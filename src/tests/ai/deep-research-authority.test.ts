import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cancelDeepResearchRun, createDeepResearchRun, DEEP_RESEARCH_CAPABILITY } from "../../lib/ai/deep-research-authority";

type QueryRow = Readonly<Record<string, unknown>>;\ntype QueryResult = { rows: QueryRow[] };
function clientFor(input:{billingRows?:QueryRow[][];insertRows?:QueryRow[];updateRows?:QueryRow[]}) {
  let billing=0;
  return {
    async query(sql:string):Promise<QueryResult> {
      if (sql.includes("FROM commerce_subscriptions")) return {rows:input.billingRows?.[billing++] ?? []};
      if (sql.includes("FROM commerce_entitlement_snapshots")) return {rows:input.billingRows?.[billing++] ?? []};
      if (sql.includes("INSERT INTO ai_research_runs")) return {rows:input.insertRows ?? []};
      if (sql.includes("UPDATE ai_research_runs")) return {rows:input.updateRows ?? []};
      throw new Error("unexpected_query");
    },
  } as unknown as import("pg").PoolClient;
}
const subscription={id:"11111111-1111-4111-8111-111111111111",plan_key:"pro",plan_version:1,state:"active",effective_at:new Date("2026-01-01"),current_period_end:null,cancel_at:null,state_version:3};
const snapshot={snapshot_version:3,capabilities:{[DEEP_RESEARCH_CAPABILITY]:true},valid_from:new Date("2026-01-01"),valid_until:null};
const base={tenantId:"tenant-a",workspaceId:"workspace-a",accountId:"account-a",question:" Verify evidence ",locale:"en" as const,requestedFreshness:"day" as const};

describe("deep research application authority",()=>{
  it("fails closed without current Pro capability",async()=>{
    await assert.rejects(()=>createDeepResearchRun(clientFor({billingRows:[[],[]]}),base),/deep_research_pro_entitlement_required/u);
    await assert.rejects(()=>createDeepResearchRun(clientFor({billingRows:[[subscription],[{...snapshot,capabilities:{}}]]}),base),/deep_research_pro_entitlement_required/u);
  });
  it("creates a bounded run only from current entitlement authority",async()=>{
    const row={id:"22222222-2222-4222-8222-222222222222",state:"planned",created_at:new Date()};
    const out=await createDeepResearchRun(clientFor({billingRows:[[subscription],[snapshot]],insertRows:[row]}),base);
    assert.equal(out.id,row.id); assert.equal(out.state,"planned");
  });
  it("rejects invalid and oversized inputs before persistence",async()=>{
    await assert.rejects(()=>createDeepResearchRun(clientFor({}),{...base,question:""}),/question_invalid/u);
    await assert.rejects(()=>createDeepResearchRun(clientFor({}),{...base,providerStrategy:{x:"x".repeat(33_000)}}),/payload_too_large/u);
  });
  it("cancels only an owned non-terminal run",async()=>{
    const id="33333333-3333-4333-8333-333333333333";
    const row={id,state:"cancelled",cancelled_at:new Date()};
    assert.equal((await cancelDeepResearchRun(clientFor({updateRows:[row]}),{tenantId:"tenant-a",workspaceId:"workspace-a",accountId:"account-a",runId:id})).state,"cancelled");
    await assert.rejects(()=>cancelDeepResearchRun(clientFor({updateRows:[]}),{tenantId:"tenant-a",workspaceId:"workspace-a",accountId:"account-a",runId:id}),/not_cancellable/u);
  });
});
