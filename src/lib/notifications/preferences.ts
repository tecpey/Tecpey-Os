import type { PoolClient } from "pg";
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

export const NOTIFICATION_CONSENT_PURPOSES = ["marketing"] as const;
export type NotificationConsentPurpose =
  (typeof NOTIFICATION_CONSENT_PURPOSES)[number];

export const MARKETING_CONSENT_POLICY_VERSION = "marketing-v1";
export const NOTIFICATION_CONSENT_SOURCE = "notification-preference-center";

export type NotificationSettingsPatch = {
  timezone: string;
  quietStart: string | null;
  quietEnd: string | null;
  digestTime: string;
  muteUntil: string | null;
};

export type NotificationPreferencePatch = {
  notificationClass: NotificationClass;
  channel: NotificationChannel;
  enabled: boolean;
  cadence: NotificationCadence;
};

export type NotificationConsentRecord = {
  id: string;
  purpose: NotificationConsentPurpose;
  status: "granted" | "revoked";
  policyVersion: string;
  source: string;
  jurisdiction: string | null;
  occurredAt: string;
};

function validTimezone(value: string): boolean {
  if (value.length < 1 || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function validTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function parseNotificationPreferencePatch(
  input: unknown,
): NotificationPreferencePatch | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  if (
    !NOTIFICATION_CLASSES.includes(candidate.notificationClass as NotificationClass) ||
    !NOTIFICATION_CHANNELS.includes(candidate.channel as NotificationChannel) ||
    !NOTIFICATION_CADENCES.includes(candidate.cadence as NotificationCadence) ||
    typeof candidate.enabled !== "boolean"
  ) {
    return null;
  }

  return {
    notificationClass: candidate.notificationClass as NotificationClass,
    channel: candidate.channel as NotificationChannel,
    cadence: candidate.cadence as NotificationCadence,
    enabled: candidate.enabled,
  };
}

export function parseNotificationSettingsPatch(
  input: unknown,
): NotificationSettingsPatch | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  const timezone = typeof candidate.timezone === "string" ? candidate.timezone.trim() : "";
  const quietStart = candidate.quietStart === null ? null : String(candidate.quietStart ?? "");
  const quietEnd = candidate.quietEnd === null ? null : String(candidate.quietEnd ?? "");
  const digestTime = String(candidate.digestTime ?? "");
  const muteUntil = candidate.muteUntil === null ? null : String(candidate.muteUntil ?? "");

  if (!validTimezone(timezone) || !validTime(digestTime)) return null;
  if ((quietStart === null) !== (quietEnd === null)) return null;
  if (quietStart !== null && (!validTime(quietStart) || !validTime(quietEnd as string))) {
    return null;
  }
  if (muteUntil !== null && !Number.isFinite(Date.parse(muteUntil))) return null;

  return {
    timezone,
    quietStart,
    quietEnd,
    digestTime,
    muteUntil: muteUntil ? new Date(muteUntil).toISOString() : null,
  };
}

export function parseNotificationConsentInput(input: unknown): {
  purpose: NotificationConsentPurpose;
  status: "granted" | "revoked";
} | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  const purpose = candidate.purpose as NotificationConsentPurpose;
  const status = candidate.status;

  if (!NOTIFICATION_CONSENT_PURPOSES.includes(purpose)) return null;
  if (status !== "granted" && status !== "revoked") return null;

  return { purpose, status };
}

export async function updateNotificationSettings(
  client: PoolClient,
  principalId: string,
  patch: NotificationSettingsPatch,
): Promise<void> {
  await client.query(
    `UPDATE notification_settings
        SET timezone = $2,
            quiet_start = $3::time,
            quiet_end = $4::time,
            digest_time = $5::time,
            mute_until = $6::timestamptz,
            updated_at = NOW()
      WHERE principal_id = $1`,
    [
      principalId,
      patch.timezone,
      patch.quietStart,
      patch.quietEnd,
      patch.digestTime,
      patch.muteUntil,
    ],
  );
}

export async function upsertNotificationPreference(
  client: PoolClient,
  principalId: string,
  preference: NotificationPreferencePatch,
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

export async function recordNotificationConsent(
  client: PoolClient,
  principalId: string,
  consent: {
    purpose: NotificationConsentPurpose;
    status: "granted" | "revoked";
    policyVersion: string;
    source: string;
    jurisdiction: string | null;
  },
): Promise<NotificationConsentRecord> {
  const result = await client.query<{
    id: string;
    purpose: NotificationConsentPurpose;
    status: "granted" | "revoked";
    policy_version: string;
    source: string;
    jurisdiction: string | null;
    occurred_at: Date;
  }>(
    `INSERT INTO notification_consents
      (principal_id, purpose, status, policy_version, source, jurisdiction)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, purpose, status, policy_version, source, jurisdiction, occurred_at`,
    [
      principalId,
      consent.purpose,
      consent.status,
      consent.policyVersion,
      consent.source,
      consent.jurisdiction,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("notification_consent_insert_failed");

  return {
    id: row.id,
    purpose: row.purpose,
    status: row.status,
    policyVersion: row.policy_version,
    source: row.source,
    jurisdiction: row.jurisdiction,
    occurredAt: row.occurred_at.toISOString(),
  };
}

export async function getCurrentNotificationConsents(
  client: PoolClient,
  principalId: string,
): Promise<NotificationConsentRecord[]> {
  const result = await client.query<{
    id: string;
    purpose: NotificationConsentPurpose;
    status: "granted" | "revoked";
    policy_version: string;
    source: string;
    jurisdiction: string | null;
    occurred_at: Date;
  }>(
    `SELECT DISTINCT ON (purpose)
            id, purpose, status, policy_version, source, jurisdiction, occurred_at
       FROM notification_consents
      WHERE principal_id = $1
      ORDER BY purpose, event_sequence DESC`,
    [principalId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    purpose: row.purpose,
    status: row.status,
    policyVersion: row.policy_version,
    source: row.source,
    jurisdiction: row.jurisdiction,
    occurredAt: row.occurred_at.toISOString(),
  }));
}
