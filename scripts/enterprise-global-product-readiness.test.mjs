import assert from "node:assert/strict";
import test from "node:test";

import {
  readEnterpriseGlobalProductReadinessRegistry,
  validateEnterpriseGlobalProductReadiness,
} from "./check-enterprise-global-product-readiness.mjs";

test("enterprise global product readiness registry preserves the 2026-08-20 baseline", async () => {
  const registry = await readEnterpriseGlobalProductReadinessRegistry();
  const summary = validateEnterpriseGlobalProductReadiness(registry);

  assert.equal(summary.totalControls, 41);
  assert.equal(summary.evidenceReadyControls, 34);
  assert.equal(summary.blockedExternalControls, 7);
  assert.equal(summary.routeScopedJsonLdDebt, 85);
  assert.equal(summary.screenshotSlotsRequired, 700);
  assert.equal(summary.decision, "NO_GO_PUBLIC_FINANCIAL_ENTERPRISE");
});

test("enterprise global product readiness fails when a PR lowers the evidence baseline", async () => {
  const registry = await readEnterpriseGlobalProductReadinessRegistry();
  const mutated = structuredClone(registry);
  mutated.controls.find((control) => control.status === "EVIDENCE_READY").status = "BLOCKED_EXTERNAL";

  assert.throws(
    () => validateEnterpriseGlobalProductReadiness(mutated),
    /expected 34 EVIDENCE_READY controls/,
  );
});

test("enterprise global product readiness rejects premature financial go claims", async () => {
  const registry = await readEnterpriseGlobalProductReadinessRegistry();
  const mutated = structuredClone(registry);
  mutated.launchScope.currentDecision = "GO_PUBLIC_FINANCIAL_ENTERPRISE";

  assert.throws(
    () => validateEnterpriseGlobalProductReadiness(mutated),
    /must not claim public\/financial\/enterprise GO/,
  );
});
