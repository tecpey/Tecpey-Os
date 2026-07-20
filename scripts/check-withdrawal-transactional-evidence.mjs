import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const audit = read("src/lib/security/sensitive-mutation-audit.ts");
const evidence = read("src/lib/security/withdrawal-evidence.ts");
const migration = read("src/lib/db-migrate-withdrawal-transactional-evidence.ts");
const migrationPlan = read("src/lib/db-migration-plan.ts");
const unitTest = read("src/tests/security/withdrawal-transactional-evidence.test.ts");
const inventory = read("docs/security/WITHDRAWAL_TRANSACTIONAL_EVIDENCE_INVENTORY.md");

const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

for (const action of [
  '"withdrawal.admit"',
  '"withdrawal.cancel"',
  '"withdrawal.admin.approve"',
  '"withdrawal.admin.reject"',
  '"withdrawal.admin.block"',
  '"withdrawal.admin.flag_review"',
]) {
  requireText(audit, action, `typed mandatory Withdrawal action is missing: ${action}`);
}
requireText(audit, '| "withdrawal"', "typed withdrawal audit resource is missing");

for (const forbiddenKey of [
  '"authorizationid"',
  '"authorization_id"',
  '"destinationaddress"',
  '"destination_address"',
  '"destinationtag"',
  '"destination_tag"',
  '"notes"',
  '"reviewnotes"',
  '"review_notes"',
  '"roles"',
  '"devicefingerprint"',
  '"device_fingerprint"',
  '"document"',
  '"documents"',
]) {
  requireText(
    audit,
    forbiddenKey,
    `sensitive audit redaction boundary is missing Withdrawal key: ${forbiddenKey}`,
  );
}

for (const invariant of [
  "WITHDRAWAL_EVIDENCE_POLICY_VERSION",
  "fingerprintWithdrawal",
  "fingerprintWithdrawalDestination",
  "buildWithdrawalAdmissionEvidence",
  "buildWithdrawalCancellationEvidence",
  "buildWithdrawalAdminDecisionEvidence",
  "destinationFingerprint",
  "reviewNotesFingerprint",
  "adminActionFingerprint",
  "releasedAmount",
  "reservedAmount",
  "\\u001f",
]) {
  requireText(evidence, invariant, `bounded Withdrawal evidence invariant is missing: ${invariant}`);
}
for (const forbidden of [
  "destinationAddress:",
  "destinationTag:",
  "reviewNotes:",
  "metadata: { address",
  "metadata: { notes",
]) {
  if (forbidden.startsWith("metadata")) {
    rejectText(
      evidence,
      forbidden,
      `Withdrawal evidence must not store raw authority metadata: ${forbidden}`,
    );
  }
}

for (const invariant of [
  'FILENAME = "0039_withdrawal_transactional_evidence.sql"',
  "tecpey_append_withdrawal_admission_evidence",
  "AFTER INSERT ON withdrawals",
  "INSERT INTO sensitive_mutation_audit_events",
  "'withdrawal.admit'",
  "'withdrawal'",
  "'withdrawal-destination-'",
  "'withdrawal-price-snapshot-'",
  "state_value NOT IN ('pending', 'compliance_review', 'blocked')",
  "blocked withdrawal cannot retain reserved funds",
  "admitted withdrawal must have reserved funds",
  "request_hash_value !~ '^[0-9a-f]{64}$'",
  "chr(31)",
  "sha256(",
]) {
  requireText(
    migration,
    invariant,
    `transactional Withdrawal admission migration is missing: ${invariant}`,
  );
}
for (const forbidden of [
  "ON CONFLICT DO NOTHING",
  "chr(0)",
  "row_data->>'authorization_id'",
  "'address', address_value",
  "'tag', tag_value",
]) {
  rejectText(
    migration,
    forbidden,
    `Withdrawal admission evidence contains forbidden or fail-open behavior: ${forbidden}`,
  );
}
if (/\bdigest\(\s*convert_to\(/m.test(migration)) {
  failures.push(
    "Withdrawal evidence SQL must not depend on pgcrypto digest(convert_to(...))",
  );
}

requireText(
  migrationPlan,
  'import { runWithdrawalTransactionalEvidenceMigrations } from "./db-migrate-withdrawal-transactional-evidence"',
  "canonical migration plan must import Withdrawal evidence migration",
);
const auditIndex = migrationPlan.indexOf("await runSensitiveMutationAuditMigrations(client)");
const withdrawalIndex = migrationPlan.indexOf(
  "await runWithdrawalTransactionalEvidenceMigrations(client)",
);
if (auditIndex < 0 || withdrawalIndex <= auditIndex) {
  failures.push(
    "Withdrawal evidence migration must execute after sensitive mutation audit authority",
  );
}

for (const proof of [
  "without raw destination authority",
  "committed blocked admission as rejected with zero reserve",
  "exact released reserve",
  "without raw notes or Admin action identity",
  "scientific notation, reserve/release mismatch and unsafe decision codes",
]) {
  requireText(
    unitTest,
    proof,
    `missing Withdrawal evidence unit proof: ${proof}`,
  );
}

for (const contract of [
  "Production mutation-path inventory",
  "Existing authority that must be preserved",
  "Proposed typed evidence design",
  "Required adversarial evidence",
  "NO-GO for #189 completion",
]) {
  requireText(inventory, contract, `Withdrawal evidence inventory is missing: ${contract}`);
}

if (failures.length > 0) {
  console.error("Withdrawal transactional evidence check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Withdrawal transactional evidence foundation passed: typed actions, bounded fingerprints, forbidden-key redaction, fail-closed admission trigger, canonical migration ordering and unit privacy/financial proofs are permanent.",
);
