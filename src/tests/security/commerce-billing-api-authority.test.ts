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
  assert.doesNotMatch(route,/searchParams|get\("tenant|x-tenant|body\.accountId/);
});
