import { createHash, randomUUID } from "crypto";
import { jwtVerify, SignJWT } from "jose";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { withDb } from "./db";
import { logger } from "./logger";

export const ADMIN_CONTROL_SESSION_COOKIE = "tecpey_admin_control_session";
const ADMIN_SESSION_ISSUER = "tecpey";
const ADMIN_SESSION_AUDIENCE = "tecpey-admin-control-plane";
const DEFAULT_STEP_UP_MAX_AGE_SECONDS = 5 * 60;
const ADMIN_AUDIT_LOCK_KEY = "tecpey_admin_audit_chain";

export type AdminPrincipal = {
  adminId: string;
  sessionId: string;
  jti: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  authenticationMethods: string[];
  permissionVersion: number;
  stepUpAt: string | null;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
};

export type AdminAuthorizationResult =
  | { ok: true; principal: AdminPrincipal }
  | {
      ok: false;
      status: 401 | 403 | 503;
      error:
        | "admin_session_required"
        | "admin_session_invalid"
        | "admin_service_unavailable"
        | "permission_denied"
        | "step_up_required";
    };

export type AdminSessionTokenInput = {
  adminId: string;
  sessionId: string;
  jti: string;
  permissionVersion: number;
  authenticationMethods: string[];
  stepUpAt?: string | null;
  absoluteExpiresAt: Date;
};

type AdminSessionClaims = {
  sub: string;
  sid: string;
  jti: string;
  pv: number;
  amr: string[];
  stepUpAt: string | null;
};

function adminSessionKey(secret = process.env.TECPEY_ADMIN_SESSION_SECRET): Uint8Array | null {
  if (secret && secret.length >= 32) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV === "production") {
    logger.error("[admin-control] TECPEY_ADMIN_SESSION_SECRET missing or too short");
    return null;
  }
  return new TextEncoder().encode("tecpey-local-admin-control-secret-change-me-32chars");
}

export async function createAdminControlSessionToken(
  input: AdminSessionTokenInput,
  secret?: string,
): Promise<string> {
  const key = adminSessionKey(secret);
  if (!key) throw new Error("admin_session_secret_not_configured");

  return new SignJWT({
    sid: input.sessionId,
    pv: input.permissionVersion,
    amr: [...new Set(input.authenticationMethods)],
    stepUpAt: input.stepUpAt ?? null,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ADMIN_SESSION_ISSUER)
    .setAudience(ADMIN_SESSION_AUDIENCE)
    .setSubject(input.adminId)
    .setJti(input.jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(input.absoluteExpiresAt.getTime() / 1000))
    .sign(key);
}

export async function verifyAdminControlSessionToken(
  token: string,
  secret?: string,
): Promise<AdminSessionClaims | null> {
  const key = adminSessionKey(secret);
  if (!key || !token) return null;

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: ADMIN_SESSION_ISSUER,
      audience: ADMIN_SESSION_AUDIENCE,
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.jti !== "string" ||
      typeof payload.pv !== "number" ||
      !Array.isArray(payload.amr) ||
      !payload.amr.every((method) => typeof method === "string") ||
      !(payload.stepUpAt === null || typeof payload.stepUpAt === "string")
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      sid: payload.sid,
      jti: payload.jti,
      pv: payload.pv,
      amr: payload.amr,
      stepUpAt: payload.stepUpAt,
    };
  } catch {
    return null;
  }
}

export function permissionGranted(grantedPermissions: readonly string[], required: string): boolean {
  if (!required || !/^[a-z0-9.*_-]+$/i.test(required)) return false;
  if (grantedPermissions.includes("*") || grantedPermissions.includes(required)) return true;

  const segments = required.split(".");
  for (let i = segments.length - 1; i > 0; i--) {
    const wildcard = `${segments.slice(0, i).join(".")}.*`;
    if (grantedPermissions.includes(wildcard)) return true;
  }
  return false;
}

export function hasRecentStepUp(
  stepUpAt: string | null,
  now = Date.now(),
  maxAgeSeconds = DEFAULT_STEP_UP_MAX_AGE_SECONDS,
): boolean {
  if (!stepUpAt || !Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) return false;
  const timestamp = Date.parse(stepUpAt);
  if (!Number.isFinite(timestamp) || timestamp > now + 30_000) return false;
  return now - timestamp <= maxAgeSeconds * 1000;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

export async function loadAdminPrincipal(req: NextRequest): Promise<AdminPrincipal | null | "unavailable"> {
  const rawToken = req.cookies.get(ADMIN_CONTROL_SESSION_COOKIE)?.value;
  if (!rawToken) return null;
  const claims = await verifyAdminControlSessionToken(rawToken);
  if (!claims) return null;

  const result = await withDb(async (client) => {
    const query = await client.query<{
      admin_id: string;
      session_id: string;
      jti: string;
      email: string;
      display_name: string;
      permission_version: number;
      authentication_methods: unknown;
      step_up_at: string | null;
      idle_expires_at: string;
      absolute_expires_at: string;
      roles: unknown;
      permissions: unknown;
    }>(
      `SELECT
         u.id::text AS admin_id,
         s.id::text AS session_id,
         s.jti,
         u.email,
         u.display_name,
         u.permission_version,
         s.authentication_methods,
         s.step_up_at,
         s.idle_expires_at,
         s.absolute_expires_at,
         COALESCE(jsonb_agg(DISTINCT ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL), '[]'::jsonb) AS roles,
         COALESCE(jsonb_agg(DISTINCT rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '[]'::jsonb) AS permissions
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_id
       LEFT JOIN admin_user_roles ur
         ON ur.admin_id = u.id AND ur.revoked_at IS NULL
       LEFT JOIN admin_role_permissions rp ON rp.role_id = ur.role_id
       WHERE s.id = $1::uuid
         AND s.admin_id = $2::uuid
         AND s.jti = $3
         AND s.permission_version = u.permission_version
         AND s.revoked_at IS NULL
         AND s.idle_expires_at > NOW()
         AND s.absolute_expires_at > NOW()
         AND u.status = 'active'
       GROUP BY u.id, s.id
       LIMIT 1`,
      [claims.sid, claims.sub, claims.jti],
    );

    const row = query.rows[0];
    if (!row || row.permission_version !== claims.pv) return null;

    return {
      adminId: row.admin_id,
      sessionId: row.session_id,
      jti: row.jti,
      email: row.email,
      displayName: row.display_name,
      roles: normalizeStringArray(row.roles),
      permissions: normalizeStringArray(row.permissions),
      authenticationMethods: normalizeStringArray(row.authentication_methods),
      permissionVersion: row.permission_version,
      stepUpAt: row.step_up_at,
      idleExpiresAt: row.idle_expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
    } satisfies AdminPrincipal;
  });

  if (!result.enabled) return "unavailable";
  return result.value;
}

export async function authorizeAdminRequest(
  req: NextRequest,
  requiredPermission: string,
  options?: { stepUpWithinSeconds?: number },
): Promise<AdminAuthorizationResult> {
  const rawToken = req.cookies.get(ADMIN_CONTROL_SESSION_COOKIE)?.value;
  if (!rawToken) return { ok: false, status: 401, error: "admin_session_required" };

  const principal = await loadAdminPrincipal(req);
  if (principal === "unavailable") {
    return { ok: false, status: 503, error: "admin_service_unavailable" };
  }
  if (!principal) return { ok: false, status: 401, error: "admin_session_invalid" };
  if (!permissionGranted(principal.permissions, requiredPermission)) {
    return { ok: false, status: 403, error: "permission_denied" };
  }

  if (
    options?.stepUpWithinSeconds !== undefined &&
    !hasRecentStepUp(principal.stepUpAt, Date.now(), options.stepUpWithinSeconds)
  ) {
    return { ok: false, status: 403, error: "step_up_required" };
  }

  return { ok: true, principal };
}

function isSensitiveAuditKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (["authorization", "cookie", "seed", "otp", "totp"].includes(normalized)) return true;
  return [
    "password",
    "passphrase",
    "secret",
    "token",
    "apikey",
    "privatekey",
    "recoverycode",
    "credential",
    "signature",
  ].some((suffix) => normalized.endsWith(suffix));
}

export function redactAdminAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 4_000 ? `${value.slice(0, 4_000)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => redactAdminAuditValue(item, depth + 1));
  if (typeof value !== "object") return String(value);

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
    output[key] = isSensitiveAuditKey(key) ? "[REDACTED]" : redactAdminAuditValue(nested, depth + 1);
  }
  return output;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`);
  return `{${entries.join(",")}}`;
}

export type AdminAuditInput = {
  actorAdminId: string | null;
  sessionId: string | null;
  effectiveRoles: string[];
  action: string;
  resourceType: string;
  resourceId?: string | null;
  requestId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
  reason?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  approvalRequestId?: string | null;
  outcome?: "success" | "denied" | "failed";
  errorCode?: string | null;
};

export function computeAdminAuditHash(previousHash: string | null, event: Record<string, unknown>): string {
  return createHash("sha256")
    .update(previousHash ?? "GENESIS")
    .update("\n")
    .update(canonicalize(event))
    .digest("hex");
}

export async function writeAdminAuditEvent(
  client: PoolClient,
  input: AdminAuditInput,
): Promise<{ id: string; eventHash: string; createdAt: string }> {
  await client.query(`SELECT pg_advisory_lock(hashtext($1))`, [ADMIN_AUDIT_LOCK_KEY]);

  try {
    const previous = await client.query<{ event_hash: string }>(
      `SELECT event_hash FROM admin_audit_events ORDER BY chain_sequence DESC LIMIT 1`,
    );

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const beforeState = input.beforeState === undefined ? null : redactAdminAuditValue(input.beforeState);
    const afterState = input.afterState === undefined ? null : redactAdminAuditValue(input.afterState);
    const previousHash = previous.rows[0]?.event_hash ?? null;
    const hashPayload: Record<string, unknown> = {
      id,
      createdAt,
      actorAdminId: input.actorAdminId,
      sessionId: input.sessionId,
      effectiveRoles: [...new Set(input.effectiveRoles)].sort(),
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      requestId: input.requestId ?? null,
      sourceIp: input.sourceIp ?? null,
      userAgent: input.userAgent ?? null,
      reason: input.reason ?? null,
      beforeState,
      afterState,
      approvalRequestId: input.approvalRequestId ?? null,
      outcome: input.outcome ?? "success",
      errorCode: input.errorCode ?? null,
    };
    const eventHash = computeAdminAuditHash(previousHash, hashPayload);

    // The database trigger takes a transaction-scoped lock as a second layer and
    // rejects stale previous_hash values, including direct inserts that bypass
    // this writer.
    await client.query(
      `INSERT INTO admin_audit_events (
         id, actor_admin_id, session_id, effective_roles, action, resource_type,
         resource_id, request_id, source_ip, user_agent, reason, before_state,
         after_state, approval_request_id, outcome, error_code, previous_hash,
         event_hash, created_at
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::jsonb, $5, $6,
         $7, $8, $9, $10, $11, $12::jsonb,
         $13::jsonb, $14::uuid, $15, $16, $17, $18, $19::timestamptz
       )`,
      [
        id,
        input.actorAdminId,
        input.sessionId,
        JSON.stringify(hashPayload.effectiveRoles),
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        input.requestId ?? null,
        input.sourceIp ?? null,
        input.userAgent ?? null,
        input.reason ?? null,
        beforeState === null ? null : JSON.stringify(beforeState),
        afterState === null ? null : JSON.stringify(afterState),
        input.approvalRequestId ?? null,
        input.outcome ?? "success",
        input.errorCode ?? null,
        previousHash,
        eventHash,
        createdAt,
      ],
    );

    return { id, eventHash, createdAt };
  } finally {
    try {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [ADMIN_AUDIT_LOCK_KEY]);
    } catch (error) {
      logger.error("[admin-control] failed to release audit advisory lock", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
