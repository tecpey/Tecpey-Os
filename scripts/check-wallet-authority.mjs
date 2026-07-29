import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const executor = read("src/lib/wallet/withdrawal-executor.ts");
const externalEffectAuthority = read(
  "src/lib/security/withdrawal-external-effect-authority.ts",
);
const confirmation = read("src/lib/wallet/confirmation/engine.ts");
const settlement = read("src/lib/security/withdrawal-settlement-authority.ts");
const recovery = read(
  "src/lib/security/withdrawal-external-effect-recovery.ts",
);
const producer = read("src/lib/wallet/queue/withdrawal-queue.ts");
const consumer = read("src/lib/wallet/queue/processor.ts");
const queuePolicy = read("src/lib/wallet/queue/policy.ts");

const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

requireText(
  externalEffectAuthority,
  "raw_tx = $2",
  "signed raw transaction must be persisted by the canonical authority before broadcast",
);
requireText(
  externalEffectAuthority,
  "tx_hash = $3",
  "deterministic transaction hash must be persisted by the canonical authority before broadcast",
);
requireText(
  externalEffectAuthority,
  "AND raw_tx IS NOT NULL",
  "broadcast finalization must require durable raw transaction bytes",
);
requireText(
  executor,
  "commitPreparedWithdrawalExecution",
  "executor must delegate prepared-transaction persistence to the canonical authority",
);
requireText(
  executor,
  "beginWithdrawalBroadcastAttempt",
  "executor must persist one durable attempt before the RPC effect",
);
requireText(
  executor,
  "finalizeWithdrawalBroadcastAccepted",
  "accepted broadcast outcomes must use the canonical authority",
);
requireText(
  executor,
  "finalizeWithdrawalBroadcastFailure",
  "failed or ambiguous broadcast outcomes must use the canonical authority",
);
requireText(
  executor,
  "resolveAuthoritativeFeeSpeed(withdrawal.feeConfig)",
  "fee policy must come from the DB record",
);
rejectText(
  executor,
  "fee_speed",
  "executor must not query the nonexistent fee_speed column",
);
rejectText(
  executor,
  "job.chainId",
  "executor must not use queue-provided chain authority",
);
rejectText(
  executor,
  "job.amount",
  "executor must not use queue-provided amount authority",
);
rejectText(
  executor,
  "job.destinationAddress",
  "executor must not use queue-provided destination authority",
);

const prepareCallIndex = executor.indexOf("await buildSignAndPersist(");
const broadcastCallIndex = executor.indexOf(
  "const outcome = await broadcastOnce(attempt);",
);
if (
  prepareCallIndex < 0 ||
  broadcastCallIndex < 0 ||
  prepareCallIndex > broadcastCallIndex
) {
  failures.push("execution must durably prepare before invoking broadcast");
}

requireText(
  confirmation,
  'tx_hash AS "txHash"',
  "confirmation must hydrate tx hash from PostgreSQL",
);
requireText(
  confirmation,
  'required_confirmations AS "requiredConfirmations"',
  "confirmation policy must hydrate from PostgreSQL",
);
requireText(
  confirmation,
  "publishWithdrawalConfirmationOutbox",
  "confirmation must establish durable monitoring authority before provider observation",
);
requireText(
  confirmation,
  "withdrawal_confirmation_monitor_authority_unavailable",
  "confirmation must fail closed when monitor evidence cannot commit",
);
requireText(
  confirmation,
  'row.state !== "confirming"',
  "confirmation must require the committed confirming state",
);
requireText(
  confirmation,
  "markWithdrawalConfirmationOutcome",
  "terminal confirmation outcomes must use the canonical authority",
);
requireText(
  confirmation,
  "settleConfirmedWithdrawal",
  "confirmed settlement must use the canonical transaction authority",
);
rejectText(
  confirmation,
  "UPDATE withdrawals",
  "confirmation worker must not own direct withdrawal state mutation",
);
requireText(
  externalEffectAuthority,
  "withdrawal_confirmation_authority_mismatch",
  "terminal confirmation authority must bind the authoritative tx hash",
);
requireText(
  externalEffectAuthority,
  "state IN ('broadcasted', 'confirming')",
  "terminal confirmation authority must bind valid database states",
);
requireText(
  settlement,
  'row.state !== "confirming"',
  "settlement must require committed confirmation monitoring authority",
);

requireText(
  recovery,
  "lease_expires_at <= NOW() AS expired",
  "broadcast lease recovery must derive expiry from PostgreSQL",
);
requireText(
  recovery,
  "withdrawal_broadcast_lease_timeout",
  "expired broadcast calls must become ambiguous reconciliation debt",
);
requireText(
  executor,
  "recoverExpiredWithdrawalBroadcastAttempt",
  "executor must classify stale external-effect leases before a new claim",
);
requireText(
  executor,
  "enqueueRecovery",
  "live broadcast leases must retain a delayed recovery projection",
);

requireText(
  producer,
  "WITHDRAWAL_QUEUE_NAMES.confirmation",
  "confirmation producer must use shared queue name",
);
requireText(
  producer,
  "WITHDRAWAL_QUEUE_NAMES.recovery",
  "recovery producer must use shared queue name",
);
requireText(
  consumer,
  "WITHDRAWAL_QUEUE_NAMES.confirmation",
  "confirmation worker must use shared queue name",
);
requireText(
  consumer,
  "WITHDRAWAL_QUEUE_NAMES.recovery",
  "recovery worker must use shared queue name",
);
rejectText(
  consumer,
  '"withdrawal:confirmation"',
  "legacy mismatched confirmation queue name is forbidden",
);
rejectText(
  consumer,
  '"withdrawal:recovery"',
  "legacy mismatched recovery queue name is forbidden",
);

requireText(
  queuePolicy,
  "createWalletQueueJobId",
  "wallet queues need one governed custom job-ID factory",
);
requireText(
  queuePolicy,
  "confirmationAttemptBudget",
  "confirmation retry budget must derive from authoritative timeout coverage",
);
requireText(
  producer,
  "deduplication: { id:",
  "active BullMQ jobs must use atomic simple deduplication",
);
requireText(
  producer,
  'queueIdentity("confirmation", data.withdrawalId);',
  "confirmation deduplication must bind one live watcher to the authoritative withdrawal ID",
);
requireText(
  producer,
  "MAX_CONFIRMATION_ATTEMPTS",
  "confirmation queue must cover the maximum authoritative timeout",
);
rejectText(
  producer,
  'queueIdentity("confirmation", data.withdrawalId, data.txHash)',
  "untrusted queue txHash must not create a parallel confirmation deduplication identity",
);
rejectText(
  producer,
  "prepareRestorableJobSlot",
  "terminal remove/re-add restoration is race-prone",
);
rejectText(
  producer,
  ".remove()",
  "queue producers must not remove a possibly replaced job by shared ID",
);
rejectText(
  producer,
  "attempts: 50",
  "fixed 50-attempt confirmation policy ends before the Bitcoin timeout",
);
for (const forbidden of [
  "`withdrawal:${",
  "`confirm:${",
  "`dlq:${",
  "`recovery:${",
]) {
  rejectText(
    producer,
    forbidden,
    `BullMQ custom job IDs must not use reserved colon syntax: ${forbidden}`,
  );
}

if (failures.length) {
  console.error("Wallet authority boundary check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Wallet authority boundary check passed: PostgreSQL owns preparation, broadcast attempts, confirmation outcomes and settlement; BullMQ remains a deduplicated repairable projection.",
);
