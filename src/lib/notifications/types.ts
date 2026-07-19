export const NOTIFICATION_CLASSES = [
  "security_critical",
  "financial_transactional",
  "legal_compliance_service",
  "academy",
  "trading_arena",
  "mentor_ai",
  "social",
  "news_market_intelligence",
  "product_support",
  "marketing_campaign",
  "admin_operations",
] as const;

export type NotificationClass = (typeof NOTIFICATION_CLASSES)[number];

export const NOTIFICATION_CHANNELS = [
  "in_app",
  "web_push",
  "mobile_push",
  "email",
  "sms",
  "admin_center",
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_AUDIENCE_SCOPES = [
  "principal",
  "principal_list",
  "cohort",
  "crm_segment",
  "topic_followers",
  "role",
  "tenant",
  "platform",
  "emergency_broadcast",
] as const;

export type NotificationAudienceScope =
  (typeof NOTIFICATION_AUDIENCE_SCOPES)[number];

export type NotificationUrgency = "low" | "normal" | "high" | "critical";
export type NotificationCadence = "instant" | "digest";

export type NotificationPolicyDecision =
  | "allow"
  | "defer"
  | "digest"
  | "suppress"
  | "escalate";

export type NotificationPolicyReason =
  | "policy_allowed"
  | "critical_policy_allowed"
  | "recipient_ineligible"
  | "jurisdiction_disallowed"
  | "expired"
  | "duplicate"
  | "approval_required"
  | "dual_control_required"
  | "marketing_consent_required"
  | "category_disabled"
  | "channel_disabled"
  | "destination_unverified"
  | "critical_destination_unavailable"
  | "muted"
  | "quiet_hours"
  | "frequency_cap"
  | "instant_disabled"
  | "digest_unavailable"
  | "template_unavailable";

export type NotificationClassPolicy = {
  notificationClass: NotificationClass;
  mandatory: boolean;
  consentRequired: boolean;
  userCategoryOptOutAllowed: boolean;
  quietHoursBypassAt: NotificationUrgency | null;
  minimumApprovalsForGroup: number;
};

export type NotificationIntent = {
  notificationClass: NotificationClass;
  channel: NotificationChannel;
  audienceScope: NotificationAudienceScope;
  urgency: NotificationUrgency;
  cadence: NotificationCadence;
  correlationKey: string;
  expiresAt: string | null;
  locale: "fa" | "en";
  templateAvailable: boolean;
  grantedApprovals: number;
};

export type RecipientNotificationPolicy = {
  eligible: boolean;
  jurisdictionAllowed: boolean;
  categoryEnabled: boolean;
  channelEnabled: boolean;
  destinationVerified: boolean;
  marketingConsent: boolean;
  muted: boolean;
  inQuietHours: boolean;
  quietHoursEndAt: string | null;
  instantEnabled: boolean;
  digestEnabled: boolean;
  duplicateSeen: boolean;
  recentCategoryDeliveries: number;
  categoryFrequencyCap: number | null;
};

export type NotificationPolicyInput = {
  now: string;
  intent: NotificationIntent;
  recipient: RecipientNotificationPolicy;
};

export type NotificationPolicyResult = {
  decision: NotificationPolicyDecision;
  reason: NotificationPolicyReason;
  mandatory: boolean;
  notBefore: string | null;
  shouldTryFallbackChannel: boolean;
};

export type NotificationProviderRequest = {
  deliveryId: string;
  idempotencyKey: string;
  channel: NotificationChannel;
  destination: string | null;
  locale: "fa" | "en";
  title: string;
  body: string;
  actionUrl: string | null;
  expiresAt: string | null;
  metadata: Readonly<Record<string, string>>;
};

export type NotificationProviderResult = {
  accepted: boolean;
  providerMessageId: string | null;
  retryable: boolean;
  errorCode: string | null;
  providerRegion: string | null;
  estimatedCostMinor: number | null;
};

export interface NotificationProviderAdapter {
  readonly channel: NotificationChannel;
  readonly providerName: string;
  send(request: NotificationProviderRequest): Promise<NotificationProviderResult>;
}
