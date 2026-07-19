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
  legacyTests: "src/tests/security/auth-legacy-cookie-cutoff.test.ts",
  ttlTests: "src/tests/security/auth-access-session-ttl.test.ts",
  reviewTests: "src/tests/security/auth-session-review-followup.test.ts",
  platform: "src/lib/platform-config.ts",
  unified: "src/lib/unified-session.ts",
  sessionRefresh: "src/lib/session-refresh.ts",
  legacySession: "src/lib/session.ts",
  api: "src/lib/api.ts",
  authSession: "src/lib/auth-session.ts",
  jti: "src/lib/security/jti-store.ts",
  sessionStore: "src/lib/security/session-store.ts",
  refresh: "src/lib/security/refresh-tokens.ts",
  passwords: "src/lib/security/passwords.ts",
  academyAuth: "src/app/api/academy-auth/route.ts",
  profileRoute: "src/app/api/academy-student-profile/route.ts",
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
requireText("env", "4-hour security ceiling", "production validation must reject overlong access sessions");
requireText("env", "REDIS_URL is required in production", "strict session revocation must require the shared Redis authority");
requireText("env", "Redis REST credentials alone are insufficient", "rate-limit Redis may not masquerade as revocation Redis");
requireText("env", "TECPEY_LEGACY_AUTH_UNTIL", "legacy compatibility must have an explicit environment cutoff");
requireText("env", "beyond 30 days", "legacy compatibility cutoff must remain locally bounded");
requireText("env", "immutable 2026-08-18", "legacy compatibility must have a non-extendable production sunset");

for (const target of ["unified", "legacySession"]) {
  requireText(target, "TECPEY_SESSION_SECRET", "access sessions must use the canonical secret");
  rejectText(target, "JWT_SECRET", "access-session secret fallback is forbidden");
  rejectText(target, "NEXTAUTH_SECRET", "access-session secret fallback is forbidden");
  rejectText(target, "TECPEY_ACADEMY_AUTH_SECRET ||", "Academy secret may not sign unified access sessions");
}
requireText("platform", "ACCESS_SESSION_MAX_AGE_SECONDS = 4 * 60 * 60", "access JWTs need a code-owned four-hour ceiling");
requireText("platform", "return `${sessionMaxAgeSeconds()}s`", "JWT duration must derive from cookie lifetime authority");
requireText("refresh", "ACCESS_COOKIE_TTL_S = sessionMaxAgeSeconds()", "access cookie lifetime must share JWT lifetime authority");
requireText("refresh", "TECPEY_REFRESH_SECRET", "refresh tokens require a dedicated secret");
rejectText("refresh", "process.env.TECPEY_SESSION_SECRET", "refresh tokens may not fall back to the access-session secret");
rejectText("refresh", "process.env.JWT_SECRET", "refresh tokens may not fall back to a generic JWT secret");

requireText("unified", "setUnifiedSessionCookie_async_required", "unawaited cookie signing must fail explicitly");
requireText("unified", "registerSession", "replacement access cookies require durable JTI registration");
requireText("unified", "session_owner_missing", "replacement cookies require a canonical durable owner");
requireText("unified", "session_registry_unavailable", "replacement cookies must fail when registration fails");
requireText("unified", "if (!registered)", "replacement cookies may not be written before durable registration succeeds");
requireText("sessionRefresh", "refresh_token_rotation_required", "legacy sliding access renewal must be disabled");
rejectText("sessionRefresh", "setUnifiedSessionCookieAsync", "renewal helpers may not bypass refresh-token rotation");
requireText("legacySession", "getSessionToken", "server-to-server forwarding needs a verified raw token contract");
requireText("api", "getSessionToken", "API forwarding must use the verified raw access token");
rejectText("api", "session as { user?: { token?: string } }", "legacy empty-bearer session shape is forbidden");
requireText("api", "Authenticated session required", "API forwarding must not emit an empty Bearer header");

requireText("profileRoute", 'process.env.NODE_ENV !== "production" &&', "profile filesystem fallback must never run in production");
requireText("profileRoute", "strictRevocation: true", "profile claim mutations require strict revocation authority");
requireText("profileRoute", "{ deviceInfo: userAgent, ip }", "profile replacement cookies require real device and IP evidence");
requireText("profileRoute", "academy_profile_service_unavailable", "profile reads and writes must fail explicitly without durable storage");
requireText("profileRoute", "session_registry_unavailable", "profile claim replacement must surface registration failure");

requireText("authSession", "type JtiCacheEntry = { revoked: true", "only deny decisions may be cached");
rejectText("authSession", "revoked: false", "cached allow decisions are forbidden");
requireText("authSession", "legacyCookieCompatibilityEnabled", "legacy cookie acceptance must use one governed cutoff function");
requireText("authSession", "TECPEY_LEGACY_AUTH_UNTIL", "legacy cookie acceptance must require an explicit production cutoff");
requireText("authSession", "LEGACY_AUTH_MAX_WINDOW_MS", "legacy cookie migration windows must be bounded");
requireText("authSession", "LEGACY_AUTH_HARD_SUNSET", "legacy cookie retirement must have an immutable code-owned sunset");
requireText("authSession", "immutable hard sunset", "legacy cutoff configuration may not slide beyond retirement");
requireText("authSession", "if (strict || !legacyCookieCompatibilityEnabled())", "strict callers and expired legacy windows must reject legacy cookies");
requireText("authSession", "revocation check failed — blocking", "revocation check exceptions must fail closed");

requireText("jti", "durableSessionState", "PostgreSQL session authority must back JTI checks");
requireText("jti", "Redis miss is not proof of validity", "Redis misses must not imply an active session");
requireText("jti", "durable revocation authority unavailable — blocking", "ordinary auth must block when no authority is available");
requireText("jti", "strict Redis check failed — blocking", "strict Redis outages must fail closed");

requireText("sessionStore", "registerSessionWithClient", "access-session registration must support caller-owned transactions");
requireText("sessionStore", "revokeAllSessionsWithClient", "bulk access revocation must support caller-owned transactions");
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

requireText("refresh", "prepareRefreshToken", "refresh tokens must be signable before transactional persistence");
requireText("refresh", "persistPreparedRefreshTokenWithClient", "refresh-token persistence must support caller-owned transactions");
requireText("refresh", "revokeAllRefreshTokensForUserWithClient", "refresh revocation must support caller-owned transactions");
requireText("refresh", "refused to issue unstored refresh token", "refresh issuance must fail when DB persistence is unavailable");
requireText("refresh", "if (!result.enabled", "refresh token operations must inspect withDb availability");
requireText("refresh", "revokeAllRefreshTokensForUser", "credential changes/logout need durable refresh revocation");

requireText("passwords", "isPasswordReusedWithClient", "password-history checks must run inside the credential transaction");
requireText("passwords", 'throw new Error("password_history_unavailable")', "password-history authority must fail closed");
rejectText("passwords", "if (!dbResult.enabled || !dbResult.value.length) return false", "database outages may not permit password reuse");

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

for (const target of ["refreshRoute", "twoFactor", "webauthn"]) {
  requireText(target, "if (!registered)", "every ordinary token-issuing path must fail on missing durable access-session evidence");
  rejectText(target, "void registerSession", "token issuance may not fire-and-forget session registration");
}
requireText("refreshRoute", "verifyCsrfOrigin(req)", "refresh rotation must enforce same-origin mutation authority");
requireText("refreshRoute", "if (!oldRevoked)", "refresh rotation must prove the old refresh token was revoked");

requireText("password", "withTx<RotationTransactionResult>", "password and credential rotation must share one PostgreSQL transaction");
requireText("password", "FOR UPDATE", "password rotation must lock the account row");
requireText("password", "isPasswordReusedWithClient", "password reuse checks must run inside the transaction");
requireText("password", "revokeAllSessionsWithClient", "all old access sessions must be revoked inside the transaction");
requireText("password", "revokeAllRefreshTokensForUserWithClient", "all old refresh tokens must be revoked inside the transaction");
requireText("password", "persistPreparedRefreshTokenWithClient", "replacement refresh persistence must be part of the transaction");
requireText("password", "registerSessionWithClient", "replacement access persistence must be part of the transaction");
requireText("password", "rolledBack: true", "transaction failures must disclose rollback semantics");
requireText("password", "credential_rotation_cache_unavailable", "post-commit Redis failures must require reauthentication");
requireText("password", "atomic: true", "successful password rotation must disclose atomic authority");
rejectText("password", "isPasswordReused(userId", "password reuse may not run in a separate DB operation");
rejectText("password", "revokeAllSessionsStrict(userId)", "password revocation may not run after the password transaction");
rejectText("password", "issueRefreshToken({", "replacement refresh issuance may not persist outside the transaction");

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
requireText("passwordTests", "commits the password, all revocations and exactly one fresh credential pair together", "password tests must prove one atomic success state");
requireText("passwordTests", "without mutating the password or credentials", "password reuse must leave all credential state unchanged");
requireText("passwordTests", "rolls back the password and every revocation", "replacement persistence failures must roll back all credential changes");
requireText("passwordTests", "password-history authority is unavailable", "password-history outages must fail closed");
requireText("legacyTests", "disables legacy cookie authentication by default in production", "legacy authentication must be off by default in production");
requireText("legacyTests", "explicit window before the immutable sunset", "legacy authentication must require a short pre-sunset migration window");
requireText("legacyTests", "slide beyond the immutable sunset", "legacy compatibility tests must reject configuration-based extensions");
requireText("ttlTests", "one four-hour default for JWT", "access TTL tests must prove JWT and cookie alignment");
requireText("ttlTests", "explicitly shorter lifetime aligned", "access TTL tests must preserve safe shorter deployments");
requireText("ttlTests", "caps unsafe runtime configuration", "access TTL tests must reject or cap overlong sessions");
requireText("reviewTests", "replacement access cookies are written only after durable JTI registration", "replacement-cookie tests must prove durable evidence before response use");
requireText("reviewTests", "legacy sliding access-cookie refresh is disabled", "renewal tests must enforce refresh-token rotation");
requireText("reviewTests", "Redis-REST-only auth deployments", "environment tests must distinguish rate-limit and revocation Redis");

if (failures.length) {
  console.error("Authentication session authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Authentication session authority check passed: dedicated secrets, aligned four-hour access lifetime, durable issuance and replacement cookies, strict shared Redis authority, disabled sliding access renewal, fail-closed profile claims, duplicate-JTI rejection, owner-bound and recoverable single/bulk revocation, atomic password and credential rotation, fail-closed password history, refresh invalidation across devices, deny-only caching, immutable legacy-cookie retirement, focused CI evidence, same-origin refresh rotation, route-level CSRF/forgery/logout tests, PostgreSQL/Redis rollback tests and verified token forwarding are enforced.");
