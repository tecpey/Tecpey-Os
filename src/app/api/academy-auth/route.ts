import { NextRequest } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withDb } from "@/lib/db";
import {
  academyAccountIdFromEmail,
  clearAcademyAuthCookie,
  getAcademyAuthFromRequest,
  isAcademyAuthConfigured,
  normalizeAcademyEmail,
  normalizeAcademyUsername,
} from "@/lib/academy-auth";
import { clearStudentSessionCookie } from "@/lib/academy-session";
import {
  clearUnifiedSessionCookie,
  extractJtiFromToken,
  extractExpFromToken,
  signUnifiedSession,
  verifyUnifiedSession,
  UNIFIED_SESSION_COOKIE,
} from "@/lib/unified-session";
import { apiOk, apiError, apiRateLimited } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  prepareRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  ACCESS_COOKIE_TTL_S,
} from "@/lib/security/refresh-tokens";
import {
  admitSessionAuthority,
  logoutSessionAuthority,
} from "@/lib/security/session-authority";
import { shouldUseSecureCookie, COOKIES, PLATFORM } from "@/lib/platform-config";
import {
  peekPreAuthToken,
  storePreAuthToken,
} from "@/lib/security/totp";
import { trackAuthEvent } from "@/lib/security/auth-metrics";
import {
  authenticateOrRegisterAcademyAccount,
  fingerprintAcademyAccount,
  fingerprintAcademyUsername,
  hashAcademyPassword,
  verifyAcademyPassword,
  type AcademyCredentialAccount,
} from "@/lib/security/academy-account-authority";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

type LocalAcademyAccount = AcademyCredentialAccount & {
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

type LocalAuthStore = {
  accountsByEmail: Record<string, LocalAcademyAccount>;
  emailByUsername: Record<string, string>;
};

function cleanDisplayName(value: unknown): string {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, 60);
}

function authStorePath(): string {
  return path.join(process.cwd(), "storage", "academy-auth.local.json");
}

function canUseLocalAuthStorage(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE === "true";
}

async function readLocalAuthStore(): Promise<LocalAuthStore> {
  try {
    const raw = await readFile(authStorePath(), "utf8");
    const parsed = JSON.parse(raw) as LocalAuthStore;
    return {
      accountsByEmail: parsed.accountsByEmail || {},
      emailByUsername: parsed.emailByUsername || {},
    };
  } catch {
    return { accountsByEmail: {}, emailByUsername: {} };
  }
}

async function writeLocalAuthStore(store: LocalAuthStore): Promise<void> {
  await mkdir(path.dirname(authStorePath()), { recursive: true });
  await writeFile(authStorePath(), JSON.stringify(store, null, 2), "utf8");
}

async function authenticateOrRegisterLocalAccount(input: {
  mode: "login" | "signup";
  accountId: string;
  email: string;
  username: string;
  displayName: string;
  password: string;
}): Promise<
  | { status: "created" | "authenticated"; account: AcademyCredentialAccount }
  | { status: "invalid_credentials" | "username_taken" }
> {
  const store = await readLocalAuthStore();
  const existing = store.accountsByEmail[input.email];
  const usernameOwner = store.emailByUsername[input.username];

  if (usernameOwner && usernameOwner !== input.email) {
    return { status: "username_taken" };
  }
  if (existing) {
    if (!verifyAcademyPassword(input.password, existing.passwordHash)) {
      return { status: "invalid_credentials" };
    }
    return {
      status: "authenticated",
      account: {
        accountId: existing.accountId,
        email: existing.email,
        username: existing.username,
        displayName: existing.displayName,
      },
    };
  }
  if (input.mode === "login") return { status: "invalid_credentials" };

  const now = new Date().toISOString();
  const created: LocalAcademyAccount = {
    accountId: input.accountId,
    email: input.email,
    username: input.username,
    displayName: input.displayName,
    passwordHash: hashAcademyPassword(input.password),
    createdAt: now,
    updatedAt: now,
  };
  store.accountsByEmail[input.email] = created;
  store.emailByUsername[input.username] = input.email;
  await writeLocalAuthStore(store);
  return {
    status: "created",
    account: {
      accountId: created.accountId,
      email: created.email,
      username: created.username,
      displayName: created.displayName,
    },
  };
}

function clearAllAuthCookies(response: ReturnType<typeof apiOk> | ReturnType<typeof apiError>) {
  clearAcademyAuthCookie(response);
  clearStudentSessionCookie(response);
  clearUnifiedSessionCookie(response);
  clearRefreshCookie(response);
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-auth" }, async () => {
    const session = await getAcademyAuthFromRequest(req);
    return apiOk({
      authenticated: Boolean(session),
      account: session
        ? {
            email: session.email,
            displayName: session.displayName || "",
            username: session.username || "",
          }
        : null,
    });
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-auth" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "academy-auth",
      limit: 10,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);
    if (!isAcademyAuthConfigured()) {
      return apiError("academy_auth_service_not_configured", 503);
    }

    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 8_192,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
      const body = await req.json();
      const mode: "login" | "signup" = body.mode === "login" ? "login" : "signup";
      const email = normalizeAcademyEmail(body.email);
      const password = String(body.password || "");
      const requestedDisplayName = cleanDisplayName(
        body.displayName || email.split("@")[0] || "دانشجوی تک‌پی",
      );
      const username = normalizeAcademyUsername(
        body.username || requestedDisplayName || email.split("@")[0],
      );

      if (!/^\S+@\S+\.\S+$/.test(email)) return apiError("invalid_email", 400);
      if (password.length < 10) return apiError("weak_password", 400);
      if (requestedDisplayName.length < 2) return apiError("invalid_display_name", 400);
      if (username.length < 3) return apiError("invalid_username", 400);

      const accountId = academyAccountIdFromEmail(email);
      const correlationId = resolveSensitiveAuditCorrelation(
        req.headers.get("x-tecpey-request-id"),
      );
      const accountFingerprint = fingerprintAcademyAccount(accountId);
      const usernameFingerprint = fingerprintAcademyUsername(username);

      let productionAuthority = true;
      let result;
      try {
        result = await authenticateOrRegisterAcademyAccount({
          mode,
          accountId,
          email,
          username,
          displayName: requestedDisplayName,
          password,
          audit: {
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            actorType: "user",
            actorId: accountId,
            correlationId,
            requestHash: hashSensitiveAuditRequest({
              tenantId: PLATFORM.DEFAULT_TENANT_ID,
              action: "credential.account.create",
              mode,
              accountFingerprint,
              usernameFingerprint,
            }),
          },
        });
      } catch {
        return apiError("academy_auth_authority_unavailable", 503);
      }

      if (result.status === "unavailable") {
        if (!canUseLocalAuthStorage()) {
          return apiError("academy_auth_storage_unavailable", 503);
        }
        productionAuthority = false;
        result = await authenticateOrRegisterLocalAccount({
          mode,
          accountId,
          email,
          username,
          displayName: requestedDisplayName,
          password,
        });
      }
      if (result.status === "username_taken") return apiError("username_taken", 409);
      if (result.status === "invalid_credentials") {
        return apiError("invalid_credentials", 401);
      }
      const account = result.account;

      const ip = getClientIp(req);
      const deviceInfo = (req.headers.get("user-agent") ?? "").slice(0, 500);

      if (mode === "login" && productionAuthority) {
        const twoFaResult = await withDb(async (db) => {
          const selected = await db.query<{ enabled: boolean }>(
            "SELECT enabled FROM user_2fa WHERE user_id = $1",
            [account.accountId],
          );
          return selected.rows[0]?.enabled ?? false;
        });
        if (!twoFaResult.enabled) return apiError("db_unavailable", 503);

        if (twoFaResult.value) {
          const preAuthToken = crypto.randomUUID();
          try {
            await storePreAuthToken(preAuthToken, account.accountId);
          } catch {
            return apiError("preauth_authority_unavailable", 503);
          }
          const stored = await peekPreAuthToken(preAuthToken);
          if (!stored.available || stored.userId !== account.accountId) {
            return apiError("preauth_authority_unavailable", 503);
          }
          trackAuthEvent("login_2fa_required");
          return apiOk({ requires2fa: true, preAuthToken });
        }
      }

      const familyId = crypto.randomUUID();
      const accessToken = await signUnifiedSession({
        accountId: account.accountId,
        studentId: null,
        email: account.email,
        displayName: account.displayName,
        username: account.username,
      });
      const jti = extractJtiFromToken(accessToken);
      const exp = extractExpFromToken(accessToken);
      if (!jti || !exp) return apiError("session_issue_failed", 503);

      const preparedRefresh = await prepareRefreshToken({
        userId: account.accountId,
        familyId,
        deviceInfo,
        ip,
      });
      if (!preparedRefresh) return apiError("refresh_session_unavailable", 503);

      let admitted;
      try {
        admitted = await admitSessionAuthority({
          userId: account.accountId,
          access: {
            jti,
            userId: account.accountId,
            expiresAt: new Date(exp * 1000),
          },
          refresh: preparedRefresh,
          deviceInfo,
          ip,
          method: "password",
          audit: {
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            actorType: "user",
            actorId: account.accountId,
            correlationId,
            requestHash: hashSensitiveAuditRequest({
              tenantId: PLATFORM.DEFAULT_TENANT_ID,
              action: "session.issue",
              method: "password",
              mode,
              userId: account.accountId,
            }),
          },
        });
      } catch {
        return apiError("session_registry_unavailable", 503);
      }

      const response = apiOk({
        authenticated: true,
        account: {
          email: account.email,
          displayName: account.displayName,
          username: account.username,
        },
      });
      response.cookies.set(COOKIES.SESSION, accessToken, {
        path: "/",
        httpOnly: true,
        secure: shouldUseSecureCookie(),
        sameSite: "lax",
        maxAge: ACCESS_COOKIE_TTL_S,
      });
      setRefreshCookie(response, admitted.refreshToken);

      trackAuthEvent("login_success");
      if (admitted.isNewDevice) trackAuthEvent("new_device_detected");
      return response;
    } catch {
      return apiError("server_error", 500);
    }
  });
}

export async function DELETE(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-auth" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const sessionToken = req.cookies.get(UNIFIED_SESSION_COOKIE)?.value;
    if (!sessionToken) {
      const response = apiOk({ revoked: false, alreadyLoggedOut: true });
      clearAllAuthCookies(response);
      return response;
    }

    const [session, canonical] = await Promise.all([
      verifyUnifiedSession(sessionToken),
      getCanonicalSession(req, { strictRevocation: true }),
    ]);
    const jti = session?.jti ?? null;
    const signedUserId = session?.accountId ?? session?.studentId ?? null;
    const userId =
      canonical.academyAccountId ?? canonical.studentId ?? canonical.userId ?? null;
    if (!session || !jti || !signedUserId || !userId || signedUserId !== userId) {
      const response = apiError("invalid_session", 401);
      clearAllAuthCookies(response);
      return response;
    }

    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    let revoked;
    try {
      revoked = await logoutSessionAuthority({
        userId,
        currentSessionJti: jti,
        audit: {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorType: session.accountId ? "user" : "student",
          actorId: userId,
          correlationId,
          requestHash: hashSensitiveAuditRequest({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            action: "session.logout",
            userId,
          }),
        },
      });
    } catch {
      const response = apiError("logout_revocation_unavailable", 503);
      clearAllAuthCookies(response);
      return response;
    }

    const response = apiOk({
      revoked: true,
      revokedCount: revoked.revokedCount,
      revocationPending: revoked.revocationPending,
    });
    clearAllAuthCookies(response);
    return response;
  });
}
