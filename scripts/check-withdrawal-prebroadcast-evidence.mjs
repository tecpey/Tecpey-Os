import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const files = {
  package: "package.json",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  helper: "src/lib/security/withdrawal-evidence.ts",
  authorizeRoute: "src/app/api/auth/withdraw/authorize/route.ts",
  admission: "src/lib/security/withdrawal-admission-service.ts",
  cancel: "src/lib/security/withdrawal-cancel-authority.ts",
  admin: "src/lib/security/withdrawal-admin-authority.ts",
  adminRoute: "src/app/api/admin/withdrawals/[id]/route.ts",
  legacy: "src/lib/security/withdrawal-service.ts",
  migration: "src/lib/db-migrate-withdrawal-prebroadcast-evidence.ts",
  hardening: "src/lib/db-migrate-withdrawal-admin-evidence-hardening.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  inventory: "docs/security/WITHDRAWAL_PREBROADCAST_EVIDENCE_INVENTORY.md",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, filename]) => [
      key,
      await readFile(filename, "utf8"),
    ]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

for (const action of [
  "withdrawal.authorization.issue",
  "withdrawal.authorization.reject",
  "withdrawal.admit",
  "withdrawal.block",
  "withdrawal.review",
  "withdrawal.cancel",
  "withdrawal.admin.approve",
  "withdrawal.admin.reject",
  "withdrawal.admin.block",
  "withdrawal.admin.flag_review",
]) {
  requireText("audit", action, `missing typed mandatory action ${action}`);
}
for (const resource of [
  "withdrawal_authorization",
  "withdrawal_request",
  "withdrawal_admin_transition",
]) {
  requireText("audit", resource, `missing typed mandatory resource ${resource}`);
}
for (const forbidden of [
  '"withdrawalid"',
  '"withdrawal_id"',
  '"authorizationid"',
  '"authorization_id"',
  '"destinationaddress"',
  '"destination_address"',
  '"destinationtag"',
  '"destination_tag"',
  '"reviewnotes"',
  '"review_notes"',
  '"notes"',
]) {
  requireText("audit", forbidden, `application evidence redaction is missing ${forbidden}`);
  requireText(
    "migration",
    forbidden.replaceAll('"', "'"),
    `database evidence redaction is missing ${forbidden}`,
  );
}

for (const helper of [
  "fingerprintWithdrawal",
  "fingerprintWithdrawalAuthorization",
  "fingerprintWithdrawalRequest",
  "fingerprintWithdrawalDestination",
  "fingerprintWithdrawalReviewReason",
  "fingerprintWithdrawalRoleSet",
  "fingerprintWithdrawalSession",
  "writeWithdrawalEvidenceTx",
]) {
  requireText("helper", helper, `missing governed withdrawal evidence helper ${helper}`);
}
requireText(
  "helper",
  "withdrawal-prebroadcast-evidence-v1",
  "mandatory evidence requires an explicit policy version",
);
requireText(
  "helper",
  "tecpey:${domain}:v1\\u001f",
  "application fingerprints must use the canonical domain separator",
);

for (const invariant of [
  'FILENAME = "0039_withdrawal_prebroadcast_evidence.sql"',
  "withdrawal_admission_mandatory_evidence",
  "withdrawal_cancel_mandatory_evidence",
  "withdrawal_admin_mandatory_evidence",
  "DEFERRABLE INITIALLY DEFERRED",
  "withdrawal admission authorization evidence is missing",
  "withdrawal admission hold evidence is incomplete",
  "withdrawal cancellation receipt evidence is missing",
  "withdrawal cancellation release evidence is incomplete",
  "withdrawal admin receipt evidence is missing",
  "tecpey_insert_withdrawal_evidence",
]) {
  requireText("migration", invariant, `missing PostgreSQL invariant ${invariant}`);
}
for (const invariant of [
  'FILENAME = "0040_withdrawal_admin_evidence_hardening.sql"',
  "response_body->>'withdrawalId' = NEW.withdrawal_id",
  "withdrawal admin authorization evidence is incomplete",
  "withdrawal admin step-up evidence is invalid",
  "withdrawal admin review reason evidence is incomplete",
]) {
  requireText("hardening", invariant, `missing Admin evidence hardening ${invariant}`);
}
requireText(
  "migrationPlan",
  "runWithdrawalPrebroadcastEvidenceMigrations",
  "canonical migration plan must run pre-broadcast evidence",
);
requireText(
  "migrationPlan",
  "runWithdrawalAdminEvidenceHardeningMigrations",
  "canonical migration plan must run Admin receipt hardening",
);

for (const invariant of [
  "writeWithdrawalEvidenceTx",
  "withdrawal.authorization.issue",
  "withdrawal.authorization.reject",
  "claimApiCommandTx",
  "completeApiCommandTx",
  "FOR UPDATE",
]) {
  requireText("authorizeRoute", invariant, `authorization transaction is missing ${invariant}`);
}
const authorizationEvidenceIndex = content.authorizeRoute.indexOf(
  "await writeWithdrawalEvidenceTx",
);
const authorizationReceiptIndex = content.authorizeRoute.indexOf(
  "await completeApiCommandTx",
  authorizationEvidenceIndex,
);
if (
  authorizationEvidenceIndex < 0 ||
  authorizationReceiptIndex < 0 ||
  authorizationEvidenceIndex > authorizationReceiptIndex
) {
  failures.push(
    `${files.authorizeRoute}: mandatory authorization evidence must precede receipt completion`,
  );
}
rejectText(
  "authorizeRoute",
  "writeAudit(",
  "best-effort audit cannot remain authorization authority",
);

for (const target of ["cancel", "admin"]) {
  rejectText(
    target,
    "writeAudit(",
    "best-effort audit cannot remain pre-broadcast financial authority",
  );
}
for (const invariant of [
  "claimApiCommandTx",
  "FOR UPDATE",
  "releaseExactWithdrawalTx",
  "completeApiCommandTx",
]) {
  requireText("cancel", invariant, `canonical cancellation is missing ${invariant}`);
}
for (const invariant of [
  "authorizationEvidence",
  "withdrawalId: input.withdrawalId",
  "claimApiCommandTx",
  "FOR UPDATE",
  "releaseReservedFundsTx",
  "withdrawal_admin_actions",
  "completeApiCommandTx",
]) {
  requireText("admin", invariant, `Admin authority is missing ${invariant}`);
}
for (const forbidden of ["getClientIp", "userAgent", "sessionId:", "metadata:"]) {
  rejectText(
    "adminRoute",
    forbidden,
    `Admin route cannot pass raw request/session metadata: ${forbidden}`,
  );
}
for (const invariant of [
  "fingerprintWithdrawalRoleSet",
  "fingerprintWithdrawalSession",
  "fingerprintWithdrawalReviewReason",
  "stepUpWithinSeconds: ADMIN_STEP_UP_SECONDS",
]) {
  requireText("adminRoute", invariant, `Admin route is missing ${invariant}`);
}

// Admission may keep non-authoritative telemetry temporarily, but the durable
// PostgreSQL gate is mandatory and any future route/service may not treat
// writeAudit as proof. The legacy split create/cancel functions are quarantined
// by rejecting all production callers outside their definition files.
requireText(
  "admission",
  "withdrawal_admission_outbox",
  "admission must retain durable outbox authority",
);
requireText(
  "admission",
  "consumeWithdrawalAuthorizationTx",
  "admission must consume authorization in its transaction",
);
requireText(
  "admission",
  "reserveExactWithdrawalTx",
  "admission must reserve exact Decimal authority",
);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(filename) : [filename];
    }),
  );
  return nested.flat();
}
const productionFiles = [
  ...(await listFiles("src/app")),
  ...(await listFiles("src/lib")),
  ...(await listFiles("scripts")),
].filter((filename) => /\.(?:ts|tsx|mjs)$/.test(filename));
const legacyDefinitions = new Set([
  files.legacy,
  files.admission,
  "scripts/check-withdrawal-prebroadcast-evidence.mjs",
]);
for (const filename of productionFiles) {
  if (legacyDefinitions.has(filename)) continue;
  const source = await readFile(filename, "utf8");
  for (const forbiddenCall of [
    "createWithdrawalRequest(",
    "cancelAuthoritativeWithdrawal(",
  ]) {
    if (source.includes(forbiddenCall)) {
      failures.push(
        `${filename}: production code cannot invoke legacy withdrawal mutation ${forbiddenCall}`,
      );
    }
  }
}

for (const contract of [
  "Canonical production paths",
  "Legacy and bypass inventory",
  "External-effect boundary retained",
  "withdrawal.authorize",
  "withdrawal.admin_action",
]) {
  requireText("inventory", contract, `inventory is missing ${contract}`);
}
requireText(
  "package",
  "node scripts/check-withdrawal-prebroadcast-evidence.mjs",
  "withdrawals:check must execute the permanent pre-broadcast evidence guard",
);

if (failures.length) {
  console.error(
    "Withdrawal pre-broadcast evidence check failed:\n- " + failures.join("\n- "),
  );
  process.exit(1);
}

console.log(
  "Withdrawal pre-broadcast evidence check passed: authorization, admission, cancellation and Admin transitions are typed, secret-free, receipt-bound, transaction-coupled and isolated from legacy production mutation paths.",
);
