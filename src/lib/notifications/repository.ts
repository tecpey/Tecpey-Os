import type { PoolClient } from "pg";
import { Validate } from "../api-validation";
import { NOTIFICATION_CLASS_POLICIES } from "./policy";
import type { NotificationPrincipal } from "./principal";
import type {
  NotificationCadence,
  NotificationChannel,
  NotificationClass,
} from "./types";

export const LEGACY_NOTIFICATION_MIGRATION_BATCH_SIZE = 200;

export type InboxNotification = {
  id: string;
  notificationClass: NotificationClass;
  title: string;
  body: string;
  locale: "fa" | "en";
  actionUrl: string | null;
  urgency: "low" | "normal" | "high" | "critical";
  priority: number;
  sourceType: string;
  sourceId: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  actionedAt: string | null;
  deliveredAt: string;
  scheduledFor: string;
  expiresAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type NotificationPreference = {
  notificationClass: NotificationClass;
  channel: NotificationChannel;
  enabled: boolean;
  cadence: NotificationCadence;
  updatedAt: string;
};

export type NotificationSettings = {
  timezone: string;
  quietStart: string | null;
  quietEnd: string | null;
  digestTime: string;
  muteUntil: string | null;
  updatedAt: string;
};

type InboxRow = {
  id: string;
  notification_class: NotificationClass;
  title: string;
  body: string;
  locale: "fa" | "en";
  action_url: string | null;
  urgency: InboxNotification["urgency"];
  priority: number;
  source_type: string;
  source_id: string | null;
  read_at: Date | null;
  dismissed_at: Date | null;
  actioned_at: Date | null;
  delivered_at: Date;
  scheduled_for: Date;
  expires_at: Date | null;
  created_at: Date;
  metadata: Record<string, unknown>;
};

type Cursor = { createdAt: string; id: string };

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapInboxRow(row: InboxRow): InboxNotification {
  return {
    id: row.id,
    notificationClass: row.notification_class,
    title: row.title,
    body: row.body,
    locale: row.locale,
    actionUrl: row.action_url,
    urgency: row.urgency,
    priority: row.priority,
    sourceType: row.source_type,
    sourceId: row.source_id,
    readAt: toIso(row.read_at),
    dismissedAt: toIso(row.dismissed_at),
    actionedAt: toIso(row.actioned_at),
    deliveredAt: row.delivered_at.toISOString(),
    scheduledFor: row.scheduled_for.toISOString(),
    expiresAt: toIso(row.expires_at),
    createdAt: row.created_at.toISOString(),
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata
        : {},
  };
}

export function encodeNotificationCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeNotificationCursor(value: unknown): Cursor | null {
  if (typeof value !== "string" || value.length < 8 || value.length > 500) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<Cursor>;
    const id = Validate.uuid(parsed.id);
    if (
      !id ||
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt))
    ) {
      return null;
    }
    return { id, createdAt: new Date(parsed.createdAt).toISOString() };
  } catch {
    return null;
  }
}

function legacyClass(type: string): NotificationClass {
  switch (type) {
    case "learning":
    case "academy":
      return "academy";
    case "mentor":
      return "mentor_ai";
    case "security":
      return "security_critical";
    case "market":
    case "news":
      return "news_market_intelligence";
    case "social":
      return "social";
    default:
      return "product_support";
  }
}

// Command Center broadcasts are promotional re-engagement, not support. They are
// written to notification_center with type "system" (there is no marketing type
// on that legacy path) but carry metadata.campaign, so on migration they would
// otherwise fall through legacyClass to product_support — a near-mandatory
// support class the recipient cannot opt out of, letting a marketing blast
// masquerade as transactional support. Classify any campaign-stamped legacy row
// as the consent-gated marketing_campaign class instead.
export function classifyLegacyNotification(
  type: string,
  metadata: unknown,
): NotificationClass {
  if (
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    typeof (metadata as Record<string, unknown>).campaign === "string" &&
    (metadata as Record<string, unknown>).campaign !== ""
  ) {
    return "marketing_campaign";
  }
  return legacyClass(type);
}

export async function migrateLegacyNotificationsForPrincipal(
  client: PoolClient,
  principal: NotificationPrincipal,
): Promise<number> {
  // Two legacy sources are drained into the governed inbox on read, keyed
  // differently: notification_center by student, security_notifications by
  // account. A principal may carry either binding (a security-only principal
  // has no studentId at all), so drain each independently rather than gating
  // both on the student.
  let inserted = 0;
  inserted += await drainNotificationCenterForPrincipal(client, principal);
  inserted += await drainSecurityNotificationsForPrincipal(client, principal);
  return inserted;
}

/**
 * Marketing consent as the governed creation path evaluates it: the latest
 * `notification_consents` row for the marketing purpose, absent meaning refused.
 *
 * Inlined into each migration INSERT rather than read once for the batch. A
 * batch drains up to LEGACY_NOTIFICATION_MIGRATION_BATCH_SIZE rows, and under
 * READ COMMITTED a revocation committed part-way through that loop is visible to
 * every later statement — but not to a boolean captured before it began. Reading
 * it per statement makes each row's decision atomic with its own insert, so a
 * revocation cannot leak the campaigns still queued behind it.
 */
const MARKETING_CONSENT_SQL = `
  SELECT COALESCE((
    SELECT c.status = 'granted'
      FROM notification_consents c
     WHERE c.principal_id = $2
       AND c.purpose = 'marketing'
     ORDER BY c.event_sequence DESC
     LIMIT 1
  ), FALSE) AS granted`;

async function drainNotificationCenterForPrincipal(
  client: PoolClient,
  principal: NotificationPrincipal,
): Promise<number> {
  if (!principal.studentId) return 0;

  // marketing_campaign is the only class the policy marks consentRequired, so it
  // is the platform's single consent gate — and this legacy drain used to walk
  // straight past it. Every migrated row was stamped policy_decision 'allow' and
  // given a delivered_at, so a Command Center campaign reached the inbox of a
  // principal who had never granted marketing consent, with an audit trail
  // asserting the policy permitted it. Classifying the row as marketing_campaign
  // made the gap visible; it did not close it.

  const legacy = await client.query<{
    id: string;
    type: string;
    title: string;
    body: string;
    action_url: string | null;
    priority: number;
    read_at: Date | null;
    created_at: Date;
    scheduled_for: Date;
    metadata: Record<string, unknown>;
  }>(
    `SELECT legacy.id, legacy.type, legacy.title, legacy.body, legacy.action_url,
            legacy.priority, legacy.read_at, legacy.created_at,
            legacy.scheduled_for, legacy.metadata
       FROM notification_center AS legacy
      WHERE legacy.tenant_id = $2
        AND (legacy.student_id = $1::uuid OR legacy.student_id IS NULL)
        AND NOT EXISTS (
          SELECT 1
            FROM platform_notifications AS migrated
           WHERE migrated.tenant_id = $2
             AND migrated.principal_id = $3::uuid
             AND migrated.correlation_key =
                 'legacy:notification_center:' || legacy.id::text
        )
      ORDER BY legacy.created_at DESC, legacy.id DESC
      LIMIT $4`,
    [
      principal.studentId,
      principal.tenantId,
      principal.id,
      LEGACY_NOTIFICATION_MIGRATION_BATCH_SIZE,
    ],
  );

  let inserted = 0;
  for (const item of legacy.rows) {
    const notificationClass = classifyLegacyNotification(item.type, item.metadata);
    // Whether the class needs consent is a static property of the class, so it is
    // safe to decide here; whether consent is *held* is not, so that is read
    // inside the statement below.
    const consentRequired = NOTIFICATION_CLASS_POLICIES[notificationClass].consentRequired;

    // Withhold rather than skip. The row is still written so it consumes its
    // correlation key: skipping would leave it eligible on every later drain,
    // and a campaign backlog would occupy the batch window indefinitely while
    // older legitimate notifications never migrated. Written without a
    // delivered_at it stays out of the inbox, which filters on delivered_at.
    //
    // The decision is recorded as 'defer', not 'suppress', only because this
    // table's CHECK constraint predates the consent gate and admits no
    // 'suppress' value; the reason column carries the governed vocabulary. That
    // divergence is a follow-up needing a migration, not a judgement that the
    // notification may later be delivered without consent.
    const result = await client.query(
      `WITH consent AS (${MARKETING_CONSENT_SQL}),
            decision AS (
              SELECT ($15::boolean AND NOT consent.granted) AS withheld FROM consent
            )
       INSERT INTO platform_notifications
        (tenant_id, principal_id, notification_class, source_type, source_id,
         title, body, locale, action_url, urgency, priority, correlation_key,
         policy_decision, policy_reason, scheduled_for, read_at, delivered_at,
         metadata, created_at, updated_at)
       SELECT
         $1, $2, $3, 'legacy_notification_center', $4, $5, $6, $7, $8,
         CASE WHEN $9::int >= 3 THEN 'high' ELSE 'normal' END,
         LEAST(10, GREATEST(0, $9::int)), $10,
         CASE WHEN decision.withheld THEN 'suppress' ELSE 'allow' END,
         CASE WHEN decision.withheld THEN 'marketing_consent_required' ELSE 'legacy_migrated' END,
         $11, $12,
         CASE WHEN decision.withheld THEN NULL::timestamptz ELSE $14::timestamptz END,
         $13::jsonb, $14, $14
       FROM decision
       ON CONFLICT (tenant_id, principal_id, correlation_key) DO NOTHING`,
      [
        principal.tenantId,
        principal.id,
        notificationClass,
        item.id,
        item.title,
        item.body,
        principal.locale,
        item.action_url,
        Number.isInteger(item.priority) ? item.priority : 1,
        `legacy:notification_center:${item.id}`,
        item.scheduled_for,
        item.read_at,
        JSON.stringify({ legacyType: item.type, ...(item.metadata ?? {}) }),
        item.created_at,
        consentRequired,
      ],
    );
    inserted += result.rowCount ?? 0;
  }

  return inserted;
}

// Source type and correlation-key prefix under which security_notifications rows
// (withdrawal blocked, new device, risky withdrawal, 2FA disabled, …) are drained
// into the governed inbox. Kept as a pure helper so the correlation identity is
// testable and stable — the drain is idempotent on it.
export const SECURITY_NOTIFICATION_SOURCE_TYPE = "legacy_security_notification";

export function securityNotificationCorrelationKey(id: string): string {
  return `legacy:security_notifications:${id}`;
}

// Deliver persisted security events. security_notifications was written by
// emitSecurityNotification (fire-and-forget from the withdrawal/security flows)
// but nothing ever read it, so security-critical alerts were logged and then
// stranded. Drain the acting account's own rows into platform_notifications —
// the same governed inbox GET /api/notifications already serves — classified as
// the mandatory security_critical class, idempotently by correlation key, and
// mark the source row delivered. Scoped to principal.accountId (the auth user
// id security_notifications.user_id carries), so it is a no-op for principals
// with no bound account.
async function drainSecurityNotificationsForPrincipal(
  client: PoolClient,
  principal: NotificationPrincipal,
): Promise<number> {
  if (!principal.accountId) return 0;

  const pending = await client.query<{
    id: string;
    type: string;
    title: string;
    body: string;
    read: boolean;
    created_at: Date;
    metadata: Record<string, unknown>;
  }>(
    `SELECT s.id, s.type, s.title, s.body, s.read, s.created_at, s.metadata
       FROM security_notifications AS s
      WHERE s.user_id = $1
        AND NOT EXISTS (
          SELECT 1
            FROM platform_notifications AS migrated
           WHERE migrated.tenant_id = $2
             AND migrated.principal_id = $3::uuid
             AND migrated.correlation_key =
                 'legacy:security_notifications:' || s.id
        )
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT $4`,
    [
      principal.accountId,
      principal.tenantId,
      principal.id,
      LEGACY_NOTIFICATION_MIGRATION_BATCH_SIZE,
    ],
  );

  let inserted = 0;
  for (const item of pending.rows) {
    const result = await client.query(
      `INSERT INTO platform_notifications
        (tenant_id, principal_id, notification_class, source_type, source_id,
         title, body, locale, action_url, urgency, priority, correlation_key,
         policy_decision, policy_reason, scheduled_for, read_at, delivered_at,
         metadata, created_at, updated_at)
       VALUES
        ($1, $2, 'security_critical', $3, $4, $5, $6, $7, NULL,
         'critical', 9, $8, 'allow', 'legacy_migrated',
         $9, $10, $9, $11::jsonb, $9, $9)
       ON CONFLICT (tenant_id, principal_id, correlation_key) DO NOTHING`,
      [
        principal.tenantId,
        principal.id,
        SECURITY_NOTIFICATION_SOURCE_TYPE,
        item.id,
        item.title,
        item.body,
        principal.locale,
        securityNotificationCorrelationKey(item.id),
        item.created_at,
        item.read ? item.created_at : null,
        JSON.stringify({ legacyType: item.type, ...(item.metadata ?? {}) }),
      ],
    );
    inserted += result.rowCount ?? 0;
    // Mark the source row delivered — the semantics its schema documented but
    // nothing implemented. Idempotent and safe to repeat on replay.
    await client.query(
      `UPDATE security_notifications SET delivered = TRUE WHERE id = $1`,
      [item.id],
    );
  }

  return inserted;
}

export async function listInboxNotifications(
  client: PoolClient,
  principal: NotificationPrincipal,
  options: { limit: number; cursor: Cursor | null },
): Promise<{
  notifications: InboxNotification[];
  unread: number;
  nextCursor: string | null;
}> {
  const limit = Math.min(50, Math.max(1, options.limit));
  const cursor = options.cursor;

  const result = await client.query<InboxRow>(
    `SELECT id, notification_class, title, body, locale, action_url, urgency,
            priority, source_type, source_id, read_at, dismissed_at, actioned_at,
            delivered_at, scheduled_for, expires_at, created_at, metadata
       FROM platform_notifications
      WHERE tenant_id = $1
        AND principal_id = $2
        AND delivered_at IS NOT NULL
        AND scheduled_for <= NOW()
        AND (expires_at IS NULL OR expires_at > NOW())
        AND dismissed_at IS NULL
        AND ($3::timestamptz IS NULL OR (created_at, id) < ($3::timestamptz, $4::uuid))
      ORDER BY created_at DESC, id DESC
      LIMIT $5`,
    [
      principal.tenantId,
      principal.id,
      cursor?.createdAt ?? null,
      cursor?.id ?? null,
      limit + 1,
    ],
  );

  const unreadResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM platform_notifications
      WHERE tenant_id = $1
        AND principal_id = $2
        AND delivered_at IS NOT NULL
        AND scheduled_for <= NOW()
        AND (expires_at IS NULL OR expires_at > NOW())
        AND dismissed_at IS NULL
        AND read_at IS NULL`,
    [principal.tenantId, principal.id],
  );

  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  const last = rows.at(-1);

  return {
    notifications: rows.map(mapInboxRow),
    unread: Number.parseInt(unreadResult.rows[0]?.count ?? "0", 10),
    nextCursor:
      hasMore && last
        ? encodeNotificationCursor({
            createdAt: last.created_at.toISOString(),
            id: last.id,
          })
        : null,
  };
}

export type InboxMutation = "read" | "unread" | "dismiss" | "actioned";

export async function mutateInboxNotification(
  client: PoolClient,
  principal: NotificationPrincipal,
  notificationId: string,
  mutation: InboxMutation,
): Promise<InboxNotification | null> {
  const assignment =
    mutation === "read"
      ? "read_at = COALESCE(read_at, NOW())"
      : mutation === "unread"
        ? "read_at = NULL"
        : mutation === "dismiss"
          ? "dismissed_at = COALESCE(dismissed_at, NOW()), read_at = COALESCE(read_at, NOW())"
          : "actioned_at = COALESCE(actioned_at, NOW()), read_at = COALESCE(read_at, NOW())";

  const result = await client.query<InboxRow>(
    `UPDATE platform_notifications
        SET ${assignment}, updated_at = NOW()
      WHERE id = $1::uuid
        AND tenant_id = $2
        AND principal_id = $3
        AND delivered_at IS NOT NULL
      RETURNING id, notification_class, title, body, locale, action_url, urgency,
                priority, source_type, source_id, read_at, dismissed_at, actioned_at,
                delivered_at, scheduled_for, expires_at, created_at, metadata`,
    [notificationId, principal.tenantId, principal.id],
  );

  return result.rows[0] ? mapInboxRow(result.rows[0]) : null;
}

export async function getNotificationPreferences(
  client: PoolClient,
  principalId: string,
): Promise<{
  settings: NotificationSettings;
  preferences: NotificationPreference[];
}> {
  const settingsResult = await client.query<{
    timezone: string;
    quiet_start: string | null;
    quiet_end: string | null;
    digest_time: string;
    mute_until: Date | null;
    updated_at: Date;
  }>(
    `SELECT timezone,
            CASE WHEN quiet_start IS NULL THEN NULL ELSE to_char(quiet_start, 'HH24:MI') END AS quiet_start,
            CASE WHEN quiet_end IS NULL THEN NULL ELSE to_char(quiet_end, 'HH24:MI') END AS quiet_end,
            to_char(digest_time, 'HH24:MI') AS digest_time,
            mute_until, updated_at
       FROM notification_settings
      WHERE principal_id = $1`,
    [principalId],
  );

  const preferenceResult = await client.query<{
    notification_class: NotificationClass;
    channel: NotificationChannel;
    enabled: boolean;
    cadence: NotificationCadence;
    updated_at: Date;
  }>(
    `SELECT notification_class, channel, enabled, cadence, updated_at
       FROM notification_preferences
      WHERE principal_id = $1
      ORDER BY notification_class, channel`,
    [principalId],
  );

  const settings = settingsResult.rows[0];
  if (!settings) throw new Error("notification_settings_missing");

  return {
    settings: {
      timezone: settings.timezone,
      quietStart: settings.quiet_start,
      quietEnd: settings.quiet_end,
      digestTime: settings.digest_time,
      muteUntil: toIso(settings.mute_until),
      updatedAt: settings.updated_at.toISOString(),
    },
    preferences: preferenceResult.rows.map((row) => ({
      notificationClass: row.notification_class,
      channel: row.channel,
      enabled: row.enabled,
      cadence: row.cadence,
      updatedAt: row.updated_at.toISOString(),
    })),
  };
}
