import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route=readFileSync("src/app/api/commerce/billing/route.ts","utf8");

test("commerce billing API derives account and tenant authority from strict server evidence",()=>{
  assert.match(route,/getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
  assert.match(route,/const accountId = session\.academyAccountId/);
  assert.match(route,/requiredPrincipalType: "account"/);
  assert.match(route,/request: req/);
  assert.match(route,/readCommerceBillingAuthority/);
  assert.match(route,/set_config\('app\.tenant_id'/);
  // Query inspection is allowed only to enforce the route's zero-query surface.
  // It must never become an authority source for tenant/workspace/account selection.
  assert.match(route,/req\.nextUrl\.searchParams\.keys\(\)/);
  assert.match(route,/billingError\("invalid_query", 400\)/);
  assert.doesNotMatch(route,/searchParams\.(?:get|getAll|has)\s*\(/);
  assert.doesNotMatch(route,/get\("tenant|x-tenant|body\.accountId/);
});
