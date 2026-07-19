import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
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

test("only governed domain producers can call notification creation authority", async () => {
  const producerPath = "src/lib/notifications/producers.ts";
  const producer = await readFile(producerPath, "utf8");

  for (const eventType of [
    "academy.lesson_available",
    "academy.assessment_completed",
    "academy.certificate_issued",
    "security.new_login",
    "security.credential_changed",
    "security.session_revoked",
    "support.ticket_status_changed",
  ]) {
    assert.ok(producer.includes(`"${eventType}"`), eventType);
  }

  for (const required of [
    "parseNotificationProducerEvent",
    "hasExactKeys",
    "occurredAt(value.occurredAt)",
    "uuid(value.principalId)",
    "value.version !== 1",
    "WHERE tenant_id = $1 AND id = $2::uuid",
    "FOR SHARE",
    "createInAppNotification",
    "buildNotificationRequest",
    "templateId",
    "correlationKey: `${event.type}:${event.id}`",
    "sourceType: event.type",
    "sourceId: event.id",
    "producerOccurredAt",
    "event.locale !== principal.locale",
  ]) {
    assert.ok(producer.includes(required), required);
  }

  for (const forbidden of [
    "input.title",
    "input.body",
    "input.urgency",
    "input.notificationClass",
    "producerPayload",
    "https://",
    "http://",
  ]) {
    assert.equal(producer.includes(forbidden), false, forbidden);
  }

  for (const path of await sourceFiles("src")) {
    if (
      path === "src/lib/notifications/creation.ts" ||
      path === producerPath
    ) {
      continue;
    }
    const source = await readFile(path, "utf8");
    assert.equal(
      source.includes("createInAppNotification"),
      false,
      `${path} bypasses governed producer authority`,
    );

    if (path.startsWith("src/app/api/")) {
      assert.equal(
        source.includes("produceDomainNotification"),
        false,
        `${path} calls producer authority outside a domain transaction`,
      );
    }
  }
});
