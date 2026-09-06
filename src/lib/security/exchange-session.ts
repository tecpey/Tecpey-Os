import "server-only";

import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { withDb, withTx } from "@/lib/db";
import { strictRevocationVerdict, revokeJti } from "@/lib/security/jti-store";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveMutationAuditEvent,
} from "@/lib/security/sensitive-mutation-audit";
import {
  LEGACY_EXCHANGE_ORIGINS,
  resolveTecpeyExchangeOrigin,
} from "@/services/product-authority/exchange-app-boundary";

export const EXCHANGE_SESSION_POLICY_VERSION = "exchange-session-v1" as const;
export const EXCHANGE_SESSION_COOKIE = "tecpey_exchange_session" as const;
export const EXCHANGE_SESSION_ISSUER = "urn:tecpey:identity" as const;
export const EXCHANGE_SESSION_AUDIENCE = "tecpey-exchange" as const;
export const EXCHANGE_SESSION_MAX_AGE_SECONDS = 15 * 60;
export const EXCHANGE_MUTATION_STEP_UP_MAX_AGE_SECONDS = 5 * 60;

const CORE_REGISTRABLE_DOMAINS = ["tecpey.com", "tecpey.ir", "tecp.ir"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACR = new Set([
  "urn:tecpey:acr:exchange:password-2fa",
  "urn:tecpey:acr:exchange:webauthn",
]);
const AMR = new Set(["pwd", "otp", "webauthn", "hwk", "mfa"]);

export type ExchangeAuthenticationMethod =
  | "pwd"
  | "otp"
  | "webauthn"
  | "hwk"
  | "mfa";

export type ExchangeSessionAcr =
  | "urn:tecpey:acr:exchange:password-2fa"
  | "urn:tecpey:acr:exchange:webauthn";

export type ExchangeSession = {
  tenantId: string;
  principalId: string;
  productAccountId: string;
  authenticationTime: number;
  authenticationMethods: ExchangeAuthenticationMethod[];
  acr: ExchangeSessionAcr;
  jti: string;
  expiresAt: number;
};

export type ExchangeSessionAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
>;

function exchangeSigningKey(): Uint8Array | null {
  const raw = process.env.TECPEY_EXCHANGE_SESSION_SECRET?.trim();
  if (raw && raw.length >= 32) return new TextEncoder().encode(raw);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode(
      "tecpey-local-exchange-session-dev-secret-change-before-production",
    );
  }
  return null;
}

function exchangeOrigin(): string | null {
  const resolved = resolveTecpeyExchangeOrigin(process.env.TECPEY_EXCHANGE_ORIGIN, {
    coreRegistrableDomains: CORE_REGISTRABLE_DOMAINS,
    forbiddenOrigins: LEGACY_EXCHANGE_ORIGINS,
  });
  return resolved.ok ? resolved.origin : null;
}

function requestUsesExchangeOrigin(request: NextRequest): boolean {
  const requiredOrigin = exchangeOrigin();
  if (!requiredOrigin) return false;
  try {
    return new URL(request.url).origin === requiredOrigin;
  } catch {
    return false;
  }
}

function validMethods(value: unknown): ExchangeAuthenticationMethod[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) return null;
  const normalized = [...new Set(value.filter((entry): entry is string => typeof entry === "string"))];
  if (normalized.length === 0 || normalized.some((entry) => !AMR.has(entry))) return null;
  return normalized as ExchangeAuthenticationMethod[];
}

export async function verifyExchangeSessionToken(
  token: string | undefined,
): Promise<ExchangeSession | null> {
  if (!token || token.length > 8_192) return null;
  const key = exchangeSigningKey();
  if (!key) return null;

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: EXCHANGE_SESSION_ISSUER,
      audience: EXCHANGE_SESSION_AUDIENCE,
      clockTolerance: 5,
    });
    const tenantId = typeof payload.tid === "string" ? payload.tid : "";
    const principalId = typeof payload.pid === "string" ? payload.pid : "";
    const productAccountId = typeof payload.paid === "string" ? payload.paid : "";
    const authenticationTime = typeof payload.auth_time === "number" ? payload.auth_time : 0;
    const methods = validMethods(payload.amr);
    const acr = typeof payload.acr === "string" && ACR.has(payload.acr)
      ? payload.acr as ExchangeSessionAcr
      : null;
    const jti = typeof payload.jti === "string" ? payload.jti : "";
    const expiresAt = typeof payload.exp === "number" ? payload.exp : 0;

    if (
      payload.role !== "exchange" ||
      payload.v !== 1 ||
      !tenantId || tenantId.length > 120 ||
      !UUID.test(principalId) ||
      !UUID.test(productAccountId) ||
      !authenticationTime ||
      authenticationTime > Math.floor(Date.now() / 1000) + 60 ||
      !methods ||
      !acr ||
      !jti || jti.length > 220 ||
      !expiresAt
    ) {
      return null;
    }

    return {
      tenantId,
      principalId,
      productAccountId,
      authenticationTime,
      authenticationMethods: methods,
      acr,
      jti,
      expiresAt,
    };
  } catch {
    return null;
  }
}

async function activeExchangeBinding(session: ExchangeSession): Promise<boolean> {
  const result = await withDb(async (client) => {
    const row = await client.query(
      `SELECT 1
         FROM platform_product_accounts account
         JOIN platform_principals principal
           ON principal.tenant_id = account.tenant_id
          AND principal.id = account.principal_id
        WHERE account.tenant_id = $1
          AND account.id = $2::uuid
          AND account.principal_id = $3::uuid
          AND account.product = 'exchange'
          AND account.status = 'active'
          AND principal.status = 'active'
        LIMIT 1`,
      [session.tenantId, session.productAccountId, session.principalId],
    );
    return (row.rowCount ?? 0) === 1;
  });
  return result.enabled && result.value;
}

export async function getExchangeSession(
  request: NextRequest,
  options: { requireRecentStepUp?: boolean } = {},
): Promise<ExchangeSession | null> {
  if (!requestUsesExchangeOrigin(request)) return null;
  const session = await verifyExchangeSessionToken(
    request.cookies.get(EXCHANGE_SESSION_COOKIE)?.value,
  );
  if (!session) return null;

  const verdict = await strictRevocationVerdict(session.jti);
  if (verdict !== "active") return null;
  if (!await activeExchangeBinding(session)) return null;

  if (options.requireRecentStepUp) {
    const age = Math.floor(Date.now() / 1000) - session.authenticationTime;
    if (age < 0 || age > EXCHANGE_MUTATION_STEP_UP_MAX_AGE_SECONDS) return null;
  }

  return session;
}

export async function issueExchangeAccessSession(input: {
  tenantId: string;
  principalId: string;
  productAccountId: string;
  authenticationMethods: ExchangeAuthenticationMethod[];
  acr: ExchangeSessionAcr;
  authenticationTime: number;
  deviceInfo: string;
  ip: string;
  audit: ExchangeSessionAuditContext;
}): Promise<{ token: string; session: ExchangeSession }> {
  if (
    input.audit.tenantId !== input.tenantId ||
    input.audit.actorId !== input.principalId ||
    input.audit.actorType !== "user" ||
    !UUID.test(input.principalId) ||
    !UUID.test(input.productAccountId) ||
    !ACR.has(input.acr)
  ) {
    throw new Error("exchange_session_issue_binding_invalid");
  }
  const methods = validMethods(input.authenticationMethods);
  if (!methods) throw new Error("exchange_session_authentication_methods_invalid");
  const now = Math.floor(Date.now() / 1000);
  if (input.authenticationTime > now + 60 || now - input.authenticationTime > 10 * 60) {
    throw new Error("exchange_session_step_up_stale");
  }

  const key = exchangeSigningKey();
  if (!key) throw new Error("exchange_session_secret_missing");
  const jti = `exchange:${randomUUID()}`;
  const expiresAt = now + EXCHANGE_SESSION_MAX_AGE_SECONDS;
  const token = await new SignJWT({
    role: "exchange" as const,
    v: 1 as const,
    tid: input.tenantId,
    pid: input.principalId,
    paid: input.productAccountId,
    auth_time: input.authenticationTime,
    amr: methods,
    acr: input.acr,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(EXCHANGE_SESSION_ISSUER)
    .setAudience(EXCHANGE_SESSION_AUDIENCE)
    .setSubject(input.productAccountId)
    .setJti(jti)
    .setIssuedAt(now)
    .setNotBefore(now - 5)
    .setExpirationTime(expiresAt)
    .sign(key);

  const stored = await withTx(async (client) => {
    const binding = await client.query(
      `SELECT 1
         FROM platform_product_accounts account
         JOIN platform_principals principal
           ON principal.tenant_id = account.tenant_id
          AND principal.id = account.principal_id
        WHERE account.tenant_id = $1
          AND account.id = $2::uuid
          AND account.principal_id = $3::uuid
          AND account.product = 'exchange'
          AND account.status = 'active'
          AND principal.status = 'active'
        FOR UPDATE OF account, principal`,
      [input.tenantId, input.productAccountId, input.principalId],
    );
    if ((binding.rowCount ?? 0) !== 1) {
      throw new Error("exchange_session_product_account_not_active");
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO user_sessions
         (id, user_id, device_info, ip, expires_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5))
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        jti,
        input.productAccountId,
        input.deviceInfo.slice(0, 500),
        input.ip.slice(0, 80),
        expiresAt,
      ],
    );
    if (!inserted.rows[0]?.id) throw new Error("exchange_session_jti_conflict");

    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "session.issue",
      resourceType: "exchange_product_account",
      resourceId: input.productAccountId,
      outcome: "success",
      metadata: {
        policyVersion: EXCHANGE_SESSION_POLICY_VERSION,
        product: "exchange",
        audience: EXCHANGE_SESSION_AUDIENCE,
        acr: input.acr,
        authenticationMethods: methods,
        maxAgeSeconds: EXCHANGE_SESSION_MAX_AGE_SECONDS,
      },
    });
    return true;
  });
  if (!stored.enabled || !stored.value) throw new Error("exchange_session_store_unavailable");

  return {
    token,
    session: {
      tenantId: input.tenantId,
      principalId: input.principalId,
      productAccountId: input.productAccountId,
      authenticationTime: input.authenticationTime,
      authenticationMethods: methods,
      acr: input.acr,
      jti,
      expiresAt,
    },
  };
}

export function setExchangeSessionCookie(
  response: NextResponse,
  token: string,
): void {
  response.cookies.set(EXCHANGE_SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: EXCHANGE_SESSION_MAX_AGE_SECONDS,
  });
}

export function clearExchangeSessionCookie(response: NextResponse): void {
  response.cookies.delete(EXCHANGE_SESSION_COOKIE);
}

export async function revokeExchangeSession(
  session: ExchangeSession,
  audit: ExchangeSessionAuditContext,
): Promise<void> {
  if (
    audit.tenantId !== session.tenantId ||
    audit.actorId !== session.principalId ||
    audit.actorType !== "user"
  ) {
    throw new Error("exchange_session_revoke_binding_invalid");
  }

  const result = await withTx(async (client) => {
    const updated = await client.query<{ expires_at: Date }>(
      `UPDATE user_sessions
          SET is_revoked = TRUE,
              revoked_at = COALESCE(revoked_at, NOW())
        WHERE id = $1
          AND user_id = $2
          AND is_revoked = FALSE
       RETURNING expires_at`,
      [session.jti, session.productAccountId],
    );
    await writeSensitiveMutationAuditTx(client, {
      ...audit,
      action: "session.revoke",
      resourceType: "exchange_product_account",
      resourceId: session.productAccountId,
      outcome: "success",
      metadata: {
        policyVersion: EXCHANGE_SESSION_POLICY_VERSION,
        product: "exchange",
        revokedSessionCount: updated.rowCount ?? 0,
      },
    });
    return updated.rows[0]?.expires_at ?? null;
  });
  if (!result.enabled) throw new Error("exchange_session_revoke_unavailable");

  if (result.value) {
    await revokeJti(session.jti, Math.floor(result.value.getTime() / 1000));
  }
}
