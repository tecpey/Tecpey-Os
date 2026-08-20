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
  assert.equal(summary.waveAExternalEvidenceControls, 7);
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

test("enterprise global product readiness requires every wave A external blocker to have an evidence contract", async () => {
  const registry = await readEnterpriseGlobalProductReadinessRegistry();
  const mutated = structuredClone(registry);
  mutated.waveAExternalEvidenceTracker.controls = mutated.waveAExternalEvidenceTracker.controls.filter(
    (control) => control.id !== "OPS-010",
  );

  assert.throws(
    () => validateEnterpriseGlobalProductReadiness(mutated),
    /wave A tracker must exactly cover all seven blocked external P0 controls/,
  );
});

test("enterprise global product readiness rejects reduced visual QA screenshot coverage", async () => {
  const registry = await readEnterpriseGlobalProductReadinessRegistry();
  const mutated = structuredClone(registry);
  const visualQa = mutated.waveAExternalEvidenceTracker.controls.find((control) => control.id === "QA-050");
  visualQa.requiredSlots = 696;

  assert.throws(
    () => validateEnterpriseGlobalProductReadiness(mutated),
    /QA-050 route and screenshot slot counts must match/,
  );
});

test("enterprise global product readiness rejects incomplete runtime accessibility scope", async () => {
  const registry = await readEnterpriseGlobalProductReadinessRegistry();
  const mutated = structuredClone(registry);
  const a11y = mutated.waveAExternalEvidenceTracker.controls.find((control) => control.id === "QA-051");
  a11y.requiredChecks = a11y.requiredChecks.filter((check) => check !== "reduced-motion");

  assert.throws(
    () => validateEnterpriseGlobalProductReadiness(mutated),
    /QA-051 must require axe, keyboard, focus, contrast and reduced-motion/,
  );
});
