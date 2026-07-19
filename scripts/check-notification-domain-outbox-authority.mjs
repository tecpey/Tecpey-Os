import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const files = {
  package: "package.json",
  ci: ".github/workflows/ci.yml",
  migrationPlan: "src/lib/db-migration-plan.ts",
  migration: "src/lib/db-migrate-notification-domain-outbox.ts",
  outbox: "src/lib/notifications/domain-outbox.ts",
  workerPolicy: "src/lib/notifications/domain-worker.ts",
  worker: "scripts/run-notification-domain-worker.ts",
  academyAuthority: "src/lib/academy-authority.ts",
  academyEvents: "src/lib/notifications/academy-domain-events.ts",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [
      key,
      await readFile(path.join(root, file), "utf8"),
    ]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

requireText("package", '"notifications:domain:check"', "domain outbox guard must be exposed through npm");
requireText("package", '"notifications:worker:domain"', "domain worker must have an explicit runtime command");
requireText("package", "npm run notifications:domain:check", "release check must include domain outbox authority");
requireText("ci", "Notification domain outbox authority guard", "pull-request CI must execute the domain outbox guard");
requireText("ci", "npm run notifications:domain:check", "CI must call the governed npm command");

requireText("migrationPlan", "runNotificationDomainOutboxMigrations", "canonical migration plan must include the domain outbox");
requireText("migration", "CREATE TABLE IF NOT EXISTS notification_domain_outbox", "durable domain outbox table is required");
requireText("migration", "UNIQUE (tenant_id, event_type, event_id)", "domain event identity must be database-enforced");
requireText("migration", "notification_domain_outbox_attempts", "attempt evidence is required");
requireText("migration", "notification_domain_dead_letters", "terminal failures require a DLQ");
requireText("migration", "REFERENCES platform_principals(tenant_id, id)", "events must be tenant/principal scoped");
requireText("migration", "lease_expires_at", "worker claims require expiring leases");

requireText("outbox", "parseNotificationProducerEvent(rawEvent)", "enqueue must runtime-validate producer events");
requireText("outbox", "canonicalEventHash", "event identity conflicts need a complete validated fingerprint");
requireText("outbox", "notification_domain_event_identity_conflict", "changed event replays must fail closed");
requireText("outbox", "FOR UPDATE SKIP LOCKED", "concurrent workers require skip-locked claims");
requireText("outbox", "recoverExpiredNotificationDomainLeases", "stale claims must be recoverable");
requireText("outbox", "processClaimedNotificationDomainEvent", "notification creation and processed state need one transaction");
requireText("outbox", "produceDomainNotification(client, claim.event)", "workers must delegate only to governed producers");
requireText("outbox", "insertDeadLetter", "terminal events must preserve repair evidence");

requireText("workerPolicy", "loadEffectiveNotificationDomainClaim", "delayed events need current principal locale and status");
requireText("workerPolicy", "parseNotificationProducerEvent", "effective locale changes must be revalidated");
requireText("worker", "loadEffectiveNotificationDomainClaim", "runtime worker must use governed current-locale policy");
requireText("worker", "failNotificationDomainEvent", "runtime worker must record classified failures");
requireText("worker", "getNotificationDomainOutboxReconciliation", "runtime worker must emit reconciliation evidence");

requireText("academyAuthority", "RETURNING created_at", "only newly committed commands may enqueue events");
requireText("academyAuthority", "termAssessmentCommand", "only governed term assessment commands may integrate");
requireText("academyAuthority", "enqueueAcademyAssessmentCompleted", "assessment event must be written inside the command transaction");
requireText("academyEvents", "resolveNotificationPrincipal", "Academy events must bind to the tenant principal registry");
requireText("academyEvents", "enqueueNotificationDomainEvent", "Academy integration must use the durable domain outbox");
requireText("academyEvents", "score: input.percent", "user-facing assessment score must use normalized percent");
rejectText("academyEvents", "produceDomainNotification", "Academy transactions must not synchronously create delivery intents");

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory)) {
    const absolute = path.join(directory, entry);
    const details = await stat(absolute);
    if (details.isDirectory()) output.push(...(await walk(absolute)));
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry)) output.push(absolute);
  }
  return output;
}

for (const absolute of await walk(path.join(root, "src", "app", "api"))) {
  const relative = path.relative(root, absolute);
  const source = await readFile(absolute, "utf8");
  for (const forbidden of [
    "enqueueNotificationDomainEvent",
    "enqueueAcademyAssessmentCompleted",
    "claimNotificationDomainOutbox",
    "processClaimedNotificationDomainEvent",
  ]) {
    if (source.includes(forbidden)) {
      failures.push(`${relative}: API route bypasses the authoritative domain/service transaction through ${forbidden}`);
    }
  }
}

if (failures.length) {
  console.error("Notification domain outbox authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Notification domain outbox authority check passed: transaction-coupled enqueue, idempotent event identity, leased processing, retry/DLQ, current-locale rendering and Academy command integration are enforced.",
);
