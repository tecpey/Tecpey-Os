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
