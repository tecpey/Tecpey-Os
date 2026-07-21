import { createHash } from "node:crypto";

export const COMMUNITY_CHALLENGE_HOST_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const COMMUNITY_CHALLENGE_HOST_EVIDENCE_COLLECTOR_VERSION =
  "community-challenge-staging-host-evidence-v1" as const;

const SHA256_RE = /^[0-9a-f]{64}$/;
const GIT_SHA_RE = /^[0-9a-f]{40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNIT_RE = /^[A-Za-z0-9@_.:-]{3,200}\.(?:service|timer)$/;
const TOKEN_RE = /^[A-Za-z0-9._:-]+$/;

export type HostEvidenceEnvironment = "staging" | "production";

export type HostEvidenceFileClassification = {
  kind: "regular_file" | "directory";
  symlink: false;
  mode: string;
  private: true;
};

export type HostEvidenceSystemdUnit = {
  unit: string;
  kind: "service" | "timer";
  enabled: boolean;
  active: boolean;
  activeState: string;
  subState: string;
  unitFileState: string;
  nextElapseAt: string | null;
  lastTriggerAt: string | null;
  expectedSha256: string;
  installedSha256: string;
  matchesExpected: boolean;
};

export type HostEvidenceHealth = {
  httpStatus: 200;
  ok: true;
  health: "ok";
  service: "tecpey-web";
  environment: "production";
  commit: string;
  database: "ok";
  redis: "ok";
  migrationsStatus: "tracked";
  migrationsApplied: number;
};

export type HostEvidenceLatestRun = {
  runId: string;
  resultStatus: "succeeded" | "partial_failure" | "authority_unavailable";
  startedAt: string;
  completedAt: string;
  batchesProcessed: number;
  selectedCount: number;
  finalizedCompletedCount: number;
  finalizedNotCompletedCount: number;
  failureCount: number;
  drainLimitReached: boolean;
};

export type HostEvidenceAlertProbe = {
  requested: true;
  alertId: string;
  enqueuedAt: string;
  deliveredAt: string;
  delivered: true;
  pendingDuplicate: false;
};

export type CommunityChallengeHostEvidencePayload = {
  schemaVersion: 1;
  collectorVersion: typeof COMMUNITY_CHALLENGE_HOST_EVIDENCE_COLLECTOR_VERSION;
  environment: HostEvidenceEnvironment;
  collectionStartedAt: string;
  collectedAt: string;
  expectedReleaseSha: string;
  observedSourceSha: string;
  observedApplicationSha: string;
  applicationWorkingTreeClean: true;
  hostFingerprint: string;
  runtime: {
    currentUser: string;
    currentGroup: string;
    expectedUser: string;
    expectedGroup: string;
    identityMatches: true;
    environmentFile: HostEvidenceFileClassification;
    stateDirectory: HostEvidenceFileClassification;
  };
  systemd: {
    finalizerService: HostEvidenceSystemdUnit;
    finalizerTimer: HostEvidenceSystemdUnit;
    alertDeliveryService: HostEvidenceSystemdUnit;
    alertDeliveryTimer: HostEvidenceSystemdUnit;
  };
  health: HostEvidenceHealth;
  database: {
    migration0050Applied: true;
    latestRun: HostEvidenceLatestRun | null;
  };
  spool: {
    pending: number;
    delivered: number;
    quarantine: number;
  };
  alertProbe: HostEvidenceAlertProbe | null;
};

export type CommunityChallengeHostEvidence = CommunityChallengeHostEvidencePayload & {
  contentDigest: string;
};

export type CommunityChallengeHostEvidenceVerificationOptions = {
  expectedEnvironment: HostEvidenceEnvironment;
  expectedReleaseSha: string;
  now?: Date;
  maxEvidenceAgeMs?: number;
  maxRunAgeMs?: number;
  requireAlertProbe?: boolean;
};

export type CommunityChallengeHostEvidenceVerification = {
  ok: true;
  environment: HostEvidenceEnvironment;
  releaseSha: string;
  collectedAt: string;
  latestRunCompletedAt: string;
  alertProbeDelivered: boolean;
};

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  throw new Error("host_evidence_value_invalid");
}

export function hashCommunityChallengeHostEvidencePayload(
  payload: CommunityChallengeHostEvidencePayload,
): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function finalizeCommunityChallengeHostEvidence(
  payload: CommunityChallengeHostEvidencePayload,
): CommunityChallengeHostEvidence {
  const validated = validateCommunityChallengeHostEvidencePayload(payload);
  return {
    ...validated,
    contentDigest: hashCommunityChallengeHostEvidencePayload(validated),
  };
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(code);
  }
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  minimum: number,
  maximum: number,
  code: string,
  pattern?: RegExp,
): string {
  if (typeof value !== "string") throw new Error(code);
  const normalized = value.trim();
  if (
    normalized.length < minimum ||
    normalized.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(normalized) ||
    (pattern && !pattern.test(normalized))
  ) {
    throw new Error(code);
  }
  return normalized;
}

function iso(value: unknown, code: string): string {
  const raw = text(value, 20, 40, code);
  if (!Number.isFinite(Date.parse(raw))) throw new Error(code);
  const normalized = new Date(raw).toISOString();
  if (normalized !== raw) throw new Error(code);
  return normalized;
}

function integer(value: unknown, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(code);
  }
  return Number(value);
}

function boolean(value: unknown, expected: boolean, code: string): boolean {
  if (value !== expected) throw new Error(code);
  return expected;
}

function nullableIso(value: unknown, code: string): string | null {
  return value === null ? null : iso(value, code);
}

function validateFileClassification(
  raw: unknown,
  expectedKind: HostEvidenceFileClassification["kind"],
  code: string,
): HostEvidenceFileClassification {
  const value = object(raw, code);
  exactKeys(value, ["kind", "symlink", "mode", "private"], code);
  if (value.kind !== expectedKind) throw new Error(code);
  const mode = text(value.mode, 4, 4, code, /^0[0-7]{3}$/);
  boolean(value.symlink, false, code);
  boolean(value.private, true, code);
  return { kind: expectedKind, symlink: false, mode, private: true };
}

function validateUnit(raw: unknown, expectedKind: "service" | "timer", code: string): HostEvidenceSystemdUnit {
  const value = object(raw, code);
  exactKeys(value, [
    "unit",
    "kind",
    "enabled",
    "active",
    "activeState",
    "subState",
    "unitFileState",
    "nextElapseAt",
    "lastTriggerAt",
    "expectedSha256",
    "installedSha256",
    "matchesExpected",
  ], code);
  if (value.kind !== expectedKind) throw new Error(code);
  const unit = text(value.unit, 3, 200, code, UNIT_RE);
  if (!unit.endsWith(`.${expectedKind}`)) throw new Error(code);
  const activeState = text(value.activeState, 2, 40, code, TOKEN_RE);
  const subState = text(value.subState, 2, 40, code, TOKEN_RE);
  const unitFileState = text(value.unitFileState, 2, 60, code, TOKEN_RE);
  const expectedSha256 = text(value.expectedSha256, 64, 64, code, SHA256_RE);
  const installedSha256 = text(value.installedSha256, 64, 64, code, SHA256_RE);
  if (typeof value.enabled !== "boolean" || typeof value.active !== "boolean") throw new Error(code);
  if (typeof value.matchesExpected !== "boolean") throw new Error(code);
  return {
    unit,
    kind: expectedKind,
    enabled: value.enabled,
    active: value.active,
    activeState,
    subState,
    unitFileState,
    nextElapseAt: nullableIso(value.nextElapseAt, code),
    lastTriggerAt: nullableIso(value.lastTriggerAt, code),
    expectedSha256,
    installedSha256,
    matchesExpected: value.matchesExpected,
  };
}

function validateHealth(raw: unknown): HostEvidenceHealth {
  const value = object(raw, "host_evidence_health_invalid");
  exactKeys(value, [
    "httpStatus",
    "ok",
    "health",
    "service",
    "environment",
    "commit",
    "database",
    "redis",
    "migrationsStatus",
    "migrationsApplied",
  ], "host_evidence_health_invalid");
  if (
    value.httpStatus !== 200 ||
    value.ok !== true ||
    value.health !== "ok" ||
    value.service !== "tecpey-web" ||
    value.environment !== "production" ||
    value.database !== "ok" ||
    value.redis !== "ok" ||
    value.migrationsStatus !== "tracked"
  ) {
    throw new Error("host_evidence_health_invalid");
  }
  return {
    httpStatus: 200,
    ok: true,
    health: "ok",
    service: "tecpey-web",
    environment: "production",
    commit: text(value.commit, 40, 40, "host_evidence_health_invalid", GIT_SHA_RE),
    database: "ok",
    redis: "ok",
    migrationsStatus: "tracked",
    migrationsApplied: integer(value.migrationsApplied, 1, 100_000, "host_evidence_health_invalid"),
  };
}

function validateLatestRun(raw: unknown): HostEvidenceLatestRun | null {
  if (raw === null) return null;
  const value = object(raw, "host_evidence_latest_run_invalid");
  exactKeys(value, [
    "runId",
    "resultStatus",
    "startedAt",
    "completedAt",
    "batchesProcessed",
    "selectedCount",
    "finalizedCompletedCount",
    "finalizedNotCompletedCount",
    "failureCount",
    "drainLimitReached",
  ], "host_evidence_latest_run_invalid");
  if (
    value.resultStatus !== "succeeded" &&
    value.resultStatus !== "partial_failure" &&
    value.resultStatus !== "authority_unavailable"
  ) {
    throw new Error("host_evidence_latest_run_invalid");
  }
  const startedAt = iso(value.startedAt, "host_evidence_latest_run_invalid");
  const completedAt = iso(value.completedAt, "host_evidence_latest_run_invalid");
  if (Date.parse(completedAt) < Date.parse(startedAt)) {
    throw new Error("host_evidence_latest_run_invalid");
  }
  const selectedCount = integer(value.selectedCount, 0, 1_000_000, "host_evidence_latest_run_invalid");
  const finalizedCompletedCount = integer(
    value.finalizedCompletedCount,
    0,
    1_000_000,
    "host_evidence_latest_run_invalid",
  );
  const finalizedNotCompletedCount = integer(
    value.finalizedNotCompletedCount,
    0,
    1_000_000,
    "host_evidence_latest_run_invalid",
  );
  if (finalizedCompletedCount + finalizedNotCompletedCount > selectedCount) {
    throw new Error("host_evidence_latest_run_invalid");
  }
  if (typeof value.drainLimitReached !== "boolean") {
    throw new Error("host_evidence_latest_run_invalid");
  }
  return {
    runId: text(value.runId, 36, 36, "host_evidence_latest_run_invalid", UUID_RE),
    resultStatus: value.resultStatus,
    startedAt,
    completedAt,
    batchesProcessed: integer(value.batchesProcessed, 0, 100, "host_evidence_latest_run_invalid"),
    selectedCount,
    finalizedCompletedCount,
    finalizedNotCompletedCount,
    failureCount: integer(value.failureCount, 0, 1_000_000, "host_evidence_latest_run_invalid"),
    drainLimitReached: value.drainLimitReached,
  };
}

function validateAlertProbe(raw: unknown): HostEvidenceAlertProbe | null {
  if (raw === null) return null;
  const value = object(raw, "host_evidence_alert_probe_invalid");
  exactKeys(value, [
    "requested",
    "alertId",
    "enqueuedAt",
    "deliveredAt",
    "delivered",
    "pendingDuplicate",
  ], "host_evidence_alert_probe_invalid");
  boolean(value.requested, true, "host_evidence_alert_probe_invalid");
  boolean(value.delivered, true, "host_evidence_alert_probe_invalid");
  boolean(value.pendingDuplicate, false, "host_evidence_alert_probe_invalid");
  const enqueuedAt = iso(value.enqueuedAt, "host_evidence_alert_probe_invalid");
  const deliveredAt = iso(value.deliveredAt, "host_evidence_alert_probe_invalid");
  if (Date.parse(deliveredAt) < Date.parse(enqueuedAt)) {
    throw new Error("host_evidence_alert_probe_invalid");
  }
  return {
    requested: true,
    alertId: text(value.alertId, 8, 220, "host_evidence_alert_probe_invalid", TOKEN_RE),
    enqueuedAt,
    deliveredAt,
    delivered: true,
    pendingDuplicate: false,
  };
}

export function validateCommunityChallengeHostEvidencePayload(
  raw: unknown,
): CommunityChallengeHostEvidencePayload {
  const value = object(raw, "host_evidence_payload_invalid");
  exactKeys(value, [
    "schemaVersion",
    "collectorVersion",
    "environment",
    "collectionStartedAt",
    "collectedAt",
    "expectedReleaseSha",
    "observedSourceSha",
    "observedApplicationSha",
    "applicationWorkingTreeClean",
    "hostFingerprint",
    "runtime",
    "systemd",
    "health",
    "database",
    "spool",
    "alertProbe",
  ], "host_evidence_payload_invalid");
  if (value.schemaVersion !== COMMUNITY_CHALLENGE_HOST_EVIDENCE_SCHEMA_VERSION) {
    throw new Error("host_evidence_schema_invalid");
  }
  if (value.collectorVersion !== COMMUNITY_CHALLENGE_HOST_EVIDENCE_COLLECTOR_VERSION) {
    throw new Error("host_evidence_collector_version_invalid");
  }
  if (value.environment !== "staging" && value.environment !== "production") {
    throw new Error("host_evidence_environment_invalid");
  }
  const collectionStartedAt = iso(value.collectionStartedAt, "host_evidence_collection_time_invalid");
  const collectedAt = iso(value.collectedAt, "host_evidence_collection_time_invalid");
  if (Date.parse(collectedAt) < Date.parse(collectionStartedAt)) {
    throw new Error("host_evidence_collection_time_invalid");
  }

  const runtime = object(value.runtime, "host_evidence_runtime_invalid");
  exactKeys(runtime, [
    "currentUser",
    "currentGroup",
    "expectedUser",
    "expectedGroup",
    "identityMatches",
    "environmentFile",
    "stateDirectory",
  ], "host_evidence_runtime_invalid");
  const currentUser = text(runtime.currentUser, 1, 32, "host_evidence_runtime_invalid", TOKEN_RE);
  const currentGroup = text(runtime.currentGroup, 1, 32, "host_evidence_runtime_invalid", TOKEN_RE);
  const expectedUser = text(runtime.expectedUser, 1, 32, "host_evidence_runtime_invalid", TOKEN_RE);
  const expectedGroup = text(runtime.expectedGroup, 1, 32, "host_evidence_runtime_invalid", TOKEN_RE);
  boolean(runtime.identityMatches, true, "host_evidence_runtime_invalid");
  if (currentUser !== expectedUser || currentGroup !== expectedGroup) {
    throw new Error("host_evidence_runtime_invalid");
  }

  const systemd = object(value.systemd, "host_evidence_systemd_invalid");
  exactKeys(systemd, [
    "finalizerService",
    "finalizerTimer",
    "alertDeliveryService",
    "alertDeliveryTimer",
  ], "host_evidence_systemd_invalid");

  const database = object(value.database, "host_evidence_database_invalid");
  exactKeys(database, ["migration0050Applied", "latestRun"], "host_evidence_database_invalid");
  boolean(database.migration0050Applied, true, "host_evidence_database_invalid");

  const spool = object(value.spool, "host_evidence_spool_invalid");
  exactKeys(spool, ["pending", "delivered", "quarantine"], "host_evidence_spool_invalid");

  return {
    schemaVersion: 1,
    collectorVersion: COMMUNITY_CHALLENGE_HOST_EVIDENCE_COLLECTOR_VERSION,
    environment: value.environment,
    collectionStartedAt,
    collectedAt,
    expectedReleaseSha: text(value.expectedReleaseSha, 40, 40, "host_evidence_release_sha_invalid", GIT_SHA_RE),
    observedSourceSha: text(value.observedSourceSha, 40, 40, "host_evidence_release_sha_invalid", GIT_SHA_RE),
    observedApplicationSha: text(
      value.observedApplicationSha,
      40,
      40,
      "host_evidence_release_sha_invalid",
      GIT_SHA_RE,
    ),
    applicationWorkingTreeClean: boolean(
      value.applicationWorkingTreeClean,
      true,
      "host_evidence_worktree_invalid",
    ) as true,
    hostFingerprint: text(value.hostFingerprint, 64, 64, "host_evidence_host_invalid", SHA256_RE),
    runtime: {
      currentUser,
      currentGroup,
      expectedUser,
      expectedGroup,
      identityMatches: true,
      environmentFile: validateFileClassification(
        runtime.environmentFile,
        "regular_file",
        "host_evidence_runtime_invalid",
      ),
      stateDirectory: validateFileClassification(
        runtime.stateDirectory,
        "directory",
        "host_evidence_runtime_invalid",
      ),
    },
    systemd: {
      finalizerService: validateUnit(
        systemd.finalizerService,
        "service",
        "host_evidence_systemd_invalid",
      ),
      finalizerTimer: validateUnit(systemd.finalizerTimer, "timer", "host_evidence_systemd_invalid"),
      alertDeliveryService: validateUnit(
        systemd.alertDeliveryService,
        "service",
        "host_evidence_systemd_invalid",
      ),
      alertDeliveryTimer: validateUnit(
        systemd.alertDeliveryTimer,
        "timer",
        "host_evidence_systemd_invalid",
      ),
    },
    health: validateHealth(value.health),
    database: {
      migration0050Applied: true,
      latestRun: validateLatestRun(database.latestRun),
    },
    spool: {
      pending: integer(spool.pending, 0, 1_000_000, "host_evidence_spool_invalid"),
      delivered: integer(spool.delivered, 0, 1_000_000, "host_evidence_spool_invalid"),
      quarantine: integer(spool.quarantine, 0, 1_000_000, "host_evidence_spool_invalid"),
    },
    alertProbe: validateAlertProbe(value.alertProbe),
  };
}

export function validateCommunityChallengeHostEvidence(
  raw: unknown,
): CommunityChallengeHostEvidence {
  const value = object(raw, "host_evidence_invalid");
  exactKeys(value, [
    "schemaVersion",
    "collectorVersion",
    "environment",
    "collectionStartedAt",
    "collectedAt",
    "expectedReleaseSha",
    "observedSourceSha",
    "observedApplicationSha",
    "applicationWorkingTreeClean",
    "hostFingerprint",
    "runtime",
    "systemd",
    "health",
    "database",
    "spool",
    "alertProbe",
    "contentDigest",
  ], "host_evidence_invalid");
  const { contentDigest, ...payload } = value;
  const validated = validateCommunityChallengeHostEvidencePayload(payload);
  const digest = text(contentDigest, 64, 64, "host_evidence_digest_invalid", SHA256_RE);
  if (hashCommunityChallengeHostEvidencePayload(validated) !== digest) {
    throw new Error("host_evidence_digest_mismatch");
  }
  return { ...validated, contentDigest: digest };
}

function positiveDuration(
  value: number | undefined,
  fallback: number,
  maximum: number,
  code: string,
): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0 || selected > maximum) {
    throw new Error(code);
  }
  return selected;
}

function rejectSensitiveMaterial(evidence: CommunityChallengeHostEvidence): void {
  const serialized = JSON.stringify(evidence);
  const forbidden = [
    /postgres(?:ql)?:\/\//i,
    /DATABASE_URL/i,
    /TECPEY_OPS_ALERT_BEARER_TOKEN/i,
    /Authorization/i,
    /Bearer\s+[A-Za-z0-9._~+\/-]+/i,
    /studentId/i,
    /tenantId/i,
    /principalId/i,
    /(?:^|[^0-9])(?:\d{1,3}\.){3}\d{1,3}(?:[^0-9]|$)/,
  ];
  if (forbidden.some((pattern) => pattern.test(serialized))) {
    throw new Error("host_evidence_sensitive_material_detected");
  }
}

function requireHealthyUnit(unit: HostEvidenceSystemdUnit, code: string): void {
  if (!unit.matchesExpected || unit.expectedSha256 !== unit.installedSha256) throw new Error(code);
  if (unit.kind === "timer") {
    if (!unit.enabled || !unit.active || unit.activeState !== "active") throw new Error(code);
    if (!unit.nextElapseAt) throw new Error(code);
  }
}

export function verifyCommunityChallengeHostEvidence(
  raw: unknown,
  options: CommunityChallengeHostEvidenceVerificationOptions,
): CommunityChallengeHostEvidenceVerification {
  const evidence = validateCommunityChallengeHostEvidence(raw);
  rejectSensitiveMaterial(evidence);
  const expectedReleaseSha = text(
    options.expectedReleaseSha,
    40,
    40,
    "host_evidence_expected_release_invalid",
    GIT_SHA_RE,
  );
  if (evidence.environment !== options.expectedEnvironment) {
    throw new Error("host_evidence_environment_mismatch");
  }
  if (
    evidence.expectedReleaseSha !== expectedReleaseSha ||
    evidence.observedSourceSha !== expectedReleaseSha ||
    evidence.observedApplicationSha !== expectedReleaseSha ||
    evidence.health.commit !== expectedReleaseSha
  ) {
    throw new Error("host_evidence_release_mismatch");
  }
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("host_evidence_clock_invalid");
  const maxEvidenceAgeMs = positiveDuration(
    options.maxEvidenceAgeMs,
    15 * 60_000,
    24 * 60 * 60_000,
    "host_evidence_max_age_invalid",
  );
  const maxRunAgeMs = positiveDuration(
    options.maxRunAgeMs,
    2 * 60 * 60_000,
    7 * 24 * 60 * 60_000,
    "host_evidence_max_run_age_invalid",
  );
  const collectedAtMs = Date.parse(evidence.collectedAt);
  if (collectedAtMs > now.getTime() + 60_000 || now.getTime() - collectedAtMs > maxEvidenceAgeMs) {
    throw new Error("host_evidence_stale");
  }
  if (Date.parse(evidence.collectionStartedAt) > collectedAtMs) {
    throw new Error("host_evidence_collection_time_invalid");
  }

  requireHealthyUnit(evidence.systemd.finalizerService, "host_evidence_finalizer_service_invalid");
  requireHealthyUnit(evidence.systemd.finalizerTimer, "host_evidence_finalizer_timer_invalid");
  requireHealthyUnit(evidence.systemd.alertDeliveryService, "host_evidence_alert_service_invalid");
  requireHealthyUnit(evidence.systemd.alertDeliveryTimer, "host_evidence_alert_timer_invalid");

  if (
    evidence.runtime.currentUser !== evidence.runtime.expectedUser ||
    evidence.runtime.currentGroup !== evidence.runtime.expectedGroup ||
    !evidence.runtime.environmentFile.private ||
    !evidence.runtime.stateDirectory.private
  ) {
    throw new Error("host_evidence_runtime_invalid");
  }
  if (
    evidence.health.httpStatus !== 200 ||
    evidence.health.health !== "ok" ||
    evidence.health.database !== "ok" ||
    evidence.health.redis !== "ok" ||
    evidence.health.environment !== "production" ||
    evidence.health.migrationsStatus !== "tracked" ||
    !evidence.database.migration0050Applied
  ) {
    throw new Error("host_evidence_health_invalid");
  }
  const latestRun = evidence.database.latestRun;
  if (!latestRun) throw new Error("host_evidence_latest_run_missing");
  if (latestRun.resultStatus !== "succeeded" || latestRun.failureCount !== 0 || latestRun.drainLimitReached) {
    throw new Error("host_evidence_latest_run_unhealthy");
  }
  const runCompletedMs = Date.parse(latestRun.completedAt);
  if (
    runCompletedMs > collectedAtMs + 60_000 ||
    collectedAtMs - runCompletedMs > maxRunAgeMs
  ) {
    throw new Error("host_evidence_latest_run_stale");
  }
  if (evidence.spool.pending !== 0) throw new Error("host_evidence_pending_alerts_present");
  if (evidence.spool.quarantine !== 0) throw new Error("host_evidence_quarantine_present");

  if (options.requireAlertProbe) {
    if (!evidence.alertProbe?.delivered || evidence.alertProbe.pendingDuplicate) {
      throw new Error("host_evidence_alert_probe_missing");
    }
    if (
      Date.parse(evidence.alertProbe.enqueuedAt) < Date.parse(evidence.collectionStartedAt) - 60_000 ||
      Date.parse(evidence.alertProbe.deliveredAt) > collectedAtMs + 60_000
    ) {
      throw new Error("host_evidence_alert_probe_time_invalid");
    }
  } else if (evidence.alertProbe !== null && !evidence.alertProbe.delivered) {
    throw new Error("host_evidence_alert_probe_invalid");
  }

  return {
    ok: true,
    environment: evidence.environment,
    releaseSha: expectedReleaseSha,
    collectedAt: evidence.collectedAt,
    latestRunCompletedAt: latestRun.completedAt,
    alertProbeDelivered: Boolean(evidence.alertProbe?.delivered),
  };
}
