import { NextRequest } from "next/server";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
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
  admitSession,
  revokeExactSession,
} from "@/lib/security/session-authority";
import { buildSessionAuditContext } from "@/lib/security/session-route-context";
import { shouldUseSecureCookie, COOKIES } from "@/lib/platform-config";
import { storePreAuthToken } from "@/lib/security/totp";
import { trackAuthEvent } from "@/lib/security/auth-metrics";
import { deviceFingerprint } from "@/lib/security/webauthn";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

type AcademyAccount = {
  accountId: string;
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

type LocalAuthStore = {
  accountsByEmail: Record<string, AcademyAccount>;
  emailByUsername: Record<string, string>;
};

function cleanDisplayName(value: unknown) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, 60);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}

function verifyPassword(password: string, stored: string) {
  const [algo, roundsText, salt, digest] = stored.split("$");
  if (algo !== "pbkdf2_sha256" || !roundsText || !salt || !digest) return false;
  const rounds = Number(roundsText);
  if (!Number.isFinite(rounds) || rounds < 50_000) return false;
  const calculated = pbkdf2Sync(password, salt, rounds, 32, "sha256").toString("hex");
  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(digest, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function authStorePath() {
  return path.join(process.cwd(), "storage", "academy-auth.local.json");
}

function canUseLocalAuthStorage() {
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

async function writeLocalAuthStore(store: LocalAuthStore) {
  await mkdir(path.dirname(authStorePath()), { recursive: true });
  await writeFile(authStorePath(), JSON.stringify(store, null, 2), "utf8");
}

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

async function loadDbAccount(client: Queryable, email: string, username?: string) {
  const values: string[] = [email];
  let where = "email = $1";
  if (username) {
    values.push(username);
    where = "email = $1 OR username = $2";
  }
  const result = await client.query(
    `SELECT id, email, username, display_name, password_hash
       FROM academy_auth_accounts
      WHERE ${where}
      LIMIT 1`,
    values,
  );
  return result.rows[0] || null;
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
      const mode = body.mode === "login" ? "login" : "signup";
      const email = normalizeAcademyEmail(body.email);
      const password = String(body.password || "");
      const displayName = cleanDisplayName(
        body.displayName || email.split("@")[0] || "دانشجوی تک‌پی",
      );
      const username = normalizeAcademyUsername(
        body.username || displayName || email.split("@")[0],
      );

      if (!/^\S+@\S+\.\S+$/.test(email)) return apiError("invalid_email", 400);
      if (password.length < 10) return apiError("weak_password", 400);
      if (displayName.length < 2) return apiError("invalid_display_name", 400);
      if (username.length < 3) return apiError("invalid_username", 400);

      const accountId = academyAccountIdFromEmail(email);
      const dbResult = await withDb(async (client) => {
        const existing = await loadDbAccount(client, email, username);
        if (existing) {
          if (existing.email !== email && existing.username === username) {
            return { ok: false as const, status: 409, error: "username_taken" };
          }
          if (!verifyPassword(password, existing.password_hash)) {
            return { ok: false as const, status: 401, error: "invalid_credentials" };
          }
          await client.query(
            `UPDATE academy_auth_accounts
                SET display_name = COALESCE(NULLIF($2, ''), display_name),
                    updated_at = NOW()
              WHERE email = $1`,
            [email, displayName],
          );
          return {
            ok: true as const,
            account: {
              accountId: existing.id,
              email: existing.email,
              username: existing.username,
              displayName: displayName || existing.display_name,
            },
          };
        }
        if (mode === "login") {
          return { ok: false as const, status: 401, error: "invalid_credentials" };
        }
        await client.query(
          `INSERT INTO academy_auth_accounts
            (id, email, username, display_name, password_hash)
           VALUES ($1, $2, $3, $4, $5)`,
          [accountId, email, username, displayName, hashPassword(password)],
        );
        return {
          ok: true as const,
          account: { accountId, email, username, displayName },
        };
      });

      let account:
        | AcademyAccount
        | { accountId: string; email: string; username: string; displayName: string }
        | null = null;

      if (dbResult.enabled) {
        if (!dbResult.value?.ok) {
          return apiError(
            dbResult.value?.error || "auth_failed",
            dbResult.value?.status || 400,
          );
        }
        account = dbResult.value.account;
      } else {
        if (!canUseLocalAuthStorage()) {
          return apiError("academy_auth_storage_unavailable", 503);
        }
        const store = await readLocalAuthStore();
        const existing = store.accountsByEmail[email];
        const ownerEmail = store.emailByUsername[username];
        if (ownerEmail && ownerEmail !== email) {
          return apiError("username_taken", 409);
        }
        if (existing) {
          if (!verifyPassword(password, existing.passwordHash)) {
            return apiError("invalid_credentials", 401);
          }
          existing.displayName = displayName || existing.displayName;
          existing.updatedAt = new Date().toISOString();
          store.accountsByEmail[email] = existing;
          await writeLocalAuthStore(store);
          account = existing;
        } else {
          if (mode === "login") return apiError("invalid_credentials", 401);
          const created: AcademyAccount = {
            accountId,
            email,
            username,
            displayName,
            passwordHash: hashPassword(password),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          store.accountsByEmail[email] = created;
          store.emailByUsername[username] = email;
          await writeLocalAuthStore(store);
          account = created;
        }
      }

      const ip = getClientIp(req);
      const deviceInfo = (req.headers.get("user-agent") ?? "").slice(0, 500);

      if (mode === "login" && dbResult.enabled) {
        const twoFaResult = await withDb(async (db) => {
          const result = await db.query<{ enabled: boolean }>(
            `SELECT enabled FROM user_2fa WHERE user_id = $1`,
            [account!.accountId],
          );
          return result.rows[0]?.enabled ?? false;
        });
        if (!twoFaResult.enabled) {
          return apiError("authentication_policy_unavailable", 503);
        }
        if (twoFaResult.value) {
          const preAuthToken = crypto.randomUUID();
          await storePreAuthToken(preAuthToken, account!.accountId);
          trackAuthEvent("login_2fa_required");
          return apiOk({ requires2fa: true, preAuthToken });
        }
      }

      const accessToken = await signUnifiedSession({
        accountId: account.accountId,
        studentId: null,
        email: account.email,
        displayName: account.displayName,
        username: account.username,
      });
      const accessJti = extractJtiFromToken(accessToken);
      const accessExp = extractExpFromToken(accessToken);
      if (!accessJti || !accessExp) return apiError("session_issue_failed", 503);

      const familyId = crypto.randomUUID();
      const preparedRefresh = await prepareRefreshToken({
        userId: account.accountId,
        familyId,
        deviceInfo,
        ip,
      });
      if (!preparedRefresh) return apiError("refresh_session_unavailable", 503);

      let admission;
      try {
        admission = await admitSession({
          userId: account.accountId,
          accessJti,
          accessExpiresAt: new Date(accessExp * 1000),
          preparedRefresh,
          deviceInfo,
          ip,
          deviceFingerprint: deviceFingerprint(deviceInfo, ip),
          method: mode === "login" ? "password" : "password_signup",
          audit: buildSessionAuditContext({
            req,
            userId: account.accountId,
            actorType: "user",
            action: "session.issue",
            evidence: {
              authenticationMethod:
                mode === "login" ? "password" : "password_signup",
            },
          }),
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
      setRefreshCookie(response, admission.refreshToken);

      trackAuthEvent("login_success");
      if (admission.isNewDevice) trackAuthEvent("new_device_detected");
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

    const session = await verifyUnifiedSession(sessionToken);
    const sessionId = session?.jti ?? null;
    const userId = session?.accountId ?? session?.studentId ?? null;
    if (!session || !sessionId || !userId) {
      const response = apiError("invalid_session", 401);
      clearAllAuthCookies(response);
      return response;
    }

    const result = await revokeExactSession({
      sessionId,
      userId,
      action: "session.logout",
      audit: buildSessionAuditContext({
        req,
        userId,
        actorType: session.accountId ? "user" : "student",
        action: "session.logout",
        evidence: { sessionId },
      }),
    });

    if (!result.ok) {
      const response = apiError("logout_revocation_unavailable", 503, {
        reason: result.reason,
      });
      clearAllAuthCookies(response);
      return response;
    }

    const response = apiOk({
      revoked: true,
      revokedCount: result.revokedCount,
      denyCachePending: result.denyCachePending,
    });
    clearAllAuthCookies(response);
    return response;
  });
}
