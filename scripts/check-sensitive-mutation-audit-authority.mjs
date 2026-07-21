import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const files = {
  device: "src/app/api/device-token/route.ts",
  conversations: "src/app/api/mentor-conversations/migrate/route.ts",
  profile: "src/app/api/mentor-profile/recompute/route.ts",
  profileAuthority: "src/lib/mentor-profile-recompute-authority.ts",
  apiKeysRoute: "src/app/api/api-keys/route.ts",
  apiKeyByIdRoute: "src/app/api/api-keys/[id]/route.ts",
  apiKeysAuthority: "src/lib/security/api-keys.ts",
  passwordRoute: "src/app/api/auth/password/change/route.ts",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  legacyAudit: "src/lib/security/audit-log.ts",
  legacyApiKeyAuth: "src/lib/security/api-key-auth.ts",
  legacyWithdrawal: "src/lib/security/withdrawal-service.ts",
  legacyClassification:
    "docs/security/LEGACY_AUDIT_CALLER_CLASSIFICATION.md",
  migration: "src/lib/db-migrate-sensitive-mutation-audit.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  postgresTests:
    "src/tests/security/sensitive-mutation-audit-postgres.test.ts",
  apiKeyPostgresTests:
    "src/tests/security/api-key-transactional-audit-postgres.test.ts",
  passwordPostgresTests:
    "src/tests/security/password-rotation-audit-postgres.test.ts",
  routeTests: "src/tests/security/sensitive-mutation-audit-routes.test.ts",
  package: "package.json",
  workflow: ".github/workflows/sensitive-mutation-audit.yml",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readFile(path, "utf8"),
    ]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) {
    failures.push(`${files[target]}: ${reason}`);
  }
};
const rejectText = (target, text, reason) => {
  if (content[target].includes(text)) {
    failures.push(`${files[target]}: ${reason}`);
  }
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

function callObjectBlock(source, marker) {
  const callStart = source.indexOf(marker);
  if (callStart < 0) return "";
  const objectStart = source.indexOf("{", callStart);
  return objectStart >= 0 ? balancedObject(source, objectStart) : "";
}

function containsStoredKey(block, names) {
  return new RegExp(`\\b(?:${names.join("|")})\\s*(?=:|[,}])`).test(
    block,
  );
}

async function listSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return listSourceFiles(path);
      return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

const sourcePaths = await listSourceFiles("src");
const sourceEntries = await Promise.all(
  sourcePaths.map(async (path) => [
    relative(".", path).split(sep).join("/"),
    await readFile(path, "utf8"),
  ]),
);
const sourceByPath = new Map(sourceEntries);

for (const target of ["device", "conversations", "profile"]) {
  requireText(
    target,
    "getCanonicalSession(req, { strictRevocation: true })",
    "mutation must use strict session revocation authority",
  );
  requireText(
    target,
    "verifyCsrfOrigin(req)",
    "mutation must enforce CSRF origin authority",
  );
  requireText(
    target,
    "withTx(async (client)",
    "mutation and audit must share one PostgreSQL transaction",
  );
  requireText(
    target,
    "writeSensitiveMutationAuditTx(client",
    "route must write strict durable audit evidence",
  );
  requireText(
    target,
    "resolveSensitiveAuditCorrelation",
    "route must bind a stable correlation identifier",
  );
  requireText(
    target,
    "hashSensitiveAuditRequest",
    "route must bind canonical request evidence",
  );
  rejectText(
    target,
    "writeAudit(",
    "non-blocking legacy audit is forbidden for sensitive mutations",
  );
  rejectText(
    target,
    "body.studentId",
    "caller-controlled student targeting is forbidden",
  );
  rejectText(
    target,
    "body.userId",
    "caller-controlled user targeting is forbidden",
  );
  rejectText(
    target,
    "body.actorId",
    "caller-controlled audit actors are forbidden",
  );
  if (!auditMetadataBlock(target)) {
    failures.push(
      `${files[target]}: audit metadata object must be statically identifiable`,
    );
  }
}

requireText(
  "device",
  "const tokenHash = hashSensitiveAuditRequest(token)",
  "raw push tokens must be represented by a one-way hash",
);
requireText(
  "device",
  "resourceId: tokenHash",
  "device audit resource identity must be the token hash",
);
requireText("device", "tokenHash,", "safe token hash metadata is required");
if (containsStoredKey(auditMetadataBlock("device"), ["token"])) {
  failures.push(`${files.device}: raw token must not appear in audit metadata`);
}

requireText(
  "conversations",
  "contentHash: hashSensitiveAuditRequest(message.content)",
  "conversation request evidence must contain only content hashes",
);
for (const field of [
  "attemptedCount",
  "acceptedCount",
  "importedCount",
  "rejectedCount",
]) {
  requireText(
    "conversations",
    field,
    `conversation audit needs safe count: ${field}`,
  );
}
if (
  containsStoredKey(auditMetadataBlock("conversations"), [
    "content",
    "messages",
    "conversation",
  ])
) {
  failures.push(
    `${files.conversations}: raw conversation fields are forbidden in audit metadata`,
  );
}

requireText(
  "profile",
  "upsertMentorProfileUpdateTx(client, studentId, updated)",
  "profile write must use the injected transaction client",
);
for (const field of [
  "confidenceScore",
  "disciplineScore",
  "weakAreaCount",
  "strongAreaCount",
]) {
  requireText(
    "profile",
    field,
    `profile audit needs safe derived metadata: ${field}`,
  );
}
if (
  containsStoredKey(auditMetadataBlock("profile"), [
    "primaryGoal",
    "weakAreas",
    "strongAreas",
  ])
) {
  failures.push(
    `${files.profile}: behavioral text and area labels are forbidden in audit metadata`,
  );
}
requireText(
  "profileAuthority",
  "upsertMentorProfileUpdateTx",
  "profile mutation needs a transaction-injected writer",
);
requireText(
  "profileAuthority",
  "client.query",
  "profile writer must use the supplied PostgreSQL client",
);

for (const target of ["apiKeysRoute", "apiKeyByIdRoute"]) {
  requireText(
    target,
    "getCanonicalSession(req, { strictRevocation: true })",
    "API key credential mutations must use strict session revocation",
  );
  requireText(
    target,
    "PLATFORM.DEFAULT_TENANT_ID",
    "API key tenant authority must be server-derived",
  );
  requireText(
    target,
    "resolveSensitiveAuditCorrelation",
    "API key mutations must bind stable correlation evidence",
  );
  requireText(
    target,
    "hashSensitiveAuditRequest",
    "API key mutations must bind canonical request evidence",
  );
  rejectText(
    target,
    "writeAudit(",
    "API key credential changes cannot use best-effort audit",
  );
  rejectText(
    target,
    "body.tenantId",
    "client-supplied API key tenant authority is forbidden",
  );
  rejectText(
    target,
    "body.userId",
    "client-supplied API key principal authority is forbidden",
  );
  rejectText(
    target,
    "body.actorId",
    "client-supplied API key audit actor is forbidden",
  );
}

requireText(
  "apiKeysRoute",
  "audit: {",
  "API key creation must pass mandatory audit context",
);
for (const call of [
  "setApiKeyActive(",
  "rotateApiKey(",
  "deleteApiKey(",
]) {
  requireText(
    "apiKeyByIdRoute",
    call,
    `API key lifecycle route must call ${call}`,
  );
}

requireText(
  "apiKeysAuthority",
  'import { withDb, withTx } from "@/lib/db"',
  "API key authority must expose transaction-coupled mutations",
);
requireText(
  "apiKeysAuthority",
  "writeSensitiveMutationAuditTx(client",
  "API key authority must append mandatory evidence in the mutation transaction",
);
requireText(
  "apiKeysAuthority",
  "assertAuditActor",
  "API key mutations must bind the audit actor to the target principal",
);
requireText(
  "apiKeysAuthority",
  "credentialFingerprint",
  "API key rotation evidence needs a one-way credential version fingerprint",
);
for (const action of [
  "api_key.create",
  "api_key.enable",
  "api_key.disable",
  "api_key.rotate",
  "api_key.delete",
]) {
  requireText(
    "apiKeysAuthority",
    action,
    `missing mandatory API key audit action ${action}`,
  );
  requireText(
    "audit",
    action,
    `sensitive audit action type is missing ${action}`,
  );
}
rejectText(
  "apiKeysAuthority",
  "writeAudit(",
  "legacy best-effort audit must not satisfy API key credential evidence",
);
if (/metadata:\s*\{[^}]*\bplaintext\b/s.test(content.apiKeysAuthority)) {
  failures.push(
    `${files.apiKeysAuthority}: API key plaintext is forbidden in audit metadata`,
  );
}
if (/metadata:\s*\{[^}]*\bkey_hash\b/s.test(content.apiKeysAuthority)) {
  failures.push(
    `${files.apiKeysAuthority}: stored API key hash is forbidden in audit metadata`,
  );
}

requireText(
  "passwordRoute",
  "getCanonicalSession(req, { strictRevocation: true })",
  "password rotation must use strict revocation-aware identity",
);
requireText(
  "passwordRoute",
  "verifyUnifiedSession(currentToken)",
  "password rotation must bind the current unified session",
);
requireText(
  "passwordRoute",
  "PLATFORM.DEFAULT_TENANT_ID",
  "password rotation tenant authority must be server-derived",
);
requireText(
  "passwordRoute",
  "resolveSensitiveAuditCorrelation",
  "password rotation must bind stable correlation evidence",
);
requireText(
  "passwordRoute",
  "hashSensitiveAuditRequest",
  "password rotation must bind canonical request evidence",
);
requireText(
  "passwordRoute",
  "withTx<RotationTransactionResult>(async (client)",
  "password and evidence must share one PostgreSQL transaction",
);
requireText(
  "passwordRoute",
  "writeSensitiveMutationAuditTx(client",
  "password rotation must append mandatory evidence before commit",
);
requireText(
  "passwordRoute",
  'action: "credential.password.change"',
  "password rotation needs its dedicated audit action",
);
requireText(
  "passwordRoute",
  'resourceType: "credential_account"',
  "password rotation needs a credential resource boundary",
);
requireText(
  "passwordRoute",
  "currentSessionEvidenceHash",
  "password rotation must bind current-session evidence without raw JTI storage",
);
requireText(
  "passwordRoute",
  "credentialVersionFingerprint",
  "password rotation must bind a one-way credential version fingerprint",
);
requireText(
  "passwordRoute",
  'policyVersion: "password-rotation-v1"',
  "password rotation evidence must identify its policy version",
);
rejectText(
  "passwordRoute",
  "writeAudit(",
  "committed password rotation cannot rely on best-effort audit",
);
rejectText(
  "passwordRoute",
  "metadata: { currentPassword",
  "current password is forbidden in evidence metadata",
);
rejectText(
  "passwordRoute",
  "metadata: { newPassword",
  "new password is forbidden in evidence metadata",
);
const passwordMetadata = auditMetadataBlock("passwordRoute");
if (!passwordMetadata) {
  failures.push(
    `${files.passwordRoute}: password audit metadata must be statically identifiable`,
  );
}
if (
  containsStoredKey(passwordMetadata, [
    "password",
    "currentPassword",
    "newPassword",
    "currentHash",
    "newHash",
    "accessToken",
    "refreshToken",
    "cookie",
  ])
) {
  failures.push(
    `${files.passwordRoute}: password audit metadata contains a credential or token field`,
  );
}
const passwordAuditIndex = content.passwordRoute.indexOf(
  "writeSensitiveMutationAuditTx(client",
);
const redisProjectionIndex = content.passwordRoute.indexOf("revokeMultiple(");
if (
  passwordAuditIndex < 0 ||
  redisProjectionIndex < 0 ||
  passwordAuditIndex >= redisProjectionIndex
) {
  failures.push(
    `${files.passwordRoute}: durable password evidence must be admitted before Redis projection synchronization`,
  );
}
requireText(
  "audit",
  "credential.password.change",
  "sensitive audit action type is missing password rotation",
);
requireText(
  "audit",
  "credential_account",
  "sensitive audit resource type is missing credential account",
);

// Legacy best-effort audit classification and quarantine.
requireText(
  "legacyAudit",
  'LEGACY_AUDIT_TELEMETRY_AUTHORITY = "non-authoritative"',
  "legacy audit writer must be explicitly non-authoritative",
);
requireText(
  "legacyAudit",
  "@deprecated Non-authoritative, best-effort telemetry only.",
  "legacy writer must carry an explicit deprecation contract",
);
requireText(
  "legacyAudit",
  "cannot satisfy security,",
  "legacy writer must state that it cannot prove mandatory evidence",
);
requireText(
  "legacyApiKeyAuth",
  'LEGACY_SIGNED_API_KEY_AUTHORITY =\n  "inactive-non-authoritative"',
  "signed API-key adapter must remain explicitly inactive",
);
requireText(
  "legacyApiKeyAuth",
  'action: "api_key_auth_rejected"',
  "rejected authentication telemetry needs truthful semantics",
);
requireText(
  "legacyApiKeyAuth",
  'update("tecpey-legacy-signed-api-key-telemetry-v1\\0")',
  "legacy telemetry actor identity must be a domain-separated fingerprint",
);
requireText(
  "legacyApiKeyAuth",
  'telemetryVersion: "legacy-signed-api-key-rejection-v1"',
  "legacy telemetry must be versioned",
);
rejectText(
  "legacyApiKeyAuth",
  'action: "api_key_created"',
  "authentication rejection must not impersonate a credential mutation",
);
rejectText(
  "legacyApiKeyAuth",
  "rawKey.slice(",
  "raw API-key prefixes are forbidden in telemetry identity",
);
rejectText(
  "legacyApiKeyAuth",
  "submittedTs",
  "exact submitted timestamps are forbidden in rejection telemetry",
);

const legacyTelemetryObject = callObjectBlock(
  content.legacyApiKeyAuth,
  "writeAudit(",
);
if (!legacyTelemetryObject) {
  failures.push(
    `${files.legacyApiKeyAuth}: classified rejection telemetry object is missing`,
  );
}
if (
  containsStoredKey(legacyTelemetryObject, [
    "rawApiKey",
    "rawKey",
    "signature",
    "submittedSignature",
    "rawBody",
    "timestampMs",
    "authorization",
    "cookie",
    "secret",
  ])
) {
  failures.push(
    `${files.legacyApiKeyAuth}: rejection telemetry stores raw credential or request material`,
  );
}

const classifiedLegacyPaths = new Set([
  "src/lib/security/audit-log.ts",
  "src/lib/security/api-key-auth.ts",
  "src/lib/security/withdrawal-service.ts",
]);
for (const [path, source] of sourceByPath.entries()) {
  const hasLegacyCall = /\bwriteAudit\s*\(/.test(source);
  const importsLegacyAudit = /["'][^"']*audit-log["']/.test(source);
  if (
    (hasLegacyCall || importsLegacyAudit) &&
    !classifiedLegacyPaths.has(path)
  ) {
    failures.push(
      `${path}: new legacy audit import/call is forbidden outside the classified compatibility set`,
    );
  }
  if (
    path !== "src/lib/security/api-key-auth.ts" &&
    /["'][^"']*api-key-auth["']/.test(source)
  ) {
    failures.push(
      `${path}: dormant signed API-key adapter must not be imported`,
    );
  }
  if (
    path !== "src/lib/security/withdrawal-service.ts" &&
    /["'][^"']*withdrawal-service["']/.test(source)
  ) {
    failures.push(
      `${path}: superseded withdrawal service must not be imported`,
    );
  }
}

for (const [symbol, owner] of [
  ["validateSignedApiKeyRequest", "src/lib/security/api-key-auth.ts"],
  ["hasApiKeyHeaders", "src/lib/security/api-key-auth.ts"],
  ["createWithdrawalRequest", "src/lib/security/withdrawal-service.ts"],
]) {
  const externalReferences = [...sourceByPath.entries()]
    .filter(([path]) => path !== owner)
    .filter(([, source]) => source.includes(symbol))
    .map(([path]) => path);
  if (externalReferences.length > 0) {
    failures.push(
      `${owner}: dormant export ${symbol} is referenced by ${externalReferences.join(
        ", ",
      )}`,
    );
  }
}

const withdrawalLegacyCalls =
  content.legacyWithdrawal.match(/\bwriteAudit\s*\(/g)?.length ?? 0;
if (withdrawalLegacyCalls !== 3) {
  failures.push(
    `${files.legacyWithdrawal}: expected exactly three classified obsolete writeAudit calls, found ${withdrawalLegacyCalls}`,
  );
}

for (const invariant of [
  "Every remaining production-source `writeAudit()` site",
  "Non-authoritative security telemetry in a dormant adapter",
  "Obsolete/duplicate legacy withdrawal telemetry",
  "Deprecated best-effort writer",
  "api_key_auth_rejected",
  "Module must have no external caller",
  "must not be imported by a route, worker or authority",
  "#161 remains open",
]) {
  requireText(
    "legacyClassification",
    invariant,
    `legacy caller inventory is missing: ${invariant}`,
  );
}

for (const text of [
  "sensitive_mutation_audit_events",
  "UNIQUE (tenant_id, action, correlation_id)",
  "tecpey_sensitive_audit_has_forbidden_key",
  "sensitive_mutation_audit_validate",
  "sensitive_mutation_audit_no_update",
  "sensitive_mutation_audit_no_delete",
  "sensitive mutation audit evidence is append-only",
]) {
  requireText(
    "migration",
    text,
    `migration is missing strict audit invariant: ${text}`,
  );
}
requireText(
  "migrationPlan",
  "runSensitiveMutationAuditMigrations",
  "canonical migration plan must install the audit ledger",
);

for (const text of [
  "FORBIDDEN_METADATA_KEYS",
  "sensitive_audit_correlation_conflict",
  "writeSensitiveMutationAuditTx",
]) {
  requireText(
    "audit",
    text,
    `audit authority is missing invariant: ${text}`,
  );
}
for (const forbidden of [
  '"token"',
  '"conversation"',
  '"secret"',
  '"password"',
  '"authorization"',
]) {
  requireText(
    "audit",
    forbidden,
    `audit authority must reject forbidden metadata key ${forbidden}`,
  );
}
requireText(
  "audit",
  'Buffer.byteLength(encoded, "utf8") > 16_384',
  "audit metadata needs an application byte bound",
);

for (const evidence of [
  "reuses an exact correlation",
  "isolates the same correlation across tenants",
  "rejects raw sensitive metadata",
  "rolls back the mutation when the audit sink rejects evidence",
  "keeps completed audit evidence append-only",
  "without raw token or conversation content",
]) {
  requireText(
    "postgresTests",
    evidence,
    `missing PostgreSQL evidence: ${evidence}`,
  );
}
for (const evidence of [
  "commits credential creation and mandatory evidence atomically",
  "rolls back API key creation when mandatory audit admission is invalid",
  "prevents replayed rotation from committing a second credential version",
  "transactionally records disable, enable and delete lifecycle evidence",
  "does not mutate or emit success evidence for another principal's key",
]) {
  requireText(
    "apiKeyPostgresTests",
    evidence,
    `missing API key PostgreSQL evidence: ${evidence}`,
  );
}
for (const evidence of [
  "commits password rotation and one secret-free audit event atomically",
  "rolls back password, history and session rotation when audit admission fails",
  "rejects changed replay evidence and rolls back the second credential generation",
  "keeps committed password evidence truthful when Redis deny synchronization fails",
]) {
  requireText(
    "passwordPostgresTests",
    evidence,
    `missing password PostgreSQL evidence: ${evidence}`,
  );
}
for (const evidence of [
  "binds device-token registration to the strict session",
  "binds conversation migration to the strict session",
  "writes profile and audit in one transaction",
  "binds API key creation to strict server identity",
  "binds API key lifecycle changes to strict identity",
]) {
  requireText(
    "routeTests",
    evidence,
    `missing route-boundary evidence: ${evidence}`,
  );
}

requireText(
  "package",
  '"audit:sensitive:check"',
  "package must expose the sensitive audit guard",
);
requireText(
  "package",
  '"test:sensitive-mutation-audit"',
  "package must expose focused sensitive audit tests",
);
requireText(
  "package",
  "src/tests/security/api-key-transactional-audit-postgres.test.ts",
  "focused audit test command must include API key PostgreSQL evidence",
);
requireText(
  "package",
  "src/tests/security/password-rotation-audit-postgres.test.ts",
  "focused audit test command must include password PostgreSQL evidence",
);
requireText(
  "package",
  "npm run audit:sensitive:check",
  "release gate must execute the sensitive audit guard",
);
requireText(
  "package",
  "npm run test:sensitive-mutation-audit",
  "release gate must execute focused sensitive audit tests",
);
requireText(
  "workflow",
  "Sensitive mutation audit authority guard",
  "dedicated CI must run the authority guard",
);
requireText(
  "workflow",
  "Sensitive mutation audit PostgreSQL and Redis tests",
  "dedicated CI must run focused PostgreSQL/Redis tests",
);
requireText(
  "workflow",
  "contents: read",
  "dedicated workflow must remain read-only",
);

if (failures.length) {
  console.error("Sensitive mutation audit authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Sensitive mutation audit authority check passed: strict sessions, server-derived actors, transaction-coupled append-only evidence, correlation integrity, recursive metadata redaction, fail-closed rollback and complete quarantine of classified legacy best-effort audit callers are enforced.",
);
