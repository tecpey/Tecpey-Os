import path from "node:path";

export const STAGING_SERVICE = "tecpey-staging.service";
export const RELEASE_ROOT = "/srv/tecpey/releases";
export const SYSTEMD_ROOT = "/etc/systemd/system";

export const DEFAULT_STAGING_SMOKE_PATHS = Object.freeze([
  "/",
  "/en",
  "/academy",
  "/en/academy",
  "/academy/login",
  "/en/academy/login",
  "/academy/profile",
  "/en/academy/profile",
  "/academy/account",
  "/en/academy/account",
  "/academy/ai-guide",
  "/en/academy/ai-guide",
  "/academy/market-intelligence",
  "/en/academy/market-intelligence",
  "/academy/trading-arena",
  "/en/academy/trading-arena",
  "/academy/notifications",
  "/en/academy/notifications",
]);

const MIGRATION_AUTHORITY_PATHS = Object.freeze([
  /^migrations\//,
  /^src\/lib\/db-migrate\.ts$/,
  /^src\/lib\/db-migration-(?:registry|readiness)\.ts$/,
  /^scripts\/(?:run-database-migrations|check-database-migration-authority)\.(?:ts|mjs)$/,
]);

export function classifyMigrationRollbackSafety(changedPaths) {
  if (!Array.isArray(changedPaths) || changedPaths.some((value) => typeof value !== "string")) {
    throw new Error("migration_changed_paths_invalid");
  }
  const migrationAuthorityChanges = changedPaths.filter((file) =>
    MIGRATION_AUTHORITY_PATHS.some((pattern) => pattern.test(file)),
  );
  return Object.freeze({
    mode:
      migrationAuthorityChanges.length === 0
        ? "app_rollback_safe_no_migration_authority_change"
        : "forward_fix_or_restore_required",
    migrationAuthorityChanges: Object.freeze([...migrationAuthorityChanges].sort()),
  });
}

const EXACT_SHA = /^[0-9a-f]{40}$/;
const RELEASE_PATH = /^\/srv\/tecpey\/releases\/([0-9a-f]{40})$/;
const SYSTEMD_DROP_IN =
  /^\/etc\/systemd\/system\/tecpey-staging\.service(?:\.d\/[A-Za-z0-9_.-]+\.conf)?$/;

const PRODUCTION_HOSTS = new Set([
  "tecpey.ir",
  "www.tecpey.ir",
  "my.tecpey.ir",
  "api.tecpey.ir",
  "stream.tecpey.ir",
]);

export function assertExactReleaseSha(value, label = "release_sha") {
  if (typeof value !== "string" || !EXACT_SHA.test(value)) {
    throw new Error(`${label}_must_be_exact_lowercase_sha`);
  }
  return value;
}

export function releasePathForSha(sha) {
  return `${RELEASE_ROOT}/${assertExactReleaseSha(sha)}`;
}

export function assertReleasePath(value, expectedSha = null) {
  if (typeof value !== "string") throw new Error("release_path_invalid");
  const match = RELEASE_PATH.exec(value);
  if (!match) throw new Error("release_path_outside_immutable_root");
  if (expectedSha !== null && match[1] !== assertExactReleaseSha(expectedSha, "expected_sha")) {
    throw new Error("release_path_sha_mismatch");
  }
  return value;
}

export function assertStagingService(value) {
  if (value !== STAGING_SERVICE) throw new Error("staging_service_name_invalid");
  return value;
}

export function assertSafeSystemdMutationPath(value) {
  if (
    typeof value !== "string" ||
    !path.posix.isAbsolute(value) ||
    !SYSTEMD_DROP_IN.test(value)
  ) {
    throw new Error("staging_unit_mutation_path_invalid");
  }
  if (value.includes("..")) throw new Error("staging_unit_mutation_path_invalid");
  return value;
}

export function assertSafeStagingPublicBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("staging_public_base_url_invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !url.hostname
  ) {
    throw new Error("staging_public_base_url_invalid");
  }
  const hostname = url.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(hostname) || hostname.endsWith(".tecpey.ir")) {
    throw new Error("staging_public_base_url_must_not_target_production");
  }
  return url.origin;
}

export function assertSafeEnvironmentFilePath(value) {
  if (
    typeof value !== "string" ||
    !path.posix.isAbsolute(value) ||
    value.length > 500 ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    throw new Error("staging_environment_file_path_invalid");
  }
  return value;
}

export function replaceReleasePathInUnit(source, currentReleasePath, nextReleasePath) {
  if (typeof source !== "string" || !source.trim()) {
    throw new Error("staging_unit_source_invalid");
  }
  assertReleasePath(currentReleasePath);
  assertReleasePath(nextReleasePath);
  if (currentReleasePath === nextReleasePath) {
    throw new Error("staging_release_already_active");
  }

  const occurrences = source.split(currentReleasePath).length - 1;
  if (occurrences < 1 || occurrences > 8) {
    throw new Error("staging_unit_release_path_occurrence_invalid");
  }

  const updated = source.split(currentReleasePath).join(nextReleasePath);
  if (updated.includes(currentReleasePath)) {
    throw new Error("staging_unit_release_path_replacement_incomplete");
  }
  const foreignReleasePaths = [
    ...updated.matchAll(/\/srv\/tecpey\/releases\/[0-9a-f]{40}/g),
  ].map((match) => match[0]).filter((value) => value !== nextReleasePath);
  if (foreignReleasePaths.length) {
    throw new Error("staging_unit_contains_foreign_release_path");
  }
  for (const forbidden of [
    "tecpey-production.service",
    "/srv/tecpey/production",
    "/var/www/tecpey",
  ]) {
    if (updated.includes(forbidden)) {
      throw new Error("staging_unit_contains_production_target");
    }
  }
  return updated;
}

export function validateStagingHealth(payload, expectedSha) {
  const sha = assertExactReleaseSha(expectedSha, "expected_sha");
  if (!payload || typeof payload !== "object") throw new Error("staging_health_invalid");
  if (payload.ok !== true || payload.health !== "ok") {
    throw new Error("staging_health_not_ok");
  }
  if (payload.build?.commit !== sha) {
    throw new Error("staging_health_commit_mismatch");
  }
  if (
    payload.checks?.database !== "ok" ||
    payload.checks?.schema !== "current" ||
    payload.checks?.redis !== "ok" ||
    payload.checks?.runtime !== "ready" ||
    payload.checks?.email !== "configured" ||
    !["ready", "disabled"].includes(payload.checks?.requiredWorkers)
  ) {
    throw new Error("staging_health_dependency_not_ready");
  }
  return true;
}

function sanitizeHealthEvidence(payload) {
  const migrationStatus = payload.migrations?.status ?? payload.checks?.schema ?? null;
  const migrationCurrent = Number.isInteger(payload.migrations?.current)
    ? payload.migrations.current
    : null;
  return {
    commit: payload.build.commit,
    database: payload.checks.database,
    schema: payload.checks.schema,
    redis: payload.checks.redis,
    runtime: payload.checks.runtime,
    email: payload.checks.email,
    requiredWorkers: payload.checks.requiredWorkers,
    migrationStatus,
    migrationCurrent,
  };
}

export function validateSmokeResult({ path: routePath, finalStatus, finalUrl }, expectedOrigin) {
  if (!DEFAULT_STAGING_SMOKE_PATHS.includes(routePath)) {
    throw new Error("staging_smoke_path_not_governed");
  }
  if (!Number.isInteger(finalStatus) || finalStatus < 200 || finalStatus >= 300) {
    throw new Error("staging_smoke_final_status_invalid");
  }
  let url;
  try {
    url = new URL(finalUrl);
  } catch {
    throw new Error("staging_smoke_final_url_invalid");
  }
  if (url.origin !== assertSafeStagingPublicBaseUrl(expectedOrigin)) {
    throw new Error("staging_smoke_redirected_off_staging_origin");
  }
  return true;
}

export function buildPromotionEvidence(input) {
  const {
    previousSha,
    targetSha,
    imageDigest,
    publicBaseUrl,
    smokeResults,
    startedAt,
    completedAt,
    rollback,
    migration,
    operation = "promoted",
    runtimeHealth,
    previousHealth = null,
    backupManifest = null,
  } = input;
  assertExactReleaseSha(previousSha, "previous_sha");
  assertExactReleaseSha(targetSha, "target_sha");
  if (!["promoted", "verified_already_active"].includes(operation)) {
    throw new Error("promotion_operation_invalid");
  }
  if (previousSha === targetSha && operation !== "verified_already_active") {
    throw new Error("promotion_target_equals_previous");
  }
  if (previousSha !== targetSha && operation === "verified_already_active") {
    throw new Error("promotion_already_active_sha_mismatch");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(imageDigest ?? "")) {
    throw new Error("promotion_image_digest_invalid");
  }
  const origin = assertSafeStagingPublicBaseUrl(publicBaseUrl);
  if (!Array.isArray(smokeResults) || smokeResults.length !== DEFAULT_STAGING_SMOKE_PATHS.length) {
    throw new Error("promotion_smoke_matrix_incomplete");
  }
  const seen = new Set();
  for (const result of smokeResults) {
    validateSmokeResult(result, origin);
    if (seen.has(result.path)) throw new Error("promotion_smoke_path_duplicate");
    seen.add(result.path);
  }
  for (const required of DEFAULT_STAGING_SMOKE_PATHS) {
    if (!seen.has(required)) throw new Error("promotion_smoke_matrix_incomplete");
  }
  for (const [name, value] of [["started_at", startedAt], ["completed_at", completedAt]]) {
    if (typeof value !== "string" || new Date(value).toISOString() !== value) {
      throw new Error(`promotion_${name}_invalid`);
    }
  }
  if (!rollback || !["armed", "not_needed", "completed", "completed_and_repromoted", "not_permitted_schema_authority_changed"].includes(rollback.disposition)) {
    throw new Error("promotion_rollback_evidence_invalid");
  }
  if (
    !migration ||
    !/^[0-9a-f]{64}$/.test(migration.previousPlanHash ?? "") ||
    !/^[0-9a-f]{64}$/.test(migration.targetPlanHash ?? "") ||
    !["app_rollback_safe_no_migration_authority_change", "forward_fix_or_restore_required"].includes(migration.rollbackMode)
  ) {
    throw new Error("promotion_migration_evidence_invalid");
  }
  const hashesEqual = migration.previousPlanHash === migration.targetPlanHash;
  if (
    (hashesEqual && migration.rollbackMode !== "app_rollback_safe_no_migration_authority_change") ||
    (!hashesEqual && migration.rollbackMode !== "forward_fix_or_restore_required")
  ) {
    throw new Error("promotion_migration_rollback_mode_mismatch");
  }
  validateStagingHealth(runtimeHealth, targetSha);
  const sanitizedRuntime = sanitizeHealthEvidence(runtimeHealth);

  let sanitizedPreviousRuntime = null;
  if (operation === "promoted") {
    validateStagingHealth(previousHealth, previousSha);
    sanitizedPreviousRuntime = sanitizeHealthEvidence(previousHealth);
  }

  let sanitizedBackup = null;
  if (operation === "promoted") {
    if (!backupManifest || typeof backupManifest !== "object") {
      throw new Error("promotion_backup_manifest_missing");
    }
    assertReleasePath(backupManifest.previousReleasePath, previousSha);
    assertReleasePath(backupManifest.targetReleasePath, targetSha);
    assertSafeSystemdMutationPath(backupManifest.unitPath);
    for (const [name, digest] of [
      ["previous_unit_digest", backupManifest.previousUnitDigest],
      ["target_unit_digest", backupManifest.targetUnitDigest],
    ]) {
      if (!/^sha256:[0-9a-f]{64}$/.test(digest ?? "")) {
        throw new Error(`promotion_${name}_invalid`);
      }
    }
    sanitizedBackup = {
      previousReleasePath: backupManifest.previousReleasePath,
      targetReleasePath: backupManifest.targetReleasePath,
      unitPath: backupManifest.unitPath,
      previousUnitDigest: backupManifest.previousUnitDigest,
      targetUnitDigest: backupManifest.targetUnitDigest,
    };
  }

  return {
    schemaVersion: 1,
    evidenceClass: "tecpey-staging-promotion-v1",
    environment: "staging",
    previousSha,
    targetSha,
    supplyChainImageDigest: imageDigest,
    publicOrigin: origin,
    previousRuntime: sanitizedPreviousRuntime,
    runtime: sanitizedRuntime,
    backup: sanitizedBackup,
    smokeResults: smokeResults.map(({ path: smokePath, finalStatus }) => ({
      path: smokePath,
      finalStatus,
    })),
    operation,
    migration: {
      previousPlanHash: migration.previousPlanHash,
      targetPlanHash: migration.targetPlanHash,
      rollbackMode: migration.rollbackMode,
    },
    rollback: { disposition: rollback.disposition },
    startedAt,
    completedAt,
  };
}
