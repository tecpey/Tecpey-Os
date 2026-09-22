import type { PoolClient } from "pg";
import { readCommerceBillingAuthority } from "@/lib/commerce/commerce-billing-authority";

export const DEEP_RESEARCH_CAPABILITY = "deep_research" as const;
export const DEEP_RESEARCH_FRESHNESS = ["current","day","week","month","historical"] as const;
export type DeepResearchFreshness = typeof DEEP_RESEARCH_FRESHNESS[number];

export type DeepResearchCreateInput = Readonly<{
  tenantId: string; workspaceId: string; accountId: string;
  question: string; locale: "fa" | "en"; requestedFreshness: DeepResearchFreshness;
  providerStrategy?: Readonly<Record<string, unknown>>;
  budget?: Readonly<Record<string, unknown>>;
}>;

function boundedObject(value: Readonly<Record<string, unknown>> | undefined, maxBytes: number): Record<string, unknown> {
  const normalized = value ? { ...value } : {};
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > maxBytes) throw new Error("deep_research_payload_too_large");
  return normalized;
}
function capabilityEnabled(capabilities: Readonly<Record<string, unknown>>): boolean {
  return capabilities[DEEP_RESEARCH_CAPABILITY] === true;
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

  const result=await client.query<{
    id:string; state:string; created_at:Date;
  }>(
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
