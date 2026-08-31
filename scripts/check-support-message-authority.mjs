#!/usr/bin/env node
// SB-013 authority guard.
//
// The defect this closes was a control that claimed to do something it did not:
// a button labelled "send" wired to an empty mailto. The replacement can fail
// the same way in three quieter places, so each is asserted here rather than
// trusted.
//
//   1. The contact page could drift back to a link that discards the message.
//   2. The retention sweep could exist as a function nobody calls, while the
//      consent text keeps promising erasure after six months. That is the
//      original defect moved into a privacy promise, which is worse.
//   3. The intake could lose one of the bounds that make an unauthenticated
//      public write safe.
//
// Modelled on scripts/check-crm-lead-authority.mjs, which guards the sibling
// lead intake the same way.

import { readFileSync } from "node:fs";

const files = {
  page: "src/app/contact-us/page.tsx",
  enPage: "src/app/en/contact-us/page.tsx",
  form: "src/components/contact/SupportMessageForm.tsx",
  route: "src/app/api/support-message/route.ts",
  input: "src/lib/crm/support-message-input.ts",
  authority: "src/lib/crm/support-message-authority.ts",
  migration: "src/lib/db-migrate-support-messages.ts",
  retentionRunner: "scripts/run-support-message-retention.ts",
  inboxRunner: "scripts/run-support-message-inbox.ts",
  package: "package.json",
  registry: "docs/security/tenant-scoped-table-registry.json",
};

const content = {};
const failures = [];
for (const [key, path] of Object.entries(files)) {
  try {
    content[key] = readFileSync(path, "utf8");
  } catch {
    failures.push(`${path} is missing — SB-013 authority is incomplete`);
    content[key] = "";
  }
}

function requireText(key, needle, message) {
  if (!content[key].includes(needle)) failures.push(`${files[key]}: ${message}`);
}

function requirePattern(key, pattern, message) {
  if (!pattern.test(content[key])) failures.push(`${files[key]}: ${message}`);
}

function refusePattern(key, pattern, message) {
  if (pattern.test(content[key])) failures.push(`${files[key]}: ${message}`);
}

// 1. The message reaches a server, not a mail client.
// The JSX usage, not the identifier: an import line alone contains the name
// while rendering nothing, and that is precisely how this check first passed
// against a page with the form deleted.
requirePattern(
  "page",
  /<SupportMessageForm\s*\/?>/,
  "the contact page must render the real form, not merely import it",
);
requirePattern(
  "enPage",
  /<SupportMessageForm\s+locale="en"\s*\/?>/,
  "the English contact page must render the governed sender too",
);
// A mailto used as a link target, not the word appearing in a comment that
// explains what this replaced — the first check here matched its own
// documentation, which is the failure mode this whole guard is about.
refusePattern(
  "form",
  /href\s*=\s*[{"'`]\s*[`"']?mailto:/,
  "the send control must post the message, not hand it to a mail client",
);
requireText("form", '"/api/support-message"', "the form must post to the intake route");
requireText("form", "Idempotency-Key", "a resubmission must be distinguishable from a new message");
requirePattern(
  "form",
  /code === "idempotency_conflict"[\s\S]*setSubmissionId\(crypto\.randomUUID\(\)\)/,
  "a payload conflict must rotate the key without discarding the edited form",
);

// 2. The sender is never told something happened that did not.
requireText("form", "aria-live", "the outcome must be announced, not only shown");
requireText(
  "route",
  "support_storage_unavailable",
  "storage being unavailable must answer an error, never a success",
);
requireText(
  "authority",
  '{ status: "unavailable" }',
  "a failed write must surface as unavailable rather than resolving",
);

// 3. Unauthenticated public writes stay bounded.
requireText("route", "verifyCsrfOrigin", "the intake must verify the request origin");
requireText("route", "rateLimit", "the intake must be rate limited");
requireText("route", "readBoundedJsonRequest", "the request body must be bounded");
requireText("input", "privacy_consent_required", "consent must be mandatory");
requirePattern(
  "input",
  /privacyNoticeVersion !== SUPPORT_PRIVACY_NOTICE_VERSION/,
  "consent evidence must use the server-owned privacy notice version",
);
requireText(
  "form",
  "SUPPORT_PRIVACY_NOTICE_VERSION",
  "the client must submit the same governed notice version the server validates",
);
requireText("input", "invalid_message", "an empty message must be refused, not stored blank");
requireText(
  "input",
  "phoneDigits.length < 6",
  "phone contacts must contain digits, not only allowed punctuation",
);
requirePattern(
  "input",
  /normalizeLocalizedDigits\(contact\)/,
  "Persian and Arabic phone digits must normalize before validation and storage",
);
for (const marker of [
  "name_too_long",
  "contact_too_long",
  "subject_too_long",
  "message_too_long",
  "source_too_long",
  "idempotency_key_invalid",
  "privacy_notice_invalid",
]) {
  requireText(
    "input",
    marker,
    `oversized scalar input must be rejected explicitly: ${marker}`,
  );
}

// 4. What is stored is encrypted, scoped and finite.
requireText("authority", "encryptLeadPii", "personal data must be encrypted at rest");
requireText("migration", "tenant_id", "rows must carry a tenant");
requireText(
  "migration",
  "support_messages_tenant_idempotency_key",
  "replay protection must be keyed on the submission, not the sender",
);
// The exact table entry: "support_messages_OLD" contains "support_messages",
// so a rename would otherwise still satisfy this.
requirePattern(
  "registry",
  /"table":\s*"support_messages"/,
  "the table must be registered as tenant-scoped under its exact name",
);

// 5. A stored message can be read, or the promise that support will respond is
//    as untrue as the mailto this replaced.
requireText(
  "authority",
  "readSupportMessageInbox",
  "stored messages must be readable, or nobody can answer them",
);
requireText(
  "inboxRunner",
  "readSupportMessageInbox",
  "the reader needs a runner that calls it",
);
requireText(
  "package",
  '"support:inbox"',
  "the reader needs a governed command, or the queue is unreachable",
);
requirePattern(
  "authority",
  /options\.reveal/,
  "listing the queue must not decrypt every message by default",
);
// "Nothing is waiting" and "I could not look" are opposite answers. withDb
// reports enabled:false for an unconfigured pool *and* for a failed schema
// check, so a reader that returns a bare array reports an empty queue for a
// database it never reached — the mailto defect pointed at the operator instead
// of the sender.
requirePattern(
  "authority",
  /if \(!transaction\.enabled\) return \{ status: "unavailable" \};/,
  "an unreachable queue must not read as an empty one",
);
requirePattern(
  "inboxRunner",
  /inbox\.status === "unavailable"/,
  "the reader's runner must refuse to report a queue it could not read",
);
requirePattern(
  "inboxRunner",
  /process\.exit\(1\)/,
  "an unreadable queue must exit non-zero, not print an empty list and succeed",
);
requireText(
  "inboxRunner",
  "SUPPORT_INBOX_CURSOR",
  "the operator must be able to request the next inbox page",
);
requireText(
  "authority",
  "nextCursor",
  "the inbox must expose a cursor instead of permanently hiding older messages",
);
requireText(
  "authority",
  "AND retain_until > NOW()",
  "expired messages must be unreadable even before the sweep catches up",
);

// 6. An idempotency key is a key to a specific message, not to any message.
requireText(
  "authority",
  "hashSupportMessageCommand",
  "the idempotency key must be bound to the payload it was issued for",
);
requirePattern(
  "authority",
  /request_hash !== requestHash/,
  "a reused key carrying a different message must be refused, not reported as sent",
);
requireText(
  "route",
  "idempotency_conflict",
  "the conflict must reach the caller rather than resolving as success",
);
requirePattern(
  "authority",
  /status !== "active"/,
  "a replay after retention deletion must not be acknowledged as delivered",
);
requireText(
  "route",
  "support_message_expired",
  "the expired replay result must reach the caller rather than resolving as success",
);
requireText(
  "authority",
  "retention_expired",
  "a replay past retain_until must expire before the sweep runs",
);
for (const marker of [
  "contact_hash = NULL",
  "email_hash = NULL",
  "phone_hash = NULL",
  "network_fingerprint = NULL",
  "request_hash = ''",
]) {
  requireText(
    "authority",
    marker,
    `retention must erase derived personal data: ${marker}`,
  );
}

// 7. The retention promise in the consent text has a process behind it.
requireText(
  "authority",
  "deleteExpiredSupportMessagePii",
  "a retention sweep must exist",
);
requireText(
  "retentionRunner",
  "deleteExpiredSupportMessagePii",
  "the sweep must have a runner that calls it",
);
// A sweep that never ran erased nothing. Reporting that as `deleted: 0` and
// exiting 0 makes a cron job that has been failing for months look healthy,
// while personal data outlives the six months the consent text promises.
requirePattern(
  "authority",
  /\{ status: "swept", deleted:/,
  "the sweep must report whether it ran, not only how much it erased",
);
requirePattern(
  "retentionRunner",
  /swept\.status === "unavailable"/,
  "a sweep that could not reach storage must not report a successful no-op",
);
requirePattern(
  "retentionRunner",
  /process\.exit\(1\)/,
  "a sweep that did not run must exit non-zero",
);
requireText(
  "package",
  '"support:retention"',
  "the retention runner needs a governed command, or nothing ever runs it",
);
requireText(
  "package",
  '"test:crm-leads"',
  "the support message evidence must run under a governed test command",
);
requireText(
  "package",
  "support-message*.test.ts",
  "the support message tests must be wired into that command",
);

if (failures.length > 0) {
  console.error("Support message authority check failed:\n");
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  "Support message authority check passed: the contact form posts to a bounded, " +
    "consent-gated intake; storage failure cannot read as success; messages are " +
    "encrypted, tenant-scoped and replay-protected on the submission; and the " +
    "six-month retention promised in the consent text has a runner behind it.",
);
