import assert from "node:assert/strict";
import test from "node:test";
import { readCommerceBillingAuthority } from "../../lib/commerce/commerce-billing-authority";

function client(subscriptionRows: unknown[], snapshotRows: unknown[]) {
  let calls = 0;
  return {
    async query() {
      calls += 1;
      return { rows: calls === 1 ? subscriptionRows : snapshotRows };
    },
  } as never;
}
const active = {
  id:"sub-1",plan_key:"pro",plan_version:1,state:"active",effective_at:new Date("2026-09-01T00:00:00Z"),
  current_period_end:new Date("2026-10-01T00:00:00Z"),cancel_at:null,state_version:"3",
};

test("billing authority accepts only the snapshot matching current subscription state version", async () => {
  const result=await readCommerceBillingAuthority(client([active],[{
    snapshot_version:"3",capabilities:{mentor_pro:true},valid_from:new Date("2026-09-01T00:00:00Z"),
    valid_until:new Date("2026-10-01T00:00:00Z"),
  }]),{tenantId:"t",workspaceId:"w",accountId:"a"},new Date("2026-09-22T00:00:00Z"));
  assert.equal(result.entitlement.active,true);
  assert.deepEqual(result.entitlement.capabilities,{mentor_pro:true});
});

test("billing authority fails closed when only an older active snapshot exists", async () => {
  const result=await readCommerceBillingAuthority(client([active],[{
    snapshot_version:"2",capabilities:{mentor_pro:true},valid_from:new Date("2026-09-01T00:00:00Z"),
    valid_until:new Date("2026-10-01T00:00:00Z"),
  }]),{tenantId:"t",workspaceId:"w",accountId:"a"},new Date("2026-09-22T00:00:00Z"));
  assert.equal(result.entitlement.active,false);
  assert.deepEqual(result.entitlement.capabilities,{});
});

test("billing authority fails closed on ambiguous multiple subscriptions", async () => {
  const result=await readCommerceBillingAuthority(client([active,{...active,id:"sub-2"}],[]),
    {tenantId:"t",workspaceId:"w",accountId:"a"},new Date("2026-09-22T00:00:00Z"));
  assert.equal(result.subscription,null);
  assert.equal(result.entitlement.active,false);
});
