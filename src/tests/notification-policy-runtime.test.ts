import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateNotificationPolicy,
  NOTIFICATION_CLASS_POLICIES,
} from "../lib/notifications/policy";
import type { NotificationPolicyInput } from "../lib/notifications/types";

function validInput(): NotificationPolicyInput {
  return {
    now: "2026-07-19T12:00:00.000Z",
    intent: {
      notificationClass: "academy",
      channel: "in_app",
      audienceScope: "principal",
      dispatchMode: "event",
      urgency: "normal",
      cadence: "instant",
      correlationKey: "academy:runtime:validation:1",
      expiresAt: "2026-07-20T12:00:00.000Z",
      locale: "fa",
      templateAvailable: true,
      grantedApprovals: 0,
    },
    recipient: {
      eligible: true,
      jurisdictionAllowed: true,
      categoryEnabled: true,
      channelEnabled: true,
      destinationVerified: false,
      marketingConsent: false,
      muted: false,
      inQuietHours: false,
      quietHoursEndAt: null,
      instantEnabled: true,
      digestEnabled: true,
      duplicateSeen: false,
      recentCategoryDeliveries: 0,
      categoryFrequencyCap: 5,
    },
  };
}

function malformed(
  path: "notificationClass" | "channel" | "audienceScope" | "dispatchMode" | "urgency" | "cadence" | "locale",
  value: unknown,
): NotificationPolicyInput {
  const candidate = validInput() as unknown as {
    intent: Record<string, unknown>;
  };
  candidate.intent[path] = value;
  return candidate as unknown as NotificationPolicyInput;
}

for (const [field, value] of [
  ["notificationClass", "ai_decided_mandatory"],
  ["channel", "telegram_unapproved"],
  ["audienceScope", "everyone_forever"],
  ["dispatchMode", "silent_autonomous"],
  ["urgency", "super_critical"],
  ["cadence", "continuous"],
  ["locale", "unknown"],
] as const) {
  test(`fails closed on malformed runtime ${field}`, () => {
    const result = evaluateNotificationPolicy(malformed(field, value));
    assert.deepEqual(result, {
      decision: "suppress",
      reason: "invalid_request",
      mandatory: false,
      notBefore: null,
      shouldTryFallbackChannel: false,
    });
  });
}

test("fails closed on missing recipient policy shape", () => {
  const candidate = validInput() as unknown as Record<string, unknown>;
  candidate.recipient = null;
  const result = evaluateNotificationPolicy(
    candidate as unknown as NotificationPolicyInput,
  );
  assert.equal(result.decision, "suppress");
  assert.equal(result.reason, "invalid_request");
});

test("class policy map and individual policies are frozen at runtime", () => {
  assert.equal(Object.isFrozen(NOTIFICATION_CLASS_POLICIES), true);
  assert.equal(
    Object.isFrozen(NOTIFICATION_CLASS_POLICIES.security_critical),
    true,
  );
});
