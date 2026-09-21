import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STAGING_SMOKE_PATHS,
  STAGING_SERVICE,
  assertExactReleaseSha,
  assertReleasePath,
  assertSafeStagingPublicBaseUrl,
  assertSafeStagingHealthUrl,
  assertSafeSystemdMutationPath,
  assertStagingService,
  buildPromotionEvidence,
  classifyMigrationRollbackSafety,
  evaluateMigrationCutover,
  releasePathForSha,
  replaceReleasePathInUnit,
  validateSmokeResult,
  validateStagingHealth,
} from "./staging-promotion-policy.mjs";

const PREVIOUS = "b".repeat(40);
const TARGET = "a".repeat(40);
const PLAN = "f".repeat(64);

function healthy(sha, current = 123) {
  return {
    ok: true,
    health: "ok",
    build: { commit: sha },
    checks: {
      database: "ok",
      schema: "current",
      redis: "ok",
      runtime: "ready",
      email: "configured",
      requiredWorkers: "disabled",
    },
    migrations: { status: "current", current },
  };
}

const BACKUP_MANIFEST = {
  previousReleasePath: `/srv/tecpey/releases/${PREVIOUS}`,
  targetReleasePath: `/srv/tecpey/releases/${TARGET}`,
  unitPath: "/etc/systemd/system/tecpey-staging.service.d/release.conf",
  previousUnitDigest: `sha256:${"c".repeat(64)}`,
  targetUnitDigest: `sha256:${"d".repeat(64)}`,
};

test("exact release SHA rejects mutable refs, uppercase and short SHAs", () => {
  assert.equal(assertExactReleaseSha(TARGET), TARGET);
  for (const invalid of ["main", "abc123", TARGET.toUpperCase(), `${TARGET}x`, ""]) {
    assert.throws(() => assertExactReleaseSha(invalid), /exact_lowercase_sha/);
  }
});

test("release paths are immutable exact-SHA paths only", () => {
  assert.equal(releasePathForSha(TARGET), `/srv/tecpey/releases/${TARGET}`);
  assert.equal(assertReleasePath(`/srv/tecpey/releases/${TARGET}`, TARGET), `/srv/tecpey/releases/${TARGET}`);
  for (const invalid of [
    "/srv/tecpey/current",
    `/srv/tecpey/releases/${TARGET}/nested`,
    `/var/www/tecpey/${TARGET}`,
  ]) {
    assert.throws(() => assertReleasePath(invalid), /release_path/);
  }
});

test("only the staging service and its governed systemd files can be mutated", () => {
  assert.equal(assertStagingService(STAGING_SERVICE), STAGING_SERVICE);
  assert.equal(
    assertSafeSystemdMutationPath("/etc/systemd/system/tecpey-staging.service"),
    "/etc/systemd/system/tecpey-staging.service",
  );
  assert.equal(
    assertSafeSystemdMutationPath("/etc/systemd/system/tecpey-staging.service.d/release.conf"),
    "/etc/systemd/system/tecpey-staging.service.d/release.conf",
  );
  assert.throws(() => assertStagingService("tecpey-production.service"), /service_name_invalid/);
  assert.throws(
    () => assertSafeSystemdMutationPath("/etc/systemd/system/tecpey-production.service"),
    /mutation_path_invalid/,
  );
  assert.throws(
    () => assertSafeSystemdMutationPath("/lib/systemd/system/tecpey-staging.service"),
    /mutation_path_invalid/,
  );
});

test("public staging origin must be HTTPS and cannot target production TecPey hosts", () => {
  assert.equal(assertSafeStagingPublicBaseUrl("https://tecp.ir"), "https://tecp.ir");
  for (const invalid of [
    "http://tecp.ir",
    "https://tecpey.ir",
    "https://my.tecpey.ir",
    "https://preview.tecpey.ir",
    "https://example.com",
    "https://user:pass@tecp.ir",
    "https://tecp.ir/path",
  ]) {
    assert.throws(() => assertSafeStagingPublicBaseUrl(invalid), /staging_public_base_url/);
  }
});

test("staging health URL is governed and cannot target production or arbitrary hosts", () => {
  assert.equal(
    assertSafeStagingHealthUrl("http://127.0.0.1:3000/api/health"),
    "http://127.0.0.1:3000/api/health",
  );
  assert.equal(
    assertSafeStagingHealthUrl("https://tecp.ir/api/health"),
    "https://tecp.ir/api/health",
  );
  for (const invalid of [
    "http://127.0.0.1/api/health",
    "http://tecp.ir:3000/api/health",
    "https://tecpey.ir/api/health",
    "https://my.tecpey.ir/api/health",
    "https://example.com/api/health",
    "https://tecp.ir/health",
    "https://user:pass@tecp.ir/api/health",
    "https://tecp.ir/api/health?deep=1",
  ]) {
    assert.throws(() => assertSafeStagingHealthUrl(invalid), /staging_health_url/);
  }
});

test("unit release replacement is bounded, exact and production-safe", () => {
  const currentPath = `/srv/tecpey/releases/${PREVIOUS}`;
  const nextPath = `/srv/tecpey/releases/${TARGET}`;
  const unit = `[Service]\nWorkingDirectory=${currentPath}\nExecStart=/usr/bin/npm --prefix ${currentPath} start\n`;
  const updated = replaceReleasePathInUnit(unit, currentPath, nextPath);
  assert.match(updated, new RegExp(TARGET, "g"));
  assert.doesNotMatch(updated, new RegExp(PREVIOUS, "g"));
  assert.throws(
    () => replaceReleasePathInUnit("[Service]\nWorkingDirectory=/var/www/tecpey\n", currentPath, nextPath),
    /occurrence_invalid/,
  );
  assert.throws(
    () => replaceReleasePathInUnit(`${unit}Environment=UNIT=tecpey-production.service\n`, currentPath, nextPath),
    /production_target/,
  );
});

test("health authority requires exact commit and all governed dependencies", () => {
  const health = healthy(TARGET);
  assert.equal(validateStagingHealth(health, TARGET), true);
  assert.throws(() => validateStagingHealth({ ...health, build: { commit: PREVIOUS } }, TARGET), /commit_mismatch/);
  assert.throws(
    () => validateStagingHealth({ ...health, checks: { ...health.checks, schema: "pending" } }, TARGET),
    /dependency_not_ready/,
  );
});

test("smoke validation rejects failures and redirects away from staging", () => {
  assert.equal(
    validateSmokeResult(
      { path: "/academy/profile", finalStatus: 200, finalUrl: "https://tecp.ir/academy/login" },
      "https://tecp.ir",
    ),
    true,
  );
  assert.throws(
    () => validateSmokeResult(
      { path: "/academy/profile", finalStatus: 500, finalUrl: "https://tecp.ir/academy/profile" },
      "https://tecp.ir",
    ),
    /final_status_invalid/,
  );
  assert.throws(
    () => validateSmokeResult(
      { path: "/academy/profile", finalStatus: 200, finalUrl: "https://tecpey.ir/" },
      "https://tecp.ir",
    ),
    /redirected_off_staging_origin/,
  );
});

test("promotion evidence is complete, redacted and bound to the full FA/EN smoke matrix", () => {
  const smokeResults = DEFAULT_STAGING_SMOKE_PATHS.map((smokePath) => ({
    path: smokePath,
    finalStatus: 200,
    finalUrl: `https://tecp.ir${smokePath}`,
  }));
  const evidence = buildPromotionEvidence({
    previousSha: PREVIOUS,
    targetSha: TARGET,
    imageDigest: `sha256:${"a".repeat(64)}`,
    publicBaseUrl: "https://tecp.ir",
    smokeResults,
    startedAt: "2026-09-21T10:00:00.000Z",
    completedAt: "2026-09-21T10:04:00.000Z",
    rollback: { disposition: "not_needed" },
    migration: { previousPlanHash: PLAN, targetPlanHash: PLAN, authorityChanges: [], rollbackMode: "app_rollback_safe_no_migration_authority_change" },
    previousHealth: healthy(PREVIOUS, 122),
    runtimeHealth: healthy(TARGET, 123),
    backupManifest: BACKUP_MANIFEST,
  });
  assert.equal(evidence.environment, "staging");
  assert.equal(evidence.targetSha, TARGET);
  assert.equal(evidence.supplyChainImageDigest, `sha256:${"a".repeat(64)}`);
  assert.equal("imageDigest" in evidence, false);
  assert.equal(evidence.smokeResults.length, DEFAULT_STAGING_SMOKE_PATHS.length);
  assert.equal(JSON.stringify(evidence).includes("secret"), false);
  assert.throws(
    () => buildPromotionEvidence({
      previousSha: PREVIOUS,
      targetSha: TARGET,
      imageDigest: `sha256:${"a".repeat(64)}`,
      publicBaseUrl: "https://tecp.ir",
      smokeResults: smokeResults.slice(1),
      startedAt: "2026-09-21T10:00:00.000Z",
      completedAt: "2026-09-21T10:04:00.000Z",
      rollback: { disposition: "not_needed" },
      previousHealth: healthy(PREVIOUS, 122),
      runtimeHealth: healthy(TARGET, 123),
      backupManifest: BACKUP_MANIFEST,
    }),
    /smoke_matrix_incomplete/,
  );
});

test("already-active verification is an idempotent accepted operation", () => {
  const smokeResults = DEFAULT_STAGING_SMOKE_PATHS.map((smokePath) => ({
    path: smokePath,
    finalStatus: 200,
    finalUrl: `https://tecp.ir${smokePath}`,
  }));
  const evidence = buildPromotionEvidence({
    previousSha: TARGET,
    targetSha: TARGET,
    imageDigest: `sha256:${"b".repeat(64)}`,
    publicBaseUrl: "https://tecp.ir",
    smokeResults,
    startedAt: "2026-09-21T10:00:00.000Z",
    completedAt: "2026-09-21T10:01:00.000Z",
    rollback: { disposition: "not_needed" },
    migration: { previousPlanHash: PLAN, targetPlanHash: PLAN, authorityChanges: [], rollbackMode: "app_rollback_safe_no_migration_authority_change" },
    operation: "verified_already_active",
    runtimeHealth: healthy(TARGET, 123),
  });
  assert.equal(evidence.operation, "verified_already_active");
  assert.equal(evidence.previousSha, TARGET);
  assert.equal(evidence.targetSha, TARGET);
  assert.throws(
    () => buildPromotionEvidence({
      previousSha: PREVIOUS,
      targetSha: TARGET,
      imageDigest: `sha256:${"b".repeat(64)}`,
      publicBaseUrl: "https://tecp.ir",
      smokeResults,
      startedAt: "2026-09-21T10:00:00.000Z",
      completedAt: "2026-09-21T10:01:00.000Z",
      rollback: { disposition: "not_needed" },
      operation: "verified_already_active",
      runtimeHealth: healthy(TARGET, 123),
    }),
    /already_active_sha_mismatch/,
  );
});

test("new promotion evidence fails closed without previous health or a unit backup manifest", () => {
  const smokeResults = DEFAULT_STAGING_SMOKE_PATHS.map((smokePath) => ({
    path: smokePath,
    finalStatus: 200,
    finalUrl: `https://tecp.ir${smokePath}`,
  }));
  const base = {
    previousSha: PREVIOUS,
    targetSha: TARGET,
    imageDigest: `sha256:${"e".repeat(64)}`,
    publicBaseUrl: "https://tecp.ir",
    smokeResults,
    startedAt: "2026-09-21T10:00:00.000Z",
    completedAt: "2026-09-21T10:04:00.000Z",
    rollback: { disposition: "not_needed" },
    migration: { previousPlanHash: PLAN, targetPlanHash: PLAN, authorityChanges: [], rollbackMode: "app_rollback_safe_no_migration_authority_change" },
    runtimeHealth: healthy(TARGET, 123),
  };
  assert.throws(
    () => buildPromotionEvidence({ ...base, backupManifest: BACKUP_MANIFEST }),
    /staging_health_invalid/,
  );
  assert.throws(
    () => buildPromotionEvidence({ ...base, previousHealth: healthy(PREVIOUS, 122) }),
    /backup_manifest_missing/,
  );
});



test("classifies migration-authority changes as forward-fix/restore only", () => {
  assert.deepEqual(
    classifyMigrationRollbackSafety([
      "src/components/navbar/Navbar.tsx",
      "docs/program/01_STAGING_RELEASE_AUTOMATION_CONTRACT.md",
    ]),
    {
      mode: "app_rollback_safe_no_migration_authority_change",
      migrationAuthorityChanges: [],
    },
  );

  const changed = classifyMigrationRollbackSafety([
    "src/components/navbar/Navbar.tsx",
    "migrations/0112_example.sql",
    "src/lib/db-migration-registry.ts",
  ]);
  assert.equal(changed.mode, "forward_fix_or_restore_required");
  assert.deepEqual(changed.migrationAuthorityChanges, [
    "migrations/0112_example.sql",
    "src/lib/db-migration-registry.ts",
  ]);

  assert.throws(
    () => classifyMigrationRollbackSafety(["ok.ts", null]),
    /migration_changed_paths_invalid/,
  );
});

test("migration cutover policy requires explicit schema authority and forbids schema-changing downgrade", () => {
  assert.equal(
    evaluateMigrationCutover({
      isDowngrade: false,
      rollbackMode: "app_rollback_safe_no_migration_authority_change",
      allowSchemaChange: false,
    }),
    "allowed",
  );
  assert.equal(
    evaluateMigrationCutover({
      isDowngrade: false,
      rollbackMode: "forward_fix_or_restore_required",
      allowSchemaChange: false,
    }),
    "require_schema_change_approval",
  );
  assert.equal(
    evaluateMigrationCutover({
      isDowngrade: false,
      rollbackMode: "forward_fix_or_restore_required",
      allowSchemaChange: true,
    }),
    "allowed",
  );
  assert.equal(
    evaluateMigrationCutover({
      isDowngrade: true,
      rollbackMode: "app_rollback_safe_no_migration_authority_change",
      allowSchemaChange: false,
    }),
    "allowed",
  );
  assert.equal(
    evaluateMigrationCutover({
      isDowngrade: true,
      rollbackMode: "forward_fix_or_restore_required",
      allowSchemaChange: true,
    }),
    "reject_schema_change_downgrade",
  );
  assert.throws(
    () => evaluateMigrationCutover({
      isDowngrade: "yes",
      rollbackMode: "forward_fix_or_restore_required",
      allowSchemaChange: true,
    }),
    /migration_cutover_flags_invalid/,
  );
});

test("rejects migration rollback mode that disagrees with plan-hash equality", () => {
  const smokeResults = DEFAULT_STAGING_SMOKE_PATHS.map((smokePath) => ({
    path: smokePath,
    finalStatus: 200,
    finalUrl: `https://tecp.ir${smokePath}`,
  }));
  const base = {
    previousSha: PREVIOUS,
    targetSha: TARGET,
    imageDigest: `sha256:${"9".repeat(64)}`,
    publicBaseUrl: "https://tecp.ir",
    smokeResults,
    startedAt: "2026-09-21T10:00:00.000Z",
    completedAt: "2026-09-21T10:04:00.000Z",
    rollback: { disposition: "not_needed" },
    previousHealth: healthy(PREVIOUS, 122),
    runtimeHealth: healthy(TARGET, 123),
    backupManifest: BACKUP_MANIFEST,
  };

  assert.throws(
    () => buildPromotionEvidence({
      ...base,
      migration: {
        previousPlanHash: "1".repeat(64),
        targetPlanHash: "2".repeat(64),
        authorityChanges: [],
        rollbackMode: "app_rollback_safe_no_migration_authority_change",
      },
    }),
    /migration_rollback_mode_mismatch/,
  );

  const evidence = buildPromotionEvidence({
    ...base,
    migration: {
      previousPlanHash: "1".repeat(64),
      targetPlanHash: "2".repeat(64),
      authorityChanges: [],
      rollbackMode: "forward_fix_or_restore_required",
    },
  });
  assert.equal(evidence.migration.rollbackMode, "forward_fix_or_restore_required");
});


test("migration authority source changes forbid app rollback even when the plan hash is unchanged", () => {
  const smokeResults = DEFAULT_STAGING_SMOKE_PATHS.map((smokePath) => ({
    path: smokePath,
    finalStatus: 200,
    finalUrl: `https://tecp.ir${smokePath}`,
  }));
  const base = {
    previousSha: PREVIOUS,
    targetSha: TARGET,
    imageDigest: `sha256:${"7".repeat(64)}`,
    publicBaseUrl: "https://tecp.ir",
    smokeResults,
    startedAt: "2026-09-21T10:00:00.000Z",
    completedAt: "2026-09-21T10:04:00.000Z",
    rollback: { disposition: "not_permitted_schema_authority_changed" },
    previousHealth: healthy(PREVIOUS, 122),
    runtimeHealth: healthy(TARGET, 123),
    backupManifest: BACKUP_MANIFEST,
  };

  assert.throws(
    () => buildPromotionEvidence({
      ...base,
      migration: {
        previousPlanHash: PLAN,
        targetPlanHash: PLAN,
        authorityChanges: ["scripts/run-database-migrations.ts"],
        rollbackMode: "app_rollback_safe_no_migration_authority_change",
      },
    }),
    /migration_rollback_mode_mismatch/,
  );

  const evidence = buildPromotionEvidence({
    ...base,
    migration: {
      previousPlanHash: PLAN,
      targetPlanHash: PLAN,
      authorityChanges: ["scripts/run-database-migrations.ts"],
      rollbackMode: "forward_fix_or_restore_required",
    },
  });
  assert.deepEqual(evidence.migration.authorityChanges, ["scripts/run-database-migrations.ts"]);
  assert.equal(evidence.migration.rollbackMode, "forward_fix_or_restore_required");
});
