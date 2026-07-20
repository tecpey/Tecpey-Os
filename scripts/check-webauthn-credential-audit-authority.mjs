import { readFile } from "node:fs/promises";

const files = {
  registerChallenge: "src/app/api/auth/webauthn/register/challenge/route.ts",
  registerVerify: "src/app/api/auth/webauthn/register/verify/route.ts",
  authChallenge: "src/app/api/auth/webauthn/auth/challenge/route.ts",
  authVerify: "src/app/api/auth/webauthn/auth/verify/route.ts",
  credentials: "src/app/api/auth/webauthn/credentials/route.ts",
  credentialById: "src/app/api/auth/webauthn/credentials/[id]/route.ts",
  authority: "src/lib/security/webauthn-credential-authority.ts",
  legacyUtilities: "src/lib/security/webauthn.ts",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  postgresTests: "src/tests/security/webauthn-transactional-audit-postgres.test.ts",
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

for (const target of ["registerChallenge", "registerVerify", "credentials", "credentialById"]) {
  requireText(target, "getCanonicalSession(req, { strictRevocation: true })", "authenticated WebAuthn paths must use strict revocation-aware identity");
  requireText(target, "verifyCsrfOrigin(req)", "authenticated WebAuthn paths must enforce CSRF origin authority");
}

for (const target of ["registerVerify", "credentialById"]) {
  requireText(target, "PLATFORM.DEFAULT_TENANT_ID", "WebAuthn mutation tenant authority must be server-derived");
  requireText(target, "resolveSensitiveAuditCorrelation", "WebAuthn mutations must bind stable correlation evidence");
  requireText(target, "hashSensitiveAuditRequest", "WebAuthn mutations must bind canonical request evidence");
  rejectText(target, "writeAudit(", "WebAuthn credential mutations cannot use best-effort audit");
  rejectText(target, "body.actorId", "request-controlled WebAuthn audit actors are forbidden");
  rejectText(target, "body.tenantId", "request-controlled WebAuthn tenant authority is forbidden");
  rejectText(target, "body.userId", "request-controlled WebAuthn mutation owners are forbidden");
}

requireText("registerChallenge", 'residentKey: "required"', "new passkeys must be discoverable to support non-enumerating authentication");
requireText("registerChallenge", "requireResidentKey: true", "registration must require resident credentials");
requireText("registerChallenge", 'userVerification: "required"', "registration must require user verification");
rejectText("registerChallenge", "{ alg: -257", "registration must not advertise an unsupported RS256 verifier");
requireText("registerChallenge", "listWebAuthnCredentials", "registration exclusions must use fail-closed credential reads");

requireText("authChallenge", "userId: null", "public authentication challenges must not bind a request-controlled principal");
requireText("authChallenge", "allowCredentials: []", "public authentication must use discoverable credentials without credential enumeration");
rejectText("authChallenge", "body.userId", "public authentication challenge cannot accept raw user authority");
rejectText("authChallenge", "listCredentials", "public authentication challenge cannot expose another principal's credential IDs");

requireText("registerVerify", "verifyAndRegisterWebAuthnCredential", "registration route must delegate to the transactional authority");
requireText("registerVerify", "recordWebAuthnRegistrationRejection", "resolved invalid registration challenges need durable rejected evidence");
requireText("authVerify", "verifyAndAdvanceWebAuthnAuthentication", "authentication route must delegate counter authority to the transactional verifier");
rejectText("authVerify", "storeWebAuthnChallenge", "legacy challenge storage cannot become a second ceremony authority");
rejectText("authVerify", "writeAudit(", "WebAuthn authentication cannot rely on best-effort credential evidence");
rejectText("authVerify", "body.userId", "authentication verification cannot accept request-controlled principal authority");

requireText("credentials", "listWebAuthnCredentials", "credential list must distinguish database unavailability from an empty set");
requireText("credentialById", "renameWebAuthnCredential", "rename must use transactional credential authority");
requireText("credentialById", "revokeWebAuthnCredential", "revoke must use transactional credential authority");

requireText("authority", 'import { withDb, withTx } from "@/lib/db"', "WebAuthn authority must use canonical database wrappers");
requireText("authority", "writeSensitiveMutationAuditTx(client", "WebAuthn mutations must append mandatory evidence in their transaction");
requireText("authority", "assertAuditActor", "WebAuthn management must bind actor and owner");
requireText("authority", "tecpey-webauthn-credential-v1\\0", "credential evidence identity must be one-way and domain separated");
requireText("authority", "ON CONFLICT (credential_id) DO NOTHING", "credential uniqueness must remain database-enforced");
requireText("authority", "RETURNING id", "registration must prove that a credential row was actually inserted");
requireText("authority", "FOR UPDATE", "credential counter and lifecycle decisions must lock authoritative rows");
requireText("authority", "counterRollback", "counter rollback must be an explicit governed decision");
requireText("authority", 'resourceType: "credential_webauthn"', "WebAuthn evidence must use its typed credential resource");
rejectText("authority", "writeAudit(", "legacy best-effort audit must not satisfy WebAuthn credential evidence");

if (countText("authority", "withTx(async (client)") < 6) {
  failures.push(`${files.authority}: registration, rejection, counter, rename and revoke boundaries must remain transaction-backed`);
}

requireText("legacyUtilities", "generateChallenge", "shared WebAuthn utilities must retain cryptographic challenge generation");
requireText("legacyUtilities", "deviceFingerprint", "shared WebAuthn utilities must retain device fingerprint compatibility");
requireText("legacyUtilities", "markDeviceSeen", "shared WebAuthn utilities must retain the residual known-device compatibility projection");
for (const forbiddenLegacyAuthority of [
  "storeWebAuthnChallenge",
  "consumeWebAuthnChallenge",
  "verifyWebAuthnRegistration",
  "verifyWebAuthnAuthentication",
  "listCredentials",
  "renameCredential",
  "revokeCredential",
  "INSERT INTO webauthn_credentials",
  "UPDATE webauthn_credentials",
]) {
  rejectText(
    "legacyUtilities",
    forbiddenLegacyAuthority,
    `legacy WebAuthn module must remain mutation-free and cannot expose ${forbiddenLegacyAuthority}`,
  );
}

for (const action of [
  "credential.webauthn.register",
  "credential.webauthn.authenticate",
  "credential.webauthn.counter_rollback",
  "credential.webauthn.rename",
  "credential.webauthn.revoke",
]) {
  requireText("authority", action, `missing mandatory WebAuthn audit action ${action}`);
  requireText("audit", action, `sensitive audit action type is missing ${action}`);
}
requireText("audit", "credential_webauthn", "sensitive audit resource type is missing credential_webauthn");

for (const forbidden of [
  '"public_key"',
  '"signature"',
  '"challenge"',
  '"clientdatajson"',
  '"authenticatordata"',
  '"attestationobject"',
  '"userhandle"',
]) {
  requireText("audit", forbidden, `audit metadata policy must reject WebAuthn secret-bearing key ${forbidden}`);
}

for (const unsafeMetadata of [
  /metadata:\s*\{[^}]*\bpublicKey\s*:/s,
  /metadata:\s*\{[^}]*\bsignature\s*:/s,
  /metadata:\s*\{[^}]*\bchallenge\s*:/s,
  /metadata:\s*\{[^}]*\bclientDataJSON\s*:/s,
  /metadata:\s*\{[^}]*\bauthenticatorData\s*:/s,
  /metadata:\s*\{[^}]*\battestationObject\s*:/s,
]) {
  if (unsafeMetadata.test(content.authority)) {
    failures.push(`${files.authority}: raw WebAuthn ceremony or key material appears in audit metadata`);
    break;
  }
}

for (const evidence of [
  "commits registration and secret-free evidence atomically",
  "rolls back registration when mandatory audit admission fails",
  "rejects duplicate credential registration without transferring ownership",
  "allows at most one concurrent nonzero counter transition",
  "records counter rollback as durable clone-suspected evidence",
  "rejects changed replay evidence and rolls back the second counter transition",
  "prevents cross-principal rename and revoke",
]) {
  requireText("postgresTests", evidence, `missing WebAuthn PostgreSQL evidence: ${evidence}`);
}

requireText("package", "node scripts/check-webauthn-credential-audit-authority.mjs", "sensitive audit guard must include the permanent WebAuthn source guard");
requireText("package", "src/tests/security/webauthn-transactional-audit-postgres.test.ts", "focused sensitive audit tests must include WebAuthn PostgreSQL evidence");
requireText("workflow", "npm run audit:sensitive:check", "dedicated workflow must execute the composed sensitive audit guards");
requireText("workflow", "npm run test:sensitive-mutation-audit", "dedicated workflow must execute focused WebAuthn PostgreSQL evidence");
requireText("workflow", "contents: read", "dedicated workflow must remain read-only");

if (failures.length) {
  console.error("WebAuthn credential transactional audit authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "WebAuthn credential authority check passed: discoverable challenge privacy, strict identity, one exclusive transaction-coupled credential authority, row locking, replay conflict handling, clone-suspected outcomes and secret-redaction controls are enforced.",
);
