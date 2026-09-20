import { readFile } from "node:fs/promises";

const failures = [];
const source = async (path) => readFile(path, "utf8");
const requireText = (label, body, needle, message) => {
  if (!body.includes(needle)) failures.push(`${label}: ${message}`);
};
const requirePattern = (label, body, pattern, message) => {
  if (!pattern.test(body)) failures.push(`${label}: ${message}`);
};

const migration = await source("src/lib/db-migrate-mentor-profile-update-outbox.ts");
for (const needle of [
  "mentor_profile_update_outbox",
  "mentor_profile_update_attempts",
  "mentor_profile_update_dead_letters",
  "mentor_profile_update_outbox_workspace_fk",
  "mentor_profile_update_attempts_outbox_scope_fk",
  "mentor_profile_update_dead_letters_outbox_scope_fk",
  "mentor_profile_update_outbox_identity_no_update",
  "mentor_profile_update_outbox_no_delete",
  "mentor_profile_update_dead_letters_no_update",
  "mentor_profile_update_dead_letters_no_delete",
]) {
  requireText("migration", migration, needle, `missing durable schema invariant: ${needle}`);
}
requirePattern(
  "migration",
  migration,
  /FOREIGN KEY \(tenant_id, workspace_id\)[\s\S]*REFERENCES platform_workspaces\(tenant_id, id\)/,
  "outbox provenance must be database-bound to the exact tenant/workspace pair",
);

const evidenceEventMigration = await source(
  "src/lib/db-migrate-mentor-profile-evidence-event.ts",
);
for (const needle of [
  "academy.lesson_assessment",
  "academy.flashcards_updated",
  "academy.reflection_updated",
  "authoritative_lesson_assessment",
  "authoritative_flashcards_updated",
  "authoritative_reflection_updated",
  "mentor_profile_update_outbox_event_reason_check",
]) {
  requireText(
    "evidence-event-migration",
    evidenceEventMigration,
    needle,
    `missing evidence event database invariant: ${needle}`,
  );
}

const outbox = await source("src/lib/mentor-profile-update-outbox.ts");
for (const needle of [
  "createMentorProfileEventId",
  "tenantId: input.tenantId",
  "workspaceId: input.workspaceId",
  "studentId: input.studentId",
  "sourceReference: input.sourceReference",
  "ON CONFLICT (event_id) DO NOTHING",
  "FOR UPDATE SKIP LOCKED",
  "lease_expires_at > NOW()",
  "recoverExpiredMentorProfileLeases",
  "failed_retryable",
  "failed_terminal",
  "deadLetter",
  "pg_advisory_xact_lock",
  "mentorProfileRetryDelaySeconds",
  "mentor-profile-retry-jitter-v1",
  "computeMentorProfileForStudentTx",
  "upsertMentorProfileUpdateTx",
]) {
  requireText("outbox", outbox, needle, `missing projection authority invariant: ${needle}`);
}
requirePattern(
  "outbox",
  outbox,
  /eventPayloadHash\([\s\S]*reason: input\.reason[\s\S]*\}\);/,
  "replay identity conflict detection must hash the reviewed event semantics",
);

const producerPaths = [
  "src/app/api/academy-term-progress/route.ts",
  "src/app/api/academy-lesson-assessment/route.ts",
  "src/app/api/academy-flashcards/route.ts",
  "src/app/api/academy-reflections/route.ts",
  "src/app/api/mentor-challenge/route.ts",
  "src/app/api/trading-arena/route.ts",
  "src/app/api/trading-arena/execution/route.ts",
  "src/app/api/mentor-conversations/migrate/route.ts",
];
for (const path of producerPaths) {
  const producer = await source(path);
  requireText(path, producer, "withTx(async (client)", "producer must use an authoritative transaction");
  requireText(path, producer, "enqueueMentorProfileUpdateTx(client", "producer mutation must durably enqueue inside its transaction");
}

const lessonAssessment = await source("src/app/api/academy-lesson-assessment/route.ts");
for (const needle of [
  'eventType: "academy.lesson_assessment"',
  'reason: "authoritative_lesson_assessment"',
  "sourceReference: idempotencyKey",
]) {
  requireText(
    "academy-lesson-assessment",
    lessonAssessment,
    needle,
    `lesson assessment evidence must remain durable and replay-bound: ${needle}`,
  );
}

for (const [path, eventType, reason] of [
  ["src/app/api/academy-flashcards/route.ts", "academy.flashcards_updated", "authoritative_flashcards_updated"],
  ["src/app/api/academy-reflections/route.ts", "academy.reflection_updated", "authoritative_reflection_updated"],
]) {
  const producer = await source(path);
  requireText(path, producer, eventType, `learning-state event missing: ${eventType}`);
  requireText(path, producer, reason, `learning-state reason missing: ${reason}`);
}

const mentorSignals = await source("src/lib/mentor-signals.ts");
for (const needle of [
  "academy_lesson_assessments",
  "lessonAssessmentCount",
  "avgLessonAssessmentScore",
  "passedLessonAssessments",
  "normalizeDeck",
  "normalizeReflectionMap",
  "flashcardReviewed",
  "flashcardAvgGrade",
  "reflectionCount",
]) {
  requireText(
    "mentor-signals",
    mentorSignals,
    needle,
    `lesson assessment evidence fusion missing: ${needle}`,
  );
}

const migrationRoute = await source("src/app/api/mentor-conversations/migrate/route.ts");
for (const needle of [
  "pg_advisory_xact_lock",
  "ensureLegacyMentorThreadTx",
  "WHERE NOT EXISTS",
]) {
  requireText(
    "mentor-conversation-migration",
    migrationRoute,
    needle,
    `legacy migration must remain replay-safe: ${needle}`,
  );
}

const trustStore = await source("src/lib/ai/mentor-trust-store.ts");
for (const needle of [
  "withTx(async (client)",
  "tenantId: input.tenantId",
  "workspaceId: input.workspaceId",
  "enqueueMentorProfileUpdateTx(client",
]) {
  requireText("mentor-trust-store", trustStore, needle, `conversation persistence missing ${needle}`);
}

const hotPath = await source("src/lib/mentor-events.ts");
requireText(
  "mentor-events",
  hotPath,
  "durable transactional outbox remains authoritative",
  "request-process microtasks must be explicitly non-authoritative",
);
requireText(
  "mentor-events",
  hotPath,
  "studentFingerprint",
  "hot-path logging must not expose raw learner identifiers",
);

const worker = await source("scripts/run-mentor-profile-worker.ts");
for (const needle of [
  "claimMentorProfileUpdates",
  "processMentorProfileUpdateClaimTx",
  "failMentorProfileUpdateClaim",
  "loadMentorProfileHealthSnapshot",
  "evaluateMentorProfileHealth",
  "mentorProfileHealthAlertMetadata",
  "withTx",
  "MENTOR_PROFILE_WORKER_LEASE_SECONDS",
  "errorDetail: null",
]) {
  requireText("worker", worker, needle, `worker missing bounded durable control: ${needle}`);
}

const workerPolicy = await source("src/lib/mentor-profile-worker.ts");
requireText(
  "worker-policy",
  workerPolicy,
  "isTerminalMentorProfileWorkerError",
  "worker must classify terminal poison failures separately from retryable outages",
);
requireText(
  "worker-policy",
  workerPolicy,
  "postgres_23503",
  "referential poison events must fail terminally rather than retry forever",
);

const service = await source("deploy/systemd/tecpey-mentor-profile-worker.service.in");
for (const needle of [
  "Type=simple",
  "Restart=on-failure",
  "NoNewPrivileges=true",
  "PrivateTmp=true",
  "ProtectSystem=strict",
  "CapabilityBoundingSet=",
  "mentor:profiles:worker",
]) {
  requireText("systemd", service, needle, `missing service hardening/runtime control: ${needle}`);
}

const installer = await source("scripts/install-mentor-profile-worker.sh");
for (const needle of [
  "mentor_profile_worker_bundle_missing",
  "operational_installer_env_bundle_missing",
  "TECPEY_INSTALL_ENV_FILE",
  "ops:installer:env-check",
  "operational_install_environment_invalid",
  "systemd-analyze verify",
  "TECPEY_DRY_RUN",
  "runtime_user_root_forbidden",
]) {
  requireText("installer", installer, needle, `installer must fail closed on ${needle}`);
}

const installEnvironment = await source(
  "src/lib/ops/operational-install-environment.ts",
);
for (const needle of [
  'requiredValue(values, "DATABASE_URL")',
  "validateDatabaseUrl(databaseUrl)",
  "operational_install_database_url_invalid",
  "rejectDuplicateKeys: true",
]) {
  requireText(
    "installer-env",
    installEnvironment,
    needle,
    `governed installer database authority missing: ${needle}`,
  );
}

const registry = await source("src/lib/db-migration-registry.ts");
requireText("registry", registry, "migration-step-089", "outbox migration must be in the canonical ledger");
requireText("registry", registry, "migration-step-095", "evidence event migration must be in the canonical ledger");
requireText(
  "registry",
  registry,
  "runMentorProfileEvidenceEventMigrations",
  "evidence event migration runner must be governed",
);
requireText(
  "registry",
  registry,
  "runMentorProfileUpdateOutboxMigrations",
  "outbox migration runner must be governed",
);

const tenantRegistry = await source("docs/security/tenant-scoped-table-registry.json");
for (const table of [
  "mentor_profile_update_outbox",
  "mentor_profile_update_attempts",
  "mentor_profile_update_dead_letters",
]) {
  requireText("tenant-registry", tenantRegistry, `"table": "${table}"`, `tenant registry missing ${table}`);
}

const packageRaw = await source("package.json");
const packageJson = JSON.parse(packageRaw);
const scripts = packageJson.scripts ?? {};
for (const [name, needle] of [
  ["build:server", "scripts/run-mentor-profile-worker.ts"],
  ["build:server", "scripts/check-mentor-profile-health.ts"],
  ["build:server", "--bundle"],
  ["mentor:profiles:worker", "node dist/run-mentor-profile-worker.cjs"],
  ["mentor:profiles:worker:dev", "tsx scripts/run-mentor-profile-worker.ts"],
  ["mentor:profiles:health", "node dist/check-mentor-profile-health.cjs"],
]) {
  if (typeof scripts[name] !== "string" || !scripts[name].includes(needle)) {
    failures.push(`package/runtime wiring missing: ${name} -> ${needle}`);
  }
}
for (const name of [
  "test:mentor-profile-outbox",
  "mentor:profiles:authority:check",
  "mentor:profiles:health:check",
]) {
  if (typeof scripts[name] !== "string" || scripts[name].trim() === "") {
    failures.push(`package/runtime script missing: ${name}`);
  }
}

const workerTest = await source("src/tests/security/mentor-profile-worker.test.ts");
for (const needle of [
  "retry jitter is deterministic, bounded and event-spread",
  "mentorProfileRetryDelaySeconds(3, firstId)",
]) {
  requireText("worker-test", workerTest, needle, `retry jitter proof missing: ${needle}`);
}

const postgresTest = await source("src/tests/security/mentor-profile-update-outbox-postgres.test.ts");
for (const needle of [
  "same authoritative source idempotently",
  "rejects a workspace borrowed from another tenant",
  "commits profile plus attempt evidence atomically",
  "append-only dead-letter evidence",
  "expired leases recover",
  "producer transaction rollback",
  "accepts governed Academy evidence events and rejects event/reason drift",
]) {
  requireText("postgres-test", postgresTest, needle, `missing adversarial proof: ${needle}`);
}

if (failures.length) {
  console.error("Mentor profile projection authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Mentor profile projection authority check passed.");
