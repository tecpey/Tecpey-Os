import type { AcademyLeadCommand } from "./lead-authority";

const MAX_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 40;
const MAX_EMAIL_LENGTH = 160;
const MAX_CITY_LENGTH = 80;
const MAX_NOTE_LENGTH = 1200;
const MAX_SOURCE_LENGTH = 120;
const MAX_CAMPAIGN_LENGTH = 120;
const MAX_IDEMPOTENCY_LENGTH = 160;
const MAX_PRIVACY_NOTICE_LENGTH = 80;
const PHONE_PATTERN = /^[+0-9\-\s()]{6,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,160}$/;
const SPECIALIZED_MODES = new Set(["online", "in-person", "either"]);
const SPECIALIZED_TRACKS = new Set([
  "risk-first-trading",
  "security-operations",
  "portfolio-builder",
]);

function clean(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function parseAcademyLeadCommand(input: {
  body: unknown;
  tenantId: string;
  leadKind: AcademyLeadCommand["leadKind"];
  defaultSource: string;
  idempotencyHeader?: string | null;
  networkFingerprint?: string | null;
}):
  | { ok: true; command: AcademyLeadCommand }
  | { ok: false; error: string } {
  const raw = input.body && typeof input.body === "object"
    ? input.body as Record<string, unknown>
    : {};
  const name = clean(raw.name ?? raw.displayName, MAX_NAME_LENGTH);
  const phone = clean(raw.phone, MAX_PHONE_LENGTH);
  const email = clean(raw.email, MAX_EMAIL_LENGTH);
  const city = clean(raw.city, MAX_CITY_LENGTH);
  const note = clean(raw.note, MAX_NOTE_LENGTH);
  const locale = clean(raw.locale, 8) === "en" ? "en" : "fa";
  const source = clean(raw.source, MAX_SOURCE_LENGTH) || input.defaultSource;
  const campaign = clean(raw.campaign, MAX_CAMPAIGN_LENGTH) || undefined;
  const idempotencyKey = clean(
    input.idempotencyHeader || raw.submissionId || raw.idempotencyKey,
    MAX_IDEMPOTENCY_LENGTH,
  );
  const privacyNoticeVersion = clean(
    raw.privacyNoticeVersion,
    MAX_PRIVACY_NOTICE_LENGTH,
  );
  const consent = raw.consent === true;

  if (name.length < 2 || !PHONE_PATTERN.test(phone)) {
    return { ok: false, error: "invalid_name_or_phone" };
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "invalid_email" };
  }
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    return { ok: false, error: "idempotency_key_required" };
  }
  if (!consent || !privacyNoticeVersion) {
    return { ok: false, error: "privacy_consent_required" };
  }

  const attributes: Record<string, unknown> = {};
  if (input.leadKind === "academy_interest") {
    const termNumber = Number(raw.termNumber ?? 1);
    if (!Number.isInteger(termNumber) || termNumber < 1 || termNumber > 7) {
      return { ok: false, error: "invalid_term_number" };
    }
    attributes.termNumber = termNumber;
  } else {
    const mode = clean(raw.mode, 40) || "online";
    const track = clean(raw.track, 80) || "risk-first-trading";
    if (!SPECIALIZED_MODES.has(mode)) {
      return { ok: false, error: "invalid_program_mode" };
    }
    if (!SPECIALIZED_TRACKS.has(track)) {
      return { ok: false, error: "invalid_program_track" };
    }
    attributes.mode = mode;
    attributes.track = track;
  }

  return {
    ok: true,
    command: {
      tenantId: input.tenantId,
      idempotencyKey,
      leadKind: input.leadKind,
      source,
      campaign,
      locale,
      pii: {
        name,
        phone,
        email: email || undefined,
        city: city || undefined,
        note: note || undefined,
      },
      attributes,
      consent: true,
      legalBasis: "consent",
      privacyNoticeVersion,
      networkFingerprint: input.networkFingerprint ?? null,
    },
  };
}
