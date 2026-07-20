import { readFile } from "node:fs/promises";

const files = {
  device: "src/app/api/device-token/route.ts",
  conversations: "src/app/api/mentor-conversations/migrate/route.ts",
  profile: "src/app/api/mentor-profile/recompute/route.ts",
  profileAuthority: "src/lib/mentor-profile-recompute-authority.ts",
  apiKeysRoute: "src/app/api/api-keys/route.ts",
  apiKeyByIdRoute: "src/app/api/api-keys/[id]/route.ts",
  apiKeysAuthority: "src/lib/security/api-keys.ts",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  migration: "src/lib/db-migrate-sensitive-mutation-audit.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  postgresTests: "src/tests/security/sensitive-mutation-audit-postgres.test.ts",
  apiKeyPostgresTests: "src/tests/security/api-key-transactional-audit-postgres.test.ts",
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

function balancedObject(source, start) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function auditMetadataBlock(target) {
  const source = content[target];
  const auditStart = source.indexOf("writeSensitiveMutationAuditTx(");
  if (auditStart < 0) return "";
  const metadataStart = source.indexOf("metadata:", auditStart);
  if (metadataStart < 0) return "";
  const objectStart = source.indexOf("{", metadataStart);
  return objectStart >= 0 ? balancedObject(source, objectStart) : "";
}

function containsStoredKey(block, names) {
  return new RegExp(`\\b(?:${names.join("|")})\\s*(?=:|[,}])`).test(block);
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
  if (!auditMetadataBlock(target)) failures.push(`${files[target]}: audit metadata object must be statically identifiable`);
}

requireText("device", "const tokenHash = hashSensitiveAuditRequest(token)", "raw push tokens must be represented by a one-way hash");
requireText("device", "resourceId: tokenHash", "device audit resource identity must be the token hash");
requireText("device", "tokenHash,", "safe token hash metadata is required");
if (containsStoredKey(auditMetadataBlock("device"), ["token"])) failures.push(`${files.device}: raw token must not appear in audit metadata`);

requireText("conversations", "contentHash: hashSensitiveAuditRequest(message.content)", "conversation request evidence must contain only content hashes");
for (const field of ["attemptedCount", "acceptedCount", "importedCount", "rejectedCount"]) {
  requireText("conversations", field, `conversation audit needs safe count: ${field}`);
}
if (containsStoredKey(auditMetadataBlock("conversations"), ["content", "messages", "conversation"])) {
  failures.push(`${files.conversations}: raw conversation fields are forbidden in audit metadata`);
}

requireText("profile", "upsertMentorProfileUpdateTx(client, studentId, updated)", "profile write must use the injected transaction client");
for (const field of ["confidenceScore", "disciplineScore", "weakAreaCount", "strongAreaCount"]) {
  requireText("profile", field, `profile audit needs safe derived metadata: ${field}`);
}
if (containsStoredKey(auditMetadataBlock("profile"), ["primaryGoal", "weakAreas", "strongAreas"])) {
  failures.push(`${files.profile}: behavioral text and area labels are forbidden in audit metadata`);
}
requireText("profileAuthority", "upsertMentorProfileUpdateTx", "profile mutation needs a transaction-injected writer");
requireText("profileAuthority", "client.query", "profile writer must use the supplied PostgreSQL client");

for (const target of ["apiKeysRoute", "apiKeyByIdRoute"]) {
  requireText(target, "getCanonicalSession(req, { strictRevocation: true })", "API key credential mutations must use strict session revocation");
  requireText(target, "PLATFORM.DEFAULT_TENANT_ID", "API key tenant authority must be server-derived");
  requireText(target, "resolveSensitiveAuditCorrelation", "API key mutations must bind stable correlation evidence");
  requireText(target, "hashSensitiveAuditRequest", "API key mutations must bind canonical request evidence");
  rejectText(target, "writeAudit(", "API key credential changes cannot use best-effort audit");
  rejectText(target, "body.tenantId", "client-supplied API key tenant authority is forbidden");
  rejectText(target, "body.userId", "client-supplied API key principal authority is forbidden");
  rejectText(target, "body.actorId", "client-supplied API key audit actor is forbidden");
}

requireText("apiKeysRoute", "audit: {", "API key creation must pass mandatory audit context");
for (const call of ["setApiKeyActive(", "rotateApiKey(", "deleteApiKey("]) {
  requireText("apiKeyByIdRoute", call, `API key lifecycle route must call ${call}`);
}

requireText("apiKeysAuthority", 'import { withDb, withTx } from "@/lib/db"', "API key authority must expose transaction-coupled mutations");
requireText("apiKeysAuthority", "writeSensitiveMutationAuditTx(client", "API key authority must append mandatory evidence in the mutation transaction");
requireText("apiKeysAuthority", "assertAuditActor", "API key mutations must bind the audit actor to the target principal");
requireText("apiKeysAuthority", "credentialFingerprint", "API key rotation evidence needs a one-way credential version fingerprint");
for (const action of ["api_key.create", "api_key.enable", "api_key.disable", "api_key.rotate", "api_key.delete"]) {
  requireText("apiKeysAuthority", action, `missing mandatory API key audit action ${action}`);
  requireText("audit", action, `sensitive audit action type is missing ${action}`);
}
rejectText("apiKeysAuthority", "writeAudit(", "legacy best-effort audit must not satisfy API key credential evidence");
if (/metadata:\s*\{[^}]*\bplaintext\b/s.test(content.apiKeysAuthority)) failures.push(`${files.apiKeysAuthority}: API key plaintext is forbidden in audit metadata`);
if (/metadata:\s*\{[^}]*\bkey_hash\b/s.test(content.apiKeysAuthority)) failures.push(`${files.apiKeysAuthority}: stored API key hash is forbidden in audit metadata`);

for (const text of [
  "sensitive_mutation_audit_events",
  "UNIQUE (tenant_id, action, correlation_id)",
  "tecpey_sensitive_audit_has_forbidden_key",
  "sensitive_mutation_audit_validate",
  "sensitive_mutation_audit_no_update",
  "sensitive_mutation_audit_no_delete",
  "sensitive mutation audit evidence is append-only",
]) requireText("migration", text, `migration is missing strict audit invariant: ${text}`);
requireText("migrationPlan", "runSensitiveMutationAuditMigrations", "canonical migration plan must install the audit ledger");

for (const text of ["FORBIDDEN_METADATA_KEYS", "sensitive_audit_correlation_conflict", "writeSensitiveMutationAuditTx"]) {
  requireText("audit", text, `audit authority is missing invariant: ${text}`);
}
for (const forbidden of ['"token"', '"conversation"', '"secret"', '"password"', '"authorization"']) {
  requireText("audit", forbidden, `audit authority must reject forbidden metadata key ${forbidden}`);
}
requireText("audit", 'Buffer.byteLength(encoded, "utf8") > 16_384', "audit metadata needs an application byte bound");

for (const evidence of [
  "reuses an exact correlation",
  "isolates the same correlation across tenants",
  "rejects raw sensitive metadata",
  "rolls back the mutation when the audit sink rejects evidence",
  "keeps completed audit evidence append-only",
  "without raw token or conversation content",
]) requireText("postgresTests", evidence, `missing PostgreSQL evidence: ${evidence}`);
for (const evidence of [
  "commits credential creation and mandatory evidence atomically",
  "rolls back API key creation when mandatory audit admission is invalid",
  "prevents replayed rotation from committing a second credential version",
  "transactionally records disable, enable and delete lifecycle evidence",
  "does not mutate or emit success evidence for another principal's key",
]) requireText("apiKeyPostgresTests", evidence, `missing API key PostgreSQL evidence: ${evidence}`);
for (const evidence of [
  "binds device-token registration to the strict session",
  "binds conversation migration to the strict session",
  "writes profile and audit in one transaction",
  "binds API key creation to strict server identity",
  "binds API key lifecycle changes to strict identity",
]) requireText("routeTests", evidence, `missing route-boundary evidence: ${evidence}`);

requireText("package", '"audit:sensitive:check"', "package must expose the sensitive audit guard");
requireText("package", '"test:sensitive-mutation-audit"', "package must expose focused sensitive audit tests");
requireText("package", "src/tests/security/api-key-transactional-audit-postgres.test.ts", "focused audit test command must include API key PostgreSQL evidence");
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
