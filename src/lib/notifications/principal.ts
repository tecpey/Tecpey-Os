import type { PoolClient } from "pg";
import type { NextRequest } from "next/server";
import { getStudentSessionFromRequest } from "../academy-session";
import { Validate } from "../api-validation";
import { getUnifiedSessionFromRequest } from "../unified-session";

export const DEFAULT_NOTIFICATION_TENANT_ID = "tecpey";

export type NotificationIdentity = {
  accountId: string | null;
  studentId: string | null;
  email: string | null;
  locale: "fa" | "en";
};

export type NotificationPrincipal = {
  id: string;
  tenantId: string;
  accountId: string | null;
  studentId: string | null;
  status: "active" | "suspended" | "disabled" | "deleted";
  locale: "fa" | "en";
  timezone: string;
};

type PrincipalRow = {
  id: string;
  tenant_id: string;
  account_id: string | null;
  student_id: string | null;
  status: NotificationPrincipal["status"];
  locale: "fa" | "en";
  timezone: string;
};

function normalizeLocale(value: unknown): "fa" | "en" {
  return value === "en" ? "en" : "fa";
}

export async function getNotificationIdentityFromRequest(
  request: NextRequest,
): Promise<NotificationIdentity | null> {
  const unified = await getUnifiedSessionFromRequest(request);
  if (unified) {
    const accountId = unified.accountId
      ? Validate.text(unified.accountId, 3, 220)
      : null;
    const studentId = unified.studentId
      ? Validate.uuid(unified.studentId)
      : null;

    if (unified.accountId && !accountId) return null;
    if (unified.studentId && !studentId) return null;
    if (!accountId && !studentId) return null;

    return {
      accountId,
      studentId,
      email: unified.email ? Validate.email(unified.email) : null,
      locale: normalizeLocale(new URL(request.url).searchParams.get("locale")),
    };
  }

  const legacy = await getStudentSessionFromRequest(request);
  const studentId = legacy?.studentId ? Validate.uuid(legacy.studentId) : null;
  if (!studentId) return null;

  return {
    accountId: null,
    studentId,
    email: null,
    locale: normalizeLocale(new URL(request.url).searchParams.get("locale")),
  };
}

function identityLockKeys(
  tenantId: string,
  identity: NotificationIdentity,
): string[] {
  return [
    identity.accountId
      ? `notification-principal:${tenantId}:account:${identity.accountId}`
      : null,
    identity.studentId
      ? `notification-principal:${tenantId}:student:${identity.studentId}`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .sort();
}

export async function resolveNotificationPrincipal(
  client: PoolClient,
  identity: NotificationIdentity,
  tenantId = DEFAULT_NOTIFICATION_TENANT_ID,
): Promise<NotificationPrincipal> {
  if (!identity.accountId && !identity.studentId) {
    throw new Error("notification_principal_identity_required");
  }

  for (const key of identityLockKeys(tenantId, identity)) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
  }

  const existing = await client.query<PrincipalRow>(
    `SELECT id, tenant_id, account_id, student_id, status, locale, timezone
       FROM platform_principals
      WHERE tenant_id = $1
        AND (($2::text IS NOT NULL AND account_id = $2)
          OR ($3::uuid IS NOT NULL AND student_id = $3::uuid))
      FOR UPDATE`,
    [tenantId, identity.accountId, identity.studentId],
  );

  if (existing.rows.length > 1) {
    throw new Error("notification_principal_identity_conflict");
  }

  let row: PrincipalRow;
  const current = existing.rows[0];
  if (current) {
    if (
      identity.accountId &&
      current.account_id &&
      current.account_id !== identity.accountId
    ) {
      throw new Error("notification_principal_account_conflict");
    }
    if (
      identity.studentId &&
      current.student_id &&
      current.student_id !== identity.studentId
    ) {
      throw new Error("notification_principal_student_conflict");
    }

    const updated = await client.query<PrincipalRow>(
      `UPDATE platform_principals
          SET account_id = COALESCE(account_id, $2),
              student_id = COALESCE(student_id, $3::uuid),
              email = COALESCE($4, email),
              locale = $5,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, tenant_id, account_id, student_id, status, locale, timezone`,
      [
        current.id,
        identity.accountId,
        identity.studentId,
        identity.email,
        identity.locale,
      ],
    );
    row = updated.rows[0];
  } else {
    const inserted = await client.query<PrincipalRow>(
      `INSERT INTO platform_principals
        (tenant_id, account_id, student_id, email, locale)
       VALUES ($1, $2, $3::uuid, $4, $5)
       RETURNING id, tenant_id, account_id, student_id, status, locale, timezone`,
      [tenantId, identity.accountId, identity.studentId, identity.email, identity.locale],
    );
    row = inserted.rows[0];
  }

  if (!row) throw new Error("notification_principal_resolution_failed");

  await client.query(
    `INSERT INTO notification_settings (principal_id, timezone)
     VALUES ($1, $2)
     ON CONFLICT (principal_id) DO NOTHING`,
    [row.id, row.timezone],
  );

  return {
    id: row.id,
    tenantId: row.tenant_id,
    accountId: row.account_id,
    studentId: row.student_id,
    status: row.status,
    locale: row.locale,
    timezone: row.timezone,
  };
}
