import { readFile } from "node:fs/promises";

const failures = [];
const source = async (path) => readFile(path, "utf8");
const requireText = (label, body, needle, message) => {
  if (!body.includes(needle)) failures.push(`${label}: ${message}`);
};
const requirePattern = (label, body, pattern, message) => {
  if (!pattern.test(body)) failures.push(`${label}: ${message}`);
};

const migration = await source("src/lib/db-migrate-mentor-privacy-retention.ts");
requireText(
  "migration",
  migration,
  "ALTER COLUMN external_provider_enabled SET DEFAULT FALSE",
  "database default for external AI must be opt-in",
);
requirePattern(
  "migration",
  migration,
  /external_provider_enabled = FALSE[\s\S]*consented_at IS NULL/,
  "legacy rows without explicit consent must be revoked",
);
requireText(
  "migration",
  migration,
  "mentor_memories_expiry_cleanup_idx",
  "memory TTL cleanup needs an index",
);
requireText(
  "migration",
  migration,
  "mentor_conversations_retention_cleanup_idx",
  "conversation retention cleanup needs an index",
);

const cleanup = await source("src/lib/mentor-cleanup.ts");
requireText(
  "cleanup",
  cleanup,
  "FOR UPDATE SKIP LOCKED",
  "cleanup must avoid broad blocking locks",
);
requireText(
  "cleanup",
  cleanup,
  "retention_class = 'mentor_history_90d'",
  "90-day Mentor history must be enforced",
);
requireText(
  "cleanup",
  cleanup,
  "storageAvailable",
  "database outage must not be reported as zero deletions",
);
requirePattern(
  "cleanup",
  cleanup,
  /MAX_BATCH_SIZE\s*=\s*1_000/,
  "cleanup needs a hard per-batch ceiling",
);

const worker = await source("scripts/run-mentor-retention.ts");
for (const needle of [
  "persistOperationalJobRunTx",
  "mentor-retention-cleanup",
  "tecpey-mentor-retention.service",
  "authority unavailable",
  "drain_limit_reached",
]) {
  requireText("worker", worker, needle, `missing ${needle}`);
}

const service = await source("deploy/systemd/tecpey-mentor-retention.service.in");
for (const needle of [
  "Type=oneshot",
  "NoNewPrivileges=true",
  "PrivateTmp=true",
  "ProtectSystem=strict",
  "CapabilityBoundingSet=",
  "mentor:retention:run",
]) {
  requireText("service", service, needle, `missing hardening/control: ${needle}`);
}

const timer = await source("deploy/systemd/tecpey-mentor-retention.timer");
for (const needle of [
  "OnCalendar=*-*-* 03:35:00 UTC",
  "Persistent=true",
  "RandomizedDelaySec=120",
  "Unit=tecpey-mentor-retention.service",
]) {
  requireText("timer", timer, needle, `missing scheduling control: ${needle}`);
}

const registry = await source("src/lib/db-migration-registry.ts");
requireText(
  "registry",
  registry,
  "migration-step-088",
  "privacy/retention migration must be in the governed ledger",
);
requireText(
  "registry",
  registry,
  "runMentorPrivacyRetentionMigrations",
  "privacy/retention runner must be governed",
);

const packageJson = await source("package.json");
for (const needle of [
  '"mentor:retention:run"',
  '"mentor:retention:install"',
  '"mentor:retention:check"',
  "check-mentor-retention-authority.mjs",
]) {
  requireText("package", packageJson, needle, `missing package wiring: ${needle}`);
}

if (failures.length) {
  console.error("Mentor retention authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Mentor retention authority check passed.");
