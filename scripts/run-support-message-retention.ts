import { deleteExpiredSupportMessagePii } from "../src/lib/crm/support-message-authority";

// The contact form's consent text tells the sender their details are erased
// after six months. This is the process that makes that true; without it the
// promise is a sentence in a form.
const limit = Math.max(1, Math.min(1000, Number(process.env.SUPPORT_MESSAGE_RETENTION_BATCH ?? 250)));
const swept = await deleteExpiredSupportMessagePii(limit);

// A sweep that could not reach the database has erased nothing, and must not
// exit 0 reporting `deleted: 0`. Scheduled from cron, that difference is the
// whole promise: "nothing was due" is a healthy no-op, "the sweep never ran" is
// personal data being retained past the six months the consent text promises,
// silently, for as long as nobody looks.
if (swept.status === "unavailable") {
  console.error(JSON.stringify({ ok: false, error: "support_storage_unavailable" }));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, deleted: swept.deleted }));
