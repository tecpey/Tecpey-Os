import { readFile } from "node:fs/promises";

const files = {
  inventory:
    "docs/security/WITHDRAWAL_BROADCAST_SETTLEMENT_EVIDENCE_INVENTORY.md",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  helper: "src/lib/security/withdrawal-execution-evidence.ts",
  authority: "src/lib/security/withdrawal-execution-authority.ts",
  migration: "src/lib/db-migrate-withdrawal-execution-attempts.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  walletGuard: "scripts/check-wallet-authority.mjs",
  tests: "src/tests/security/withdrawal-execution-attempt-postgres.test.ts",
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

for (const action of [
  "withdrawal.execution.claim",
  "withdrawal.transaction.build",
  "withdrawal.transaction.sign",
  "withdrawal.broadcast.attempt",
  "withdrawal.broadcast.accept",
  "withdrawal.broadcast.ambiguous",
  "withdrawal.broadcast.reject",
  "withdrawal.reconcile",
  "withdrawal.confirming",
  "withdrawal.dropped",
  "withdrawal.timeout",
  "withdrawal.settle",
  "withdrawal.complete",
]) {
  requireText("audit", action, `missing typed execution action ${action}`);
  requireText("authority", action, `execution authority cannot emit ${action}`);
}
for (const resource of [
  "withdrawal_execution",
  "withdrawal_broadcast_attempt",
  "withdrawal_settlement",
]) {
  requireText("audit", resource, `missing typed execution resource ${resource}`);
}
for (const forbidden of [
  '"rawtransaction"',
  '"raw_transaction"',
  '"rawtx"',
  '"raw_tx"',
  '"unsignedtransaction"',
  '"signinghash"',
  '"txhash"',
  '"transactionhash"',
  '"privatekey"',
  '"private_key"',
  '"seed"',
  '"mnemonic"',
  '"rpcurl"',
  '"rpcresponse"',
  '"providerresponse"',
]) {
  requireText("audit", forbidden, `application evidence redaction is missing ${forbidden}`);
  requireText(
    "migration",
    forbidden.replaceAll('"', "'"),
    `database evidence redaction is missing ${forbidden}`,
  );
}

for (const helper of [
  "fingerprintWithdrawalExecution",
  "fingerprintWithdrawalExecutionAttempt",
  "fingerprintWithdrawalTxHash",
  "fingerprintWithdrawalSignedPayload",
  "fingerprintWithdrawalSignerIdentity",
  "fingerprintWithdrawalProviderPolicy",
  "fingerprintWithdrawalExecutionError",
  "writeWithdrawalExecutionEvidenceTx",
]) {
  requireText("helper", helper, `missing governed execution helper ${helper}`);
}
requireText(
  "helper",
  "withdrawal-execution-evidence-v1",
  "execution evidence needs a versioned policy",
);
requireText(
  "helper",
  "tecpey:${domain}:v1\\u001f",
  "execution fingerprints must use the canonical domain separator",
);

for (const invariant of [
  'FILENAME = "0042_withdrawal_execution_attempts.sql"',
  "withdrawal_execution_attempts",
  "withdrawal_execution_events",
  "withdrawal_reconciliation_outbox",
  "withdrawal execution attempt lease owner mismatch",
  "withdrawal execution attempt lease is expired",
  "withdrawal execution event attempt binding mismatch",
  "withdrawal execution authority is append-only",
  "withdrawal_reconciliation_pending_idx",
  "UNIQUE (withdrawal_id, lease_owner)",
  "UNIQUE (attempt_id, event_type, correlation_id)",
]) {
  requireText("migration", invariant, `missing execution schema invariant ${invariant}`);
}
requireText(
  "migrationPlan",
  "runWithdrawalExecutionAttemptMigrations",
  "canonical migration plan must run execution attempt schema",
);

for (const authority of [
  "createWithdrawalExecutionAttemptTx",
  "appendWithdrawalExecutionEventTx",
  "enqueueWithdrawalReconciliationTx",
  "WITHDRAWAL_EXECUTION_POLICY_VERSION",
]) {
  requireText("authority", authority, `missing transaction-injected authority ${authority}`);
}
for (const binding of [
  "leaseOwnerFingerprint",
  "expectedTxHashFingerprint",
  "signedPayloadFingerprint",
  "signerIdentityFingerprint",
  "providerPolicyFingerprint",
  "errorClassFingerprint",
]) {
  requireText("authority", binding, `missing bounded execution fact ${binding}`);
}

for (const evidence of [
  "commits a lease-bound attempt, claim event and secret-free mandatory evidence atomically",
  "rolls back attempt and claim event when mandatory evidence is rejected",
  "rejects attempts from a stale or foreign lease owner",
  "keeps attempt and event rows append-only",
  "deduplicates reconciliation work for one attempt and reason",
]) {
  requireText("tests", evidence, `missing PostgreSQL execution evidence: ${evidence}`);
}

for (const contract of [
  "Canonical production paths",
  "Broadcast crash window",
  "Required durable attempt model",
  "Required state and reservation policy",
  "Required adversarial evidence",
]) {
  requireText("inventory", contract, `execution inventory is missing ${contract}`);
}
requireText(
  "walletGuard",
  "persist raw transaction BEFORE broadcast",
  "existing persist-before-effect guard must remain intact",
);

if (failures.length) {
  console.error(
    "Withdrawal execution evidence check failed:\n- " + failures.join("\n- "),
  );
  process.exit(1);
}

console.log(
  "Withdrawal execution evidence check passed: typed execution actions, lease-bound append-only attempts/events, secret-free fingerprints, reconciliation outbox and PostgreSQL rollback evidence are permanent.",
);
