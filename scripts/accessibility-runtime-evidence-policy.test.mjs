import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_CHECKS,
  REQUIRED_VIEWPORTS,
  accessibilityRuntimeEvidenceFindings,
} from "./accessibility-runtime-evidence-policy.mjs";

const SHA = "a".repeat(40);
const DIGEST = "b".repeat(64);

// The observation each check has to carry alongside its verdict.
const OBSERVATION = {
  axe: { criticalOrSeriousCount: 0, ruleTags: ["wcag2aa"] },
  keyboard: { firstStopTag: "a" },
  focus: { stops: [{ tag: "a", domIndex: 4 }], followsDomOrder: true },
  contrast: { contrastViolations: 0 },
  reducedMotion: { animatedElements: 0 },
};

function records(check) {
  return REQUIRED_VIEWPORTS.map((viewport) => ({
    viewport,
    surface: `/academy#${check}`,
    passed: true,
    ...OBSERVATION[check],
  }));
}

function bundle(overrides = {}) {
  const reports = Object.fromEntries(
    Object.keys(REQUIRED_CHECKS).map((name) => [name, records(name)]),
  );
  const root = {
    schemaVersion: 1,
    evidenceClass: "accessibility-runtime-evidence-v1",
    generatedAt: "2026-08-21T12:00:00.000Z",
    sourceCommitSha: SHA,
    viewports: [...REQUIRED_VIEWPORTS],
    checks: Object.fromEntries(
      Object.entries(REQUIRED_CHECKS).map(([name, artifact]) => [
        name,
        {
          artifact,
          sha256: DIGEST,
          surfaces: REQUIRED_VIEWPORTS.length,
          ...(name === "axe" ? { criticalOrSerious: 0 } : {}),
        },
      ]),
    ),
  };
  return {
    root,
    rootDigest: DIGEST,
    reports,
    digestOf: () => DIGEST,
    expectedSha: SHA,
    ...overrides,
  };
}

test("a complete bundle produces no findings", () => {
  assert.deepEqual(accessibilityRuntimeEvidenceFindings(bundle()), []);
});

test("a check that observed nothing is refused", () => {
  // The failure this module exists for. An empty report satisfies "zero
  // violations" while proving nothing ran.
  const input = bundle();
  input.reports.axe = [];
  const findings = accessibilityRuntimeEvidenceFindings(input);
  assert.ok(
    findings.some((finding) => finding.includes("observed nothing")),
    `expected an empty-report finding, got: ${findings.join(" | ")}`,
  );
});

test("axe passing with no rules enabled is refused", () => {
  // Disabling every rule yields zero violations. Without the rule set on the
  // record, that is indistinguishable from a real pass.
  const input = bundle();
  input.reports.axe = input.reports.axe.map((record) => ({ ...record, ruleTags: [] }));
  const findings = accessibilityRuntimeEvidenceFindings(input);
  assert.ok(findings.some((finding) => finding.includes("ruleTags")), findings.join(" | "));
});

test("critical or serious violations cannot be recorded as a pass", () => {
  const viaSummary = bundle();
  viaSummary.root.checks.axe.criticalOrSerious = 2;
  assert.ok(
    accessibilityRuntimeEvidenceFindings(viaSummary).some((f) => f.includes("must be 0")),
  );

  // And the same claim made only in the detail records, not the summary.
  const viaRecords = bundle();
  viaRecords.reports.axe[0].criticalOrSeriousCount = 1;
  assert.ok(
    accessibilityRuntimeEvidenceFindings(viaRecords).some((f) =>
      f.includes("critical or serious violations"),
    ),
  );
});

test("every one of the five checks is required", () => {
  for (const name of Object.keys(REQUIRED_CHECKS)) {
    const input = bundle();
    delete input.root.checks[name];
    const findings = accessibilityRuntimeEvidenceFindings(input);
    assert.ok(
      findings.some((finding) => finding.includes(`checks.${name} is missing`)),
      `dropping ${name} produced no finding`,
    );
  }
});

test("a missing viewport is a gap, not a rounding error", () => {
  // RTL and LTR at both form factors is the control. Three of four is not
  // "mostly covered".
  for (const viewport of REQUIRED_VIEWPORTS) {
    const input = bundle();
    input.root.viewports = REQUIRED_VIEWPORTS.filter((name) => name !== viewport);
    input.reports.keyboard = input.reports.keyboard.filter(
      (record) => record.viewport !== viewport,
    );
    input.root.checks.keyboard.surfaces = input.reports.keyboard.length;
    const findings = accessibilityRuntimeEvidenceFindings(input);
    assert.ok(
      findings.some((finding) => finding.includes(viewport)),
      `dropping ${viewport} produced no finding`,
    );
  }
});

test("a digest that does not bind to its bytes is refused", () => {
  const root = bundle({ digestOf: (name) => (name === "root" ? "c".repeat(64) : DIGEST) });
  assert.ok(
    accessibilityRuntimeEvidenceFindings(root).some((f) => f.includes("root digest")),
  );

  const report = bundle({ digestOf: (name) => (name === "axe" ? "c".repeat(64) : DIGEST) });
  assert.ok(
    accessibilityRuntimeEvidenceFindings(report).some((f) =>
      f.includes("does not match the bytes of axe-results.json"),
    ),
  );
});

test("evidence must be bound to the exact head", () => {
  const input = bundle({ expectedSha: "f".repeat(40) });
  assert.ok(
    accessibilityRuntimeEvidenceFindings(input).some((f) => f.includes("exact head")),
  );
});

test("a summary count that disagrees with the records is refused", () => {
  // Two places holding the same fact is how they drift. The count is checked
  // against the thing it counts.
  const input = bundle();
  input.root.checks.focus.surfaces = 99;
  assert.ok(
    accessibilityRuntimeEvidenceFindings(input).some((f) => f.includes("but focus-order-report.json holds")),
  );
});

test("secrets and host locations cannot ride along in evidence", () => {
  for (const [path, mutate] of [
    ["root key", (input) => { input.root.token = "x"; }],
    ["report key", (input) => { input.reports.contrast[0].cookie = "x"; }],
    ["bearer string", (input) => { input.reports.focus[0].surface = "Bearer abcdefghijklmno"; }],
    ["host address", (input) => { input.reports.keyboard[0].surface = "10.0.0.7"; }],
    ["database url", (input) => { input.root.note = "postgresql://u:p@h/db"; }],
  ]) {
    const input = bundle();
    mutate(input);
    assert.ok(
      accessibilityRuntimeEvidenceFindings(input).length > 0,
      `${path} was not caught`,
    );
  }
});

test("a verdict with no observation behind it is refused", () => {
  // The empty-report failure one level down: `passed: true` and nothing else
  // reports that a check happened instead of showing what it saw.
  for (const [check, expected] of [
    ["keyboard", "the control focus first reached"],
    ["focus", "the focus stops it walked"],
    ["contrast", "the number of contrast violations"],
    ["reducedMotion", "how many elements were still animating"],
  ]) {
    const input = bundle();
    input.reports[check] = input.reports[check].map(({ viewport, surface, passed }) => ({
      viewport,
      surface,
      passed,
    }));
    const findings = accessibilityRuntimeEvidenceFindings(input);
    assert.ok(
      findings.some((finding) => finding.includes(expected)),
      `a bare ${check} verdict was accepted: ${findings.join(" | ")}`,
    );
  }
});

test("focus order that does not follow document order is not a pass", () => {
  const input = bundle();
  input.reports.focus[0].followsDomOrder = false;
  assert.ok(
    accessibilityRuntimeEvidenceFindings(input).some((finding) =>
      finding.includes("focus stops it walked"),
    ),
  );
});

test("a recorded failure is not evidence of a pass", () => {
  const input = bundle();
  input.reports.reducedMotion[1].passed = false;
  assert.ok(
    accessibilityRuntimeEvidenceFindings(input).some((finding) =>
      finding.includes("records a failed check"),
    ),
  );
});

test("a malformed bundle fails closed rather than throwing", () => {
  assert.deepEqual(accessibilityRuntimeEvidenceFindings({ root: null }), [
    "accessibility-runtime-evidence.json is missing or not an object",
  ]);
  assert.ok(accessibilityRuntimeEvidenceFindings({ root: {} }).length > 0);
});
