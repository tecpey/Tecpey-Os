import { readFile } from "node:fs/promises";

const files = {
  exactRoute: "src/app/api/auth/sessions/[id]/route.ts",
  bulkRoute: "src/app/api/auth/sessions/route.ts",
  exactAuthority: "src/lib/security/session-revocation-authority.ts",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  tests: "src/tests/security/session-revocation-audit-postgres.test.ts",
  package: "package.json",
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

for (const target of ["exactRoute", "bulkRoute"]) {
  requireText(target, "getCanonicalSession(req, { strictRevocation: true })", "session revocation must use strict canonical identity");
  requireText(target, "verifyCsrfOrigin(req)", "session revocation must enforce CSRF origin authority");
  requireText(target, "PLATFORM.DEFAULT_TENANT_ID", "tenant authority must be server-derived");
  requireText(target, "extractJtiFromToken", "current access-session evidence must be server-derived");
  requireText(target, "resolveSensitiveAuditCorrelation", "command must bind stable correlation evidence");
  requireText(target, "hashSensitiveAuditRequest", "command must bind canonical request evidence");
  requireText(target, "withTx", "access, refresh and audit mutations must share one PostgreSQL transaction");
  requireText(target, "writeSensitiveMutationAuditTx(client", "mandatory evidence must be admitted before commit");
  requireText(target, "revokeAllRefreshTokensForUserWithClient", "refresh authority must be revoked in the same transaction");
  requireText(target, "clearRefreshCookie", "revoked refresh browser authority must be cleared");
  requireText(target, "session-revocation-v1", "audit evidence must bind a policy version");
  rejectText(target, "writeAudit(", "best-effort audit cannot prove session revocation");
  rejectText(target, "req.headers.get(\"authorization\")", "authorization headers must not become revocation authority or evidence");
}

requireText("exactRoute", "revokeExactSessionWithClient(client, sessionId, userId)", "exact session mutation needs a transaction-injected principal-scoped writer");
requireText("exactRoute", 'action: "session.revoke_one"', "exact session command needs a dedicated audit action");
requireText("exactRoute", 'resourceType: "access_session"', "exact session evidence needs a hashed access-session resource");
requireText("exactRoute", "targetSessionEvidenceHash", "raw target JTI must be represented only by a one-way evidence hash");
requireText("exactRoute", "revokeJti(", "Redis exact-session deny projection must run after commit");

requireText("bulkRoute", "revokeAllSessionsWithClient(client, userId, currentJti)", "bulk access revocation must use the transaction-injected writer");
requireText("bulkRoute", 'action: "session.revoke_others"', "bulk session command needs a dedicated audit action");
requireText("bulkRoute", 'resourceType: "session_authority"', "bulk evidence needs a principal authority resource");
requireText("bulkRoute", "revokeMultiple(", "Redis bulk deny projection must run after commit");
requireText("bulkRoute", "currentAccessRetained: true", "bulk command must preserve and declare the current access session");

requireText("exactAuthority", "PoolClient", "exact revocation helper must accept the caller transaction client");
requireText("exactAuthority", "WHERE id = $1", "exact session lookup must bind the requested JTI");
requireText("exactAuthority", "AND user_id = $2", "exact session lookup must be principal-scoped");
requireText("exactAuthority", "is_revoked", "already-revoked owned sessions must support idempotent projection repair");
rejectText("exactAuthority", "withDb(", "transaction-injected helper must not open an independent database operation");
rejectText("exactAuthority", "revokeJti(", "Redis projection is forbidden inside the PostgreSQL helper");

for (const token of [
  "session.revoke_one",
  "session.revoke_others",
  "access_session",
  "session_authority",
]) {
  requireText("audit", token, `sensitive audit type registry is missing ${token}`);
}

for (const evidence of [
  "commits exact access and refresh revocation with one secret-free event",
  "rolls back exact access and refresh revocation when audit admission fails",
  "does not revoke or reveal another principal's session",
  "rejects changed target replay and rolls back the second revocation",
  "atomically revokes other access sessions and all refresh authority",
  "keeps committed session evidence truthful when Redis projection fails",
]) {
  requireText("tests", evidence, `missing session revocation adversarial evidence: ${evidence}`);
}

requireText("package", "check-session-revocation-audit-authority.mjs", "permanent session revocation guard must be part of the audit command");
requireText("package", "session-revocation-audit-postgres.test.ts", "focused sensitive audit suite must execute session revocation tests");

if (failures.length > 0) {
  console.error("Session revocation audit authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Session revocation audit authority check passed: exact and bulk commands use strict server identity, one PostgreSQL transaction, secret-free append-only evidence and post-commit Redis deny projection.");
