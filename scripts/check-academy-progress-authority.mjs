import { access, readFile } from "node:fs/promises";

const files = {
  package: "package.json",
  workflow: ".github/workflows/ci.yml",
  browserGuard: "scripts/check-browser-persistence.mjs",
  page: "src/app/academy/[slug]/page.tsx",
  player: "src/components/academy/AcademyAuthoritativeLessonPlayer.tsx",
  quarantine: "src/components/academy/AcademyLegacyProgressQuarantine.tsx",
  stateRoute: "src/app/api/academy-state/route.ts",
  lessonRoute: "src/app/api/academy-lesson-progress/route.ts",
  checkpoint: "src/lib/academy-section-checkpoint.ts",
  authority: "src/lib/academy-section-authority.ts",
  commandAuthority: "src/lib/academy-authority.ts",
  projection: "src/lib/academy-progress-projection.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  migration: "src/lib/db-migrate-academy-section-authority.ts",
  rewardRelease: "src/lib/db-migrate-academy-reward-release.ts",
  commandMigration: "src/lib/db-migrate-academy-section-commands.ts",
  certificate: "src/lib/academy-certificates.ts",
  unitTests: "src/tests/academy/section-checkpoint.test.ts",
  projectionTests: "src/tests/academy/progress-state.test.ts",
  postgresTests: "src/tests/security/academy-progress-authority-postgres.test.ts",
  migrationTests: "src/tests/database/migration-integration.test.ts",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);
const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

try {
  await access("src/components/academy/AcademyLessonPlayer.tsx");
  failures.push("src/components/academy/AcademyLessonPlayer.tsx: browser-owned lesson player must remain deleted");
} catch {
  // Expected: the former browser authority no longer exists.
}

requireText("package", '"academy:progress:check"', "authority guard needs a governed npm command");
requireText("package", '"test:academy-progress"', "focused authority tests need a governed npm command");
requireText("package", "npm run academy:progress:check", "release gate must execute the authority guard");
requireText("package", "npm run test:academy-progress", "release gate must execute focused tests");
requireText("workflow", "Academy progress authority guard", "CI must execute the permanent authority guard");
requireText("workflow", "Academy progress PostgreSQL integration tests", "CI must execute PostgreSQL evidence");

requireText("page", "AcademyAuthoritativeLessonPlayer", "public terms must render the server-owned player");
requireText("page", "AcademyLegacyProgressQuarantine", "public terms must run the bounded legacy bridge");
rejectText("page", "AcademyLessonPlayer", "public terms may not restore the browser-owned player");

for (const target of ["player", "lessonRoute", "authority", "projection"]) {
  rejectText(target, "localStorage", "active progress authority may not read browser persistence");
  rejectText(target, "sessionStorage", "active progress authority may not read browser session state");
  rejectText(target, "indexedDB", "active progress authority may not use browser databases");
}
requireText("player", "Content is free", "unauthenticated users must retain access to free lessons");
requireText("player", "server_checkpoint_v1", "UI must label server authority");
requireText("player", "Idempotency-Key", "client retries must carry a stable command identity");
requireText("player", "no local or false completion", "failure messaging must reject false success");
requireText("player", "status === \"auth\"", "progress controls must lock without hiding content");

requireText("quarantine", "Array.from({ length: 7 }", "legacy import must capture all seven terms in one bounded request");
requireText("quarantine", "legacySnapshot", "legacy browser state must be quarantined, not applied");
requireText("quarantine", "removeItem", "browser copies must be removed only after server preservation");
const localPersistenceLines = content.quarantine
  .split(/\r?\n/)
  .filter((line) => /localStorage/.test(line)).length;
if (localPersistenceLines !== 2) {
  failures.push(`${files.quarantine}: expected exactly two audited localStorage bridge lines, found ${localPersistenceLines}`);
}
requireText("browserGuard", '"src/components/academy/AcademyLegacyProgressQuarantine.tsx": 2', "browser debt baseline must describe the bounded bridge");
rejectText("browserGuard", "AcademyLessonPlayer.tsx", "deleted browser authority must not remain in the baseline");

requireText("stateRoute", "authorityApplied: false", "legacy snapshots must never overwrite current progress");
requireText("stateRoute", "reconciliationStatus: \"quarantined\"", "legacy snapshots require explicit reconciliation state");
requireText("stateRoute", "strictRevocation: true", "legacy import requires a live canonical session");
requireText("stateRoute", "academy_progress_legacy_snapshots", "legacy evidence must be durable");

requireText("lessonRoute", "strictRevocation: true", "read and write routes require live canonical sessions");
requireText("lessonRoute", "submitAcademySectionCheckpoint", "route must delegate grading and persistence to domain authority");
requireText("lessonRoute", "readAcademyTermSectionProjection", "route must return server projection");
requireText("lessonRoute", "academy_lesson_progress_put_only", "legacy POST mutation must remain disabled");
requireText("lessonRoute", "{16,120}", "route idempotency identity must match the immutable ledger bound");
rejectText("lessonRoute", 'action === "complete"', "client completion actions are forbidden");
rejectText("lessonRoute", "body.xp", "clients may not submit XP");
rejectText("lessonRoute", "body.completed", "clients may not submit completion");

requireText("checkpoint", "opaqueOptionId", "public option identities must not reveal grading semantics");
requireText("checkpoint", "questionVersion", "every checkpoint must be versioned");
requireText("checkpoint", "optionExists", "unknown option IDs must fail closed");
rejectText("checkpoint", 'id: "lesson-outcome"', "correct answer identity may not be exposed");
rejectText("checkpoint", 'id: "guaranteed-result"', "distractor semantics may not be exposed through IDs");

requireText("authority", "pg_advisory_xact_lock", "concurrent devices must serialize authoritative changes");
requireText("authority", "readLearningCommand", "submission retries need durable idempotency");
requireText("authority", "academy_section_attempts", "all grading attempts need append-only evidence");
requireText("authority", "previousOfficialTermPassed", "later terms must require prior official pass");
requireText("authority", "COALESCE(academy_lesson_progress.last_answer_correct, FALSE)", "later wrong attempts must not erase pass evidence");
requireText("authority", "awardAcademyReward", "XP must originate from the governed reward ledger boundary");
requireText("authority", "SECTION_COMPLETION_XP", "section XP must be server resolved");
requireText("authority", "refreshAcademyProgressProjection", "writes must refresh the server projection in the same transaction");
rejectText("authority", "input.xp", "domain command may not accept client XP");
rejectText("authority", "input.completed", "domain command may not accept client completion");

requireText("commandAuthority", "readSectionCommand", "section commands need a dedicated immutable resolver");
requireText("commandAuthority", "academy_section_commands", "section retries must use the dedicated command ledger");
requireText("commandAuthority", "resultLocale", "stored section results must bind locale from authoritative output");
requireText("commandAuthority", "ON CONFLICT (student_id, idempotency_key) DO NOTHING", "replay aliases must bind every key safely");
requireText("commandAuthority", "idempotencyConflict: true", "changed reuse of an alias key must fail closed");

requireText("projection", "revoked_at IS NULL", "revoked legacy rewards must not grant XP or badges");
requireText("projection", 'authority_status === "server_checkpoint_v1"', "legacy sections must be excluded from projections");
requireText("projection", "immutable reward ledger", "projection must document one XP authority");
rejectText("projection", "termXp", "term-summary XP must not be double counted");

requireText("migrationPlan", "runAcademySectionAuthorityMigrations", "canonical migration plan must include section authority");
requireText("migrationPlan", "runAcademyRewardLegacyReleaseMigrations", "canonical plan must release revoked legacy badge keys");
requireText("migrationPlan", "runAcademySectionCommandMigrations", "canonical plan must include immutable section commands");
requireText("migration", "academy_section_legacy_snapshots", "legacy relational state must be quarantined before reset");
requireText("migration", "academy_section_attempts", "append-only attempt storage is required");
requireText("migration", "academy_section_attempts_no_update", "attempt evidence must reject update");
requireText("migration", "academy_section_attempts_no_delete", "attempt evidence must reject deletion");
requireText("migration", "academy_lesson_progress_checkpoint_completion_check", "database must reject unverified completion");
requireText("migration", "legacy_client_mutable_section_state", "legacy rewards must be explicitly revoked");
requireText("rewardRelease", "legacy-revoked:", "revoked legacy keys must preserve evidence without blocking new awards");
requireText("rewardRelease", "academy_reward_ledger_active_student_idx", "active reward projection requires an indexed path");
requireText("commandMigration", "academy_section_commands", "durable section command storage is required");
requireText("commandMigration", "academy_section_commands_no_update", "section command evidence must reject update");
requireText("commandMigration", "academy_section_commands_no_delete", "section command evidence must reject deletion");
requireText("commandMigration", "academy_section_commands_request_idx", "same-request alias replay needs an indexed path");

requireText("certificate", "p.status = 'passed'", "certificate issuance must consume official term pass evidence");
for (const evidence of [
  "creates stable FA and EN checkpoint catalogs",
  "grades only the opaque server-owned correct option",
  "fails closed for unknown options, stale versions and unknown lessons",
]) requireText("unitTests", evidence, `missing checkpoint evidence: ${evidence}`);
for (const evidence of [
  "never double counts term-summary XP",
  "ignores quarantined legacy completion",
]) requireText("projectionTests", evidence, `missing projection evidence: ${evidence}`);
for (const evidence of [
  "wrong answer without completion, XP, or unlock authority",
  "replays exact idempotent delivery and rejects changed payload reuse",
  "binds every replay alias key",
  "preserves pass evidence after later wrong attempts",
  "serializes concurrent devices",
  "keeps progress isolated per student",
  "blocks later terms",
  "append-only attempt and command evidence",
]) requireText("postgresTests", evidence, `missing PostgreSQL evidence: ${evidence}`);
requireText("migrationTests", "0027_academy_section_checkpoint_authority.sql", "migration test must verify section authority");
requireText("migrationTests", "0028_academy_reward_legacy_release.sql", "migration test must verify reward release");
requireText("migrationTests", "0029_academy_section_command_authority.sql", "migration test must verify command authority");

if (failures.length) {
  console.error("Academy progress authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Academy progress authority check passed: free content remains public while grading, completion, XP, pass evidence, replay identities, unlocks, legacy reconciliation and cross-device projection are server-owned and permanently guarded.");
