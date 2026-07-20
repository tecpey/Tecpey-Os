import { readFile } from "node:fs/promises";

const files = {
  academyAuth: "src/app/api/academy-auth/route.ts",
  twoFactorVerify: "src/app/api/auth/2fa/verify/route.ts",
  webauthnVerify: "src/app/api/auth/webauthn/auth/verify/route.ts",
  refresh: "src/app/api/auth/refresh/route.ts",
  sessions: "src/app/api/auth/sessions/route.ts",
  sessionById: "src/app/api/auth/sessions/[id]/route.ts",
  devices: "src/app/api/auth/devices/route.ts",
  deviceById: "src/app/api/auth/devices/[id]/route.ts",
  authority: "src/lib/security/session-authority.ts",
  context: "src/lib/security/session-route-context.ts",
  migration: "src/lib/db-migrate-session-authority.ts",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  postgresTests: "src/tests/security/session-device-transactional-authority-postgres.test.ts",
  repair: "scripts/reconcile-session-revocations.ts",
  package: "package.json",
  workflow: ".github/workflows/sensitive-mutation-audit.yml",
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
const countText = (target, text) => content[target].split(text).length - 1;

const issuanceRoutes = ["academyAuth", "twoFactorVerify", "webauthnVerify"];
for (const target of issuanceRoutes) {
  requireText(target, "prepareRefreshToken({", "login route must prepare refresh material without persisting it");
  requireText(target, "admitSession({", "login route must delegate durable admission to the transactional authority");
  requireText(target, "extractJtiFromToken", "login route must bind the signed access JTI before admission");
  requireText(target, "extractExpFromToken", "login route must bind access expiry before admission");
  requireText(target, "setRefreshCookie(response", "refresh cookie may be published only after authority success");
  rejectText(target, "issueRefreshToken({", "route-side refresh persistence is forbidden");
  rejectText(target, "registerSession({", "route-side access-session persistence is forbidden");
  rejectText(target, "markDeviceSeen(", "route-side known-device persistence is forbidden");
  rejectText(target, "revokeAllRefreshTokensForUser(", "best-effort cleanup cannot replace atomic admission");
  rejectText(target, "writeAudit(", "best-effort audit cannot satisfy mandatory session evidence");
}

requireText("academyAuth", 'return apiError("authentication_policy_unavailable", 503)', "password login must fail closed when 2FA policy state is unavailable");
requireText("academyAuth", 'action: "session.logout"', "logout must use typed transactional evidence");
requireText("academyAuth", "revokeExactSession({", "logout must revoke the bound session family through one authority");

requireText("refresh", "verifyRefreshTokenClaims", "refresh route must cryptographically preflight claims without durable acceptance");
requireText("refresh", "rotateSession({", "refresh route must delegate locked rotation to the authority");
requireText("refresh", "prepareRefreshToken({", "replacement refresh material must be prepared before the transaction");
requireText("refresh", "clearRefreshCookie(response)", "invalid/reused refresh authority must clear the client cookie");
rejectText("refresh", "verifyRefreshToken(", "legacy unlocked refresh verification is forbidden");
rejectText("refresh", "revokeRefreshToken(", "route-side old-token revocation is forbidden");
rejectText("refresh", "issueRefreshToken(", "route-side replacement persistence is forbidden");
rejectText("refresh", "registerSession(", "route-side access-session persistence is forbidden");
rejectText("refresh", "writeAudit(", "best-effort refresh evidence is forbidden");

requireText("sessions", "revokeAllUserSessions({", "bulk revocation must use the transactional authority");
requireText("sessionById", "revokeExactSession({", "exact revocation must use bound-family authority");
requireText("sessionById", 'refreshScope: "bound_family"', "exact revocation must not claim all-user refresh scope");
for (const target of ["sessions", "sessionById"]) {
  rejectText(target, "revokeSessionStrict(", "route-side split access revocation is forbidden");
  rejectText(target, "revokeAllRefreshTokensForUser(", "route-side split refresh revocation is forbidden");
  rejectText(target, "writeAudit(", "best-effort revocation evidence is forbidden");
}

requireText("devices", "listKnownDevicesStrict", "known-device reads must distinguish database outage from an empty registry");
requireText("devices", 'return apiError("device_registry_unavailable", 503)', "known-device reads must fail closed");
requireText("deviceById", "renameKnownDevice({", "device rename must use the transactional authority");
requireText("deviceById", "removeKnownDevice({", "device removal must revoke bound authority transactionally");
rejectText("deviceById", "DELETE FROM known_devices", "device removal must retain durable inactive history");
rejectText("deviceById", "writeAudit(", "best-effort device evidence is forbidden");

requireText("context", "PLATFORM.DEFAULT_TENANT_ID", "session tenant authority must be server-derived");
requireText("context", "resolveSensitiveAuditCorrelation", "session evidence must bind stable correlation identity");
requireText("context", "hashSensitiveAuditRequest", "session evidence must bind canonical request evidence");

requireText("authority", 'import { withDb, withTx } from "@/lib/db"', "session authority must use canonical PostgreSQL wrappers");
requireText("authority", "SELECT id, family_id, user_id, is_revoked, expires_at", "refresh rotation must select authoritative refresh state");
requireText("authority", "FOR UPDATE", "refresh/session/device lifecycle decisions must lock authoritative rows");
requireText("authority", "insertRefreshTokenTx", "refresh insertion must be transaction-injected");
requireText("authority", "insertAccessSessionTx", "access-session insertion must be transaction-injected");
requireText("authority", "upsertKnownDeviceTx", "known-device persistence must share admission transactions");
requireText("authority", "session_revocation_outbox", "Redis deny publication must have durable repair authority");
requireText("authority", "revokeMultiple", "outbox publisher must populate the Redis deny cache");
requireText("authority", "writeSensitiveMutationAuditTx(client", "state and mandatory evidence must share one transaction");
requireText("authority", "session.refresh.reuse_detected", "refresh reuse must have a governed incident outcome");
requireText("authority", "refresh_family_id", "access sessions must bind to refresh families");
requireText("authority", "known_device_id", "session and refresh authority must bind to known devices");
requireText("authority", "tecpey-session-v1\\0", "session evidence identifiers must be one-way and domain separated");
rejectText("authority", "writeAudit(", "legacy best-effort audit cannot satisfy session authority");

if (countText("authority", "withTx(async (client)") < 7) {
  failures.push(`${files.authority}: admission, rotation, revocation and device mutations must remain transaction-backed`);
}

for (const field of [
  "refresh_family_id TEXT",
  "refresh_token_id TEXT",
  "known_device_id TEXT",
  "CREATE TABLE IF NOT EXISTS session_revocation_outbox",
  "UNIQUE(session_jti)",
  "user_sessions_refresh_token_fk",
  "user_sessions_known_device_fk",
  "refresh_tokens_known_device_fk",
]) {
  requireText("migration", field, `session authority migration is missing ${field}`);
}

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
  requireText("authority", action, `missing session/device authority action ${action}`);
  requireText("audit", action, `sensitive audit type is missing ${action}`);
}
for (const resource of ["auth_session", "refresh_family", "known_device"]) {
  requireText("audit", resource, `sensitive audit resource is missing ${resource}`);
}
for (const forbidden of [
  '"ip"',
  '"useragent"',
  '"device_info"',
  '"access_token"',
  '"refresh_token"',
  '"jti"',
]) {
  requireText("audit", forbidden, `mandatory evidence policy must reject ${forbidden}`);
}

for (const evidence of [
  "commits refresh, access session, known device and secret-free evidence atomically",
  "rolls back the complete admission tuple when mandatory evidence is rejected",
  "rolls back a replacement refresh row when the access JTI conflicts",
  "allows at most one concurrent rotation and revokes the family on reuse",
  "rejects changed correlation replay and rolls back the second admission",
  "binds exact-session revocation to the owner and its refresh family",
  "device removal revokes only device-bound refresh and access authority",
  "retains durable pending revocation evidence and repairs it after Redis returns",
]) {
  requireText("postgresTests", evidence, `missing session authority evidence: ${evidence}`);
}

requireText("repair", "repairPendingSessionRevocations", "a durable outbox repair command is required");
requireText("package", "node scripts/check-session-transactional-authority.mjs", "release guards must include the session authority source guard");
requireText("package", "src/tests/security/session-device-transactional-authority-postgres.test.ts", "focused audit tests must include session authority evidence");
requireText("package", "reconcile-session-revocations.ts", "operations must expose the revocation repair command");
requireText("workflow", "npm run audit:sensitive:check", "dedicated workflow must execute composed authority guards");
requireText("workflow", "npm run test:sensitive-mutation-audit", "dedicated workflow must execute PostgreSQL authority evidence");
requireText("workflow", "contents: read", "dedicated workflow must remain read-only");

if (failures.length) {
  console.error("Session transactional authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Session transactional authority check passed: atomic admission and rotation, refresh-family/device binding, durable Redis repair, typed evidence, strict reads and permanent route guards are enforced.",
);
