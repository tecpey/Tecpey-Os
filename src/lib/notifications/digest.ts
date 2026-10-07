import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { assertSafeNotificationCopy } from "./copy-safety";
import type { NotificationPrincipal } from "./principal";
import type {
  NotificationClass,
  NotificationLocale,
  NotificationPolicyReason,
} from "./types";

export const NOTIFICATION_DIGEST_VERSION = "notification-digest-v1";
export const NOTIFICATION_DIGEST_MAX_CONSTITUENTS = 50;

type DigestAggregateRow = {
  notification_id: string;
  outbox_id: string;
  constituent_count: number;
  digest_shard: number;
};

export type NotificationDigestAggregate = {
  notificationId: string;
  outboxId: string;
  version: typeof NOTIFICATION_DIGEST_VERSION;
  baseKey: string;
  shard: number;
  constituentOrdinal: number;
  maxConstituents: number;
};

export type NotificationDigestInput = {
  principal: NotificationPrincipal;
  notificationClass: NotificationClass;
  sourceType: string;
  locale: NotificationLocale;
  scheduledFor: string;
  expiresAt: string | null;
  policyReason: NotificationPolicyReason;
  now: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestCopy(locale: NotificationLocale): { title: string; body: string } {
  const copy =
    locale === "fa"
      ? {
          title: "خلاصه به‌روزرسانی‌های تک‌پی",
          body: "چند به‌روزرسانی جدید برای شما آماده است.",
        }
      : {
          title: "TecPey digest",
          body: "Several new updates are ready for you.",
        };
  assertSafeNotificationCopy(copy);
  return copy;
}

function digestBaseKey(input: NotificationDigestInput): string {
  return sha256(
    [
      NOTIFICATION_DIGEST_VERSION,
      input.principal.tenantId,
      input.principal.id,
      "in_app",
      input.notificationClass,
      input.sourceType,
      input.locale,
      input.scheduledFor,
    ].join("|"),
  );
}

function aggregateCorrelationKey(baseKey: string, shard: number): string {
  return `digest:v1:${baseKey.slice(0, 48)}:${shard}`;
}

function aggregateIdempotencyKey(
  principal: NotificationPrincipal,
  correlationKey: string,
): string {
  return `in-app-digest:${sha256(
    `${principal.tenantId}:${principal.id}:${correlationKey}`,
  ).slice(0, 48)}`;
}

function aggregatePayloadHash(
  correlationKey: string,
  locale: NotificationLocale,
  title: string,
  body: string,
): string {
  return sha256(
    JSON.stringify({
      version: NOTIFICATION_DIGEST_VERSION,
      channel: "in_app",
      correlationKey,
      locale,
      title,
      body,
      actionUrl: null,
    }),
  );
}

export async function coalesceNotificationDigest(
  client: PoolClient,
  input: NotificationDigestInput,
): Promise<NotificationDigestAggregate> {
  if (!Number.isFinite(Date.parse(input.scheduledFor))) {
    throw new Error("notification_digest_schedule_invalid");
  }
  if (!Number.isFinite(Date.parse(input.now))) {
    throw new Error("notification_digest_now_invalid");
  }

  const baseKey = digestBaseKey(input);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `notification-digest:${NOTIFICATION_DIGEST_VERSION}:${baseKey}`,
  ]);

  const reusable = await client.query<DigestAggregateRow>(
    `SELECT n.id AS notification_id,
            o.id AS outbox_id,
            COUNT(i.id)::int AS constituent_count,
            (n.metadata->>'digestShard')::int AS digest_shard
       FROM platform_notifications n
       JOIN notification_outbox o
         ON o.notification_id = n.id
        AND o.channel = 'in_app'
       LEFT JOIN notification_intents i
         ON i.notification_id = n.id
        AND i.policy_decision = 'digest'
      WHERE n.tenant_id = $1
        AND n.principal_id = $2
        AND n.notification_class = $3
        AND n.policy_decision = 'digest'
        AND n.metadata->>'digestVersion' = $4
        AND n.metadata->>'digestBaseKey' = $5
        AND o.status = 'pending'
        AND o.available_at > $6::timestamptz
      GROUP BY n.id, o.id
     HAVING COUNT(i.id) < $7
      ORDER BY (n.metadata->>'digestShard')::int ASC
      LIMIT 1`,
    [
      input.principal.tenantId,
      input.principal.id,
      input.notificationClass,
      NOTIFICATION_DIGEST_VERSION,
      baseKey,
      input.now,
      NOTIFICATION_DIGEST_MAX_CONSTITUENTS,
    ],
  );

  const existing = reusable.rows[0];
  if (existing) {
    const nextCount = existing.constituent_count + 1;
    await client.query(
      `UPDATE platform_notifications
          SET expires_at = CASE
                WHEN expires_at IS NULL OR $2::timestamptz IS NULL THEN NULL
                ELSE GREATEST(expires_at, $2::timestamptz)
              END,
              metadata = jsonb_set(
                metadata,
                '{constituentCount}',
                to_jsonb($3::int),
                true
              ),
              updated_at = NOW()
        WHERE id = $1`,
      [existing.notification_id, input.expiresAt, nextCount],
    );
    return {
      notificationId: existing.notification_id,
      outboxId: existing.outbox_id,
      version: NOTIFICATION_DIGEST_VERSION,
      baseKey,
      shard: existing.digest_shard,
      constituentOrdinal: nextCount,
      maxConstituents: NOTIFICATION_DIGEST_MAX_CONSTITUENTS,
    };
  }

  const nextShardResult = await client.query<{ shard: number }>(
    `SELECT (COALESCE(MAX((metadata->>'digestShard')::int), -1) + 1)::int AS shard
       FROM platform_notifications
      WHERE tenant_id = $1
        AND principal_id = $2
        AND notification_class = $3
        AND policy_decision = 'digest'
        AND metadata->>'digestVersion' = $4
        AND metadata->>'digestBaseKey' = $5`,
    [
      input.principal.tenantId,
      input.principal.id,
      input.notificationClass,
      NOTIFICATION_DIGEST_VERSION,
      baseKey,
    ],
  );
  const shard = nextShardResult.rows[0]?.shard ?? 0;
  const correlationKey = aggregateCorrelationKey(baseKey, shard);
  const copy = digestCopy(input.locale);
  const aggregateMetadata = {
    digestVersion: NOTIFICATION_DIGEST_VERSION,
    digestBaseKey: baseKey,
    digestShard: shard,
    digestWindowScheduledFor: input.scheduledFor,
    digestSourceType: input.sourceType,
    constituentCount: 1,
    maxConstituents: NOTIFICATION_DIGEST_MAX_CONSTITUENTS,
  };

  const insertedNotification = await client.query<{ id: string }>(
    `INSERT INTO platform_notifications
      (tenant_id, principal_id, notification_class, source_type, source_id,
       title, body, locale, action_url, urgency, priority, correlation_key,
       policy_decision, policy_reason, scheduled_for, expires_at, metadata)
     VALUES ($1, $2, $3, 'notification_digest', $4, $5, $6, $7, NULL,
             'low', 1, $8, 'digest', $9, $10::timestamptz,
             $11::timestamptz, $12::jsonb)
     RETURNING id`,
    [
      input.principal.tenantId,
      input.principal.id,
      input.notificationClass,
      baseKey,
      copy.title,
      copy.body,
      input.locale,
      correlationKey,
      input.policyReason,
      input.scheduledFor,
      input.expiresAt,
      JSON.stringify(aggregateMetadata),
    ],
  );
  const notificationId = insertedNotification.rows[0]?.id;
  if (!notificationId) throw new Error("notification_digest_insert_failed");

  const insertedOutbox = await client.query<{ id: string }>(
    `INSERT INTO notification_outbox
      (notification_id, channel, idempotency_key, available_at, payload_hash)
     VALUES ($1, 'in_app', $2, $3::timestamptz, $4)
     RETURNING id`,
    [
      notificationId,
      aggregateIdempotencyKey(input.principal, correlationKey),
      input.scheduledFor,
      aggregatePayloadHash(
        correlationKey,
        input.locale,
        copy.title,
        copy.body,
      ),
    ],
  );
  const outboxId = insertedOutbox.rows[0]?.id;
  if (!outboxId) throw new Error("notification_digest_outbox_insert_failed");

  return {
    notificationId,
    outboxId,
    version: NOTIFICATION_DIGEST_VERSION,
    baseKey,
    shard,
    constituentOrdinal: 1,
    maxConstituents: NOTIFICATION_DIGEST_MAX_CONSTITUENTS,
  };
}
