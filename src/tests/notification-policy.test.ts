import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNotificationPolicy } from "../lib/notifications/policy";
import type {
  NotificationIntent,
  NotificationPolicyInput,
  RecipientNotificationPolicy,
} from "../lib/notifications/types";

const NOW = "2026-07-19T12:00:00.000Z";

function baseIntent(
  overrides: Partial<NotificationIntent> = {},
): NotificationIntent {
  return {
    notificationClass: "academy",
    channel: "in_app",
    audienceScope: "principal",
    dispatchMode: "event",
    urgency: "normal",
    cadence: "instant",
    correlationKey: "academy:lesson:student-1:term-1",
    expiresAt: "2026-07-20T12:00:00.000Z",
    locale: "fa",
    templateAvailable: true,
    grantedApprovals: 0,
    ...overrides,
  };
}

function baseRecipient(
  overrides: Partial<RecipientNotificationPolicy> = {},
): RecipientNotificationPolicy {
  return {
    eligible: true,
    jurisdictionAllowed: true,
    categoryEnabled: true,
    channelEnabled: true,
    destinationVerified: true,
    marketingConsent: false,
    muted: false,
    inQuietHours: false,
    quietHoursEndAt: null,
    instantEnabled: true,
    digestEnabled: true,
    duplicateSeen: false,
    recentCategoryDeliveries: 0,
    categoryFrequencyCap: 5,
    ...overrides,
  };
}

function input(
  intentOverrides: Partial<NotificationIntent> = {},
  recipientOverrides: Partial<RecipientNotificationPolicy> = {},
): NotificationPolicyInput {
  return {
    now: NOW,
    intent: baseIntent(intentOverrides),
    recipient: baseRecipient(recipientOverrides),
  };
}

test("allows an eligible personal Academy in-app notification", () => {
  assert.deepEqual(evaluateNotificationPolicy(input()), {
    decision: "allow",
    reason: "policy_allowed",
    mandatory: false,
    notBefore: null,
    shouldTryFallbackChannel: false,
  });
});

test("security-critical high urgency bypasses quiet hours and category opt-out", () => {
  const result = evaluateNotificationPolicy(
    input(
      {
        notificationClass: "security_critical",
        channel: "email",
        urgency: "high",
      },
      {
        categoryEnabled: false,
        instantEnabled: false,
        muted: true,
        inQuietHours: true,
        quietHoursEndAt: "2026-07-19T20:00:00.000Z",
      },
    ),
  );

  assert.equal(result.decision, "allow");
  assert.equal(result.reason, "critical_policy_allowed");
  assert.equal(result.mandatory, true);
});

test("normal financial notification respects quiet hours and is deferred", () => {
  const result = evaluateNotificationPolicy(
    input(
      {
        notificationClass: "financial_transactional",
        channel: "web_push",
        urgency: "normal",
      },
      {
        inQuietHours: true,
        quietHoursEndAt: "2026-07-19T20:00:00.000Z",
      },
    ),
  );

  assert.equal(result.decision, "defer");
  assert.equal(result.reason, "quiet_hours");
  assert.equal(result.notBefore, "2026-07-19T20:00:00.000Z");
  assert.equal(result.mandatory, true);
});

test("marketing is suppressed without explicit consent", () => {
  const result = evaluateNotificationPolicy(
    input({ notificationClass: "marketing_campaign" }),
  );

  assert.equal(result.decision, "suppress");
  assert.equal(result.reason, "marketing_consent_required");
});

test("AI or campaign callers cannot bypass a disabled optional category", () => {
  const result = evaluateNotificationPolicy(
    input(
      {
        notificationClass: "mentor_ai",
        dispatchMode: "automation",
      },
      { categoryEnabled: false },
    ),
  );

  assert.equal(result.decision, "suppress");
  assert.equal(result.reason, "category_disabled");
});

test("platform-wide sends require dual control", () => {
  const result = evaluateNotificationPolicy(
    input({
      notificationClass: "legal_compliance_service",
      audienceScope: "platform",
      dispatchMode: "broadcast",
      urgency: "critical",
      grantedApprovals: 1,
    }),
  );

  assert.equal(result.decision, "escalate");
  assert.equal(result.reason, "dual_control_required");
});

test("approved platform-wide critical send is allowed", () => {
  const result = evaluateNotificationPolicy(
    input({
      notificationClass: "legal_compliance_service",
      audienceScope: "platform",
      dispatchMode: "broadcast",
      urgency: "critical",
      grantedApprovals: 2,
    }),
  );

  assert.equal(result.decision, "allow");
  assert.equal(result.mandatory, true);
});

test("campaign sends require approval even for a single CRM segment", () => {
  const result = evaluateNotificationPolicy(
    input(
      {
        notificationClass: "marketing_campaign",
        audienceScope: "crm_segment",
        dispatchMode: "campaign",
        grantedApprovals: 0,
      },
      { marketingConsent: true },
    ),
  );

  assert.equal(result.decision, "escalate");
  assert.equal(result.reason, "approval_required");
});

test("mandatory delivery with an unverified destination escalates to fallback", () => {
  const result = evaluateNotificationPolicy(
    input(
      {
        notificationClass: "security_critical",
        channel: "sms",
        urgency: "critical",
      },
      { destinationVerified: false },
    ),
  );

  assert.equal(result.decision, "escalate");
  assert.equal(result.reason, "critical_destination_unavailable");
  assert.equal(result.shouldTryFallbackChannel, true);
});

test("in-app delivery does not require an external verified destination", () => {
  const result = evaluateNotificationPolicy(
    input({}, { destinationVerified: false }),
  );

  assert.equal(result.decision, "allow");
});

test("optional notification moves to digest after frequency cap", () => {
  const result = evaluateNotificationPolicy(
    input(
      { notificationClass: "social" },
      {
        recentCategoryDeliveries: 5,
        categoryFrequencyCap: 5,
        digestEnabled: true,
      },
    ),
  );

  assert.equal(result.decision, "digest");
  assert.equal(result.reason, "frequency_cap");
});

test("duplicate correlation is suppressed before channel delivery", () => {
  const result = evaluateNotificationPolicy(
    input({}, { duplicateSeen: true }),
  );

  assert.equal(result.decision, "suppress");
  assert.equal(result.reason, "duplicate");
});

test("expired notification is suppressed", () => {
  const result = evaluateNotificationPolicy(
    input({ expiresAt: "2026-07-18T12:00:00.000Z" }),
  );

  assert.equal(result.decision, "suppress");
  assert.equal(result.reason, "expired");
});

test("invalid timestamps and weak correlation keys fail closed", () => {
  const invalidTime = evaluateNotificationPolicy({
    ...input(),
    now: "not-a-time",
  });
  const weakKey = evaluateNotificationPolicy(
    input({ correlationKey: "short" }),
  );

  assert.equal(invalidTime.decision, "suppress");
  assert.equal(invalidTime.reason, "invalid_request");
  assert.equal(weakKey.decision, "suppress");
  assert.equal(weakKey.reason, "invalid_request");
});

test("optional instant-disabled notification uses an enabled digest", () => {
  const result = evaluateNotificationPolicy(
    input({}, { instantEnabled: false, digestEnabled: true }),
  );

  assert.equal(result.decision, "digest");
  assert.equal(result.reason, "instant_disabled");
});

test("malformed runtime enum values fail closed without throwing", () => {
  const fields = [
    ["notificationClass", "invented_mandatory_class"],
    ["channel", "direct_provider_bypass"],
    ["audienceScope", "everyone_without_snapshot"],
    ["dispatchMode", "unapproved_autonomous_send"],
    ["urgency", "override_all_controls"],
    ["cadence", "continuous_spam"],
    ["locale", "unknown-locale"],
  ] as const;

  for (const [field, value] of fields) {
    const malformed = input() as unknown as {
      now: string;
      intent: Record<string, unknown>;
      recipient: RecipientNotificationPolicy;
    };
    malformed.intent[field] = value;

    assert.doesNotThrow(() =>
      evaluateNotificationPolicy(
        malformed as unknown as NotificationPolicyInput,
      ),
    );
    const result = evaluateNotificationPolicy(
      malformed as unknown as NotificationPolicyInput,
    );
    assert.equal(result.decision, "suppress", field);
    assert.equal(result.reason, "invalid_request", field);
  }
});

test("malformed recipient policy fails closed without exposing a send path", () => {
  const malformed = {
    ...input(),
    recipient: {
      ...baseRecipient(),
      categoryEnabled: "yes",
      recentCategoryDeliveries: Number.NaN,
    },
  } as unknown as NotificationPolicyInput;

  assert.doesNotThrow(() => evaluateNotificationPolicy(malformed));
  assert.deepEqual(evaluateNotificationPolicy(malformed), {
    decision: "suppress",
    reason: "invalid_request",
    mandatory: false,
    notBefore: null,
    shouldTryFallbackChannel: false,
  });
});
