import {
  NOTIFICATION_AUDIENCE_SCOPES,
  NOTIFICATION_CADENCES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CLASSES,
  NOTIFICATION_DISPATCH_MODES,
  NOTIFICATION_LOCALES,
  NOTIFICATION_URGENCIES,
} from "./types";
import type {
  NotificationAudienceScope,
  NotificationClass,
  NotificationClassPolicy,
  NotificationPolicyInput,
  NotificationPolicyResult,
  NotificationUrgency,
  RecipientNotificationPolicy,
} from "./types";

const URGENCY_RANK: Record<NotificationUrgency, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

const classPolicies: Record<NotificationClass, NotificationClassPolicy> = {
  security_critical: {
    notificationClass: "security_critical",
    mandatory: true,
    consentRequired: false,
    userCategoryOptOutAllowed: false,
    quietHoursBypassAt: "high",
  },
  financial_transactional: {
    notificationClass: "financial_transactional",
    mandatory: true,
    consentRequired: false,
    userCategoryOptOutAllowed: false,
    quietHoursBypassAt: "critical",
  },
  legal_compliance_service: {
    notificationClass: "legal_compliance_service",
    mandatory: true,
    consentRequired: false,
    userCategoryOptOutAllowed: false,
    quietHoursBypassAt: "critical",
  },
  academy: {
    notificationClass: "academy",
    mandatory: false,
    consentRequired: false,
    userCategoryOptOutAllowed: true,
    quietHoursBypassAt: null,
  },
  trading_arena: {
    notificationClass: "trading_arena",
    mandatory: false,
    consentRequired: false,
    userCategoryOptOutAllowed: true,
    quietHoursBypassAt: null,
  },
  mentor_ai: {
    notificationClass: "mentor_ai",
    mandatory: false,
    consentRequired: false,
    userCategoryOptOutAllowed: true,
    quietHoursBypassAt: null,
  },
  social: {
    notificationClass: "social",
    mandatory: false,
    consentRequired: false,
    userCategoryOptOutAllowed: true,
    quietHoursBypassAt: null,
  },
  news_market_intelligence: {
    notificationClass: "news_market_intelligence",
    mandatory: false,
    consentRequired: false,
    userCategoryOptOutAllowed: true,
    quietHoursBypassAt: null,
  },
  product_support: {
    notificationClass: "product_support",
    mandatory: false,
    consentRequired: false,
    userCategoryOptOutAllowed: true,
    quietHoursBypassAt: null,
  },
  marketing_campaign: {
    notificationClass: "marketing_campaign",
    mandatory: false,
    consentRequired: true,
    userCategoryOptOutAllowed: true,
    quietHoursBypassAt: null,
  },
  admin_operations: {
    notificationClass: "admin_operations",
    mandatory: true,
    consentRequired: false,
    userCategoryOptOutAllowed: false,
    quietHoursBypassAt: "high",
  },
};

for (const policy of Object.values(classPolicies)) Object.freeze(policy);
export const NOTIFICATION_CLASS_POLICIES: Readonly<
  Record<NotificationClass, Readonly<NotificationClassPolicy>>
> = Object.freeze(classPolicies);

function result(
  decision: NotificationPolicyResult["decision"],
  reason: NotificationPolicyResult["reason"],
  mandatory: boolean,
  options: Pick<
    NotificationPolicyResult,
    "notBefore" | "shouldTryFallbackChannel"
  > = { notBefore: null, shouldTryFallbackChannel: false },
): NotificationPolicyResult {
  return { decision, reason, mandatory, ...options };
}

function invalidResult(mandatory = false): NotificationPolicyResult {
  return result("suppress", "invalid_request", mandatory);
}

function oneOf<T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function requiredApprovals(
  audienceScope: NotificationAudienceScope,
  dispatchMode: NotificationPolicyInput["intent"]["dispatchMode"],
): number {
  if (
    dispatchMode === "emergency" ||
    audienceScope === "emergency_broadcast" ||
    audienceScope === "platform"
  ) {
    return 2;
  }

  if (dispatchMode === "broadcast" || dispatchMode === "campaign") {
    return 1;
  }

  return 0;
}

function isAtLeast(
  urgency: NotificationUrgency,
  threshold: NotificationUrgency | null,
): boolean {
  return threshold !== null && URGENCY_RANK[urgency] >= URGENCY_RANK[threshold];
}

function requiresVerifiedDestination(
  channel: NotificationPolicyInput["intent"]["channel"],
): boolean {
  return channel !== "in_app" && channel !== "admin_center";
}

function validIsoTimestamp(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function validRecipientShape(
  value: unknown,
): value is RecipientNotificationPolicy {
  if (!value || typeof value !== "object") return false;
  const recipient = value as Partial<RecipientNotificationPolicy>;
  return (
    isBoolean(recipient.eligible) &&
    isBoolean(recipient.jurisdictionAllowed) &&
    isBoolean(recipient.categoryEnabled) &&
    isBoolean(recipient.channelEnabled) &&
    isBoolean(recipient.destinationVerified) &&
    isBoolean(recipient.marketingConsent) &&
    isBoolean(recipient.muted) &&
    isBoolean(recipient.inQuietHours) &&
    (recipient.quietHoursEndAt === null ||
      typeof recipient.quietHoursEndAt === "string") &&
    isBoolean(recipient.instantEnabled) &&
    isBoolean(recipient.digestEnabled) &&
    isBoolean(recipient.duplicateSeen) &&
    Number.isInteger(recipient.recentCategoryDeliveries) &&
    (recipient.categoryFrequencyCap === null ||
      Number.isInteger(recipient.categoryFrequencyCap))
  );
}

function validRuntimeShape(input: unknown): input is NotificationPolicyInput {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Partial<NotificationPolicyInput>;
  if (!candidate.intent || typeof candidate.intent !== "object") return false;
  if (!validRecipientShape(candidate.recipient)) return false;

  const intent = candidate.intent as Record<string, unknown>;
  return (
    typeof candidate.now === "string" &&
    oneOf(NOTIFICATION_CLASSES, intent.notificationClass) &&
    oneOf(NOTIFICATION_CHANNELS, intent.channel) &&
    oneOf(NOTIFICATION_AUDIENCE_SCOPES, intent.audienceScope) &&
    oneOf(NOTIFICATION_DISPATCH_MODES, intent.dispatchMode) &&
    oneOf(NOTIFICATION_URGENCIES, intent.urgency) &&
    oneOf(NOTIFICATION_CADENCES, intent.cadence) &&
    oneOf(NOTIFICATION_LOCALES, intent.locale) &&
    typeof intent.correlationKey === "string" &&
    (intent.expiresAt === null || typeof intent.expiresAt === "string") &&
    typeof intent.templateAvailable === "boolean" &&
    Number.isInteger(intent.grantedApprovals)
  );
}

/**
 * Deterministic notification policy authority.
 *
 * AI output must never be accepted as an override for this function. Callers may
 * use AI to draft or rank already-eligible content, but every recipient/channel
 * delivery must pass this policy with server-owned facts.
 */
export function evaluateNotificationPolicy(
  input: NotificationPolicyInput,
): NotificationPolicyResult {
  if (!validRuntimeShape(input)) return invalidResult();

  const { intent, recipient } = input;
  const classPolicy = NOTIFICATION_CLASS_POLICIES[intent.notificationClass];
  const mandatory = classPolicy.mandatory;

  if (
    !validIsoTimestamp(input.now) ||
    intent.correlationKey.trim().length < 8 ||
    intent.grantedApprovals < 0 ||
    recipient.recentCategoryDeliveries < 0 ||
    (recipient.categoryFrequencyCap !== null &&
      recipient.categoryFrequencyCap < 0) ||
    (intent.expiresAt !== null && !validIsoTimestamp(intent.expiresAt))
  ) {
    return invalidResult(mandatory);
  }

  if (!recipient.eligible) {
    return result("suppress", "recipient_ineligible", mandatory);
  }

  if (!recipient.jurisdictionAllowed) {
    return result("suppress", "jurisdiction_disallowed", mandatory);
  }

  if (
    intent.expiresAt !== null &&
    Date.parse(input.now) >= Date.parse(intent.expiresAt)
  ) {
    return result("suppress", "expired", mandatory);
  }

  if (recipient.duplicateSeen) {
    return result("suppress", "duplicate", mandatory);
  }

  const approvalsNeeded = requiredApprovals(
    intent.audienceScope,
    intent.dispatchMode,
  );
  if (intent.grantedApprovals < approvalsNeeded) {
    return result(
      "escalate",
      approvalsNeeded >= 2 ? "dual_control_required" : "approval_required",
      mandatory,
    );
  }

  if (!intent.templateAvailable) {
    return result(
      mandatory ? "escalate" : "suppress",
      "template_unavailable",
      mandatory,
    );
  }

  if (classPolicy.consentRequired && !recipient.marketingConsent) {
    return result("suppress", "marketing_consent_required", mandatory);
  }

  if (
    classPolicy.userCategoryOptOutAllowed &&
    !recipient.categoryEnabled
  ) {
    return result("suppress", "category_disabled", mandatory);
  }

  if (!recipient.channelEnabled) {
    return result(
      mandatory ? "escalate" : "suppress",
      "channel_disabled",
      mandatory,
      {
        notBefore: null,
        shouldTryFallbackChannel: mandatory,
      },
    );
  }

  if (
    requiresVerifiedDestination(intent.channel) &&
    !recipient.destinationVerified
  ) {
    return result(
      mandatory ? "escalate" : "suppress",
      mandatory
        ? "critical_destination_unavailable"
        : "destination_unverified",
      mandatory,
      {
        notBefore: null,
        shouldTryFallbackChannel: mandatory,
      },
    );
  }

  if (!mandatory && recipient.muted) {
    return result("suppress", "muted", mandatory);
  }

  const bypassesQuietHours = isAtLeast(
    intent.urgency,
    classPolicy.quietHoursBypassAt,
  );
  if (recipient.inQuietHours && !bypassesQuietHours) {
    if (
      recipient.quietHoursEndAt === null ||
      !validIsoTimestamp(recipient.quietHoursEndAt)
    ) {
      return invalidResult(mandatory);
    }
    return result("defer", "quiet_hours", mandatory, {
      notBefore: recipient.quietHoursEndAt,
      shouldTryFallbackChannel: false,
    });
  }

  if (
    !mandatory &&
    recipient.categoryFrequencyCap !== null &&
    recipient.recentCategoryDeliveries >= recipient.categoryFrequencyCap
  ) {
    if (recipient.digestEnabled) {
      return result("digest", "frequency_cap", mandatory);
    }
    return result("suppress", "frequency_cap", mandatory);
  }

  if (intent.cadence === "digest") {
    if (recipient.digestEnabled) {
      return result("digest", "policy_allowed", mandatory);
    }
    return result("suppress", "digest_unavailable", mandatory);
  }

  if (!mandatory && !recipient.instantEnabled) {
    if (recipient.digestEnabled) {
      return result("digest", "instant_disabled", mandatory);
    }
    return result("suppress", "instant_disabled", mandatory);
  }

  return result(
    "allow",
    bypassesQuietHours && recipient.inQuietHours
      ? "critical_policy_allowed"
      : "policy_allowed",
    mandatory,
  );
}
