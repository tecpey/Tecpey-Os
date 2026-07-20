import { readFile } from "node:fs/promises";

const files = {
  backupRoute: "src/app/api/auth/2fa/backup/route.ts",
  disableRoute: "src/app/api/auth/2fa/disable/route.ts",
  enrollRoute: "src/app/api/auth/2fa/enroll/route.ts",
  authority: "src/lib/security/two-factor-authority.ts",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  postgresTests: "src/tests/security/two-factor-transactional-audit-postgres.test.ts",
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

function metadataBlocks(source) {
  const blocks = [];
  let cursor = 0;
  while (cursor < source.length) {
    const metadataStart = source.indexOf("metadata:", cursor);
    if (metadataStart < 0) break;
    const objectStart = source.indexOf("{", metadataStart);
    if (objectStart < 0) break;
    const block = balancedObject(source, objectStart);
    if (!block) break;
    blocks.push(block);
    cursor = objectStart + block.length;
  }
  return blocks;
}

for (const target of ["backupRoute", "disableRoute", "enrollRoute"]) {
  requireText(target, "getCanonicalSession(req, { strictRevocation: true })", "2FA mutations must use strict revocation-aware identity");
  requireText(target, "verifyCsrfOrigin(req)", "2FA mutations must enforce CSRF origin authority");
  requireText(target, "PLATFORM.DEFAULT_TENANT_ID", "2FA tenant authority must be server-derived");
  requireText(target, "resolveSensitiveAuditCorrelation", "2FA mutations must bind stable correlation evidence");
  requireText(target, "hashSensitiveAuditRequest", "2FA mutations must bind canonical request evidence");
  requireText(target, "readBoundedJsonRequest", "2FA mutation bodies must remain bounded");
  rejectText(target, "writeAudit(", "2FA credential changes cannot use best-effort audit");
  rejectText(target, "body.userId", "client-supplied 2FA principal authority is forbidden");
  rejectText(target, "body.actorId", "client-supplied 2FA audit actor is forbidden");
  rejectText(target, "body.tenantId", "client-supplied 2FA tenant authority is forbidden");
}

requireText("backupRoute", "consumeTwoFactorBackupCode({", "backup-code route must delegate to the transactional authority");
requireText("disableRoute", "disableTwoFactor({", "disable route must delegate to the transactional authority");
requireText("disableRoute", "adminOverride && !session.isAdmin", "route must reject forged admin override before authority invocation");
requireText("enrollRoute", "startTwoFactorEnrollment({", "enrollment start must delegate to the transactional authority");
requireText("enrollRoute", "enableTwoFactor({", "enrollment confirmation must delegate to the transactional authority");

requireText("authority", 'import { withTx } from "@/lib/db"', "2FA authority must use the canonical PostgreSQL transaction wrapper");
requireText("authority", "assertAuditActor", "2FA authority must bind audit actor to the target principal");
requireText("authority", "writeSensitiveMutationAuditTx(client", "2FA state and evidence must share one transaction");
requireText("authority", "tecpey-2fa-generation-v1\\0", "factor-generation fingerprint must be domain separated");
requireText("authority", 'resourceType: "credential_2fa"', "2FA evidence must use the governed credential resource");
rejectText("authority", "writeAudit(", "legacy best-effort audit must not satisfy 2FA credential evidence");

if (countText("authority", "withTx(async (client)") < 4) {
  failures.push(`${files.authority}: every 2FA lifecycle mutation must own a PostgreSQL transaction`);
}
if (countText("authority", "FOR UPDATE") < 4) {
  failures.push(`${files.authority}: enrollment, enable, disable and backup consumption must lock credential state`);
}

for (const action of [
  "credential.2fa.enroll.start",
  "credential.2fa.enable",
  "credential.2fa.disable",
  "credential.2fa.backup.consume",
]) {
  requireText("authority", action, `missing mandatory 2FA audit action ${action}`);
  requireText("audit", action, `sensitive audit action type is missing ${action}`);
}
requireText("audit", "credential_2fa", "sensitive audit resource type is missing credential_2fa");

for (const field of [
  "policyVersion",
  "factorGenerationFingerprint",
  "backupCodeCount",
  "remainingCodes",
  "adminOverride",
]) {
  requireText("authority", field, `2FA evidence is missing safe governed metadata field ${field}`);
}

const blocks = metadataBlocks(content.authority);
if (blocks.length < 6) {
  failures.push(`${files.authority}: all success and rejection evidence metadata blocks must remain statically reviewable`);
}
for (const block of blocks) {
  if (/\b(?:secret|rawSecret|encryptedSecret|code|backupCodes|backupCodeHashes|hashes|token|cookie|password)\s*:/.test(block)) {
    failures.push(`${files.authority}: credential secret, submitted code or stored hash appears in audit metadata`);
    break;
  }
}

for (const evidence of [
  "commits enrollment, enablement and disablement with secret-free audit evidence",
  "rolls back pending enrollment when mandatory audit admission fails",
  "allows at most one concurrent success for the same backup code",
  "rejects changed enrollment replay and preserves the first credential generation",
  "rejects cross-principal and forged admin authority before mutation",
]) {
  requireText("postgresTests", evidence, `missing 2FA PostgreSQL evidence: ${evidence}`);
}

requireText("package", "node scripts/check-two-factor-audit-authority.mjs", "sensitive audit guard must include the permanent 2FA source guard");
requireText("package", "src/tests/security/two-factor-transactional-audit-postgres.test.ts", "focused audit tests must include 2FA PostgreSQL evidence");
requireText("workflow", "npm run audit:sensitive:check", "dedicated workflow must execute the composed sensitive-audit guards");
requireText("workflow", "npm run test:sensitive-mutation-audit", "dedicated workflow must execute focused 2FA PostgreSQL evidence");
requireText("workflow", "contents: read", "dedicated workflow must remain read-only");

if (failures.length) {
  console.error("Two-factor transactional audit authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Two-factor transactional audit authority check passed: strict identity, server-derived tenant authority, transaction-coupled evidence, row locking, replay conflict handling, secret redaction and permanent PostgreSQL coverage are enforced.",
);
