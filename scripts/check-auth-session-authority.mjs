import { readFile } from "node:fs/promises";

const files = {
  package: "package.json",
  ci: ".github/workflows/ci.yml",
  env: "scripts/validate-env.mjs",
  tests: "src/tests/security/auth-session-authority-postgres.test.ts",
  transactionalTests:
    "src/tests/security/session-device-transactional-authority-postgres.test.ts",
  logoutTests: "src/tests/security/auth-logout-route-postgres.test.ts",
  refreshTests: "src/tests/security/auth-refresh-route-postgres.test.ts",
  sessionsTests: "src/tests/security/auth-sessions-route-postgres.test.ts",
  specificSessionTests:
    "src/tests/security/auth-session-revoke-route-postgres.test.ts",
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
  sessionAuthority: "src/lib/security/session-authority.ts",
  sessionContext: "src/lib/security/session-route-context.ts",
  academyAuth: "src/app/api/academy-auth/route.ts",
  profileRoute: "src/app/api/academy-student-profile/route.ts",
  sessionsRoute: "src/app/api/auth/sessions/route.ts",
  specificSessionRoute: "src/app/api/auth/sessions/[id]/route.ts",
  refreshRoute: "src/app/api/auth/refresh/route.ts",
  twoFactor: "src/app/api/auth/2fa/verify/route.ts",
  webauthn: "src/app/api/auth/webauthn/auth/verify/route.ts",
  devices: "src/app/api/auth/devices/route.ts",
  deviceById: "src/app/api/auth/devices/[id]/route.ts",
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
requireText("package", "src/tests/security/auth-*.test.ts", "focused auth test command must include route-level suites");
requireText("package", "npm run test:auth-session", "release check must run focused auth integration tests");
requireText("package", "check-session-transactional-authority.mjs", "auth authority must include the transactional session guard");
requireText("ci", "Authentication session authority guard", "pull-request CI must run the auth authority guard");
requireText("ci", "npm run auth:check", "CI must invoke the governed auth command");
requireText("ci", "Authentication session integration tests", "pull-request CI must expose focused auth integration evidence");
requireText("ci", "npm run test:auth-session", "CI must execute the governed auth integration command");

requireText("env", "must be distinct", "production environment validation must reject reused auth secrets");
requireText("env", "4-hour security ceiling", "production validation must reject overlong access sessions");
requireText("env", "REDIS_URL is required in production", "strict session revocation must require shared Redis");
requireText("env", "Redis REST credentials alone are insufficient", "rate-limit Redis may not masquerade as revocation Redis");
requireText("env", "TECPEY_LEGACY_AUTH_UNTIL", "legacy compatibility must have an explicit cutoff");
requireText("env", "immutable 2026-08-18", "legacy compatibility must have a code-owned sunset");

for (const target of ["unified", "legacySession"]) {
  requireText(target, "TECPEY_SESSION_SECRET", "access sessions must use the canonical secret");
  rejectText(target, "JWT_SECRET", "access-session secret fallback is forbidden");
  rejectText(target, "NEXTAUTH_SECRET", "access-session secret fallback is forbidden");
}
requireText("platform", "ACCESS_SESSION_MAX_AGE_SECONDS = 4 * 60 * 60", "access JWTs need a four-hour ceiling");
requireText("platform", "return `${sessionMaxAgeSeconds()}s`", "JWT duration must derive from cookie lifetime authority");
requireText("refresh", "ACCESS_COOKIE_TTL_S = sessionMaxAgeSeconds()", "access cookie lifetime must share JWT lifetime authority");
requireText("refresh", "TECPEY_REFRESH_SECRET", "refresh tokens require a dedicated secret");
rejectText("refresh", "process.env.TECPEY_SESSION_SECRET", "refresh tokens may not fall back to the access secret");

requireText("unified", "setUnifiedSessionCookie_async_required", "unawaited cookie signing must fail explicitly");
requireText("unified", "registerSession", "legacy replacement cookies still require durable JTI registration");
requireText("sessionRefresh", "refresh_token_rotation_required", "legacy sliding access renewal must remain disabled");
rejectText("sessionRefresh", "setUnifiedSessionCookieAsync", "renewal helpers may not bypass refresh rotation");
requireText("legacySession", "getSessionToken", "server forwarding needs a verified raw token contract");
requireText("api", "getSessionToken", "API forwarding must use the verified raw access token");
requireText("api", "Authenticated session required", "API forwarding must not emit an empty Bearer header");

requireText("profileRoute", 'process.env.NODE_ENV !== "production" &&', "profile filesystem fallback must never run in production");
requireText("profileRoute", "strictRevocation: true", "profile claim mutations require strict revocation");
requireText("profileRoute", "academy_profile_service_unavailable", "profile reads and writes must fail without durable storage");

requireText("authSession", "type JtiCacheEntry = { revoked: true", "only deny decisions may be cached");
rejectText("authSession", "revoked: false", "cached allow decisions are forbidden");
requireText("authSession", "legacyCookieCompatibilityEnabled", "legacy cookies must use one governed cutoff");
requireText("authSession", "LEGACY_AUTH_HARD_SUNSET", "legacy-cookie retirement needs an immutable sunset");
requireText("authSession", "revocation check failed — blocking", "revocation exceptions must fail closed");

requireText("jti", "durableSessionState", "PostgreSQL must back JTI checks");
requireText("jti", "Redis miss is not proof of validity", "Redis misses must not imply an active session");
requireText("jti", "durable revocation authority unavailable — blocking", "ordinary auth must block without authority");
requireText("jti", "strict Redis check failed — blocking", "strict Redis outages must fail closed");

requireText("sessionStore", "registerSessionWithClient", "access-session registration must support caller-owned transactions");
requireText("sessionStore", "revokeAllSessionsWithClient", "bulk access revocation must support caller-owned transactions");
requireText("sessionStore", "listActiveSessionsStrict", "session listing must expose database unavailability");
requireText("refresh", "prepareRefreshToken", "refresh tokens must be signable before transactional persistence");
requireText("refresh", "persistPreparedRefreshTokenWithClient", "refresh persistence must support caller-owned transactions");
requireText("refresh", "revokeAllRefreshTokensForUserWithClient", "refresh revocation must support caller-owned transactions");

requireText("passwords", "isPasswordReusedWithClient", "password history must run inside credential transactions");
requireText("passwords", 'throw new Error("password_history_unavailable")', "password-history authority must fail closed");

for (const target of ["academyAuth", "twoFactor", "webauthn"]) {
  requireText(target, "prepareRefreshToken({", "every login path must prepare refresh material before admission");
  requireText(target, "admitSession({", "every login path must use one transactional admission authority");
  requireText(target, "setRefreshCookie(response", "cookies may be published only after admission succeeds");
  rejectText(target, "issueRefreshToken({", "route-side refresh persistence is forbidden");
  rejectText(target, "registerSession({", "route-side access-session persistence is forbidden");
  rejectText(target, "markDeviceSeen(", "route-side device persistence is forbidden");
  rejectText(target, "writeAudit(", "best-effort audit cannot satisfy session evidence");
}
requireText("academyAuth", "verifyUnifiedSession(sessionToken)", "logout must verify token identity");
requireText("academyAuth", "revokeExactSession({", "logout must revoke the bound family transactionally");
requireText("academyAuth", "authentication_policy_unavailable", "password login must fail closed when 2FA policy is unavailable");

requireText("refreshRoute", "verifyCsrfOrigin(req)", "refresh rotation must enforce same-origin authority");
requireText("refreshRoute", "verifyRefreshTokenClaims", "refresh route may only preflight cryptographic claims");
requireText("refreshRoute", "rotateSession({", "durable refresh acceptance must occur under row lock");
requireText("refreshRoute", "clearRefreshCookie(response)", "invalid refresh authority must be removed client-side");
rejectText("refreshRoute", "verifyRefreshToken(", "legacy unlocked refresh verification is forbidden");
rejectText("refreshRoute", "revokeRefreshToken(", "route-side split refresh revocation is forbidden");
rejectText("refreshRoute", "issueRefreshToken(", "route-side replacement persistence is forbidden");

requireText("sessionsRoute", "listActiveSessionsStrict", "session listing must fail closed");
requireText("sessionsRoute", "revokeAllUserSessions({", "logout-all must use transactional authority");
requireText("sessionsRoute", "currentAccessRetained", "logout-all must disclose retained access semantics");
requireText("specificSessionRoute", "revokeExactSession({", "specific revocation must bind owner and family");
requireText("specificSessionRoute", 'refreshScope: "bound_family"', "specific revocation must disclose family scope");
requireText("specificSessionRoute", 'return apiError("not_found", 404)', "foreign session IDs must not revoke authority");

requireText("devices", "listKnownDevicesStrict", "known-device reads must distinguish outages from empty state");
requireText("deviceById", "renameKnownDevice({", "device rename must be transactional");
requireText("deviceById", "removeKnownDevice({", "device removal must revoke bound authority");

requireText("sessionContext", "PLATFORM.DEFAULT_TENANT_ID", "session tenant authority must be server-derived");
requireText("sessionAuthority", "FOR UPDATE", "refresh rotation and mutations must lock authority rows");
requireText("sessionAuthority", "session_revocation_outbox", "Redis deny publication must be durably repairable");
requireText("sessionAuthority", "writeSensitiveMutationAuditTx(client", "session state and evidence must share transactions");
requireText("sessionAuthority", "session.refresh.reuse_detected", "refresh reuse must be governed evidence");
requireText("sessionAuthority", "refresh_family_id", "access sessions must bind to refresh families");
requireText("sessionAuthority", "known_device_id", "session authority must bind to known devices");

requireText("password", "withTx<RotationTransactionResult>", "password and credential rotation must share one PostgreSQL transaction");
requireText("password", "FOR UPDATE", "password rotation must lock the account row");
requireText("password", "persistPreparedRefreshTokenWithClient", "password rotation replacement refresh must be transactional");
requireText("password", "registerSessionWithClient", "password rotation replacement access must be transactional");

requireText("tests", "duplicate JTI registration", "legacy helper tests must reject duplicate session identity");
requireText("tests", "exact owner", "legacy helper tests must prove owner-bound revocation");
requireText("transactionalTests", "allows at most one concurrent rotation", "new tests must prove refresh race safety");
requireText("transactionalTests", "repairs it after Redis returns", "new tests must prove outbox repair");
requireText("logoutTests", "cross-origin logout", "route tests must prove CSRF rejection");
requireText("refreshTests", "cross-origin refresh rotation", "route tests must prove refresh CSRF rejection");
requireText("sessionsTests", "database unavailability", "bulk route tests must reject false success");
requireText("specificSessionTests", "does not belong to the principal", "foreign sessions must not mutate authority");
requireText("passwordTests", "rolls back the password and every revocation", "credential replacement failures must roll back");
requireText("legacyTests", "slide beyond the immutable sunset", "legacy compatibility may not be extended");
requireText("ttlTests", "one four-hour default for JWT", "access TTL tests must prove JWT/cookie alignment");
requireText("reviewTests", "legacy sliding access-cookie refresh is disabled", "renewal tests must enforce refresh rotation");

if (failures.length) {
  console.error("Authentication session authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Authentication session authority check passed: dedicated secrets, aligned access lifetime, transactional admission and rotation, owner/family/device binding, durable Redis repair, fail-closed 2FA policy and device reads, immutable legacy retirement, atomic credential rotation and route-level PostgreSQL/Redis evidence are enforced.",
);
