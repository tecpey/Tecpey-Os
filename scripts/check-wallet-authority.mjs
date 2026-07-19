import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const executor = read("src/lib/wallet/withdrawal-executor.ts");
const confirmation = read("src/lib/wallet/confirmation/engine.ts");
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

requireText(executor, "raw_tx = $2", "signed raw transaction must be persisted before broadcast");
requireText(executor, "tx_hash = $3", "deterministic transaction hash must be persisted before broadcast");
requireText(executor, "AND raw_tx IS NOT NULL", "broadcast finalization must require durable raw transaction bytes");
requireText(executor, "resolveAuthoritativeFeeSpeed(withdrawal.feeConfig)", "fee policy must come from the DB record");
rejectText(executor, "fee_speed", "executor must not query the nonexistent fee_speed column");
rejectText(executor, "job.chainId", "executor must not use queue-provided chain authority");
rejectText(executor, "job.amount", "executor must not use queue-provided amount authority");
rejectText(executor, "job.destinationAddress", "executor must not use queue-provided destination authority");

const prepareCallIndex = executor.indexOf("await buildSignAndPersist(");
const broadcastCallIndex = executor.indexOf("await broadcastTransaction(");
if (prepareCallIndex < 0 || broadcastCallIndex < 0 || prepareCallIndex > broadcastCallIndex) {
  failures.push("execution must durably prepare before invoking broadcast");
}

requireText(confirmation, "tx_hash AS \"txHash\"", "confirmation must hydrate tx hash from PostgreSQL");
requireText(confirmation, "required_confirmations AS \"requiredConfirmations\"", "confirmation policy must hydrate from PostgreSQL");
requireText(confirmation, "AND tx_hash = $2", "confirmation transitions must bind the authoritative tx hash");
requireText(confirmation, "state IN ('broadcasted', 'confirming')", "confirmation transitions must bind valid states");

requireText(producer, "WITHDRAWAL_QUEUE_NAMES.confirmation", "confirmation producer must use shared queue name");
requireText(producer, "WITHDRAWAL_QUEUE_NAMES.recovery", "recovery producer must use shared queue name");
requireText(consumer, "WITHDRAWAL_QUEUE_NAMES.confirmation", "confirmation worker must use shared queue name");
requireText(consumer, "WITHDRAWAL_QUEUE_NAMES.recovery", "recovery worker must use shared queue name");
rejectText(consumer, '"withdrawal:confirmation"', "legacy mismatched confirmation queue name is forbidden");
rejectText(consumer, '"withdrawal:recovery"', "legacy mismatched recovery queue name is forbidden");

requireText(queuePolicy, "createWalletQueueJobId", "wallet queues need one governed custom job-ID factory");
requireText(queuePolicy, "confirmationAttemptBudget", "confirmation retry budget must derive from authoritative timeout coverage");
requireText(producer, "deduplication: { id:", "active BullMQ jobs must use atomic simple deduplication");
requireText(
  producer,
  'queueIdentity("confirmation", data.withdrawalId);',
  "confirmation deduplication must bind one live watcher to the authoritative withdrawal ID",
);
requireText(producer, "MAX_CONFIRMATION_ATTEMPTS", "confirmation queue must cover the maximum authoritative timeout");
rejectText(
  producer,
  'queueIdentity("confirmation", data.withdrawalId, data.txHash)',
  "untrusted queue txHash must not create a parallel confirmation deduplication identity",
);
rejectText(producer, "prepareRestorableJobSlot", "terminal remove/re-add restoration is race-prone");
rejectText(producer, ".remove()", "queue producers must not remove a possibly replaced job by shared ID");
rejectText(producer, "attempts: 50", "fixed 50-attempt confirmation policy ends before the Bitcoin timeout");
for (const forbidden of ["`withdrawal:${", "`confirm:${", "`dlq:${", "`recovery:${"]) {
  rejectText(producer, forbidden, `BullMQ custom job IDs must not use reserved colon syntax: ${forbidden}`);
}

if (failures.length) {
  console.error("Wallet authority boundary check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Wallet authority boundary check passed.");
