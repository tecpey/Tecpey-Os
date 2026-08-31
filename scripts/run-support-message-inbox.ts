import { readSupportMessageInbox } from "../src/lib/crm/support-message-authority";

// SB-013 — the operator's read side.
//
// Storing a message nobody can read would leave the form's «پشتیبانی تک‌پی
// پاسخ می‌دهد» exactly as untrue as the mailto it replaced: the submission
// would succeed, the row would exist, and no one could answer it. This is the
// consumer that makes the promise keepable.
//
// A command rather than an admin screen on purpose. Reading it decrypts other
// people's personal messages, so the audience is an operator with database
// credentials and the key, not a browser session — and the smallest surface
// that makes the messages reachable is the right one to add during a
// controlled launch.

const tenantId = process.env.SUPPORT_INBOX_TENANT_ID ?? "tecpey";
const limit = Math.max(1, Math.min(200, Number(process.env.SUPPORT_INBOX_LIMIT ?? 20)));
const reveal = process.env.SUPPORT_INBOX_REVEAL === "1";
const cursor = process.env.SUPPORT_INBOX_CURSOR?.trim() || undefined;

const inbox = await readSupportMessageInbox({ tenantId, limit, reveal, cursor });

// "No messages waiting" and "I could not look" are opposite answers, and an
// empty list says the first while meaning the second. An operator checking the
// queue would close the terminal believing nobody is waiting.
if (inbox.status === "invalid_cursor") {
  console.error(JSON.stringify({ ok: false, error: "support_inbox_cursor_invalid" }));
  process.exit(1);
}
if (inbox.status === "unavailable") {
  console.error(JSON.stringify({ ok: false, error: "support_storage_unavailable" }));
  process.exit(1);
}

// Redacted unless the operator explicitly asks otherwise, so listing the queue
// to see whether anything is waiting does not spray personal data across a
// terminal, a shell history or a CI log.
console.log(
  JSON.stringify(
    {
      ok: true,
      tenantId,
      count: inbox.messages.length,
      revealed: reveal,
      nextCursor: inbox.nextCursor,
      messages: inbox.messages,
    },
    null,
    2,
  ),
);
