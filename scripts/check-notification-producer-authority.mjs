import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const producerPath = "src/lib/notifications/producers.ts";
const producer = await readFile(producerPath, "utf8");
const failures = [];

const requireText = (text, reason) => {
  if (!producer.includes(text)) failures.push(`${producerPath}: ${reason}`);
};
const rejectText = (text, reason) => {
  if (producer.includes(text)) failures.push(`${producerPath}: ${reason}`);
};

for (const eventType of [
  "academy.lesson_available",
  "academy.assessment_completed",
  "academy.certificate_issued",
  "security.new_login",
  "security.credentials_changed",
  "security.session_revoked",
  "support.ticket_status_changed",
]) {
  requireText(`"${eventType}"`, `missing governed event type ${eventType}`);
}

requireText("parseDomainNotificationEvent", "runtime event parsing is required");
requireText("hasExactKeys", "event and payload schemas must reject unknown fields");
requireText("validOccurredAt", "event timestamps must be runtime validated");
requireText("Validate.uuid(input.principalId)", "principal IDs must be runtime validated");
requireText("WHERE tenant_id = $1 AND id = $2::uuid", "principal lookup must be tenant scoped");
requireText("FOR SHARE", "producer must stabilize principal state during creation");
requireText("createInAppNotification", "producer must delegate to policy-backed creation authority");
requireText("templateId", "controlled templates require provenance metadata");
requireText("correlationKey(event)", "correlation keys must be derived from trusted event evidence");
requireText("sourceType: event.eventType", "source type must be server-controlled by event registry");
requireText("sourceId: event.eventId", "source ID must preserve domain event evidence");
requireText("eventOccurredAt", "event occurrence evidence must be retained");
rejectText("input.title", "callers must not control notification titles");
rejectText("input.body", "callers must not control notification bodies");
rejectText("input.urgency", "callers must not control notification urgency");
rejectText("input.notificationClass", "callers must not control notification class");
rejectText("https://", "producer templates must not create external action URLs");
rejectText("http://", "producer templates must not create external action URLs");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (path === "src/tests") continue;
      files.push(...(await sourceFiles(path)));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

for (const path of await sourceFiles("src")) {
  if (
    path === "src/lib/notifications/creation.ts" ||
    path === producerPath
  ) {
    continue;
  }
  const source = await readFile(path, "utf8");
  if (source.includes("createInAppNotification")) {
    failures.push(
      `${path}: direct notification creation is forbidden; use produceDomainNotification with a governed domain event`,
    );
  }
}

if (failures.length) {
  console.error("Notification producer authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Notification producer authority check passed: only runtime-validated Academy, Security and Support events can enter policy-backed creation.",
);
