import { readFile } from "node:fs/promises";

const files = {
  package: "package.json",
  ci: ".github/workflows/ci.yml",
  env: "scripts/validate-env.mjs",
  tests: "src/tests/security/auth-session-authority-postgres.test.ts",
  logoutTests: "src/tests/security/auth-logout-route-postgres.test.ts",
  refreshTests: "src/tests/security/auth-refresh-route-postgres.test.ts",
  sessionsTests: "src/tests/security/auth-sessions-route-postgres.test.ts",
  specificSessionTests: "src/tests/security/auth-session-revoke-route-postgres.test.ts",
  passwordTests: "src/tests/security/auth-password-change-postgres.test.ts",
  platform: "src/lib/platform-config.ts",
  unified: "src/lib/unified-session.ts",
  sessionRefresh: "src/lib/session-refresh.ts",
  profileRoute: "src/app/api/academy-student-profile/route.ts",
  legacySession: "src/lib/session.ts",
  api: "src/lib/api.ts",
  authSession: "src/lib/auth-session.ts",
  jti: "src/lib/security/jti-store.ts",
  sessionStore: "src/lib/security/session-store.ts",
  refresh: "src/lib/security/refresh-tokens.ts",
  academyAuth: "src/app/api/academy-auth/route.ts",
  sessionsRoute: "src/app/api/auth/sessions/route.ts",
  specificSessionRoute: "src/app/api/auth/sessions/[id]/route.ts",
  refreshRoute: "src/app/api/auth/refresh/route.ts",
  twoFactor: "src/app/api/auth/2fa/verify/route.ts",
  webauthn: "src/app/api/auth/webauthn/auth/verify/route.ts",
  password: "src/app/api/auth/password/change/route.ts",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

requireText("package", '"auth:check"', "auth authority guard must have an npm command");
requireText("package", "npm run auth:check", "release check must include auth authority");
requireText("package", '"test:auth-session"', "focused auth integration tests need a governed command");
requireText("package", "src/tests/security/auth-*.test.ts", "focused auth test command must include helper and route-level suites");
requireText("package", "npm run test:auth-session", "release check must run focused auth integration tests");
requireText("ci", "Authentication session authority guard", "pull-request CI must run the auth authority guard");
requireText("ci", "npm run auth:check", "CI must invoke the governed auth command");
requireText("ci", "Authentication session integration tests", "pull-request CI must expose focused auth integration evidence");
requireText("ci", "npm run test:auth-session", "CI must execute the governed auth integration command");
requireText("env", "must be distinct", "production environment validation must reject reused auth secrets");
requireText("env", "REDIS_URL is required in production", "strict auth must require the ioredis runtime client");
requireText("env", "between 300 and 14400 seconds", "production validation must reject long-lived access JWTs");

for (const target of ["unified", "legacySession"]) {
  requireText(target, "TECPEY_SESSION_SECRET", "access sessions must use the canonical secret");
  rejectText(target, "JWT_SECRET", "access-session secret fallback is forbidden");
  rejectText(target, "NEXTAUTH_SECRET", "access-session secret fallback is forbidden");
  rejectText(target, "TECPEY_ACADEMY_AUTH_SECRET ||", "Academy secret may not sign unified access sessions");
}
requireText("refresh", "TECPEY_REFRESH_SECRET", "refresh tokens require a dedicated secret");
rejectText("refresh", "process.env.TECPEY_SESSION_SECRET", "refresh tokens may not fall back to the access-session secret");
rejectText("refresh", "process.env.JWT_SECRET", "refresh tokens may not fall back to a generic JWT secret");

requireText("platform", "ACCESS_SESSION_MAX_AGE_SECONDS = 4 * 60 * 60", "copied access JWTs must have a hard four-hour upper bound");
requireText("platform", "Math.min(parsed, ACCESS_SESSION_MAX_AGE_SECONDS)", "configuration may shorten but never extend access lifetime");
requireText("unified", "accessSessionMaxAgeSeconds", "JWT expiry and cookie expiry must share the bounded access lifetime");
requireText("unified", ".setExpirationTime(expiresAt)", "the signed JWT itself must use the bounded access expiry");
rejectText("unified", "sessionMaxAge()", "unified access JWTs may not inherit a legacy 30-day session lifetime");
requireText("unified", "registerSession", "replacement access cookies require durable JTI registration");
requireText("unified", "if (!registered) throw new Error(\"session_registry_unavailable\")", "replacement cookie writes must fail before Set-Cookie when registration fails");
requireText("unified", "setUnifiedSessionCookie_async_required", "unawaited cookie signing must fail explicitly");
requireText("sessionRefresh", "refresh_token_rotation_required", "legacy sliding access refresh must be disabled");
rejectText("sessionRefresh", "setUnifiedSessionCookieAsync", "session refresh helper may not bypass refresh-token rotation");
requireText("profileRoute", "strictRevocation: true", "profile claim changes require a strict active session");
requireText("profileRoute", "setUnifiedSessionCookieAsync", "profile claim replacements must use registered cookie issuance");
requireText("profileRoute", "session_registry_unavailable", "profile responses must expose registration failure rather than mint rejected cookies");

requireText("legacySession", "getSessionToken", "server-to-server forwarding needs a verified raw token contract");
requireText("api", "getSessionToken", "API forwarding must use the verified raw access token");
rejectText("api", "session as { user?: { token?: string } }", "legacy empty-bearer session shape is forbidden");
requireText("api", "Authenticated session required", "API forwarding must not emit an empty Bearer header");

requireText("authSession", "type JtiCacheEntry = { revoked: true", "only deny decisions may be cached");
rejectText("authSession", "revoked: false", "cached allow decisions are forbidden");
requireText("authSession", "if (strict) return guestSession()", "legacy cookies must not satisfy strict operations");
requireText("authSession", "revocation check failed — blocking", "revocation check exceptions must fail closed");

requireText("jti", "durableSessionState", "PostgreSQL session authority must back JTI checks");
requireText("jti", "Redis miss is not proof of validity", "Redis misses must not imply an active session");
requireText("jti", "durable revocation authority unavailable — blocking", "ordinary auth must block when no authority is available");
requireText("jti", "strict Redis check failed — blocking", "strict Redis outages must fail closed");

requireText("sessionStore", "revokeSessionStrict", "session revocation must expose explicit outcomes");
requireText("sessionStore", "AND user_id = $2", "session revocation must bind the exact owner");
requireText("sessionStore", "revocation_store_unavailable", "Redis deny-write failures must be explicit");
requireText("sessionStore", "Promise<boolean>", "session registration must report durable success");
requireText("sessionStore", "ON CONFLICT (id) DO NOTHING", "session registration must explicitly handle duplicate JTI conflicts");
requireText("sessionStore", "RETURNING id", "session registration must prove that a durable row was inserted");
requireText("sessionStore", "duplicate JTI rejected", "duplicate JTI registration must fail closed");
requireText("sessionStore", "alreadyRevoked", "strict revocation must recognize an already-revoked owned session");
requireText("sessionStore", "repairing Redis deny evidence", "strict revocation retries must repair missing Redis deny evidence");
requireText("sessionStore", "listActiveSessionsStrict", "session listing must expose database unavailability");
requireText("sessionStore", "revokeAllSessionsStrict", "bulk revocation must expose database and Redis failures");
requireText("sessionStore", "evidenceCount", "bulk revocation retries must retain repair evidence");

requireText("refresh", "refused to issue unstored refresh token", "refresh issuance must fail when DB persistence is unavailable");
requireText("refresh", "if (!result.enabled)", "refresh token operations must inspect withDb availability");
requireText("refresh", "revokeAllRefreshTokensForUser", "credential changes/logout need durable refresh revocation");

requireText("academyAuth", "if (!verifyCsrfOrigin(req))", "logout and login mutations require CSRF protection");
requireText("academyAuth", "verifyUnifiedSession(sessionToken)", "logout must verify the token before reading identity");
requireText("academyAuth", "revokeSessionStrict(jti, userId)", "logout must revoke the exact durable access session");
requireText("academyAuth", "revokeAllRefreshTokensForUser(userId)", "logout must revoke refresh authority before success");
requireText("academyAuth", "if (!registered)", "login must fail if access-session registration fails");
rejectText("academyAuth", "void registerSession", "login may not fire-and-forget session registration");
rejectText("academyAuth", "void revokeSession", "logout may not fire-and-forget session revocation");
rejectText("academyAuth", "void revokeJti", "logout may not fire-and-forget deny writes");

requireText("sessionsRoute", "listActiveSessionsStrict", "session listing route must not convert DB outage into an empty list");
requireText("sessionsRoute", "revokeAllSessionsStrict", "logout-all must use explicit bulk revocation outcomes");
requireText("sessionsRoute", "revokeAllRefreshTokensForUser", "logout-all must revoke refresh authority for other devices");
requireText("sessionsRoute", "session_revocation_unavailable", "logout-all must return an explicit unavailable response");
requireText("sessionsRoute", "currentAccessRetained", "logout-all response must disclose retained current access semantics");

requireText("specificSessionRoute", "revokeSessionStrict", "device revocation must revoke the exact owned JTI");
requireText("specificSessionRoute", "revokeAllRefreshTokensForUser", "device revocation must prevent refresh-token resurrection");
requireText("specificSessionRoute", "refreshScope", "device revocation must disclose broad refresh invalidation semantics");
requireText("specificSessionRoute", 'return apiError("not_found", 404)', "unknown or foreign sessions must not revoke refresh authority");

for (const target of ["refreshRoute", "twoFactor", "webauthn", "password"]) {
  requireText(target, "if (!registered)", "every token-issuing path must fail on missing durable access-session evidence");
  rejectText(target, "void registerSession", "token issuance may not fire-and-forget session registration");
}
requireText("refreshRoute", "verifyCsrfOrigin(req)", "refresh rotation must enforce same-origin mutation authority");
requireText("refreshRoute", "if (!oldRevoked)", "refresh rotation must prove the old refresh token was revoked");
requireText("password", "revokeAllSessionsStrict", "password change must revoke every prior access session");
rejectText("password", "revokeSessionStrict", "password change may not leave other access sessions alive");
requireText("password", "revokeAllRefreshTokensForUser", "password change must revoke old refresh authority");
requireText("password", "revokedAccessSessions", "password-change evidence must disclose full access-session rotation");

requireText("tests", "duplicate JTI registration", "integration tests must reject duplicate durable session identity");
requireText("tests", "exact owner", "integration tests must prove owner-bound revocation");
requireText("tests", "Redis deny persistence is unavailable", "integration tests must cover revocation-store outage");
requireText("tests", "prior non-strict allow", "integration tests must prevent strict cache bypass");
requireText("tests", "without PostgreSQL authority", "integration tests must cover database-unavailable issuance");
requireText("tests", "reuse one secret across token classes", "integration tests must prove secret isolation validation");
requireText("logoutTests", "cross-origin logout", "route tests must prove CSRF rejection without revocation");
requireText("logoutTests", "forged unified session", "route tests must reject attacker-signed session identity");
requireText("logoutTests", "all durable refresh authority", "route tests must invalidate old access and refresh credentials");
requireText("logoutTests", "retry repairs deny evidence", "route tests must prove recovery after a Redis outage");
requireText("logoutTests", "session_not_found", "route tests must prevent permanent logout failure after partial revocation");
requireText("refreshTests", "cross-origin refresh rotation", "route tests must prove CSRF rejection before refresh rotation");
requireText("refreshTests", "without consuming the durable refresh token", "CSRF rejection must preserve the original refresh token");
requireText("sessionsTests", "all refresh tokens", "logout-all tests must prove refresh invalidation");
requireText("sessionsTests", "repairs deny evidence on retry", "logout-all tests must prove Redis outage recovery");
requireText("sessionsTests", "database unavailability", "bulk authority tests must reject false empty and zero-success results");
requireText("specificSessionTests", "cannot mint a replacement", "device revocation tests must prove refresh-token resurrection is blocked");
requireText("specificSessionTests", "does not belong to the principal", "foreign session IDs must not revoke the caller's refresh authority");
requireText("passwordTests", "invalidates every old access and refresh credential", "password tests must prove complete credential rotation");
requireText("passwordTests", "one fresh session", "password tests must prove only the replacement session remains active");

if (failures.length) {
  console.error("Authentication session authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Authentication session authority check passed: dedicated secrets, four-hour access JWT cap, required ioredis strict authority, durable issuance for every replacement cookie, disabled sliding refresh, duplicate-JTI rejection, owner-bound and recoverable single/bulk revocation, device and password credential rotation, refresh invalidation across devices, deny-only caching, focused CI evidence, same-origin refresh rotation, route-level CSRF/forgery/logout tests, PostgreSQL/Redis negative tests, strict fail-closed checks and verified token forwarding are enforced.");
