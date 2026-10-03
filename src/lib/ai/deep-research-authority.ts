import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { readCommerceBillingAuthority } from "@/lib/commerce/commerce-billing-authority";

export const DEEP_RESEARCH_CAPABILITY = "deep_research" as const;
export const DEEP_RESEARCH_FRESHNESS = ["current","day","week","month","historical"] as const;
export type DeepResearchFreshness = typeof DEEP_RESEARCH_FRESHNESS[number];
export type DeepResearchOperation = "create" | "cancel";

export type DeepResearchCreateInput = Readonly<{
  tenantId: string; workspaceId: string; accountId: string;
  question: string; locale: "fa" | "en"; requestedFreshness: DeepResearchFreshness;
  providerStrategy?: Readonly<Record<string, unknown>>;
  budget?: Readonly<Record<string, unknown>>;
}>;

export type DeepResearchCommandScope = Readonly<{
  tenantId: string;
  workspaceId: string;
  accountId: string;
  operation: DeepResearchOperation;
  idempotencyKey: string;
  requestHash: string;
  correlationId: string;
}>;

export type DeepResearchCommandClaim =
  | { status: "claimed" }
  | { status: "replayed"; httpStatus: number; response: Record<string, unknown> }
  | { status: "conflict" }
  | { status: "in_progress" };

function boundedObject(value: Readonly<Record<string, unknown>> | undefined, maxBytes: number): Record<string, unknown> {
  const normalized = value ? { ...value } : {};
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > maxBytes) throw new Error("deep_research_payload_too_large");
  return normalized;
}
function capabilityEnabled(capabilities: Readonly<Record<string, unknown>>): boolean {
  return capabilities[DEEP_RESEARCH_CAPABILITY] === true;
}
export function hashDeepResearchCommand(value: unknown): string {
  const canonical=(input:unknown):string => {
    if (input === null) return "null";
    if (typeof input === "string" || typeof input === "boolean") return JSON.stringify(input);
    if (typeof input === "number") {
      if (!Number.isFinite(input)) throw new Error("deep_research_non_finite_value");
      return JSON.stringify(Object.is(input,-0) ? 0 : input);
    }
    if (Array.isArray(input)) return `[${input.map(canonical).join(",")}]`;
    if (input && typeof input === "object") {
      return `{${Object.entries(input as Record<string,unknown>)
        .filter(([,v])=>v!==undefined)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
    }
    throw new Error("deep_research_unsupported_value");
  };
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function validDeepResearchIdempotencyKey(value:string|null): string|null {
  const normalized=String(value??"").trim();
  return /^[A-Za-z0-9._:-]{16,120}$/.test(normalized) ? normalized : null;
}
function validateCommandScope(scope:DeepResearchCommandScope):void {
  if (!scope.tenantId || !scope.workspaceId || !scope.accountId) throw new Error("deep_research_command_scope_invalid");
  if (!validDeepResearchIdempotencyKey(scope.idempotencyKey)) throw new Error("deep_research_idempotency_key_invalid");
  if (!/^[0-9a-f]{64}$/.test(scope.requestHash)) throw new Error("deep_research_request_hash_invalid");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(scope.correlationId)) throw new Error("deep_research_correlation_invalid");
}
export async function claimDeepResearchCommand(client:PoolClient,scope:DeepResearchCommandScope):Promise<DeepResearchCommandClaim> {
  validateCommandScope(scope);
  const lock=hashDeepResearchCommand([scope.tenantId,scope.workspaceId,scope.accountId,scope.operation,scope.idempotencyKey]);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",[lock]);
  const existing=await client.query<{request_hash:string;status:string;http_status:number|null;response_body:unknown}>(
    `SELECT request_hash,status,http_status,response_body
       FROM ai_research_api_commands
      WHERE tenant_id=$1 AND workspace_id=$2 AND account_id=$3 AND operation=$4 AND idempotency_key=$5
      FOR UPDATE`,
    [scope.tenantId,scope.workspaceId,scope.accountId,scope.operation,scope.idempotencyKey],
  );
  const row=existing.rows[0];
  if (row) {
    if (row.request_hash !== scope.requestHash) return {status:"conflict"};
    if (row.status !== "completed") return {status:"in_progress"};
    if (!row.http_status || !row.response_body || typeof row.response_body !== "object" || Array.isArray(row.response_body)) {
      throw new Error("deep_research_command_evidence_corrupt");
    }
    return {status:"replayed",httpStatus:row.http_status,response:row.response_body as Record<string,unknown>};
  }
  await client.query(
    `INSERT INTO ai_research_api_commands
      (tenant_id,workspace_id,account_id,operation,idempotency_key,request_hash,correlation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [scope.tenantId,scope.workspaceId,scope.accountId,scope.operation,scope.idempotencyKey,scope.requestHash,scope.correlationId],
  );
  return {status:"claimed"};
}
export async function completeDeepResearchCommand(
  client:PoolClient,scope:DeepResearchCommandScope,input:{httpStatus:number;response:Record<string,unknown>;resourceId?:string|null},
):Promise<void> {
  validateCommandScope(scope);
  if (!Number.isInteger(input.httpStatus) || input.httpStatus<200 || input.httpStatus>499) throw new Error("deep_research_http_status_invalid");
  const updated=await client.query(
    `UPDATE ai_research_api_commands
        SET status='completed',http_status=$6,response_body=$7::jsonb,resource_id=$8::uuid,completed_at=NOW()
      WHERE tenant_id=$1 AND workspace_id=$2 AND account_id=$3 AND operation=$4 AND idempotency_key=$5
        AND request_hash=$9 AND status='processing'`,
    [scope.tenantId,scope.workspaceId,scope.accountId,scope.operation,scope.idempotencyKey,input.httpStatus,JSON.stringify(input.response),input.resourceId??null,scope.requestHash],
  );
  if ((updated.rowCount??0)!==1) throw new Error("deep_research_command_completion_failed");
}

export async function createDeepResearchRun(client: PoolClient, input: DeepResearchCreateInput) {
  const question=input.question.trim();
  if (!input.tenantId || !input.workspaceId || !input.accountId) throw new Error("deep_research_scope_invalid");
  if (question.length < 1 || question.length > 12_000) throw new Error("deep_research_question_invalid");
  if (input.locale !== "fa" && input.locale !== "en") throw new Error("deep_research_locale_invalid");
  if (!(DEEP_RESEARCH_FRESHNESS as readonly string[]).includes(input.requestedFreshness)) throw new Error("deep_research_freshness_invalid");
  const providerStrategy=boundedObject(input.providerStrategy,32_768);
  const budget=boundedObject(input.budget,16_384);

  const billing=await readCommerceBillingAuthority(client,{
    tenantId:input.tenantId,workspaceId:input.workspaceId,accountId:input.accountId,
  });
  if (!billing.entitlement.active || !capabilityEnabled(billing.entitlement.capabilities)) {
    throw new Error("deep_research_pro_entitlement_required");
  }
  if (billing.entitlement.snapshotVersion === null || !billing.subscription) {
    throw new Error("deep_research_entitlement_authority_invalid");
  }

  const result=await client.query<{id:string; state:string; created_at:Date}>(
    `INSERT INTO ai_research_runs
      (tenant_id,workspace_id,account_id,question,locale,requested_freshness,provider_strategy,budget)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
     RETURNING id,state,created_at`,
    [input.tenantId,input.workspaceId,input.accountId,question,input.locale,input.requestedFreshness,
      JSON.stringify(providerStrategy),JSON.stringify({
        ...budget,
        entitlementSnapshotVersion: billing.entitlement.snapshotVersion,
        subscriptionId: billing.subscription.id,
        subscriptionStateVersion: billing.subscription.stateVersion,
      })],
  );
  const row=result.rows[0];
  if (!row) throw new Error("deep_research_create_failed");
  return row;
}

export async function cancelDeepResearchRun(client: PoolClient,input:{
  tenantId:string;workspaceId:string;accountId:string;runId:string;
}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.runId)) {
    throw new Error("deep_research_run_id_invalid");
  }
  const result=await client.query<{id:string;state:string;cancelled_at:Date}>(
    `UPDATE ai_research_runs
        SET state='cancelled',cancelled_at=NOW()
      WHERE id=$1 AND tenant_id=$2 AND workspace_id=$3 AND account_id=$4
        AND state IN ('planned','gathering','synthesizing','verifying','reporting')
      RETURNING id,state,cancelled_at`,
    [input.runId,input.tenantId,input.workspaceId,input.accountId],
  );
  const row=result.rows[0];
  if (!row) throw new Error("deep_research_run_not_cancellable");
  return row;
}


export type DeepResearchRunSnapshot = Readonly<{
  id:string; question:string; locale:"fa"|"en"; requestedFreshness:DeepResearchFreshness;
  state:"planned"|"gathering"|"synthesizing"|"verifying"|"reporting"|"completed"|"failed"|"cancelled";
  degradedReason:string|null; startedAt:string|null; completedAt:string|null; cancelledAt:string|null; createdAt:string;
}>;

function runSnapshot(row:{
  id:string;question:string;locale:"fa"|"en";requested_freshness:DeepResearchFreshness;state:DeepResearchRunSnapshot["state"];
  degraded_reason:string|null;started_at:Date|null;completed_at:Date|null;cancelled_at:Date|null;created_at:Date;
}):DeepResearchRunSnapshot {
  return {
    id:row.id,question:row.question,locale:row.locale,requestedFreshness:row.requested_freshness,state:row.state,
    degradedReason:row.degraded_reason,startedAt:row.started_at?.toISOString()??null,completedAt:row.completed_at?.toISOString()??null,
    cancelledAt:row.cancelled_at?.toISOString()??null,createdAt:row.created_at.toISOString(),
  };
}

export async function readDeepResearchRuns(client:PoolClient,input:{
  tenantId:string;workspaceId:string;accountId:string;limit:number;
}):Promise<DeepResearchRunSnapshot[]> {
  if (!input.tenantId || !input.workspaceId || !input.accountId) throw new Error("deep_research_scope_invalid");
  const limit=Math.max(1,Math.min(50,Math.trunc(input.limit)));
  const result=await client.query<{
    id:string;question:string;locale:"fa"|"en";requested_freshness:DeepResearchFreshness;state:DeepResearchRunSnapshot["state"];
    degraded_reason:string|null;started_at:Date|null;completed_at:Date|null;cancelled_at:Date|null;created_at:Date;
  }>(
    `SELECT id,question,locale,requested_freshness,state,degraded_reason,started_at,completed_at,cancelled_at,created_at
       FROM ai_research_runs
      WHERE tenant_id=$1 AND workspace_id=$2 AND account_id=$3
      ORDER BY created_at DESC,id DESC
      LIMIT $4`,
    [input.tenantId,input.workspaceId,input.accountId,limit],
  );
  return result.rows.map(runSnapshot);
}


export type DeepResearchSourceSnapshot = Readonly<{
  id:string; url:string; publisher:string|null; domain:string|null; title:string|null;
  retrievedAt:string; publishedAt:string|null; locale:string|null;
  sourceChannel:"public_web"|"connected_private"|"social_x"|"other";
}>;
export type DeepResearchClaimSnapshot = Readonly<{
  id:string; reportSection:string; normalizedText:string;
  claimType:"externally_factual"|"synthesis"|"opinion"|"unresolved";
  freshnessClass:"live"|"day"|"week"|"month"|"historical"|"not_applicable";
  confidenceRationale:string|null; sourceIds:string[];
}>;
export type DeepResearchConflictSnapshot = Readonly<{
  id:string; summary:string; resolutionState:"unresolved"|"partially_resolved"|"resolved"; claimIds:string[];
}>;
export type DeepResearchArtifactSnapshot = Readonly<{
  id:string; runId:string; version:number; status:"draft"|"final"; report:Record<string,unknown>;
  sourceCount:number; citedSourceCount:number; finalizedAt:string|null; createdAt:string;
  sources:DeepResearchSourceSnapshot[]; claims:DeepResearchClaimSnapshot[]; conflicts:DeepResearchConflictSnapshot[];
}>;

export async function readDeepResearchArtifact(client:PoolClient,input:{
  tenantId:string;workspaceId:string;accountId:string;runId:string;
}):Promise<DeepResearchArtifactSnapshot|null> {
  if (!input.tenantId || !input.workspaceId || !input.accountId) throw new Error("deep_research_scope_invalid");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.runId)) throw new Error("deep_research_run_id_invalid");

  const owned=await client.query<{id:string}>(
    `SELECT id FROM ai_research_runs WHERE id=$1 AND tenant_id=$2 AND workspace_id=$3 AND account_id=$4 LIMIT 1`,
    [input.runId,input.tenantId,input.workspaceId,input.accountId],
  );
  if (!owned.rows[0]) return null;

  const artifacts=await client.query<{
    id:string;run_id:string;version:number;status:"draft"|"final";report:unknown;source_count:number;cited_source_count:number;finalized_at:Date|null;created_at:Date;
  }>(
    `SELECT id,run_id,version,status,report,source_count,cited_source_count,finalized_at,created_at
       FROM ai_research_artifacts
      WHERE tenant_id=$1 AND workspace_id=$2 AND run_id=$3
      ORDER BY (status='final') DESC,version DESC LIMIT 1`,
    [input.tenantId,input.workspaceId,input.runId],
  );
  const artifact=artifacts.rows[0];
  if (!artifact) return null;

  // A pg PoolClient is a single PostgreSQL session. Keep reads sequential:
  // concurrent Promise.all calls do not create database parallelism and can make
  // transaction/session semantics harder to reason about.
  const sources=await client.query<{id:string;url:string;publisher:string|null;domain:string|null;title:string|null;retrieved_at:Date;published_at:Date|null;locale:string|null;source_channel:DeepResearchSourceSnapshot["sourceChannel"]}>(
    `SELECT id,url,publisher,domain,title,retrieved_at,published_at,locale,source_channel FROM ai_research_sources WHERE tenant_id=$1 AND workspace_id=$2 AND run_id=$3 ORDER BY retrieved_at DESC,id`,
    [input.tenantId,input.workspaceId,input.runId]);
  const claims=await client.query<{id:string;report_section:string;normalized_text:string;claim_type:DeepResearchClaimSnapshot["claimType"];freshness_class:DeepResearchClaimSnapshot["freshnessClass"];confidence_rationale:string|null}>(
    `SELECT id,report_section,normalized_text,claim_type,freshness_class,confidence_rationale FROM ai_research_claims WHERE tenant_id=$1 AND workspace_id=$2 AND run_id=$3 ORDER BY created_at,id`,
    [input.tenantId,input.workspaceId,input.runId]);
  const citations=await client.query<{claim_id:string;source_id:string}>(
    `SELECT claim_id,source_id FROM ai_research_claim_citations WHERE tenant_id=$1 AND workspace_id=$2 AND run_id=$3 ORDER BY created_at,id`,
    [input.tenantId,input.workspaceId,input.runId]);
  const conflicts=await client.query<{id:string;summary:string;resolution_state:DeepResearchConflictSnapshot["resolutionState"]}>(
    `SELECT id,summary,resolution_state FROM ai_research_conflict_sets WHERE tenant_id=$1 AND workspace_id=$2 AND run_id=$3 ORDER BY created_at,id`,
    [input.tenantId,input.workspaceId,input.runId]);
  const members=await client.query<{conflict_set_id:string;claim_id:string}>(
    `SELECT conflict_set_id,claim_id FROM ai_research_conflict_members WHERE tenant_id=$1 AND workspace_id=$2 AND run_id=$3 ORDER BY created_at,id`,
    [input.tenantId,input.workspaceId,input.runId]);
  const sourceIds=new Map<string,string[]>();
  for (const row of citations.rows) sourceIds.set(row.claim_id,[...(sourceIds.get(row.claim_id)??[]),row.source_id]);
  const claimIds=new Map<string,string[]>();
  for (const row of members.rows) claimIds.set(row.conflict_set_id,[...(claimIds.get(row.conflict_set_id)??[]),row.claim_id]);
  const report=artifact.report && typeof artifact.report==="object" && !Array.isArray(artifact.report) ? artifact.report as Record<string,unknown> : {};
  return {
    id:artifact.id,runId:artifact.run_id,version:artifact.version,status:artifact.status,report,
    sourceCount:artifact.source_count,citedSourceCount:artifact.cited_source_count,
    finalizedAt:artifact.finalized_at?.toISOString()??null,createdAt:artifact.created_at.toISOString(),
    sources:sources.rows.map(row=>({id:row.id,url:row.url,publisher:row.publisher,domain:row.domain,title:row.title,retrievedAt:row.retrieved_at.toISOString(),publishedAt:row.published_at?.toISOString()??null,locale:row.locale,sourceChannel:row.source_channel})),
    claims:claims.rows.map(row=>({id:row.id,reportSection:row.report_section,normalizedText:row.normalized_text,claimType:row.claim_type,freshnessClass:row.freshness_class,confidenceRationale:row.confidence_rationale,sourceIds:sourceIds.get(row.id)??[]})),
    conflicts:conflicts.rows.map(row=>({id:row.id,summary:row.summary,resolutionState:row.resolution_state,claimIds:claimIds.get(row.id)??[]})),
  };
}
