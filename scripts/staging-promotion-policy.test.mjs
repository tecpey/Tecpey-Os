import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STAGING_SMOKE_PATHS,
  STAGING_SERVICE,
  assertExactReleaseSha,
  assertReleasePath,
  assertSafeStagingPublicBaseUrl,
  assertSafeSystemdMutationPath,
  assertStagingService,
  buildPromotionEvidence,
  releasePathForSha,
  replaceReleasePathInUnit,
  validateSmokeResult,
  validateStagingHealth,
} from "./staging-promotion-policy.mjs";

const PREVIOUS = "1111111111111111111111111111111111111111";
const TARGET = "2222222222222222222222222222222222222222";

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
    "https://user:pass@tecp.ir",
    "https://tecp.ir/path",
  ]) {
    assert.throws(() => assertSafeStagingPublicBaseUrl(invalid), /staging_public_base_url/);
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
  const health = {
    ok: true,
    health: "ok",
    build: { commit: TARGET },
    checks: {
      database: "ok",
      schema: "current",
      redis: "ok",
      runtime: "ready",
      email: "configured",
      requiredWorkers: "disabled",
    },
  };
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
    operation: "verified_already_active",
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
    }),
    /already_active_sha_mismatch/,
  );
});
