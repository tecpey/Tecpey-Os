import assert from "node:assert/strict";
import test from "node:test";
import { verifyProtectedRecoveryReconciliationEvidence } from "./verify-protected-recovery-reconciliation-evidence.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const DIGEST = "c".repeat(64);
const OPERATOR = "release-operator:mannan-vajihi";
const REVIEWER = "release-reviewer:sre-owner";

function domain(domainName, overrides = {}) {
  return {
    domain: domainName,
    sourceSha: SHA,
    migrationPlanHash: HASH,
    backupBoundary: "backup-20260812T100000Z",
    queryDigest: "d".repeat(64),
    rowCounts: {
      records: 12,
      auditEvents: 4,
    },
    startedAt: "2026-08-12T10:03:00Z",
    completedAt: "2026-08-12T10:04:00Z",
    operator: OPERATOR,
    reviewer: REVIEWER,
    disposition: "accepted",
    ...overrides,
  };
}

const valid = {
  schemaVersion: 1,
  authority: "tecpey-protected-recovery-reconciliation-v1",
  evidenceClass: "protected-staging-domain-recovery-reconciliation",
  environment: "protected-staging",
  sourceSha: SHA,
  imageDigest: `sha256:${DIGEST}`,
  migrationPlanHash: HASH,
  backupBoundary: {
    boundaryId: "backup-20260812T100000Z",
    startedAt: "2026-08-12T10:00:00Z",
    completedAt: "2026-08-12T10:01:00Z",
    rpoBoundary: "all-acknowledged-domain-state-before-backup-is-present-after-restore",
    backupDigest: "e".repeat(64),
  },
  restoreWindow: {
    startedAt: "2026-08-12T10:02:00Z",
    completedAt: "2026-08-12T10:08:00Z",
    measuredRtoSeconds: 240,
    maximumRtoSeconds: 300,
  },
  operator: {
    role: "Release Operator",
    externalIdentity: OPERATOR,
  },
  reviewer: {
    role: "SRE Reviewer",
    externalIdentity: REVIEWER,
  },
  domains: {
    academy: domain("Academy"),
    tradingArena: domain("Trading Arena"),
    mentorAi: domain("Mentor AI"),
    exchangeLedger: domain("Exchange Ledger"),
    notificationsOperationalJobs: domain("Notifications and operational jobs"),
    tenantPrincipalIsolation: domain("Tenant and principal isolation"),
  },
  privacyBoundary: [
    "counts-and-hashes-only",
    "no-raw-rows",
    "no-secrets-or-connection-urls",
  ],
  finalDisposition: "accepted",
};

test("accepts protected staging recovery reconciliation evidence for all launch domains", () => {
  assert.equal(
    verifyProtectedRecoveryReconciliationEvidence(structuredClone(valid), SHA).finalDisposition,
    "accepted",
  );
});

test("rejects missing domain reconciliation and non-accepted disposition", () => {
  const missingDomain = structuredClone(valid);
  delete missingDomain.domains.exchangeLedger;
  assert.throws(
    () => verifyProtectedRecoveryReconciliationEvidence(missingDomain, SHA),
    /domains_keys_invalid/,
  );

  const rejectedDomain = structuredClone(valid);
  rejectedDomain.domains.academy.disposition = "pending";
  assert.throws(
    () => verifyProtectedRecoveryReconciliationEvidence(rejectedDomain, SHA),
    /domains_academy_disposition_invalid/,
  );
});

test("rejects stale SHA, migration drift and dependent reviewer", () => {
  assert.throws(
    () => verifyProtectedRecoveryReconciliationEvidence(structuredClone(valid), "f".repeat(40)),
    /evidence_source_sha_invalid/,
  );

  const drift = structuredClone(valid);
  drift.domains.tradingArena.migrationPlanHash = "f".repeat(64);
  assert.throws(
    () => verifyProtectedRecoveryReconciliationEvidence(drift, SHA),
    /domains_tradingArena_migration_plan_hash_invalid/,
  );

  const dependent = structuredClone(valid);
  dependent.reviewer.externalIdentity = OPERATOR;
  assert.throws(
    () => verifyProtectedRecoveryReconciliationEvidence(dependent, SHA),
    /reviewer_must_be_independent/,
  );
});

test("rejects raw rows, connection URLs and unbounded RTO", () => {
  const rawRows = structuredClone(valid);
  rawRows.domains.mentorAi.rawRows = [{ memory: "raw" }];
  assert.throws(
    () => verifyProtectedRecoveryReconciliationEvidence(rawRows, SHA),
    /rawRows_forbidden/,
  );

  const leakedUrl = structuredClone(valid);
  leakedUrl.domains.exchangeLedger.rowCounts.databaseUrl = "postgres://example";
  assert.throws(
    () => verifyProtectedRecoveryReconciliationEvidence(leakedUrl, SHA),
    /databaseUrl_forbidden/,
  );

  const slow = structuredClone(valid);
  slow.restoreWindow.measuredRtoSeconds = 301;
  assert.throws(
    () => verifyProtectedRecoveryReconciliationEvidence(slow, SHA),
    /restoreWindow_rto_invalid/,
  );
});
