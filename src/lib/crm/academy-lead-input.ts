import type { AcademyLeadCommand } from "./lead-authority";

const PHONE_PATTERN = /^[+0-9\-\s()]{6,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,160}$/;

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
  const name = clean(raw.name ?? raw.displayName, 120);
  const phone = clean(raw.phone, 40);
  const email = clean(raw.email, 160);
  const city = clean(raw.city, 80);
  const note = clean(raw.note, 1200);
  const locale = clean(raw.locale, 8) === "en" ? "en" : "fa";
  const source = clean(raw.source, 120) || input.defaultSource;
  const campaign = clean(raw.campaign, 120) || undefined;
  const idempotencyKey = clean(
    input.idempotencyHeader || raw.submissionId || raw.idempotencyKey,
    160,
  );
  const privacyNoticeVersion = clean(raw.privacyNoticeVersion, 80);
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
    if (!new Set(["online", "in-person", "either"]).has(mode)) {
      return { ok: false, error: "invalid_program_mode" };
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
