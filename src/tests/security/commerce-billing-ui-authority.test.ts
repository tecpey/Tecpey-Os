import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const panel=readFileSync("src/components/academy/CommerceBillingPanel.tsx","utf8");
const account=readFileSync("src/components/academy/AcademyAccount.tsx","utf8");

test("account Pro surface consumes billing authority without client unlock controls",()=>{
  assert.match(account,/CommerceBillingPanel locale=\{locale\}/);
  assert.match(panel,/fetch\("\/api\/commerce\/billing"/);
  assert.match(panel,/cache: "no-store"/);
  assert.match(panel,/credentials: "include"/);
  assert.match(panel,/response\.status === 401/);
  assert.match(panel,/response\.status === 403/);
  assert.match(panel,/billing\.entitlement|entitlement\.active/);
  assert.match(panel,/aria-live="polite"/);
  assert.match(panel,/min-h-11 min-w-11/);
  assert.doesNotMatch(panel,/localStorage|sessionStorage|setItem\(/);
  assert.doesNotMatch(panel,/checkout|purchasePro|activatePro|unlockPro/);
});
