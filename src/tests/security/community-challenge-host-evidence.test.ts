import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  finalizeCommunityChallengeHostEvidence,
  verifyCommunityChallengeHostEvidence,
  type CommunityChallengeHostEvidence,
  type CommunityChallengeHostEvidencePayload,
} from "../../lib/ops/community-challenge-host-evidence";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-07-21T10:10:00.000Z");

function unit(
  name: string,
  kind: "service" | "timer",
): CommunityChallengeHostEvidencePayload["systemd"]["finalizerService"] {
  return {
    unit: name,
    kind,
    enabled: kind === "timer",
    active: kind === "timer",
    activeState: kind === "timer" ? "active" : "inactive",
    subState: kind === "timer" ? "waiting" : "dead",
    unitFileState: kind === "timer" ? "enabled" : "static",
    nextElapseAt: kind === "timer" ? "2026-07-21T11:05:00.000Z" : null,
    lastTriggerAt: kind === "timer" ? "2026-07-21T10:05:00.000Z" : null,
    expectedSha256: HASH,
    installedSha256: HASH,
    matchesExpected: true,
  };
}

function validPayload(): CommunityChallengeHostEvidencePayload {
  return {
    schemaVersion: 1,
    collectorVersion: "community-challenge-staging-host-evidence-v1",
    environment: "staging",
    collectionStartedAt: "2026-07-21T10:09:00.000Z",
    collectedAt: "2026-07-21T10:10:00.000Z",
    expectedReleaseSha: SHA,
    observedSourceSha: SHA,
    observedApplicationSha: SHA,
    applicationWorkingTreeClean: true,
    hostFingerprint: "c".repeat(64),
    runtime: {
      currentUser: "tecpey",
      currentGroup: "tecpey",
      expectedUser: "tecpey",
      expectedGroup: "tecpey",
      identityMatches: true,
      environmentFile: {
        kind: "regular_file",
        symlink: false,
        mode: "0640",
        private: true,
      },
      stateDirectory: {
        kind: "directory",
        symlink: false,
        mode: "0700",
        private: true,
      },
    },
    systemd: {
      finalizerService: unit(
        "tecpey-community-challenge-finalizer.service",
        "service",
      ),
      finalizerTimer: unit(
        "tecpey-community-challenge-finalizer.timer",
        "timer",
      ),
      alertDeliveryService: unit(
        "tecpey-ops-alert-delivery.service",
        "service",
      ),
      alertDeliveryTimer: unit(
        "tecpey-ops-alert-delivery.timer",
        "timer",
      ),
    },
    health: {
      httpStatus: 200,
      ok: true,
      health: "ok",
      service: "tecpey-web",
      environment: "production",
      commit: SHA,
      database: "ok",
      redis: "ok",
      migrationsStatus: "tracked",
      migrationsApplied: 50,
    },
    database: {
      migration0050Applied: true,
      latestRun: {
        runId: RUN_ID,
        resultStatus: "succeeded",
        startedAt: "2026-07-21T10:05:00.000Z",
        completedAt: "2026-07-21T10:05:01.000Z",
        batchesProcessed: 1,
        selectedCount: 0,
        finalizedCompletedCount: 0,
        finalizedNotCompletedCount: 0,
        failureCount: 0,
        drainLimitReached: false,
      },
    },
    spool: { pending: 0, delivered: 1, quarantine: 0 },
    alertProbe: {
      requested: true,
      alertId: "staging-alert-verification:22222222-2222-4222-8222-222222222222",
      enqueuedAt: "2026-07-21T10:09:10.000Z",
      deliveredAt: "2026-07-21T10:09:11.000Z",
      delivered: true,
      pendingDuplicate: false,
    },
  };
}

function verify(evidence: unknown, overrides: Partial<Parameters<
  typeof verifyCommunityChallengeHostEvidence
>[1]> = {}) {
  return verifyCommunityChallengeHostEvidence(evidence, {
    expectedEnvironment: "staging",
    expectedReleaseSha: SHA,
    now: NOW,
    requireAlertProbe: true,
    ...overrides,
  });
}

describe("Community challenge staging host evidence", () => {
  it("accepts fresh internally consistent staging evidence", () => {
    const evidence = finalizeCommunityChallengeHostEvidence(validPayload());
    const result = verify(evidence);
    assert.equal(result.ok, true);
    assert.equal(result.releaseSha, SHA);
    assert.equal(result.alertProbeDelivered, true);
  });

  it("rejects unknown fields and a mismatched content digest", () => {
    const evidence = finalizeCommunityChallengeHostEvidence(validPayload());
    assert.throws(
      () => verify({ ...evidence, unexpected: true }),
      /host_evidence_invalid/,
    );
    assert.throws(
      () => verify({ ...evidence, contentDigest: "d".repeat(64) }),
      /host_evidence_digest_mismatch/,
    );
  });

  it("rejects stale evidence and a stale scheduler run", () => {
    const evidence = finalizeCommunityChallengeHostEvidence(validPayload());
    assert.throws(
      () => verify(evidence, { now: new Date("2026-07-21T11:00:00.000Z") }),
      /host_evidence_stale/,
    );
    const payload = validPayload();
    payload.database.latestRun!.completedAt = "2026-07-21T07:00:00.000Z";
    payload.database.latestRun!.startedAt = "2026-07-21T06:59:59.000Z";
    assert.throws(
      () => verify(finalizeCommunityChallengeHostEvidence(payload)),
      /host_evidence_latest_run_stale/,
    );
  });

  it("rejects unit drift and disabled timers", () => {
    const drift = validPayload();
    drift.systemd.finalizerTimer.installedSha256 = "d".repeat(64);
    drift.systemd.finalizerTimer.matchesExpected = false;
    assert.throws(
      () => verify(finalizeCommunityChallengeHostEvidence(drift)),
      /host_evidence_finalizer_timer_invalid/,
    );
    const disabled = validPayload();
    disabled.systemd.alertDeliveryTimer.enabled = false;
    assert.throws(
      () => verify(finalizeCommunityChallengeHostEvidence(disabled)),
      /host_evidence_alert_timer_invalid/,
    );
  });

  it("rejects release mismatch and unhealthy dependencies", () => {
    const wrongRelease = validPayload();
    wrongRelease.observedApplicationSha = "e".repeat(40);
    assert.throws(
      () => verify(finalizeCommunityChallengeHostEvidence(wrongRelease)),
      /host_evidence_release_mismatch/,
    );
    const unhealthy = validPayload() as unknown as Record<string, unknown>;
    (unhealthy.health as Record<string, unknown>).redis = "unavailable";
    assert.throws(
      () => finalizeCommunityChallengeHostEvidence(
        unhealthy as unknown as CommunityChallengeHostEvidencePayload,
      ),
      /host_evidence_health_invalid/,
    );
  });

  it("rejects unhealthy runs, pending alerts and quarantine items", () => {
    const failedRun = validPayload();
    failedRun.database.latestRun!.resultStatus = "partial_failure";
    assert.throws(
      () => verify(finalizeCommunityChallengeHostEvidence(failedRun)),
      /host_evidence_latest_run_unhealthy/,
    );
    const pending = validPayload();
    pending.spool.pending = 1;
    assert.throws(
      () => verify(finalizeCommunityChallengeHostEvidence(pending)),
      /host_evidence_pending_alerts_present/,
    );
    const quarantine = validPayload();
    quarantine.spool.quarantine = 1;
    assert.throws(
      () => verify(finalizeCommunityChallengeHostEvidence(quarantine)),
      /host_evidence_quarantine_present/,
    );
  });

  it("requires exact alert probe evidence when requested", () => {
    const noProbe = validPayload();
    noProbe.alertProbe = null;
    assert.throws(
      () => verify(finalizeCommunityChallengeHostEvidence(noProbe)),
      /host_evidence_alert_probe_missing/,
    );
    const evidence = finalizeCommunityChallengeHostEvidence(noProbe);
    const result = verifyCommunityChallengeHostEvidence(evidence, {
      expectedEnvironment: "staging",
      expectedReleaseSha: SHA,
      now: NOW,
      requireAlertProbe: false,
    });
    assert.equal(result.alertProbeDelivered, false);
  });

  it("rejects production evidence without changing the expected environment", () => {
    const production = validPayload();
    production.environment = "production";
    const evidence: CommunityChallengeHostEvidence =
      finalizeCommunityChallengeHostEvidence(production);
    assert.throws(() => verify(evidence), /host_evidence_environment_mismatch/);
  });
});
