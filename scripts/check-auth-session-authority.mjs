import { readFile } from "node:fs/promises";

const files = {
  package: "package.json",
  ci: ".github/workflows/ci.yml",
  env: "scripts/validate-env.mjs",
  legacyTests: "src/tests/security/auth-session-authority-postgres.test.ts",
  transactionalTests: "src/tests/security/auth-session-transactional-authority-postgres.test.ts",
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
  authority: "src/lib/security/session-authority.ts",
  migration: "src/lib/db-migrate-session-authority.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  academyAuth: "src/app/api/academy-auth/route.ts",
  profileRoute: "src/app/api/academy-student-profile/route.ts",
  sessionsRoute: "src/app/api/auth/sessions/route.ts",
  specificSessionRoute: "src/app/api/auth/sessions/[id]/route.ts",
  refreshRoute: "src/app/api/auth/refresh/route.ts",
  twoFactor: "src/app/api/auth/2fa/verify/route.ts",
  webauthn: "src/app/api/auth/webauthn/auth/verify/route.ts",
  devicesRoute: "src/app/api/auth/devices/route.ts",
  deviceByIdRoute: "src/app/api/auth/devices/[id]/route.ts",
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
requireText("package", '"test:auth-session"', "focused auth tests need a governed command");
requireText("package", "src/tests/security/auth-*.test.ts", "focused auth command must include route and authority suites");
requireText("ci", "Authentication session authority guard", "CI must run the auth authority guard");
requireText("ci", "Authentication session integration tests", "CI must run focused auth tests");
requireText("ci", "npm run auth:check", "CI must invoke auth:check");
requireText("ci", "npm run test:auth-session", "CI must invoke test:auth-session");

requireText("env", "must be distinct", "production must reject reused auth secrets");
requireText("env", "4-hour security ceiling", "production must reject overlong access sessions");
requireText("env", "REDIS_URL is required in production", "strict revocation requires shared Redis");
requireText("env", "TECPEY_LEGACY_AUTH_UNTIL", "legacy compatibility needs an explicit cutoff");
requireText("env", "immutable 2026-08-18", "legacy compatibility needs a code-owned sunset");

for (const target of ["unified", "legacySession"]) {
  requireText(target, "TECPEY_SESSION_SECRET", "access sessions must use the canonical secret");
  rejectText(target, "JWT_SECRET", "generic access-session secret fallback is forbidden");
  rejectText(target, "NEXTAUTH_SECRET", "NextAuth secret fallback is forbidden");
}
requireText("platform", "ACCESS_SESSION_MAX_AGE_SECONDS = 4 * 60 * 60", "access sessions need a four-hour ceiling");
requireText("platform", "return `${sessionMaxAgeSeconds()}s`", "JWT and cookie duration must share authority");
requireText("refresh", "ACCESS_COOKIE_TTL_S = sessionMaxAgeSeconds()", "access cookie lifetime must match JWT authority");
requireText("refresh", "TECPEY_REFRESH_SECRET", "refresh tokens require a dedicated secret");
requireText("refresh", "prepareRefreshToken", "refresh tokens must be prepared before transaction admission");
requireText("refresh", "verifyRefreshTokenSignature", "refresh signature validation must be separable from durable rotation");
requireText("refresh", "persistPreparedRefreshTokenWithClient", "caller-owned transactions need refresh persistence injection");
rejectText("refresh", "process.env.TECPEY_SESSION_SECRET", "refresh tokens cannot fall back to access secret");
rejectText("refresh", "process.env.JWT_SECRET", "refresh tokens cannot use generic JWT secret");

requireText("unified", "setUnifiedSessionCookie_async_required", "unawaited cookie signing must fail explicitly");
requireText("sessionRefresh", "refresh_token_rotation_required", "sliding access renewal must remain disabled");
rejectText("sessionRefresh", "setUnifiedSessionCookieAsync", "renewal helpers cannot bypass refresh rotation");
requireText("legacySession", "getSessionToken", "server forwarding needs a verified raw token contract");
requireText("api", "Authenticated session required", "API forwarding cannot emit an empty Bearer header");

requireText("profileRoute", 'process.env.NODE_ENV !== "production" &&', "profile filesystem fallback cannot run in production");
requireText("profileRoute", "strictRevocation: true", "profile mutations require strict revocation");
requireText("profileRoute", "session_registry_unavailable", "profile replacement sessions must fail closed");

requireText("authSession", "type JtiCacheEntry = { revoked: true", "only deny decisions may be cached");
rejectText("authSession", "revoked: false", "cached allow decisions are forbidden");
requireText("authSession", "legacyCookieCompatibilityEnabled", "legacy acceptance must use one governed cutoff");
requireText("authSession", "LEGACY_AUTH_HARD_SUNSET", "legacy retirement needs an immutable sunset");
requireText("authSession", "revocation check failed — blocking", "revocation exceptions must fail closed");

requireText("jti", "durableSessionState", "PostgreSQL must back JTI decisions");
requireText("jti", "Redis miss is not proof of validity", "Redis misses cannot imply active authority");
requireText("jti", "durable revocation authority unavailable — blocking", "DB outages must block");
requireText("jti", "strict Redis check failed — blocking", "strict Redis outages must block");

requireText("sessionStore", "registerSessionWithClient", "legacy callers need transaction-injected access registration");
requireText("sessionStore", "listActiveSessionsStrict", "session listing must expose DB outages");
requireText("sessionStore", "ON CONFLICT (id) DO NOTHING", "duplicate JTI admission must be explicit");
requireText("sessionStore", "RETURNING id", "durable insertion must be proven");
requireText("passwords", "isPasswordReusedWithClient", "password history must support caller-owned transactions");
requireText("passwords", 'throw new Error("password_history_unavailable")', "password history must fail closed");

requireText("migration", 'FILENAME = "0035_session_authority.sql"', "session authority needs a canonical migration");
for (const schemaEvidence of [
  "refresh_token_families",
  "refresh_family_id",
  "known_device_id",
  "session_revocation_outbox",
  "session_revocation_outbox_pending_idx",
  "is_active BOOLEAN NOT NULL DEFAULT TRUE",
]) {
  requireText("migration", schemaEvidence, `missing session authority schema evidence ${schemaEvidence}`);
}
requireText("migration", "COUNT(DISTINCT user_id) > 1", "migration must reject cross-user legacy family collisions");
requireText("migration", "tecpey_sensitive_audit_has_forbidden_key", "database metadata redaction policy must be extended");
requireText("migrationPlan", "runSessionAuthorityMigrations", "canonical migration plan must run session authority schema");

requireText("authority", 'import { withDb, withTx } from "@/lib/db"', "session authority must use canonical DB wrappers");
requireText("authority", "writeSensitiveMutationAuditTx", "session mutations require mandatory evidence");
requireText("authority", "FOR UPDATE", "rotation and revocation decisions require row locking");
requireText("authority", "refresh_token_families", "session authority must own refresh families");
requireText("authority", "session_revocation_outbox", "Redis publication must be repairable");
requireText("authority", "publishPendingSessionRevocations", "outbox publication must have a retry authority");
requireText("authority", "admitSessionAuthority", "initial login tuple needs one authority");
requireText("authority", "rotateSessionAuthority", "refresh rotation needs one authority");
requireText("authority", "revokeSessionAuthority", "selected-session revocation needs one authority");
requireText("authority", "revokeOtherSessionsAuthority", "bulk revocation needs one authority");
requireText("authority", "logoutSessionAuthority", "logout needs one authority");
requireText("authority", "renameKnownDeviceAuthority", "device rename needs typed transactional evidence");
requireText("authority", "removeKnownDeviceAuthority", "device removal must revoke bound authority");
for (const action of [
  "session.issue",
  "session.refresh.rotate",
  "session.refresh.reuse_detected",
  "session.revoke",
  "session.revoke_all",
  "session.logout",
  "device.rename",
  "device.remove",
]) {
  requireText("authority", action, `missing mandatory action ${action}`);
}
for (const resource of ["auth_session", "refresh_family", "known_device"]) {
  requireText("authority", resource, `missing typed resource ${resource}`);
}
rejectText("authority", "writeAudit(", "best-effort audit cannot satisfy session authority");

for (const target of ["academyAuth", "twoFactor", "webauthn"]) {
  requireText(target, "admitSessionAuthority", "every login path must delegate durable admission");
  requireText(target, "prepareRefreshToken", "tokens must be prepared before authority admission");
  rejectText(target, "issueRefreshToken({", "login routes cannot persist refresh authority separately");
  rejectText(target, "registerSession({", "login routes cannot persist access authority separately");
  rejectText(target, "markDeviceSeen", "login routes cannot persist device state separately");
}
requireText("academyAuth", "logoutSessionAuthority", "logout must use transactional authority");
rejectText("academyAuth", "revokeSessionStrict", "logout cannot sequence access revocation separately");
rejectText("academyAuth", "revokeAllRefreshTokensForUser", "logout cannot sequence refresh revocation separately");

requireText("refreshRoute", "verifyRefreshTokenSignature", "refresh route must validate signed claims before account lookup");
requireText("refreshRoute", "rotateSessionAuthority", "refresh route must delegate locked rotation");
requireText("refreshRoute", "prepareRefreshToken", "replacement refresh must be prepared before transaction");
rejectText("refreshRoute", "revokeRefreshToken", "refresh route cannot revoke the old token separately");
rejectText("refreshRoute", "issueRefreshToken({", "refresh route cannot persist replacement separately");
rejectText("refreshRoute", "registerSession({", "refresh route cannot persist access JTI separately");
rejectText("refreshRoute", "writeAudit(", "refresh route cannot use best-effort login evidence");

requireText("sessionsRoute", "listActiveSessionsStrict", "session listing must remain fail closed");
requireText("sessionsRoute", "revokeOtherSessionsAuthority", "bulk session revocation must use authority");
rejectText("sessionsRoute", "revokeAllSessionsStrict", "route-side access revocation sequencing is forbidden");
rejectText("sessionsRoute", "revokeAllRefreshTokensForUser", "route-side refresh revocation sequencing is forbidden");
requireText("specificSessionRoute", "revokeSessionAuthority", "selected session revocation must target its family");
rejectText("specificSessionRoute", "revokeSessionStrict", "selected route cannot mutate access state separately");
rejectText("specificSessionRoute", "revokeAllRefreshTokensForUser", "selected route cannot broadly revoke refresh authority");

requireText("devicesRoute", "listKnownDevicesAuthority", "device listing must fail truthfully through authority");
rejectText("devicesRoute", "apiOk({ devices: [] })", "DB outage cannot masquerade as an empty device list");
requireText("deviceByIdRoute", "renameKnownDeviceAuthority", "device rename must use authority");
requireText("deviceByIdRoute", "removeKnownDeviceAuthority", "device removal must use authority");
rejectText("deviceByIdRoute", "writeAudit(", "generic best-effort device audit is forbidden");
rejectText("deviceByIdRoute", "withDb(", "device mutations cannot sequence route-owned DB writes");

requireText("password", "withTx<RotationTransactionResult>", "password rotation must remain atomic");
requireText("password", "FOR UPDATE", "password rotation must lock account state");
requireText("password", "persistPreparedRefreshTokenWithClient", "password rotation replacement refresh must share transaction");
requireText("password", "registerSessionWithClient", "password rotation access session must share transaction");
rejectText("password", "issueRefreshToken({", "password route cannot persist replacement separately");

for (const evidence of [
  "commits refresh family, refresh token, access session, device and secret-free evidence atomically",
  "rolls back the entire admission tuple when mandatory evidence conflicts",
  "allows at most one concurrent rotation and turns the loser into durable reuse handling",
  "keeps durable revocation and a repairable outbox when Redis is unavailable",
  "prevents cross-principal revocation and removes a device with its bound family",
]) {
  requireText("transactionalTests", evidence, `missing transactional session evidence: ${evidence}`);
}
requireText("legacyTests", "duplicate JTI registration", "legacy session tests must retain duplicate-JTI rejection");
requireText("legacyTests", "exact owner", "legacy session tests must retain owner-bound revocation");
requireText("legacyTests", "prior non-strict allow", "strict revocation cache bypass must remain tested");
requireText("legacyTests", "without PostgreSQL authority", "DB-unavailable issuance must remain tested");

if (failures.length) {
  console.error("Authentication session authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Authentication session authority check passed: dedicated token secrets, aligned access lifetime, one transaction-coupled login and refresh authority, locked rotation and reuse handling, family/device binding, typed append-only evidence, durable Redis repair outbox, fail-closed device reads, owner-bound revocation, legacy retirement and focused PostgreSQL/Redis evidence are enforced.",
);
