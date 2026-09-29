import assert from "node:assert/strict";
import test from "node:test";
import {
  commercialEntitlementActive,
  reconcileCommercialEvent,
  type CommercialProjection,
} from "../../lib/commerce/commerce-authority";

const t=(iso:string)=>new Date(iso);
const base=():CommercialProjection=>({
  state:"pending", effectiveAt:t("2026-09-01T00:00:00Z"), lastProviderEventAt:null,
  stateVersion:1, currentPeriodEnd:null, cancelAt:null,
});

test("commercial projection applies a newer normalized event",()=>{
  const r=reconcileCommercialEvent(base(),{
    provider:"test",providerAccountScope:"acct",providerEventId:"evt-1",providerObjectId:"sub-1",
    occurredAt:t("2026-09-21T10:00:00Z"),normalizedState:"active",currentPeriodEnd:t("2026-10-21T10:00:00Z"),
  });
  assert.equal(r.ok,true); assert.equal(r.reason,"applied");
  assert.equal(r.projection.state,"active"); assert.equal(r.projection.stateVersion,2);
});

test("late event cannot roll authority backwards",()=>{
  const current={...base(),state:"active" as const,lastProviderEventAt:t("2026-09-21T10:00:00Z"),stateVersion:4};
  const r=reconcileCommercialEvent(current,{
    provider:"test",providerAccountScope:"acct",providerEventId:"evt-old",providerObjectId:"sub-1",
    occurredAt:t("2026-09-20T10:00:00Z"),normalizedState:"suspended",
  });
  assert.equal(r.ok,true); assert.equal(r.reason,"duplicate_or_stale"); assert.deepEqual(r.projection,current);
});

test("unknown provider state fails closed",()=>{
  const r=reconcileCommercialEvent(base(),{
    provider:"test",providerAccountScope:"acct",providerEventId:"evt-x",providerObjectId:"sub-1",
    occurredAt:t("2026-09-21T10:00:00Z"),normalizedState:"unknown",
  });
  assert.equal(r.ok,false); assert.equal(r.reason,"unknown_provider_state"); assert.equal(r.projection.state,"pending");
});

test("entitlement is server-state and time bounded",()=>{
  assert.equal(commercialEntitlementActive({state:"active",now:t("2026-09-21T10:00:00Z"),effectiveAt:t("2026-09-20T10:00:00Z"),currentPeriodEnd:t("2026-10-21T10:00:00Z")}),true);
  assert.equal(commercialEntitlementActive({state:"suspended",now:t("2026-09-21T10:00:00Z"),effectiveAt:t("2026-09-20T10:00:00Z"),currentPeriodEnd:t("2026-10-21T10:00:00Z")}),false);
  assert.equal(commercialEntitlementActive({state:"active",now:t("2026-11-01T10:00:00Z"),effectiveAt:t("2026-09-20T10:00:00Z"),currentPeriodEnd:t("2026-10-21T10:00:00Z")}),false);
});
