import type { PoolClient } from "pg";
import { Validate } from "../api-validation";
import type { NotificationPrincipal } from "./principal";
import {
  NOTIFICATION_CADENCES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CLASSES,
} from "./types";
import type {
  NotificationCadence,
  NotificationChannel,
  NotificationClass,
} from "./types";

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
  if (typeof value !== "string" || value.length < 8 || value.length > 500) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    const id = Validate.uuid(parsed.id);
    if (!id || typeof parsed.createdAt !== "string" || !Number.isFinite(Date.parse(parsed.createdAt))) {
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

export async function migrateLegacyNotificationsForPrincipal(
  client: PoolClient,
  principal: NotificationPrincipal,
): Promise<number> {
  if (!principal.studentId) return 0;

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
    `SELECT id, type, title, body, action_url, priority, read_at, created_at,
            scheduled_for, metadata
       FROM notification_center
      WHERE student_id = $1::uuid OR student_id IS NULL
      ORDER BY created_at ASC`,
    [principal.studentId],
  );

  let inserted = 0;
  for (const item of legacy.rows) {
    const result = await client.query(
      `INSERT INTO platform_notifications
        (tenant_id, principal_id, notification_class, source_type, source_id,
         title, body, locale, action_url, urgency, priority, correlation_key,
         policy_decision, policy_reason, scheduled_for, read_at, metadata, created_at, updated_at)
       VALUES
        ($1, $2, $3, 'legacy_notification_center', $4, $5, $6, $7, $8,
         CASE WHEN $9 >= 3 THEN 'high' ELSE 'normal' END,
         LEAST(10, GREATEST(0, $9)), $10, 'allow', 'legacy_migrated',
         $11, $12, $13::jsonb, $14, $14)
       ON CONFLICT (tenant_id, principal_id, correlation_key) DO NOTHING`,
      [
        principal.tenantId,
        principal.id,
        legacyClass(item.type),
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
      ],
    );
    inserted += result.rowCount ?? 0;
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
            scheduled_for, expires_at, created_at, metadata
       FROM platform_notifications
      WHERE tenant_id = $1
        AND principal_id = $2
        AND scheduled_for <= NOW()
        AND (expires_at IS NULL OR expires_at > NOW())
        AND dismissed_at IS NULL
        AND ($3::timestamptz IS NULL OR (created_at, id) < ($3::timestamptz, $4::uuid))
      ORDER BY created_at DESC, id DESC
      LIMIT $5`,
    [principal.tenantId, principal.id, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
  );

  const unreadResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM platform_notifications
      WHERE tenant_id = $1
        AND principal_id = $2
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
        ? encodeNotificationCursor({ createdAt: last.created_at.toISOString(), id: last.id })
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
      RETURNING id, notification_class, title, body, locale, action_url, urgency,
                priority, source_type, source_id, read_at, dismissed_at, actioned_at,
                scheduled_for, expires_at, created_at, metadata`,
    [notificationId, principal.tenantId, principal.id],
  );

  return result.rows[0] ? mapInboxRow(result.rows[0]) : null;
}

export async function getNotificationPreferences(
  client: PoolClient,
  principalId: string,
): Promise<{ settings: NotificationSettings; preferences: NotificationPreference[] }> {
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

export function validNotificationPreferenceInput(input: {
  notificationClass: unknown;
  channel: unknown;
  cadence: unknown;
  enabled: unknown;
}): input is {
  notificationClass: NotificationClass;
  channel: NotificationChannel;
  cadence: NotificationCadence;
  enabled: boolean;
} {
  return (
    NOTIFICATION_CLASSES.includes(input.notificationClass as NotificationClass) &&
    NOTIFICATION_CHANNELS.includes(input.channel as NotificationChannel) &&
    NOTIFICATION_CADENCES.includes(input.cadence as NotificationCadence) &&
    typeof input.enabled === "boolean"
  );
}

export async function upsertNotificationPreference(
  client: PoolClient,
  principalId: string,
  preference: {
    notificationClass: NotificationClass;
    channel: NotificationChannel;
    enabled: boolean;
    cadence: NotificationCadence;
  },
): Promise<void> {
  if (
    ["security_critical", "financial_transactional", "legal_compliance_service"].includes(
      preference.notificationClass,
    ) &&
    !preference.enabled
  ) {
    throw new Error("mandatory_notification_class_cannot_be_disabled");
  }

  await client.query(
    `INSERT INTO notification_preferences
      (principal_id, notification_class, channel, enabled, cadence)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (principal_id, notification_class, channel)
     DO UPDATE SET enabled = EXCLUDED.enabled,
                   cadence = EXCLUDED.cadence,
                   updated_at = NOW()`,
    [
      principalId,
      preference.notificationClass,
      preference.channel,
      preference.enabled,
      preference.cadence,
    ],
  );
}
