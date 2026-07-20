import { readFile } from "node:fs/promises";

const paths = {
  device: "src/app/api/device-token/route.ts",
  conversations: "src/app/api/mentor-conversations/migrate/route.ts",
  profile: "src/app/api/mentor-profile/recompute/route.ts",
  profileAuthority: "src/lib/mentor-profile-recompute-authority.ts",
  apiKeysRoute: "src/app/api/api-keys/route.ts",
  apiKeyByIdRoute: "src/app/api/api-keys/[id]/route.ts",
  apiKeysAuthority: "src/lib/security/api-keys.ts",
  legacyAudit: "src/lib/security/audit-log.ts",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  migration: "src/lib/db-migrate-sensitive-mutation-audit.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  postgresTests: "src/tests/security/sensitive-mutation-audit-postgres.test.ts",
  apiKeyPostgresTests: "src/tests/security/api-key-transactional-audit-postgres.test.ts",
  routeTests: "src/tests/security/sensitive-mutation-audit-routes.test.ts",
  package: "package.json",
  workflow: ".github/workflows/sensitive-mutation-audit.yml",
};

const files = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, filePath]) => [key, await readFile(filePath, "utf8")]),
  ),
);
const failures = [];

function requireText(key, text, reason) {
  if (!files[key].includes(text)) failures.push(`${paths[key]}: ${reason}`);
}

function rejectText(key, text, reason) {
  if (files[key].includes(text)) failures.push(`${paths[key]}: ${reason}`);
}

function requireAll(key, entries) {
  for (const [text, reason] of entries) requireText(key, text, reason);
}

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

function auditMetadataBlocks(source) {
  const blocks = [];
  let cursor = 0;
  while (cursor < source.length) {
    const auditStart = source.indexOf("writeSensitiveMutationAuditTx(client", cursor);
    if (auditStart < 0) break;
    const callObjectStart = source.indexOf("{", auditStart);
    if (callObjectStart < 0) break;
    const callObject = balancedObject(source, callObjectStart);
    if (!callObject) break;
    const metadataStart = callObject.indexOf("metadata:");
    if (metadataStart >= 0) {
      const metadataObjectStart = callObject.indexOf("{", metadataStart);
      if (metadataObjectStart >= 0) {
        const metadata = balancedObject(callObject, metadataObjectStart);
        if (metadata) blocks.push(metadata);
      }
    }
    cursor = callObjectStart + callObject.length;
  }
  return blocks;
}

for (const key of ["device", "conversations", "profile"]) {
  requireAll(key, [
    ["getCanonicalSession(req, { strictRevocation: true })", "strict revocation is required"],
    ["verifyCsrfOrigin(req)", "CSRF origin authority is required"],
    ["withTx(async (client)", "mutation and audit must share one transaction"],
    ["writeSensitiveMutationAuditTx(client", "mandatory audit evidence is required"],
    ["resolveSensitiveAuditCorrelation", "correlation authority is required"],
    ["hashSensitiveAuditRequest", "canonical request evidence is required"],
  ]);
  rejectText(key, "writeAudit(", "legacy best-effort audit is forbidden");
  for (const callerField of ["body.studentId", "body.userId", "body.actorId"]) {
    rejectText(key, callerField, `caller authority is forbidden: ${callerField}`);
  }
}

requireAll("device", [
  ["const tokenHash = hashSensitiveAuditRequest(token)", "raw push token must be hashed"],
  ["resourceId: tokenHash", "device resource identity must be the token hash"],
  ["tokenHash,", "only the safe token hash may enter metadata"],
]);
requireAll("conversations", [
  ["contentHash: hashSensitiveAuditRequest(message.content)", "conversation content must be hashed"],
  ["attemptedCount", "attempted count evidence is required"],
  ["acceptedCount", "accepted count evidence is required"],
  ["importedCount", "imported count evidence is required"],
  ["rejectedCount", "rejected count evidence is required"],
]);
requireAll("profile", [
  ["upsertMentorProfileUpdateTx(client, studentId, updated)", "profile write must use the transaction client"],
  ["confidenceScore", "safe confidence evidence is required"],
  ["disciplineScore", "safe discipline evidence is required"],
  ["weakAreaCount", "safe weak-area count is required"],
  ["strongAreaCount", "safe strong-area count is required"],
]);
requireAll("profileAuthority", [
  ["upsertMentorProfileUpdateTx", "transaction-injected profile writer is required"],
  ["client.query", "profile writer must use the supplied client"],
]);

for (const key of ["apiKeysRoute", "apiKeyByIdRoute"]) {
  requireAll(key, [
    ["getCanonicalSession(req)", "API key principal must come from canonical session"],
    [
      "const userId = session.academyAccountId ?? session.studentId ?? session.userId",
      "API key principal must be server-derived",
    ],
  ]);
  for (const callerField of ["body.tenantId", "body.userId", "body.actorId"]) {
    rejectText(key, callerField, `caller API key authority is forbidden: ${callerField}`);
  }
}
requireAll("apiKeysRoute", [
  ["createApiKey({", "API key creation must use the domain authority"],
  ["userId,", "API key creation must pass the verified principal"],
]);
requireAll("apiKeyByIdRoute", [
  ["setApiKeyActive(keyId, userId", "activation changes must remain principal-scoped"],
  ["rotateApiKey(keyId, userId", "rotation must remain principal-scoped"],
  ["deleteApiKey(keyId, userId", "deletion must remain principal-scoped"],
]);

requireAll("apiKeysAuthority", [
  ['import { withDb, withTx } from "@/lib/db"', "transaction authority is required"],
  ["resolveApiKeyAuditContext", "every caller must receive mandatory audit context"],
  ["PLATFORM.DEFAULT_TENANT_ID", "tenant authority must be server-derived"],
  ["hashSensitiveAuditRequest", "canonical request hashing is required"],
  ["writeSensitiveMutationAuditTx(client", "audit must share the mutation transaction"],
  ["assertAuditActor", "audit actor must match the credential owner"],
  ["credentialFingerprint", "one-way credential-version evidence is required"],
]);
rejectText("apiKeysAuthority", "writeAudit(", "legacy audit cannot satisfy credential evidence");

const mandatoryApiKeyActions = [
  "api_key.create",
  "api_key.enable",
  "api_key.disable",
  "api_key.rotate",
  "api_key.delete",
];
for (const action of mandatoryApiKeyActions) {
  requireText("apiKeysAuthority", action, `missing API key domain action ${action}`);
  requireText("audit", action, `missing sensitive audit type ${action}`);
}

const apiKeyAuditMetadata = auditMetadataBlocks(files.apiKeysAuthority);
if (apiKeyAuditMetadata.length !== 4) {
  failures.push(
    `${paths.apiKeysAuthority}: expected 4 statically reviewable API key audit metadata blocks, found ${apiKeyAuditMetadata.length}`,
  );
}
for (const metadata of apiKeyAuditMetadata) {
  if (/\b(?:plaintext|key_hash)\b\s*:/.test(metadata)) {
    failures.push(`${paths.apiKeysAuthority}: plaintext or stored key hash entered audit metadata`);
  }
}

requireText(
  "legacyAudit",
  "TRANSACTIONALLY_MIGRATED_ACTIONS",
  "legacy compatibility calls must be explicitly classified",
);
for (const action of [
  "api_key_created",
  "api_key_rotated",
  "api_key_disabled",
  "api_key_deleted",
]) {
  requireText("legacyAudit", `"${action}"`, `compatibility projection is not suppressed: ${action}`);
}
requireText(
  "legacyAudit",
  "if (TRANSACTIONALLY_MIGRATED_ACTIONS.has(event.action)) return",
  "migrated actions must not create duplicate best-effort evidence",
);

for (const invariant of [
  "sensitive_mutation_audit_events",
  "UNIQUE (tenant_id, action, correlation_id)",
  "tecpey_sensitive_audit_has_forbidden_key",
  "sensitive_mutation_audit_validate",
  "sensitive_mutation_audit_no_update",
  "sensitive_mutation_audit_no_delete",
  "sensitive mutation audit evidence is append-only",
]) {
  requireText("migration", invariant, `missing database invariant: ${invariant}`);
}
requireText(
  "migrationPlan",
  "runSensitiveMutationAuditMigrations",
  "canonical migration plan must install the audit ledger",
);

requireAll("audit", [
  ["FORBIDDEN_METADATA_KEYS", "recursive metadata redaction is required"],
  ["sensitive_audit_correlation_conflict", "correlation conflicts must fail closed"],
  ["writeSensitiveMutationAuditTx", "transaction writer is required"],
  ['Buffer.byteLength(encoded, "utf8") > 16_384', "metadata must be byte bounded"],
]);
for (const forbidden of ["token", "conversation", "secret", "password", "authorization"]) {
  requireText("audit", `"${forbidden}"`, `forbidden metadata key is missing: ${forbidden}`);
}

for (const evidence of [
  "reuses an exact correlation",
  "isolates the same correlation across tenants",
  "rejects raw sensitive metadata",
  "rolls back the mutation when the audit sink rejects evidence",
  "keeps completed audit evidence append-only",
  "without raw token or conversation content",
]) {
  requireText("postgresTests", evidence, `missing base PostgreSQL evidence: ${evidence}`);
}
for (const evidence of [
  "commits credential creation and mandatory evidence atomically",
  "rolls back API key creation when mandatory audit admission is invalid",
  "prevents replayed rotation from committing a second credential version",
  "transactionally records disable, enable and delete lifecycle evidence",
  "does not mutate or emit success evidence for another principal's key",
]) {
  requireText("apiKeyPostgresTests", evidence, `missing API key PostgreSQL evidence: ${evidence}`);
}
for (const evidence of [
  "binds device-token registration to the strict session",
  "binds conversation migration to the strict session",
  "writes profile and audit in one transaction",
]) {
  requireText("routeTests", evidence, `missing existing route-boundary evidence: ${evidence}`);
}

requireAll("package", [
  ['"audit:sensitive:check"', "package guard command is required"],
  ['"test:sensitive-mutation-audit"', "focused test command is required"],
  [
    "src/tests/security/api-key-transactional-audit-postgres.test.ts",
    "API key PostgreSQL evidence must run in the focused suite",
  ],
  ["npm run audit:sensitive:check", "release gate must execute the guard"],
  ["npm run test:sensitive-mutation-audit", "release gate must execute focused tests"],
]);
requireAll("workflow", [
  ["Sensitive mutation audit authority guard", "dedicated CI must run the guard"],
  ["Sensitive mutation audit PostgreSQL tests", "dedicated CI must run PostgreSQL evidence"],
  ["contents: read", "dedicated workflow must remain read-only"],
]);

if (failures.length > 0) {
  console.error("Sensitive mutation audit authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Sensitive mutation audit authority check passed: server-derived principals, transaction-coupled append-only evidence, secret minimization and fail-closed rollback are enforced.",
);
