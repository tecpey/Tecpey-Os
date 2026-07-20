import { readFile } from "node:fs/promises";

const files = {
  inventory: "docs/security/WITHDRAWAL_EXTERNAL_EFFECT_EVIDENCE_INVENTORY.md",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  evidence: "src/lib/security/withdrawal-external-effect-evidence.ts",
  authority: "src/lib/security/withdrawal-external-effect-authority.ts",
  schema: "src/lib/db-migrate-withdrawal-external-effect-evidence.ts",
  gate: "src/lib/db-migrate-withdrawal-external-effect-gate.ts",
  gatePatch: "src/lib/db-migrate-withdrawal-external-effect-gate-amount-cast.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  executor: "src/lib/wallet/withdrawal-executor.ts",
  confirmation: "src/lib/wallet/confirmation/engine.ts",
  settlement: "src/lib/security/withdrawal-settlement-authority.ts",
  schemaTests: "src/tests/security/withdrawal-external-effect-schema-postgres.test.ts",
  authorityTests: "src/tests/security/withdrawal-external-effect-authority-postgres.test.ts",
  settlementTests: "src/tests/security/withdrawal-settlement-postgres.test.ts",
  package: "package.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, filename]) => [
      key,
      await readFile(filename, "utf8"),
    ]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!source[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (source[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

for (const action of [
  "withdrawal.execution.claim",
  "withdrawal.transaction.prepare",
  "withdrawal.broadcast.attempt",
  "withdrawal.broadcast.accepted",
  "withdrawal.broadcast.ambiguous",
  "withdrawal.broadcast.rejected",
  "withdrawal.broadcast.hash_mismatch",
  "withdrawal.confirmation.monitor",
  "withdrawal.confirmation.dropped",
  "withdrawal.confirmation.timeout",
  "withdrawal.settle",
]) {
  requireText("audit", action, `missing typed action ${action}`);
  requireText("evidence", action, `evidence helper cannot emit ${action}`);
}
for (const resource of [
  "withdrawal_execution",
  "withdrawal_broadcast_attempt",
  "withdrawal_settlement",
]) {
  requireText("audit", resource, `missing typed resource ${resource}`);
  requireText("evidence", resource, `evidence helper cannot emit ${resource}`);
}
for (const forbidden of [
  '"rawtx"',
  '"raw_tx"',
  '"txhash"',
  '"tx_hash"',
  '"privatekey"',
  '"private_key"',
  '"providerpayload"',
  '"provider_payload"',
  '"nonce"',
  '"utxo"',
]) {
  requireText("audit", forbidden, `application redaction is missing ${forbidden}`);
  requireText("schema", forbidden.replaceAll('"', "'"), `database redaction is missing ${forbidden}`);
}

for (const invariant of [
  'FILENAME = "0042_withdrawal_external_effect_evidence.sql"',
  "withdrawal_execution_intents",
  "withdrawal_broadcast_attempts",
  "withdrawal_confirmation_outbox",
  "withdrawal_execution_one_active_generation",
  "withdrawal_broadcast_one_active_attempt",
  "withdrawal execution intent rows are append-preserved",
  "withdrawal broadcast attempt rows are append-preserved",
  "completed withdrawal confirmation outbox is immutable",
]) {
  requireText("schema", invariant, `missing schema invariant ${invariant}`);
}
for (const invariant of [
  'FILENAME = "0043_withdrawal_external_effect_gate.sql"',
  "withdrawal transaction preparation evidence is missing",
  "withdrawal broadcast retry requires reconciliation authority",
  "withdrawal broadcast acceptance evidence is missing",
  "withdrawal confirmation publication evidence is missing",
  "withdrawal confirmation terminal evidence is missing",
  "withdrawal settlement mandatory evidence is missing",
]) {
  requireText("gate", invariant, `missing database transition gate ${invariant}`);
}
for (const invariant of [
  'FILENAME = "0044_withdrawal_external_effect_gate_amount_cast.sql"',
  "AND amount = NEW.amount::numeric",
  "patch target is missing",
]) {
  requireText("gatePatch", invariant, `missing immutable gate repair ${invariant}`);
}
requireText(
  "migrationPlan",
  "runWithdrawalExternalEffectEvidenceMigrations",
  "canonical migration plan must run schema 0042",
);
requireText(
  "migrationPlan",
  "runWithdrawalExternalEffectGateMigrations",
  "canonical migration plan must run gate 0043",
);
requireText(
  "migrationPlan",
  "runWithdrawalExternalEffectGateAmountCastMigrations",
  "canonical migration plan must run gate repair 0044",
);

for (const functionName of [
  "claimWithdrawalExecution",
  "commitPreparedWithdrawalExecution",
  "beginWithdrawalBroadcastAttempt",
  "finalizeWithdrawalBroadcastAccepted",
  "finalizeWithdrawalBroadcastFailure",
  "reconcileAmbiguousWithdrawalBroadcast",
  "publishWithdrawalConfirmationOutbox",
  "markWithdrawalConfirmationOutcome",
]) {
  requireText("authority", functionName, `missing canonical authority ${functionName}`);
  requireText("executor", functionName, `executor does not delegate to ${functionName}`);
}
requireText(
  "authority",
  "state IN ('prepared', 'calling', 'ambiguous')",
  "authority must block concurrent or ambiguous active attempts",
);
requireText(
  "authority",
  "withdrawal.broadcast.ambiguous",
  "ambiguous RPC outcomes need mandatory durable evidence",
);
requireText(
  "authority",
  "withdrawal_confirmation_outbox",
  "broadcast acceptance must create durable confirmation work",
);

for (const forbiddenSequence of [
  "UPDATE withdrawals SET\n         state = 'broadcasted'",
  "UPDATE withdrawals SET state = 'confirming'",
  "markExecutionFailure(",
  "commitBroadcastResult(",
  "transitionState(",
  "for (const delay of [0, 5_000, 15_000])",
]) {
  rejectText(
    "executor",
    forbiddenSequence,
    `executor reintroduced direct or hidden retry authority: ${forbiddenSequence}`,
  );
}
requireText(
  "executor",
  "broadcastOnce",
  "one durable attempt must wrap one RPC submission",
);
requireText(
  "executor",
  "withdrawal_broadcast_reconciliation_inconclusive",
  "unknown reconciliation cannot become blind retry",
);
requireText(
  "executor",
  "confirmationProjectionPending",
  "post-commit queue publication must be reported as repairable projection",
);

rejectText(
  "confirmation",
  "UPDATE withdrawals",
  "confirmation engine cannot mutate authoritative state directly",
);
requireText(
  "confirmation",
  "markWithdrawalConfirmationOutcome",
  "dropped and timeout transitions must use mandatory evidence authority",
);
requireText(
  "confirmation",
  "settleConfirmedWithdrawal",
  "confirmed settlement must use the canonical transaction authority",
);
requireText(
  "confirmation",
  "withdrawal_confirmation_monitor_authority_unavailable",
  "provider observation must stop when monitor evidence cannot commit",
);
requireText(
  "confirmation",
  'row.state !== "confirming"',
  "confirmation worker must require committed confirming authority",
);
rejectText(
  "confirmation",
  '["broadcasted", "confirming"].includes(row.state)',
  "broadcasted cannot bypass monitor evidence",
);

requireText(
  "settlement",
  "writeWithdrawalExternalEffectEvidenceTx",
  "settlement must write mandatory evidence in its financial transaction",
);
requireText(
  "settlement",
  "completeWithdrawalConfirmationOutbox",
  "settlement must complete confirmation projection in the same transaction",
);
requireText(
  "settlement",
  'row.state !== "confirming"',
  "settlement must require committed confirmation authority",
);
requireText(
  "settlement",
  "expectedTransactionHashFingerprint: transactionFingerprint",
  "settlement evidence must match the database gate metadata contract",
);
requireText(
  "settlementTests",
  "rolls back held-balance consumption, ledger and completed state when mandatory evidence conflicts",
  "settlement rollback evidence is missing",
);

for (const proof of [
  "enforces one active execution generation",
  "blocks a new broadcast attempt until an ambiguous attempt is reconciled",
  "keeps confirmation projection identity immutable",
  "rejects raw transaction and transaction-hash keys",
]) {
  requireText("schemaTests", proof, `schema adversarial proof is missing: ${proof}`);
}
for (const proof of [
  "allows one concurrent execution claim",
  "rolls back raw transaction, hash and intent finalization",
  "requires ambiguity reconciliation before a second durable broadcast attempt",
  "commits accepted broadcast, durable confirmation projection",
  "prevents the prepared transaction from blind rebroadcast",
]) {
  requireText("authorityTests", proof, `authority adversarial proof is missing: ${proof}`);
}

for (const proof of [
  "persist-before-effect",
  "confirmed ambiguity window",
  "BullMQ execution, confirmation, recovery and DLQ queues",
  "production custody launch gate",
  "does not by itself approve real-money custody",
]) {
  requireText("inventory", proof, `inventory/non-goal contract is missing: ${proof}`);
}

requireText(
  "package",
  "node scripts/check-withdrawal-external-effect-evidence.mjs",
  "withdrawals:check must execute external-effect guard",
);
requireText(
  "package",
  "withdrawal-external-effect*.test.ts",
  "focused Withdrawal gate must execute external-effect PostgreSQL tests",
);

if (failures.length) {
  console.error(
    "Withdrawal external-effect evidence guard failed:\n- " + failures.join("\n- "),
  );
  process.exit(1);
}

console.log(
  "Withdrawal external-effect evidence guard passed: preparation, broadcast attempts, ambiguity reconciliation, confirmation projection/outcomes and settlement are PostgreSQL-authoritative, mandatory-evidence-coupled, secret-free and protected from direct mutation paths.",
);
