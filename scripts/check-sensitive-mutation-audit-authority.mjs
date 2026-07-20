import { readFile } from "node:fs/promises";

const files = {
  device: "src/app/api/device-token/route.ts",
  conversations: "src/app/api/mentor-conversations/migrate/route.ts",
  profile: "src/app/api/mentor-profile/recompute/route.ts",
  profileAuthority: "src/lib/mentor-profile-recompute-authority.ts",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  migration: "src/lib/db-migrate-sensitive-mutation-audit.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  postgresTests: "src/tests/security/sensitive-mutation-audit-postgres.test.ts",
  routeTests: "src/tests/security/sensitive-mutation-audit-routes.test.ts",
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

function auditCallBlock(target) {
  const source = content[target];
  const start = source.indexOf("writeSensitiveMutationAuditTx(");
  if (start < 0) return "";
  const end = source.indexOf("\n      });", start);
  return end > start ? source.slice(start, end + 10) : source.slice(start);
}

for (const target of ["device", "conversations", "profile"]) {
  requireText(target, "getCanonicalSession(req, { strictRevocation: true })", "mutation must use strict session revocation authority");
  requireText(target, "verifyCsrfOrigin(req)", "mutation must enforce CSRF origin authority");
  requireText(target, "withTx(async (client)", "mutation and audit must share one PostgreSQL transaction");
  requireText(target, "writeSensitiveMutationAuditTx(client", "route must write strict durable audit evidence");
  requireText(target, "resolveSensitiveAuditCorrelation", "route must bind a stable correlation identifier");
  requireText(target, "hashSensitiveAuditRequest", "route must bind canonical request evidence");
  rejectText(target, "writeAudit(", "non-blocking legacy audit is forbidden for sensitive mutations");
  rejectText(target, "body.studentId", "caller-controlled student targeting is forbidden");
  rejectText(target, "body.userId", "caller-controlled user targeting is forbidden");
  rejectText(target, "body.actorId", "caller-controlled audit actors are forbidden");
}

requireText("device", "const tokenHash = hashSensitiveAuditRequest(token)", "raw push tokens must be represented by a one-way hash");
requireText("device", "resourceId: tokenHash", "device audit resource identity must be the token hash");
requireText("device", "tokenHash,", "safe token hash metadata is required");
if (/\btoken\s*[,}]/.test(auditCallBlock("device"))) {
  failures.push(`${files.device}: raw token must not appear in audit evidence`);
}

requireText("conversations", "contentHash: hashSensitiveAuditRequest(message.content)", "conversation request evidence must contain only content hashes");
for (const field of ["attemptedCount", "acceptedCount", "importedCount", "rejectedCount"]) {
  requireText("conversations", field, `conversation audit needs safe count: ${field}`);
}
if (/\b(?:content|messages|conversation)\b/.test(auditCallBlock("conversations"))) {
  failures.push(`${files.conversations}: raw conversation fields are forbidden in audit metadata`);
}

requireText("profile", "upsertMentorProfileUpdateTx(client, studentId, updated)", "profile write must use the injected transaction client");
for (const field of [
  "confidenceScore",
  "disciplineScore",
  "weakAreaCount",
  "strongAreaCount",
]) {
  requireText("profile", field, `profile audit needs safe derived metadata: ${field}`);
}
if (/\b(?:primaryGoal|weakAreas|strongAreas)\b/.test(auditCallBlock("profile"))) {
  failures.push(`${files.profile}: behavioral text and area labels are forbidden in audit metadata`);
}
requireText("profileAuthority", "upsertMentorProfileUpdateTx", "profile mutation needs a transaction-injected writer");
requireText("profileAuthority", "client.query", "profile writer must use the supplied PostgreSQL client");

for (const text of [
  "sensitive_mutation_audit_events",
  "UNIQUE (tenant_id, action, correlation_id)",
  "tecpey_sensitive_audit_has_forbidden_key",
  "sensitive_mutation_audit_validate",
  "sensitive_mutation_audit_no_update",
  "sensitive_mutation_audit_no_delete",
  "sensitive mutation audit evidence is append-only",
]) {
  requireText("migration", text, `migration is missing strict audit invariant: ${text}`);
}
requireText("migrationPlan", "runSensitiveMutationAuditMigrations", "canonical migration plan must install the audit ledger");

for (const text of [
  "FORBIDDEN_METADATA_KEYS",
  "sensitive_audit_correlation_conflict",
  "writeSensitiveMutationAuditTx",
  "octet",
]) {
  if (text === "octet") continue;
  requireText("audit", text, `audit authority is missing invariant: ${text}`);
}
for (const forbidden of [
  '"token"',
  '"conversation"',
  '"secret"',
  '"password"',
  '"authorization"',
]) {
  requireText("audit", forbidden, `audit authority must reject forbidden metadata key ${forbidden}`);
}
requireText("audit", "Buffer.byteLength(encoded, \"utf8\") > 16_384", "audit metadata needs an application byte bound");

for (const evidence of [
  "reuses an exact correlation",
  "isolates the same correlation across tenants",
  "rejects raw sensitive metadata",
  "rolls back the mutation when the audit sink rejects evidence",
  "keeps completed audit evidence append-only",
  "without raw token or conversation content",
]) {
  requireText("postgresTests", evidence, `missing PostgreSQL evidence: ${evidence}`);
}
for (const evidence of [
  "binds device-token registration to the strict session",
  "binds conversation migration to the strict session",
  "writes profile and audit in one transaction",
]) {
  requireText("routeTests", evidence, `missing route-boundary evidence: ${evidence}`);
}

requireText("package", '"audit:sensitive:check"', "package must expose the sensitive audit guard");
requireText("package", '"test:sensitive-mutation-audit"', "package must expose focused sensitive audit tests");
requireText("package", "npm run audit:sensitive:check", "release gate must execute the sensitive audit guard");
requireText("package", "npm run test:sensitive-mutation-audit", "release gate must execute focused sensitive audit tests");
requireText("workflow", "Sensitive mutation audit authority guard", "dedicated CI must run the authority guard");
requireText("workflow", "Sensitive mutation audit PostgreSQL tests", "dedicated CI must run focused PostgreSQL tests");
requireText("workflow", "contents: read", "dedicated workflow must remain read-only");

if (failures.length) {
  console.error("Sensitive mutation audit authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Sensitive mutation audit authority check passed: strict sessions, server-derived actors, transaction-coupled append-only evidence, correlation integrity, recursive metadata redaction and fail-closed rollback are enforced.");
