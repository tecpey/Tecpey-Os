import assert from "node:assert/strict";
import test from "node:test";
import { verifyIncidentReadinessEvidence } from "./verify-incident-readiness-evidence.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const COMMANDER = "incident-commander:mannan-vajihi";
const SRE = "sre-owner:protected-staging";
const OPERATOR = "release-operator:protected-staging";
const REVIEWER = "qa-reviewer:incident-readiness";

function owner(role, externalIdentity) {
  return { role, externalIdentity };
}

function runbook(failureMode, overrides = {}) {
  return {
    failureMode,
    firstResponder: `${failureMode} first responder`,
    escalationPath: `${failureMode} escalation path`,
    rollbackHaltCondition: `${failureMode} halt condition`,
    userCommunicationOwner: `${failureMode} communication owner`,
    evidenceDigest: HASH,
    disposition: "accepted",
    ...overrides,
  };
}

const valid = {
  schemaVersion: 1,
  authority: "tecpey-incident-readiness-v1",
  evidenceClass: "protected-staging-incident-readiness",
  environment: "protected-staging",
  sourceSha: SHA,
  supportWindow: {
    timezone: "Asia/Tehran",
    dailyStart: "09:00",
    dailyEnd: "23:00",
    coverage: "every-day-controlled-launch",
  },
  incidentOwners: {
    incidentCommander: owner("Founder/CEO or delegated release owner", COMMANDER),
    technicalOwner: owner("CTO or Chief Architect", "technical-owner:chief-architect"),
    sreOwner: owner("SRE Lead", SRE),
    securityOwner: owner("Chief Security Officer or DevSecOps Lead", "security-owner:devsecops"),
    productOwner: owner("CPO or Academy Director", "product-owner:academy-director"),
  },
  alertProbes: [
    {
      probeId: "p0-alert-probe-1",
      severity: "P0",
      alertType: "synthetic-critical-alert",
      triggeredAt: "2026-08-12T10:00:00Z",
      deliveredAt: "2026-08-12T10:02:00Z",
      latencySeconds: 120,
      deliveryChannelDigest: HASH,
      pendingAlertCountAfterProbe: 0,
      quarantineCountAfterProbe: 0,
      disposition: "accepted",
    },
    {
      probeId: "p0-alert-probe-2",
      severity: "P0",
      alertType: "synthetic-critical-alert",
      triggeredAt: "2026-08-12T10:05:00Z",
      deliveredAt: "2026-08-12T10:07:30Z",
      latencySeconds: 150,
      deliveryChannelDigest: HASH,
      pendingAlertCountAfterProbe: 0,
      quarantineCountAfterProbe: 0,
      disposition: "accepted",
    },
  ],
  alertQueueState: {
    checkedAt: "2026-08-12T10:08:00Z",
    pendingAlertCount: 0,
    quarantineCount: 0,
    queryDigest: HASH,
  },
  acknowledgementDrill: {
    drillId: "p0-ack-drill-20260812",
    severity: "P0",
    declaredAt: "2026-08-12T10:10:00Z",
    supportWindowContext: "inside-support-window",
    ackTargetSeconds: 900,
    incidentCommander: COMMANDER,
    incidentCommanderAcknowledgedAt: "2026-08-12T10:14:00Z",
    incidentCommanderLatencySeconds: 240,
    sreOwner: SRE,
    sreAcknowledgedAt: "2026-08-12T10:13:00Z",
    sreLatencySeconds: 180,
    disposition: "accepted",
  },
  runbookCoverage: {
    database: runbook("Database"),
    redis: runbook("Redis"),
    migration: runbook("Migration"),
    alertDelivery: runbook("Alert delivery"),
    provider: runbook("Provider"),
    worker: runbook("Worker"),
    reconciliation: runbook("Reconciliation"),
  },
  operator: owner("Release Operator", OPERATOR),
  reviewer: owner("Independent QA Reviewer", REVIEWER),
  privacyBoundary: [
    "redacted-evidence-only",
    "no-secrets-or-connection-urls",
    "no-host-ips",
    "no-raw-logs",
    "no-customer-data",
  ],
  finalDisposition: "accepted",
};

test("accepts protected staging incident readiness evidence", () => {
  assert.equal(verifyIncidentReadinessEvidence(structuredClone(valid), SHA).finalDisposition, "accepted");
});

test("rejects missing critical alert probes and non-zero alert queues", () => {
  const oneProbe = structuredClone(valid);
  oneProbe.alertProbes.pop();
  assert.throws(() => verifyIncidentReadinessEvidence(oneProbe, SHA), /alert_probes_count_invalid/);

  const pending = structuredClone(valid);
  pending.alertQueueState.pendingAlertCount = 1;
  assert.throws(() => verifyIncidentReadinessEvidence(pending, SHA), /alert_queue_state_invalid/);
});

test("rejects slow alert delivery, stale SHA and dependent reviewers", () => {
  const slow = structuredClone(valid);
  slow.alertProbes[0].deliveredAt = "2026-08-12T10:06:00Z";
  slow.alertProbes[0].latencySeconds = 360;
  assert.throws(() => verifyIncidentReadinessEvidence(slow, SHA), /alertProbes_0_latency_invalid/);

  assert.throws(
    () => verifyIncidentReadinessEvidence(structuredClone(valid), "f".repeat(40)),
    /evidence_source_sha_invalid/,
  );

  const dependent = structuredClone(valid);
  dependent.reviewer.externalIdentity = SRE;
  assert.throws(() => verifyIncidentReadinessEvidence(dependent, SHA), /reviewer_must_be_independent/);
});

test("rejects P0 acknowledgement misses and target drift", () => {
  const targetDrift = structuredClone(valid);
  targetDrift.acknowledgementDrill.ackTargetSeconds = 3600;
  assert.throws(() => verifyIncidentReadinessEvidence(targetDrift, SHA), /acknowledgement_drill_target_invalid/);

  const late = structuredClone(valid);
  late.acknowledgementDrill.incidentCommanderAcknowledgedAt = "2026-08-12T10:30:00Z";
  late.acknowledgementDrill.incidentCommanderLatencySeconds = 1200;
  assert.throws(() => verifyIncidentReadinessEvidence(late, SHA), /acknowledgement_drill_latency_invalid/);
});

test("rejects missing runbook coverage and raw operational material", () => {
  const missingRunbook = structuredClone(valid);
  delete missingRunbook.runbookCoverage.reconciliation;
  assert.throws(() => verifyIncidentReadinessEvidence(missingRunbook, SHA), /runbookCoverage_keys_invalid/);

  const rawWebhook = structuredClone(valid);
  rawWebhook.alertProbes[0].webhookUrl = "https://hooks.example.test/secret";
  assert.throws(() => verifyIncidentReadinessEvidence(rawWebhook, SHA), /webhookUrl_forbidden/);

  const leakedIp = structuredClone(valid);
  leakedIp.runbookCoverage.provider.escalationPath = "call host 10.0.0.5";
  assert.throws(() => verifyIncidentReadinessEvidence(leakedIp, SHA), /contains_forbidden_material/);
});
