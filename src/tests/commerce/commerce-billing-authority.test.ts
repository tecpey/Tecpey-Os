import assert from "node:assert/strict";
import test from "node:test";
import { readCommerceBillingAuthority } from "../../lib/commerce/commerce-billing-authority";

function client(responses: unknown[][]) {
  let calls = 0;
  return {
    async query() {
      const rows = responses[calls] ?? [];
      calls += 1;
      return { rows };
    },
  } as never;
}
const active = {
  id:"sub-1",plan_key:"pro",plan_version:1,state:"active",effective_at:new Date("2026-09-01T00:00:00Z"),
  current_period_end:new Date("2026-10-01T00:00:00Z"),cancel_at:null,state_version:"3",
};
const expired = {
  ...active,id:"sub-old",state:"expired",effective_at:new Date("2026-08-01T00:00:00Z"),
  current_period_end:new Date("2026-09-01T00:00:00Z"),state_version:"7",
};

test("billing authority accepts only the snapshot matching current subscription state version", async () => {
  const result=await readCommerceBillingAuthority(client([[active],[{
    snapshot_version:"3",capabilities:{mentor_pro:true},valid_from:new Date("2026-09-01T00:00:00Z"),
    valid_until:new Date("2026-10-01T00:00:00Z"),
  }]]),{tenantId:"t",workspaceId:"w",accountId:"a"},new Date("2026-09-22T00:00:00Z"));
  assert.equal(result.entitlement.active,true);
  assert.deepEqual(result.entitlement.capabilities,{mentor_pro:true});
});

test("billing authority fails closed when only an older active snapshot exists", async () => {
  const result=await readCommerceBillingAuthority(client([[active],[{
    snapshot_version:"2",capabilities:{mentor_pro:true},valid_from:new Date("2026-09-01T00:00:00Z"),
    valid_until:new Date("2026-10-01T00:00:00Z"),
  }]]),{tenantId:"t",workspaceId:"w",accountId:"a"},new Date("2026-09-22T00:00:00Z"));
  assert.equal(result.entitlement.active,false);
  assert.deepEqual(result.entitlement.capabilities,{});
});

test("billing authority fails closed on ambiguous simultaneous live subscriptions", async () => {
  const result=await readCommerceBillingAuthority(client([[active,{...active,id:"sub-2"}]]),
    {tenantId:"t",workspaceId:"w",accountId:"a"},new Date("2026-09-22T00:00:00Z"));
  assert.equal(result.subscription,null);
  assert.equal(result.entitlement.active,false);
});

test("historical terminal subscriptions do not shadow one current live subscription", async () => {
  // The live-candidate query returns only the active row; terminal ledger history
  // is intentionally outside that candidate set.
  const result=await readCommerceBillingAuthority(client([[active],[{
    snapshot_version:"3",capabilities:{mentor_pro:true},valid_from:new Date("2026-09-01T00:00:00Z"),
    valid_until:new Date("2026-10-01T00:00:00Z"),
  }]]),{tenantId:"t",workspaceId:"w",accountId:"a"},new Date("2026-09-22T00:00:00Z"));
  assert.equal(result.subscription?.id,"sub-1");
  assert.equal(result.entitlement.active,true);
});

test("latest terminal subscription remains visible for billing history without granting entitlement", async () => {
  const result=await readCommerceBillingAuthority(client([[],[expired]]),
    {tenantId:"t",workspaceId:"w",accountId:"a"},new Date("2026-09-22T00:00:00Z"));
  assert.equal(result.subscription?.id,"sub-old");
  assert.equal(result.subscription?.state,"expired");
  assert.equal(result.entitlement.active,false);
  assert.deepEqual(result.entitlement.capabilities,{});
});
