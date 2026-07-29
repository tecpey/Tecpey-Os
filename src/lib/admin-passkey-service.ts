import { randomUUID, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import {
  ADMIN_CONTROL_SESSION_COOKIE,
  createAdminControlSessionToken,
  writeAdminAuditEvent,
} from "./admin-control-plane";
import { withDb } from "./db";
import { shouldUseSecureCookie } from "./platform-config";

const ADMIN_IDLE_TTL_SECONDS = 15 * 60;
const ADMIN_ABSOLUTE_TTL_SECONDS = 8 * 60 * 60;
const ADMIN_BOOTSTRAP_HEADER = "x-tecpey-admin-token";

export type AdminBootstrapState = "open" | "closed" | "unavailable";

export async function getAdminBootstrapState(): Promise<AdminBootstrapState> {
  const result = await withDb(async (client) => {
    const query = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM admin_users
       WHERE status IN ('active', 'suspended', 'disabled')`,
    );
    return (query.rows[0]?.count ?? 0) === 0;
  });

  if (!result.enabled) return "unavailable";
  return result.value ? "open" : "closed";
}

export function verifyAdminBootstrapToken(req: NextRequest): boolean {
  const expected = process.env.TECPEY_ADMIN_TOKEN;
  const supplied = req.headers.get(ADMIN_BOOTSTRAP_HEADER);
  if (!expected || expected.length < 24 || !supplied) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export type AdminSessionRecord = {
  sessionId: string;
  jti: string;
  token: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  stepUpAt: Date;
};

export async function createAdminPasskeySession(
  client: PoolClient,
  input: {
    adminId: string;
    permissionVersion: number;
    roles: string[];
    authenticationMethods: string[];
    ip: string | null;
    userAgent: string | null;
    auditAction: "admin.bootstrap.completed" | "admin.login.passkey";
  },
): Promise<AdminSessionRecord> {
  const now = new Date();
  const sessionId = randomUUID();
  const jti = randomUUID();
  const idleExpiresAt = new Date(now.getTime() + ADMIN_IDLE_TTL_SECONDS * 1000);
  const absoluteExpiresAt = new Date(now.getTime() + ADMIN_ABSOLUTE_TTL_SECONDS * 1000);
  const methods = [...new Set(input.authenticationMethods)];

  await client.query(
    `INSERT INTO admin_sessions (
       id, admin_id, jti, permission_version, authentication_methods,
       ip, user_agent, created_at, last_seen_at, step_up_at,
       idle_expires_at, absolute_expires_at
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5::jsonb,
       $6, $7, $8::timestamptz, $8::timestamptz, $8::timestamptz,
       $9::timestamptz, $10::timestamptz
     )`,
    [
      sessionId,
      input.adminId,
      jti,
      input.permissionVersion,
      JSON.stringify(methods),
      input.ip,
      input.userAgent,
      now.toISOString(),
      idleExpiresAt.toISOString(),
      absoluteExpiresAt.toISOString(),
    ],
  );

  await writeAdminAuditEvent(client, {
    actorAdminId: input.adminId,
    sessionId,
    effectiveRoles: input.roles,
    action: input.auditAction,
    resourceType: "admin_session",
    resourceId: sessionId,
    sourceIp: input.ip,
    userAgent: input.userAgent,
    afterState: {
      authenticationMethods: methods,
      idleExpiresAt: idleExpiresAt.toISOString(),
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
    },
  });

  const token = await createAdminControlSessionToken({
    adminId: input.adminId,
    sessionId,
    jti,
    permissionVersion: input.permissionVersion,
    authenticationMethods: methods,
    stepUpAt: now.toISOString(),
    absoluteExpiresAt,
  });

  return {
    sessionId,
    jti,
    token,
    idleExpiresAt,
    absoluteExpiresAt,
    stepUpAt: now,
  };
}

export function setAdminControlSessionCookie(
  response: NextResponse,
  session: AdminSessionRecord,
): void {
  const maxAge = Math.max(
    0,
    Math.floor((session.absoluteExpiresAt.getTime() - Date.now()) / 1000),
  );

  response.cookies.set(ADMIN_CONTROL_SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}

export function clearAdminControlSessionCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_CONTROL_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
