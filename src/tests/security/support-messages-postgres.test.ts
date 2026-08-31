import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { withDb } from "../../lib/db";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  deleteExpiredSupportMessagePii,
  ingestSupportMessage,
  readSupportMessageInbox,
} from "../../lib/crm/support-message-authority";
import { parseSupportMessageCommand } from "../../lib/crm/support-message-input";
import type { SupportMessageCommand } from "../../lib/crm/support-message-input";

// SB-013 — the properties that make this table the right place for a support
// message, proven against a real database rather than argued in a comment.

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const originalPiiKey = process.env.TECPEY_CRM_PII_KEY_B64;
const originalContactHashSecret = process.env.TECPEY_CRM_CONTACT_HASH_SECRET;
let migrationPool: Pool | null = null;

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  process.env.TECPEY_CRM_PII_KEY_B64 ||= Buffer.alloc(32, 13).toString("base64");
  process.env.TECPEY_CRM_CONTACT_HASH_SECRET ||=
    "support-postgres-test-contact-hash-secret-32-minimum";
  migrationPool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  const client = await migrationPool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
  } finally {
    client.release();
  }
});

after(async () => {
  await migrationPool?.end();
  migrationPool = null;
  if (originalPiiKey === undefined) delete process.env.TECPEY_CRM_PII_KEY_B64;
  else process.env.TECPEY_CRM_PII_KEY_B64 = originalPiiKey;
  if (originalContactHashSecret === undefined) {
    delete process.env.TECPEY_CRM_CONTACT_HASH_SECRET;
  } else {
    process.env.TECPEY_CRM_CONTACT_HASH_SECRET = originalContactHashSecret;
  }
});

function postgresTest(name: string, fn: () => Promise<void>) {
  return test(name, { skip: !databaseConfigured, timeout: 30_000 }, fn);
}

/** Read helper: withDb wraps results in an enabled/value envelope. */
async function rows<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[],
): Promise<T[]> {
  const result = await withDb(async (client) => client.query<T>(sql, params));
  assert.equal(result.enabled, true, "the test database is not reachable");
  return result.enabled ? result.value.rows : [];
}

function command(overrides: Partial<SupportMessageCommand> = {}): SupportMessageCommand {
  const parsed = parseSupportMessageCommand({
    body: {
      name: "Sample Sender",
      contact: "sender@example.com",
      subject: "A question",
      message: "I would like to ask about the second term enrolment window.",
      consent: true,
      privacyNoticeVersion: "2026-08-01",
    },
    tenantId: "tenant-alpha",
    defaultSource: "contact-us",
    idempotencyHeader: `contact-${Math.random().toString(36).slice(2)}${"x".repeat(16)}`,
    networkFingerprint: "fingerprint",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("fixture did not parse");
  return { ...parsed.command, ...overrides };
}

postgresTest("a second message from the same sender does not overwrite the first", async () => {
  // The reason this is not crm_leads. That table dedups on the sender and
  // updates the matching row, so message two would replace message one — which
  // is the disappearing message SB-013 is about.
  const first = await ingestSupportMessage(command({ subject: "First", message: "The first message body, long enough." }));
  const second = await ingestSupportMessage(command({ subject: "Second", message: "The second message body, long enough." }));

  assert.equal(first.status, "committed");
  assert.equal(second.status, "committed");
  if (first.status !== "committed" || second.status !== "committed") return;

  assert.notEqual(first.result.id, second.result.id, "the second message reused the first row");
  assert.equal(first.result.created, true);
  assert.equal(second.result.created, true);

  const countRow = await rows<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM support_messages WHERE id = ANY($1::uuid[])",
    [[first.result.id, second.result.id]],
  );
  assert.equal(countRow[0]?.count, "2");
});

postgresTest("the same submission twice is one row, not two", async () => {
  // A double click or a retried request is not a second message.
  const shared = command();
  const once = await ingestSupportMessage(shared);
  const twice = await ingestSupportMessage(shared);

  assert.equal(once.status, "committed");
  assert.equal(twice.status, "committed");
  if (once.status !== "committed" || twice.status !== "committed") return;

  assert.equal(once.result.id, twice.result.id);
  assert.equal(once.result.created, true);
  assert.equal(twice.result.created, false, "the replay was recorded as a new message");
});

postgresTest("a replay after retention deletion is not acknowledged as delivered", async () => {
  const shared = command({
    tenantId: `tenant-expired-replay-${Date.now()}`,
    message: "This message will be privacy-deleted before its delayed replay.",
  });
  const stored = await ingestSupportMessage(shared);
  assert.equal(stored.status, "committed");
  if (stored.status !== "committed") return;

  await rows(
    `UPDATE support_messages
        SET retain_until = NOW() - INTERVAL '1 second'
      WHERE id = $1::uuid`,
    [stored.result.id],
  );
  const swept = await deleteExpiredSupportMessagePii(1_000);
  assert.equal(swept.status, "swept");

  const state = await rows<{
    status: string;
    pii_ciphertext: string;
    contact_hash: string | null;
    email_hash: string | null;
    phone_hash: string | null;
    network_fingerprint: string | null;
    request_hash: string;
  }>(
    `SELECT status, pii_ciphertext, contact_hash, email_hash, phone_hash,
            network_fingerprint, request_hash
       FROM support_messages
      WHERE id = $1::uuid`,
    [stored.result.id],
  );
  assert.equal(state[0]?.status, "deleted");
  assert.equal(state[0]?.pii_ciphertext, "");
  assert.equal(state[0]?.contact_hash, null);
  assert.equal(state[0]?.email_hash, null);
  assert.equal(state[0]?.phone_hash, null);
  assert.equal(state[0]?.network_fingerprint, null);
  assert.equal(state[0]?.request_hash, "");

  const replay = await ingestSupportMessage(shared);
  assert.equal(
    replay.status,
    "expired",
    "retention-deleted content was falsely acknowledged as delivered",
  );
});

postgresTest("email-only senders do not collide with each other", async () => {
  // crm_leads derives its contact hash from the phone, so every email-only
  // sender would share one. Here the hash follows whichever detail was given.
  const a = await ingestSupportMessage(command({ email: "one@example.com", phone: undefined }));
  const b = await ingestSupportMessage(command({ email: "two@example.com", phone: undefined }));
  assert.equal(a.status, "committed");
  assert.equal(b.status, "committed");
  if (a.status !== "committed" || b.status !== "committed") return;

  const countRow = await rows<{ contact_hash: string }>(
    "SELECT contact_hash FROM support_messages WHERE id = ANY($1::uuid[])",
    [[a.result.id, b.result.id]],
  );
  const hashes = new Set(countRow.map((row) => row.contact_hash));
  assert.equal(hashes.size, 2, "two different senders shared one contact hash");
});

postgresTest("the message body is stored encrypted, never as readable text", async () => {
  const secret = "Please delete my account, my national id is 0000000000.";
  const stored = await ingestSupportMessage(command({ message: secret }));
  assert.equal(stored.status, "committed");
  if (stored.status !== "committed") return;

  const countRow = await rows<{ pii_ciphertext: string }>(
    "SELECT pii_ciphertext FROM support_messages WHERE id = $1::uuid",
    [stored.result.id],
  );
  const ciphertext = countRow[0]?.pii_ciphertext ?? "";
  assert.ok(ciphertext.length > 0, "nothing was stored");
  assert.ok(!ciphertext.includes(secret), "the message was stored in the clear");
  assert.ok(!ciphertext.includes("Sample Sender"), "the sender name was stored in the clear");
});

postgresTest("one tenant's messages are not visible in another tenant's scope", async () => {
  const alpha = await ingestSupportMessage(command({ tenantId: "tenant-alpha" }));
  const beta = await ingestSupportMessage(command({ tenantId: "tenant-beta" }));
  assert.equal(alpha.status, "committed");
  assert.equal(beta.status, "committed");
  if (alpha.status !== "committed" || beta.status !== "committed") return;

  const leaked = await rows<{ id: string }>(
    "SELECT id FROM support_messages WHERE tenant_id = $1 AND id = $2::uuid",
    ["tenant-alpha", beta.result.id],
  );
  assert.equal(leaked.length, 0, "a message was readable under the wrong tenant");
});

postgresTest("a message is retained for a bounded period, not forever", async () => {
  const stored = await ingestSupportMessage(command());
  assert.equal(stored.status, "committed");
  if (stored.status !== "committed") return;

  const countRow = await rows<{ months: string }>(
    `SELECT ROUND(EXTRACT(EPOCH FROM (retain_until - created_at)) / 2592000)::text AS months
       FROM support_messages WHERE id = $1::uuid`,
    [stored.result.id],
  );
  assert.equal(countRow[0]?.months, "6");
});

postgresTest("a reused key carrying a different message is refused, not reported as sent", async () => {
  // A response lost after the insert leaves the browser holding the same key.
  // If the sender edits the message and retries, matching on the key alone
  // would hand back the older row as a success and the edit would vanish —
  // the disappearing message this whole change exists to remove.
  const first = command({ message: "The original message body, long enough." });
  const stored = await ingestSupportMessage(first);
  assert.equal(stored.status, "committed");

  const edited = { ...first, message: "The edited message body, also long enough." };
  const retried = await ingestSupportMessage(edited);
  assert.equal(retried.status, "conflict", "the edited message was silently discarded");

  // And the unedited retry is still a replay, not a second row.
  const replay = await ingestSupportMessage(first);
  assert.equal(replay.status, "committed");
  if (replay.status !== "committed" || stored.status !== "committed") return;
  assert.equal(replay.result.id, stored.result.id);
  assert.equal(replay.result.created, false);
});

postgresTest("a stored message can actually be read back by support", async () => {
  // Without a reader, the form's promise that support will respond would be as
  // untrue as the mailto it replaced: the row exists and nobody can answer it.
  const subject = "Readable subject";
  const body = "The message body that support has to be able to read back.";
  const stored = await ingestSupportMessage(
    command({ tenantId: "tenant-readback", subject, message: body }),
  );
  assert.equal(stored.status, "committed");
  if (stored.status !== "committed") return;

  const revealed = await readSupportMessageInbox({
    tenantId: "tenant-readback",
    reveal: true,
  });
  assert.equal(revealed.status, "ok");
  if (revealed.status !== "ok") return;
  const found = revealed.messages.find((entry) => entry.id === stored.result.id);
  assert.ok(found, "the stored message was not readable");
  assert.equal(found.subject, subject);
  assert.equal(found.message, body);
  assert.equal(found.name, "Sample Sender");
});

postgresTest("listing the queue does not decrypt anyone's message by default", async () => {
  // Checking whether anything is waiting should not spray personal data into a
  // terminal or a log.
  const stored = await ingestSupportMessage(
    command({ tenantId: "tenant-redact", message: "A private matter, described at length." }),
  );
  assert.equal(stored.status, "committed");

  const listed = await readSupportMessageInbox({ tenantId: "tenant-redact" });
  assert.equal(listed.status, "ok");
  if (listed.status !== "ok") return;
  assert.ok(listed.messages.length > 0);
  for (const entry of listed.messages) {
    assert.equal(entry.message, "[redacted]");
    assert.equal(entry.name, "[redacted]");
    assert.equal(entry.contact, "[redacted]");
  }
});

postgresTest("retention-expired messages are unreadable before the sweep catches up", async () => {
  const tenantId = `tenant-expired-inbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const shared = command({
    tenantId,
    message: "This message must stop being readable as soon as retention expires.",
  });
  const stored = await ingestSupportMessage(shared);
  assert.equal(stored.status, "committed");
  if (stored.status !== "committed") return;

  await rows(
    `UPDATE support_messages
        SET retain_until = NOW() - INTERVAL '1 second'
      WHERE id = $1::uuid`,
    [stored.result.id],
  );

  const inbox = await readSupportMessageInbox({ tenantId, reveal: true });
  assert.equal(inbox.status, "ok");
  if (inbox.status !== "ok") return;
  assert.equal(
    inbox.messages.some((message) => message.id === stored.result.id),
    false,
    "expired personal data remained readable while awaiting the retention sweep",
  );

  const replay = await ingestSupportMessage(shared);
  assert.equal(
    replay.status,
    "expired",
    "an unreadable expired message was still acknowledged as delivered",
  );
});

postgresTest("the support inbox can page through every active message", async () => {
  const tenantId = `tenant-pagination-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storedIds = new Set<string>();
  for (let index = 0; index < 5; index += 1) {
    const stored = await ingestSupportMessage(
      command({
        tenantId,
        subject: `Page item ${index}`,
        message: `Pagination evidence message ${index}, long enough to store.`,
      }),
    );
    assert.equal(stored.status, "committed");
    if (stored.status === "committed") storedIds.add(stored.result.id);
  }

  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await readSupportMessageInbox({
      tenantId,
      limit: 2,
      cursor,
    });
    assert.equal(page.status, "ok");
    if (page.status !== "ok") return;
    for (const entry of page.messages) {
      assert.equal(seen.has(entry.id), false, "a cursor page repeated a message");
      seen.add(entry.id);
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  assert.deepEqual(seen, storedIds, "pagination left active messages unreachable");
});

postgresTest("one tenant's inbox never returns another tenant's messages", async () => {
  const alpha = await ingestSupportMessage(command({ tenantId: "tenant-inbox-a" }));
  await ingestSupportMessage(command({ tenantId: "tenant-inbox-b" }));
  assert.equal(alpha.status, "committed");
  if (alpha.status !== "committed") return;

  const other = await readSupportMessageInbox({ tenantId: "tenant-inbox-b", reveal: true });
  assert.equal(other.status, "ok");
  if (other.status !== "ok") return;
  assert.equal(
    other.messages.some((entry) => entry.id === alpha.result.id),
    false,
    "a message leaked into another tenant's inbox",
  );
});

postgresTest("an empty queue is answered as read, not as unreachable", async () => {
  // The two answers this feature must never confuse. An operator who reads
  // "nothing waiting" off a database that was never contacted closes the
  // terminal believing nobody needs a reply — the same shape of untruth as the
  // mailto button that reported a message sent and sent nothing.
  //
  // withDb reports `enabled: false` both for an unconfigured pool and for a
  // failed schema check, so returning a bare array made those cases
  // indistinguishable from a genuinely quiet queue.
  const quiet = await readSupportMessageInbox({ tenantId: "tenant-with-no-messages-at-all" });
  assert.equal(quiet.status, "ok", "a reachable but empty queue must read as ok");
  if (quiet.status !== "ok") return;
  assert.deepEqual(quiet.messages, []);
});

postgresTest("the retention sweep reports whether it ran, not only what it erased", async () => {
  // Nothing is due in this fixture, so the honest answer is "swept, 0" — which
  // must be a different value from "the sweep never ran". A bare 0 collapsed
  // those two, leaving the consent text's six-month erasure promise looking
  // enforced by a job that could have been failing silently for months.
  const swept = await deleteExpiredSupportMessagePii(10);
  assert.equal(swept.status, "swept");
  if (swept.status !== "swept") return;
  assert.equal(typeof swept.deleted, "number");
  assert.ok(swept.deleted >= 0);
});
