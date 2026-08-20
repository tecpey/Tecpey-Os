import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNotificationRequest,
  parseNotificationProducerEvent,
  type SecurityCredentialChangedEvent,
} from "../lib/notifications/producers";

// The governed security.credential_changed producer is fully built — distinct
// per-credential copy, security_critical class, critical urgency — but until now
// the only assertion on it was the passkey variant's actionUrl. That left three
// security-load-bearing invariants unguarded:
//   1. Each credential (password / passkey / two_factor) must name the credential
//      that actually changed, so a victim of an account takeover is told *what*
//      was altered — a regression collapsing the labels would misinform them.
//   2. The class must stay security_critical. That class is mandatory and
//      consent-exempt (proven in notification-policy.test.ts), so it can never be
//      silenced by a hijacker toggling the victim's consent, category or mute
//      settings. Downgrading the class would reopen exactly that hole.
//   3. Critical urgency + top priority, so the alert bypasses quiet hours.
// This locks all three across both locales.

const CREDENTIALS = ["password", "passkey", "two_factor"] as const;

function credentialEvent(
  credential: SecurityCredentialChangedEvent["payload"]["credential"],
  locale: "fa" | "en",
): SecurityCredentialChangedEvent {
  const event = parseNotificationProducerEvent({
    id: `credential:00000000-0000-4000-8000-00000000001${CREDENTIALS.indexOf(credential)}`,
    tenantId: "tenant-a",
    principalId: "00000000-0000-4000-8000-000000000001",
    occurredAt: "2026-08-15T00:00:00.000Z",
    locale,
    version: 1,
    type: "security.credential_changed",
    payload: { credential },
  });
  assert.ok(event && event.type === "security.credential_changed", "event must parse");
  return event;
}

const EXPECTED_LABEL: Record<
  "fa" | "en",
  Record<SecurityCredentialChangedEvent["payload"]["credential"], string>
> = {
  fa: {
    password: "رمز عبور",
    passkey: "کلید عبور",
    two_factor: "تأیید دومرحله‌ای",
  },
  en: {
    password: "password",
    passkey: "passkey",
    two_factor: "two-factor authentication",
  },
};

for (const locale of ["fa", "en"] as const) {
  test(`credential-changed copy names each credential and stays security-critical (${locale})`, () => {
    const titles = new Set<string>();

    for (const credential of CREDENTIALS) {
      const request = buildNotificationRequest(credentialEvent(credential, locale));

      // Invariant 2 + 3: consent-exempt security class, quiet-hours-bypassing urgency.
      assert.equal(request.notificationClass, "security_critical");
      assert.equal(request.urgency, "critical");
      assert.equal(request.priority, 10);
      assert.equal(request.actionUrl, locale === "fa" ? "/academy/security" : "/en/security");

      // Invariant 1: the title names the credential that actually changed.
      assert.ok(
        request.title.includes(EXPECTED_LABEL[locale][credential]),
        `${locale}/${credential} title must include its own label, got: ${request.title}`,
      );
      titles.add(request.title);
    }

    // Invariant 1 (contrapositive): no two credentials share a title, so the copy
    // cannot silently collapse to one generic message that hides which changed.
    assert.equal(titles.size, CREDENTIALS.length, "each credential must have a distinct title");
  });
}

test("credential-changed titles differ across locales", () => {
  for (const credential of CREDENTIALS) {
    const fa = buildNotificationRequest(credentialEvent(credential, "fa")).title;
    const en = buildNotificationRequest(credentialEvent(credential, "en")).title;
    assert.notEqual(fa, en, `${credential} must be localized, not identical fa/en`);
  }
});
