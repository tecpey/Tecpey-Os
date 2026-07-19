import { createHash } from "crypto";
import type { PoolClient } from "pg";
import type { NotificationPrincipal } from "./principal";
import { evaluateNotificationPolicy } from "./policy";
import type {
  NotificationCadence,
  NotificationClass,
  NotificationPolicyDecision,
  NotificationPolicyReason,
  NotificationUrgency,
} from "./types";

const PILOT_NOTIFICATION_CLASSES = [
  "security_critical",
  "financial_transactional",
  "legal_compliance_service",
  "academy",
  "trading_arena",
  "mentor_ai",
  "product_support",
] as const satisfies readonly NotificationClass[];

const OPTIONAL_DAILY_CAPS: Partial<Record<NotificationClass, number>> = {
  academy: 4,
  trading_arena: 5,
  mentor_ai: 3,
  product_support: 10,
};

export type InAppNotificationRequest = {
  notificationClass: (typeof PILOT_NOTIFICATION_CLASSES)[number];
  sourceType: string;
  sourceId: string | null;
  title: string;
  body: string;
  locale: "fa" | "en";
  actionUrl: string | null;
  urgency: NotificationUrgency;
  priority: number;
  cadence: NotificationCadence;
  correlationKey: string;
  expiresAt: string | null;
  templateAvailable: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type NotificationCreationResult = {
  status: "created" | "replayed" | "suppressed" | "escalated";
  intentId: string;
  notificationId: string | null;
  outboxId: string | null;
  decision: NotificationPolicyDecision;
  reason: NotificationPolicyReason;
  scheduledFor: string | null;
};

type ExistingIntentRow = {
  id: string;
  notification_id: string | null;
  outbox_id: string | null;
  payload_hash: string;
  policy_decision: NotificationPolicyDecision;
  policy_reason: NotificationPolicyReason;
  scheduled_for: Date | null;
};

type RecipientPolicyRow = {
  status: NotificationPrincipal["status"];
  preference_enabled: boolean | null;
  preference_cadence: NotificationCadence | null;
  mute_until: Date | null;
  in_quiet_hours: boolean;
  quiet_hours_end_at: Date | null;
  next_digest_at: Date;
  marketing_consent: boolean;
  recent_category_deliveries: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("notification_metadata_invalid");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  throw new Error("notification_metadata_invalid");
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validInternalActionUrl(value: string | null): boolean {
  return (
    value === null ||
    (value.startsWith("/") && !value.startsWith("//") && value.length <= 1000)
  );
}

function validateRequest(request: InAppNotificationRequest): void {
  if (!PILOT_NOTIFICATION_CLASSES.includes(request.notificationClass)) {
    throw new Error("notification_class_not_enabled_in_pilot");
  }
  if (request.sourceType.trim().length < 1 || request.sourceType.length > 100) {
    throw new Error("notification_source_type_invalid");
  }
  if (request.sourceId !== null && (request.sourceId.length < 1 || request.sourceId.length > 220)) {
    throw new Error("notification_source_id_invalid");
  }
  if (request.title.trim().length < 1 || request.title.length > 240) {
    throw new Error("notification_title_invalid");
  }
  if (request.body.trim().length < 1 || request.body.length > 4000) {
    throw new Error("notification_body_invalid");
  }
  if (!validInternalActionUrl(request.actionUrl)) {
    throw new Error("notification_action_url_invalid");
  }
  if (!Number.isInteger(request.priority) || request.priority < 0 || request.priority > 10) {
    throw new Error("notification_priority_invalid");
  }
  if (
    request.correlationKey.trim().length < 8 ||
    request.correlationKey.length > 300 ||
    !/^[A-Za-z0-9._:-]+$/.test(request.correlationKey)
  ) {
    throw new Error("notification_correlation_key_invalid");
  }
  if (
    request.expiresAt !== null &&
    !Number.isFinite(Date.parse(request.expiresAt))
  ) {
    throw new Error("notification_expiry_invalid");
  }
  const metadataJson = stableJson(request.metadata ?? {});
  if (Buffer.byteLength(metadataJson, "utf8") > 20_000) {
    throw new Error("notification_metadata_too_large");
  }
}

function payloadHash(request: InAppNotificationRequest): string {
  return sha256(
    stableJson({
      channel: "in_app",
      audienceScope: "principal",
      dispatchMode: "event",
      ...request,
      metadata: request.metadata ?? {},
    }),
  );
}

function outboxIdempotencyKey(
  principal: NotificationPrincipal,
  correlationKey: string,
): string {
  return `in-app:${principal.tenantId}:${principal.id}:${sha256(correlationKey).slice(0, 32)}`;
}

async function loadRecipientPolicy(
  client: PoolClient,
  principal: NotificationPrincipal,
  notificationClass: NotificationClass,
  now: string,
): Promise<RecipientPolicyRow> {
  const result = await client.query<RecipientPolicyRow>(
    `WITH context AS (
       SELECT p.status,
              s.timezone,
              s.quiet_start,
              s.quiet_end,
              s.digest_time,
              s.mute_until,
              ($4::timestamptz AT TIME ZONE s.timezone) AS local_now,
              pref.enabled AS preference_enabled,
              pref.cadence AS preference_cadence
         FROM platform_principals p
         JOIN notification_settings s ON s.principal_id = p.id
         LEFT JOIN notification_preferences pref
           ON pref.principal_id = p.id
          AND pref.notification_class = $3
          AND pref.channel = 'in_app'
        WHERE p.tenant_id = $1 AND p.id = $2
        FOR SHARE OF p, s
     ), evaluated AS (
       SELECT *,
              CASE
                WHEN quiet_start IS NULL THEN FALSE
                WHEN quiet_start < quiet_end
                  THEN local_now::time >= quiet_start AND local_now::time < quiet_end
                ELSE local_now::time >= quiet_start OR local_now::time < quiet_end
              END AS in_quiet_hours
         FROM context
     )
     SELECT status,
            preference_enabled,
            preference_cadence,
            mute_until,
            in_quiet_hours,
            CASE
              WHEN NOT in_quiet_hours THEN NULL
              WHEN quiet_start < quiet_end
                THEN (local_now::date + quiet_end) AT TIME ZONE timezone
              WHEN local_now::time < quiet_end
                THEN (local_now::date + quiet_end) AT TIME ZONE timezone
              ELSE ((local_now::date + 1) + quiet_end) AT TIME ZONE timezone
            END AS quiet_hours_end_at,
            (CASE
               WHEN local_now::time < digest_time
                 THEN local_now::date + digest_time
               ELSE (local_now::date + 1) + digest_time
             END) AT TIME ZONE timezone AS next_digest_at,
            COALESCE((
              SELECT c.status = 'granted'
                FROM notification_consents c
               WHERE c.principal_id = $2
                 AND c.purpose = 'marketing'
               ORDER BY c.event_sequence DESC
               LIMIT 1
            ), FALSE) AS marketing_consent,
            (
              SELECT COUNT(*)::text
                FROM platform_notifications n
               WHERE n.tenant_id = $1
                 AND n.principal_id = $2
                 AND n.notification_class = $3
                 AND n.created_at >= $4::timestamptz - INTERVAL '24 hours'
            ) AS recent_category_deliveries
       FROM evaluated`,
    [principal.tenantId, principal.id, notificationClass, now],
  );

  const row = result.rows[0];
  if (!row) throw new Error("notification_principal_policy_missing");
  return row;
}

function replayResult(row: ExistingIntentRow): NotificationCreationResult {
  return {
    status: "replayed",
    intentId: row.id,
    notificationId: row.notification_id,
    outboxId: row.outbox_id,
    decision: row.policy_decision,
    reason: row.policy_reason,
    scheduledFor: row.scheduled_for?.toISOString() ?? null,
  };
}

/**
 * Creates one policy-governed in-app notification for one verified principal.
 * Call this only inside the same database transaction that follows a committed
 * authoritative domain event, or from a post-commit transactional-outbox
 * consumer. External channels and group audiences are intentionally disabled.
 */
export async function createInAppNotification(
  client: PoolClient,
  principal: NotificationPrincipal,
  request: InAppNotificationRequest,
  options: { now?: string } = {},
): Promise<NotificationCreationResult> {
  validateRequest(request);
  if (principal.status !== "active") {
    throw new Error("notification_principal_inactive");
  }

  const now = options.now ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(now))) throw new Error("notification_now_invalid");
  if (request.expiresAt !== null && Date.parse(request.expiresAt) <= Date.parse(now)) {
    throw new Error("notification_expiry_not_future");
  }

  const hash = payloadHash(request);
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `notification-create:${principal.tenantId}:${principal.id}:in_app:${request.correlationKey}`,
  ]);

  const existing = await client.query<ExistingIntentRow>(
    `SELECT id, notification_id, outbox_id, payload_hash,
            policy_decision, policy_reason, scheduled_for
       FROM notification_intents
      WHERE tenant_id = $1
        AND principal_id = $2
        AND channel = 'in_app'
        AND correlation_key = $3
      LIMIT 1`,
    [principal.tenantId, principal.id, request.correlationKey],
  );
  const previous = existing.rows[0];
  if (previous) {
    if (previous.payload_hash !== hash) {
      throw new Error("notification_correlation_payload_conflict");
    }
    return replayResult(previous);
  }

  const recipient = await loadRecipientPolicy(
    client,
    principal,
    request.notificationClass,
    now,
  );
  if (recipient.status !== "active") {
    throw new Error("notification_principal_inactive");
  }

  const mandatory = [
    "security_critical",
    "financial_transactional",
    "legal_compliance_service",
  ].includes(request.notificationClass);
  const preferenceEnabled = recipient.preference_enabled ?? true;
  const preferredCadence = mandatory
    ? "instant"
    : (recipient.preference_cadence ?? request.cadence);
  const categoryCap = OPTIONAL_DAILY_CAPS[request.notificationClass] ?? null;
  const recentCount = Number.parseInt(recipient.recent_category_deliveries, 10);

  const policyInput = {
    now,
    intent: {
      notificationClass: request.notificationClass,
      channel: "in_app" as const,
      audienceScope: "principal" as const,
      dispatchMode: "event" as const,
      urgency: request.urgency,
      cadence: preferredCadence,
      correlationKey: request.correlationKey,
      expiresAt: request.expiresAt,
      locale: request.locale,
      templateAvailable: request.templateAvailable,
      grantedApprovals: 0,
    },
    recipient: {
      eligible: true,
      jurisdictionAllowed: true,
      categoryEnabled: preferenceEnabled,
      channelEnabled: preferenceEnabled,
      destinationVerified: true,
      marketingConsent: recipient.marketing_consent,
      muted:
        !mandatory &&
        recipient.mute_until !== null &&
        recipient.mute_until.getTime() > Date.parse(now),
      inQuietHours: recipient.in_quiet_hours,
      quietHoursEndAt: recipient.quiet_hours_end_at?.toISOString() ?? null,
      instantEnabled: preferredCadence === "instant",
      digestEnabled: true,
      duplicateSeen: false,
      recentCategoryDeliveries: Number.isFinite(recentCount) ? recentCount : 0,
      categoryFrequencyCap: categoryCap,
    },
  };
  const policy = evaluateNotificationPolicy(policyInput);
  const metadata = canonicalize(request.metadata ?? {}) as Record<string, unknown>;
  const policySnapshot = canonicalize(policyInput) as Record<string, unknown>;

  let notificationId: string | null = null;
  let outboxId: string | null = null;
  let scheduledFor: string | null = null;

  if (["allow", "defer", "digest"].includes(policy.decision)) {
    scheduledFor =
      policy.decision === "allow"
        ? now
        : policy.decision === "defer"
          ? policy.notBefore
          : recipient.next_digest_at.toISOString();
    if (!scheduledFor || !Number.isFinite(Date.parse(scheduledFor))) {
      throw new Error("notification_schedule_resolution_failed");
    }

    const insertedNotification = await client.query<{ id: string }>(
      `INSERT INTO platform_notifications
        (tenant_id, principal_id, notification_class, source_type, source_id,
         title, body, locale, action_url, urgency, priority, correlation_key,
         policy_decision, policy_reason, scheduled_for, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13, $14, $15::timestamptz, $16::timestamptz, $17::jsonb)
       RETURNING id`,
      [
        principal.tenantId,
        principal.id,
        request.notificationClass,
        request.sourceType,
        request.sourceId,
        request.title,
        request.body,
        request.locale,
        request.actionUrl,
        request.urgency,
        request.priority,
        request.correlationKey,
        policy.decision,
        policy.reason,
        scheduledFor,
        request.expiresAt,
        JSON.stringify(metadata),
      ],
    );
    notificationId = insertedNotification.rows[0]?.id ?? null;
    if (!notificationId) throw new Error("notification_insert_failed");

    const insertedOutbox = await client.query<{ id: string }>(
      `INSERT INTO notification_outbox
        (notification_id, channel, idempotency_key, available_at, payload_hash)
       VALUES ($1, 'in_app', $2, $3::timestamptz, $4)
       RETURNING id`,
      [
        notificationId,
        outboxIdempotencyKey(principal, request.correlationKey),
        scheduledFor,
        hash,
      ],
    );
    outboxId = insertedOutbox.rows[0]?.id ?? null;
    if (!outboxId) throw new Error("notification_outbox_insert_failed");
  }

  const insertedIntent = await client.query<{ id: string }>(
    `INSERT INTO notification_intents
      (tenant_id, principal_id, notification_id, outbox_id, notification_class,
       channel, audience_scope, dispatch_mode, source_type, source_id, title,
       body, locale, action_url, urgency, priority, cadence, correlation_key,
       payload_hash, granted_approvals, template_available, policy_decision,
       policy_reason, mandatory, should_try_fallback_channel, scheduled_for,
       expires_at, policy_snapshot, metadata)
     VALUES
      ($1, $2, $3::uuid, $4::uuid, $5, 'in_app', 'principal', 'event', $6, $7,
       $8, $9, $10, $11, $12, $13, $14, $15, $16, 0, $17, $18, $19, $20,
       $21, $22::timestamptz, $23::timestamptz, $24::jsonb, $25::jsonb)
     RETURNING id`,
    [
      principal.tenantId,
      principal.id,
      notificationId,
      outboxId,
      request.notificationClass,
      request.sourceType,
      request.sourceId,
      request.title,
      request.body,
      request.locale,
      request.actionUrl,
      request.urgency,
      request.priority,
      preferredCadence,
      request.correlationKey,
      hash,
      request.templateAvailable,
      policy.decision,
      policy.reason,
      policy.mandatory,
      policy.shouldTryFallbackChannel,
      scheduledFor,
      request.expiresAt,
      JSON.stringify(policySnapshot),
      JSON.stringify(metadata),
    ],
  );
  const intentId = insertedIntent.rows[0]?.id;
  if (!intentId) throw new Error("notification_intent_insert_failed");

  return {
    status:
      policy.decision === "suppress"
        ? "suppressed"
        : policy.decision === "escalate"
          ? "escalated"
          : "created",
    intentId,
    notificationId,
    outboxId,
    decision: policy.decision,
    reason: policy.reason,
    scheduledFor,
  };
}
