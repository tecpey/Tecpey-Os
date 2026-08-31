// SB-013 — the support contact command, parsed and validated before anything
// touches the database.
//
// Kept apart from parseAcademyLeadCommand on purpose. That parser requires a
// phone, because a lead without one cannot be called back; the contact surface
// offers a single "email or phone" field, and requiring a phone there would
// reject a perfectly good email-only message. The two also mean different things
// by a repeat submission — see db-migrate-support-messages.ts.

const MAX_NAME_LENGTH = 120;
const MAX_CONTACT_LENGTH = 160;
const MAX_SUBJECT_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_SOURCE_LENGTH = 120;
const MAX_IDEMPOTENCY_LENGTH = 160;
const MAX_PRIVACY_NOTICE_LENGTH = 80;

const PHONE_PATTERN = /^[+0-9\-\s()]{6,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,160}$/;

export type SupportMessageCommand = {
  tenantId: string;
  idempotencyKey: string;
  locale: "fa" | "en";
  source: string;
  name: string;
  email?: string;
  phone?: string;
  subject: string;
  message: string;
  consent: true;
  legalBasis: "consent";
  privacyNoticeVersion: string;
  networkFingerprint: string | null;
};

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The message body keeps its line breaks; only control characters are stripped. */
function cleanMultiline(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    // Every control character except the newline, which is content here.
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseSupportMessageCommand(input: {
  body: unknown;
  tenantId: string;
  defaultSource: string;
  idempotencyHeader?: string | null;
  networkFingerprint?: string | null;
}): { ok: true; command: SupportMessageCommand } | { ok: false; error: string } {
  const raw =
    input.body && typeof input.body === "object"
      ? (input.body as Record<string, unknown>)
      : {};

  const name = clean(raw.name);
  const contact = clean(raw.contact ?? raw.email ?? raw.phone);
  const subject = clean(raw.subject);
  const message = cleanMultiline(raw.message ?? raw.note);
  const locale = clean(raw.locale) === "en" ? "en" : "fa";
  const source = clean(raw.source) || clean(input.defaultSource);
  const idempotencyKey = clean(
    input.idempotencyHeader || raw.submissionId || raw.idempotencyKey,
  );
  const privacyNoticeVersion = clean(raw.privacyNoticeVersion);
  const consent = raw.consent === true;

  // Normalization removes unsafe controls and redundant whitespace, but never
  // removes meaningful content to make an invalid request appear valid.
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };
  if (name.length < 2) return { ok: false, error: "invalid_name" };
  if (contact.length > MAX_CONTACT_LENGTH) {
    return { ok: false, error: "contact_too_long" };
  }

  // One field, two possible kinds of value. Whichever it is has to be valid —
  // storing an unusable contact detail would leave a message nobody can answer.
  const looksLikeEmail = contact.includes("@");
  const email = looksLikeEmail ? contact : "";
  const phone = looksLikeEmail ? "" : contact;
  if (email && !EMAIL_PATTERN.test(email)) return { ok: false, error: "invalid_email" };
  if (phone && !PHONE_PATTERN.test(phone)) return { ok: false, error: "invalid_phone" };
  if (!email && !phone) return { ok: false, error: "contact_required" };

  if (subject.length > MAX_SUBJECT_LENGTH) {
    return { ok: false, error: "subject_too_long" };
  }
  if (subject.length < 2) return { ok: false, error: "invalid_subject" };
  // The whole point of SB-013 is that a typed message must not be discarded, so
  // an empty one is refused here rather than stored as a blank row.
  if (message.length < 10) return { ok: false, error: "invalid_message" };
  // Never report success after silently removing part of what the sender wrote.
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: "message_too_long" };
  }

  if (source.length > MAX_SOURCE_LENGTH) {
    return { ok: false, error: "source_too_long" };
  }
  if (idempotencyKey.length > MAX_IDEMPOTENCY_LENGTH) {
    return { ok: false, error: "idempotency_key_invalid" };
  }
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    return { ok: false, error: "idempotency_key_required" };
  }
  if (privacyNoticeVersion.length > MAX_PRIVACY_NOTICE_LENGTH) {
    return { ok: false, error: "privacy_notice_invalid" };
  }
  if (!consent || !privacyNoticeVersion) {
    return { ok: false, error: "privacy_consent_required" };
  }

  return {
    ok: true,
    command: {
      tenantId: input.tenantId,
      idempotencyKey,
      locale,
      source,
      name,
      email: email || undefined,
      phone: phone || undefined,
      subject,
      message,
      consent: true,
      legalBasis: "consent",
      privacyNoticeVersion,
      networkFingerprint: input.networkFingerprint ?? null,
    },
  };
}
