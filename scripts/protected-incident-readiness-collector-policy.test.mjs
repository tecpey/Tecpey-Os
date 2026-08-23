import assert from "node:assert/strict";
import test from "node:test";
import {
  RUNBOOK_SECTIONS,
  acknowledgementLatencySeconds,
  acknowledgementTargetSeconds,
  buildRunbookCoverage,
  extractRunbookSection,
  queueStateDigest,
  sha256Canonical,
  supportWindowContext,
} from "./protected-incident-readiness-collector-policy.mjs";

test("classifies the Tehran support window and acknowledgement targets", () => {
  assert.equal(supportWindowContext("2026-08-23T06:00:00.000Z"), "inside-support-window");
  assert.equal(supportWindowContext("2026-08-23T20:00:01.000Z"), "outside-support-window");
  assert.equal(acknowledgementTargetSeconds("inside-support-window"), 900);
  assert.equal(acknowledgementTargetSeconds("outside-support-window"), 3600);
  assert.throws(() => acknowledgementTargetSeconds("unknown"), /acknowledgement_context_invalid/);
});

test("measures acknowledgement latency and fails closed on timestamp drift", () => {
  assert.equal(
    acknowledgementLatencySeconds(
      "2026-08-23T10:00:00.000Z",
      "2026-08-23T10:04:00.000Z",
      "commander",
    ),
    240,
  );
  assert.throws(
    () => acknowledgementLatencySeconds(
      "2026-08-23T10:04:00.000Z",
      "2026-08-23T10:00:00.000Z",
      "commander",
    ),
    /timestamp_order_invalid/,
  );
  assert.throws(() => supportWindowContext("not-a-time"), /support_window_timestamp_invalid/);
});

test("extracts every governed incident runbook section and hashes it", () => {
  const source = Object.values(RUNBOOK_SECTIONS).map(({ heading }) => `${heading}

**Symptom:** ${"x".repeat(40)}

**Diagnosis:** ${"y".repeat(40)}

**Resolution:** ${"z".repeat(40)}
`).join("\n");
  const coverage = buildRunbookCoverage(source);
  assert.deepEqual(Object.keys(coverage), Object.keys(RUNBOOK_SECTIONS));
  for (const entry of Object.values(coverage)) {
    assert.match(entry.evidenceDigest, /^[a-f0-9]{64}$/);
    assert.equal(entry.disposition, "accepted");
  }
  assert.match(extractRunbookSection(source, RUNBOOK_SECTIONS.database.heading), /Database Down/);
  assert.throws(() => extractRunbookSection(source, "## Incident: Missing"), /runbook_heading_missing/);
});

test("binds redacted queue state and canonical values deterministically", () => {
  assert.equal(queueStateDigest(0, 0), queueStateDigest(0, 0));
  assert.notEqual(queueStateDigest(0, 0), queueStateDigest(1, 0));
  assert.equal(
    sha256Canonical({ second: 2, first: 1 }),
    sha256Canonical({ first: 1, second: 2 }),
  );
  assert.throws(() => queueStateDigest(-1, 0), /pending_alert_count_invalid/);
});
