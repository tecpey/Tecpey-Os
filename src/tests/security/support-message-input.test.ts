import assert from "node:assert/strict";
import test from "node:test";
import { parseSupportMessageCommand } from "../../lib/crm/support-message-input";

const BASE = {
  name: "مریم رضایی",
  contact: "maryam@example.com",
  subject: "سوال درباره دوره",
  message: "سلام، درباره ثبت‌نام ترم دوم سوال داشتم و راهنمایی می‌خواستم.",
  consent: true,
  privacyNoticeVersion: "2026-08-01",
};

function parse(overrides: Record<string, unknown> = {}) {
  return parseSupportMessageCommand({
    body: { ...BASE, ...overrides },
    tenantId: "tenant-a",
    defaultSource: "contact-us",
    idempotencyHeader: "contact-us-0123456789abcdef",
    networkFingerprint: "fp",
  });
}

test("a complete submission parses", () => {
  const parsed = parse();
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.command.email, "maryam@example.com");
  assert.equal(parsed.command.phone, undefined);
  assert.equal(parsed.command.consent, true);
  assert.equal(parsed.command.tenantId, "tenant-a");
});

test("the single contact field accepts either an email or a phone", () => {
  // The contact surface has one field. Requiring a phone — as the lead parser
  // does — would reject a perfectly answerable email-only message.
  const byPhone = parse({ contact: "+98 912 345 6789" });
  assert.equal(byPhone.ok, true);
  if (byPhone.ok) {
    assert.equal(byPhone.command.phone, "+98 912 345 6789");
    assert.equal(byPhone.command.email, undefined);
  }

  for (const [contact, error] of [
    ["not-an-email@", "invalid_email"],
    ["12", "invalid_phone"],
    ["------", "invalid_phone"],
    ["000000", "invalid_phone"],
    ["1234567890123456", "invalid_phone"],
    ["", "contact_required"],
  ] as const) {
    const parsed = parse({ contact });
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.error, error);
  }
});

test("Persian and Arabic phone digits normalize before validation", () => {
  for (const localizedPhone of ["۰۹۱۲۱۲۳۴۵۶۷", "٠٩١٢١٢٣٤٥٦٧"]) {
    const parsed = parse({ contact: localizedPhone });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) continue;
    assert.equal(parsed.command.phone, "09121234567");
    assert.equal(parsed.command.email, undefined);
  }
});

test("an empty message is refused rather than stored blank", () => {
  // SB-013 is a message that disappears. Accepting an empty one and filing it
  // would be the same outcome with a row to show for it.
  for (const message of ["", "   ", "کوتاه"]) {
    const parsed = parse({ message });
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.error, "invalid_message");
  }
});

test("consent and a privacy notice version are both required", () => {
  for (const overrides of [
    { consent: false },
    { consent: undefined },
    { privacyNoticeVersion: "" },
  ]) {
    const parsed = parse(overrides);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.error, "privacy_consent_required");
  }
});

test("consent evidence accepts only the server-owned privacy notice version", () => {
  const parsed = parse({ privacyNoticeVersion: "invented-or-obsolete-version" });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.error, "privacy_notice_invalid");
});

test("a submission without a usable idempotency key is refused", () => {
  // Without one there is no way to tell a double click from a second message,
  // and the wrong answer either way loses or duplicates what someone wrote.
  const parsed = parseSupportMessageCommand({
    body: BASE,
    tenantId: "tenant-a",
    defaultSource: "contact-us",
    idempotencyHeader: "short",
    networkFingerprint: null,
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.error, "idempotency_key_required");
});

test("the message keeps its paragraphs but loses control characters", () => {
  const parsed = parse({
    message: "خط اول\u0000\n\nخط دوم که به اندازه کافی طولانی است\u0007",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.ok(parsed.command.message.includes("\n\n"), "paragraph break was lost");
  assert.ok(!/[\u0000\u0007]/.test(parsed.command.message), "control characters survived");
});

test("an oversized message is rejected rather than silently truncated", () => {
  const parsed = parse({ message: "ب".repeat(4_001) });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.error, "message_too_long");
});

test("oversized scalar fields are rejected rather than silently truncated", () => {
  for (const [overrides, error] of [
    [{ name: "ن".repeat(121) }, "name_too_long"],
    [{ contact: "a".repeat(161) }, "contact_too_long"],
    [{ subject: "س".repeat(161) }, "subject_too_long"],
    [{ source: "s".repeat(121) }, "source_too_long"],
    [{ privacyNoticeVersion: "v".repeat(81) }, "privacy_notice_invalid"],
  ] as const) {
    const parsed = parse(overrides);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.error, error);
  }

  const idempotency = parseSupportMessageCommand({
    body: BASE,
    tenantId: "tenant-a",
    defaultSource: "contact-us",
    idempotencyHeader: "x".repeat(161),
    networkFingerprint: null,
  });
  assert.equal(idempotency.ok, false);
  if (!idempotency.ok) {
    assert.equal(idempotency.error, "idempotency_key_invalid");
  }
});

test("the locale is constrained to the two the platform serves", () => {
  assert.equal(parse({ locale: "en" }).ok, true);
  const parsed = parse({ locale: "de" });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.command.locale, "fa");
});
