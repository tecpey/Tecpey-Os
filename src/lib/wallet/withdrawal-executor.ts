// Withdrawal Executor — persist-before-broadcast hardening.
// Queue payloads are identity triggers only; PostgreSQL owns all execution values.
// A signed raw transaction and deterministic tx hash are committed before any RPC broadcast.

import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createKeyStore } from "./signing/keystore";
import {
  assertCustodyExecutionEnvironmentAllowed,
  assertCustodyWithdrawalAllowed,
} from "./custody-policy";
import { getProvider } from "./providers/registry";
import { enqueueConfirmationWatch } from "./queue/withdrawal-queue";
import { trackWalletMetric, recordLatency } from "./observability";
import { buildTimeoutAt } from "./confirmation/engine";
import {
  assertQueueIdentityMatchesRecord,
  hasDurablePreparedTransaction,
  resolveAuthoritativeFeeSpeed,
} from "./withdrawal-authority";
import type { ChainId, FeeSpeed, WithdrawalJobData } from "./types";

type WithdrawalRecord = {
  id: string;
  userId: string;
  asset: string;
  amount: string;
  amountUsd: string;
  destinationAddress: string;
  network: ChainId;
  state: string;
  txHash: string | null;
  rawTx: Buffer | null;
  idempotencyKey: string | null;
  feeConfig: unknown;
  requiredConfirmations: number;
  lastBroadcastAt: Date | null;
};

type ExecutionPlan = {
  mode: "build" | "resume" | "confirm";
  withdrawal: WithdrawalRecord;
};

export async function executeWithdrawal(job: WithdrawalJobData): Promise<void> {
  // This gate runs before PostgreSQL state is claimed so disabled custody,
  // circuit-breaker activation, worker misconfiguration or an unsupported
  // queue chain can never move an approved withdrawal into execution states.
  assertCustodyExecutionEnvironmentAllowed({ chainId: job.chainId });

  const plan = await claimWithdrawal(job.withdrawalId);
  if (!plan) return;

  assertQueueIdentityMatchesRecord(job, plan.withdrawal);

  assertCustodyWithdrawalAllowed({
    chainId: plan.withdrawal.network,
    amountUsd: plan.withdrawal.amountUsd,
    approvalCount: 1,
  });

  if (plan.mode === "confirm") {
    await ensureConfirmationWatch(plan.withdrawal);
    return;
  }

  const withdrawal = plan.withdrawal;
  const feeSpeed = resolveAuthoritativeFeeSpeed(withdrawal.feeConfig);

  try {
    const prepared = plan.mode === "resume"
      ? withdrawal
      : await buildSignAndPersist(withdrawal, feeSpeed);

    if (!hasDurablePreparedTransaction(prepared)) {
      throw new Error(`Withdrawal ${prepared.id} is missing its durable signed transaction`);
    }

    const broadcastStart = Date.now();
    const result = await broadcastTransaction(
      prepared.network,
      Buffer.from(prepared.rawTx!),
      prepared.id,
      prepared.txHash!,
    );
    recordLatency("withdraw_broadcast_ms", broadcastStart);

    await commitBroadcastResult(prepared.id, prepared.txHash!, result.attempts);
    await ensureConfirmationWatch({
      ...prepared,
      state: "broadcasted",
      lastBroadcastAt: result.broadcastedAt,
    });

    logger.info("[executor] withdrawal broadcasted", {
      withdrawalId: prepared.id,
      txHash: prepared.txHash,
      chainId: prepared.network,
      attempts: result.attempts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("[executor] withdrawal execution failed", {
      withdrawalId: withdrawal.id,
      error: message,
    });
    await markExecutionFailure(withdrawal.id, message);
    throw error;
  }
}

async function buildSignAndPersist(
  withdrawal: WithdrawalRecord,
  feeSpeed: FeeSpeed,
): Promise<WithdrawalRecord> {
  const provider = getProvider(withdrawal.network);
  const keyStore = createKeyStore();
  const fromAddress = await keyStore.getAddress(withdrawal.network);

  const buildStart = Date.now();
  const built = await provider.buildTransaction({
    withdrawalId: withdrawal.id,
    chainId: withdrawal.network,
    asset: withdrawal.asset,
    amount: withdrawal.amount,
    destinationAddress: withdrawal.destinationAddress,
    feeConfig: { speed: feeSpeed },
    fromAddress,
  });
  recordLatency("withdraw_build_ms", buildStart);

  await transitionState(withdrawal.id, "building_transaction", "signing");

  const signStart = Date.now();
  const signature = await keyStore.sign(withdrawal.network, built.signingHash);
  const publicKey = await keyStore.getPublicKey(withdrawal.network);
  const signed = await provider.applySignature(built, signature, publicKey);
  recordLatency("withdraw_sign_ms", signStart);

  const expectedTxHash = signed.txHash || provider.computeTxHash(signed.rawTx);
  if (!expectedTxHash) throw new Error(`Unable to derive transaction hash for ${withdrawal.id}`);

  const requiredConfirmations = provider.requiredConfirmations(feeSpeed);
  const persisted = await withDb(async (db) => db.query<WithdrawalRecord>(
    `UPDATE withdrawals SET
       state = 'broadcasting',
       raw_tx = $2,
       tx_hash = $3,
       chain_id = $4,
       network_fee = $5,
       fee_currency = $6,
       required_confirmations = $7,
       execution_error = NULL,
       updated_at = NOW()
     WHERE id = $1
       AND state = 'signing'
       AND raw_tx IS NULL
       AND tx_hash IS NULL
     RETURNING id,
               user_id AS "userId",
               asset,
               amount::text AS amount,
               amount_usd::text AS "amountUsd",
               destination_address AS "destinationAddress",
               network,
               state,
               tx_hash AS "txHash",
               raw_tx AS "rawTx",
               idempotency_key AS "idempotencyKey",
               fee_config AS "feeConfig",
               required_confirmations AS "requiredConfirmations",
               last_broadcast_at AS "lastBroadcastAt"`,
    [
      withdrawal.id,
      signed.rawTx,
      expectedTxHash,
      withdrawal.network,
      built.fee,
      built.feeCurrency,
      requiredConfirmations,
    ],
  ));

  if (!persisted.enabled || persisted.value.rowCount !== 1 || !persisted.value.rows[0]) {
    throw new Error(`Withdrawal ${withdrawal.id} signed transaction was not durably prepared`);
  }

  return persisted.value.rows[0];
}

async function claimWithdrawal(withdrawalId: string): Promise<ExecutionPlan | null> {
  const result = await withDb(async (db) => {
    const build = await db.query<WithdrawalRecord>(
      `UPDATE withdrawals SET
         state = 'building_transaction',
         execution_error = NULL,
         updated_at = NOW()
       WHERE id = $1
         AND state IN ('approved', 'failed')
         AND raw_tx IS NULL
         AND tx_hash IS NULL
       RETURNING id,
                 user_id AS "userId",
                 asset,
                 amount::text AS amount,
                 amount_usd::text AS "amountUsd",
                 destination_address AS "destinationAddress",
                 network,
                 state,
                 tx_hash AS "txHash",
                 raw_tx AS "rawTx",
                 idempotency_key AS "idempotencyKey",
                 fee_config AS "feeConfig",
                 required_confirmations AS "requiredConfirmations",
                 last_broadcast_at AS "lastBroadcastAt"`,
      [withdrawalId],
    );
    if (build.rows[0]) return { mode: "build", withdrawal: build.rows[0] } as ExecutionPlan;

    const resume = await db.query<WithdrawalRecord>(
      `UPDATE withdrawals SET
         state = 'broadcasting',
         execution_error = NULL,
         updated_at = NOW()
       WHERE id = $1
         AND raw_tx IS NOT NULL
         AND tx_hash IS NOT NULL
         AND (
           state = 'failed'
           OR (state = 'broadcasting' AND updated_at < NOW() - INTERVAL '10 minutes')
         )
       RETURNING id,
                 user_id AS "userId",
                 asset,
                 amount::text AS amount,
                 amount_usd::text AS "amountUsd",
                 destination_address AS "destinationAddress",
                 network,
                 state,
                 tx_hash AS "txHash",
                 raw_tx AS "rawTx",
                 idempotency_key AS "idempotencyKey",
                 fee_config AS "feeConfig",
                 required_confirmations AS "requiredConfirmations",
                 last_broadcast_at AS "lastBroadcastAt"`,
      [withdrawalId],
    );
    if (resume.rows[0]) return { mode: "resume", withdrawal: resume.rows[0] } as ExecutionPlan;

    const existing = await db.query<WithdrawalRecord>(
      `SELECT id,
              user_id AS "userId",
              asset,
              amount::text AS amount,
              amount_usd::text AS "amountUsd",
              destination_address AS "destinationAddress",
              network,
              state,
              tx_hash AS "txHash",
              raw_tx AS "rawTx",
              idempotency_key AS "idempotencyKey",
              fee_config AS "feeConfig",
              required_confirmations AS "requiredConfirmations",
              last_broadcast_at AS "lastBroadcastAt"
         FROM withdrawals
        WHERE id = $1`,
      [withdrawalId],
    );
    const row = existing.rows[0];
    if (!row) throw new Error(`Withdrawal ${withdrawalId} not found`);

    if ((row.state === "broadcasted" || row.state === "confirming") && row.txHash) {
      return { mode: "confirm", withdrawal: row } as ExecutionPlan;
    }
    if (row.state === "completed" || row.state === "cancelled" || row.state === "timeout") {
      trackWalletMetric("idempotency_duplicate_blocked");
      return null;
    }

    logger.warn("[executor] withdrawal is already claimed or not executable", {
      withdrawalId,
      state: row.state,
    });
    return null;
  });

  if (!result.enabled) throw new Error("Withdrawal database unavailable");
  return result.value;
}

async function commitBroadcastResult(
  withdrawalId: string,
  txHash: string,
  attempts: number,
): Promise<void> {
  const result = await withDb(async (db) => {
    const updated = await db.query(
      `UPDATE withdrawals SET
         state = 'broadcasted',
         broadcast_attempts = COALESCE(broadcast_attempts, 0) + $3,
         last_broadcast_at = NOW(),
         execution_error = NULL,
         updated_at = NOW()
       WHERE id = $1
         AND tx_hash = $2
         AND raw_tx IS NOT NULL
         AND state = 'broadcasting'`,
      [withdrawalId, txHash, attempts],
    );
    if (updated.rowCount === 1) return true;

    const current = await db.query<{ state: string; txHash: string | null }>(
      `SELECT state, tx_hash AS "txHash" FROM withdrawals WHERE id = $1`,
      [withdrawalId],
    );
    return Boolean(
      current.rows[0]
      && current.rows[0].txHash === txHash
      && ["broadcasted", "confirming", "completed"].includes(current.rows[0].state),
    );
  });

  if (!result.enabled || !result.value) {
    throw new Error(`Withdrawal ${withdrawalId} broadcast result could not be committed`);
  }
}

async function ensureConfirmationWatch(withdrawal: WithdrawalRecord): Promise<void> {
  if (!withdrawal.txHash) throw new Error(`Withdrawal ${withdrawal.id} has no transaction hash`);

  await enqueueConfirmationWatch({
    withdrawalId: withdrawal.id,
    txHash: withdrawal.txHash,
    chainId: withdrawal.network,
    requiredConfirmations: withdrawal.requiredConfirmations,
    broadcastedAt: (withdrawal.lastBroadcastAt ?? new Date()).toISOString(),
    timeoutAt: buildTimeoutAt(withdrawal.network),
  });

  await withDb(async (db) => {
    await db.query(
      `UPDATE withdrawals SET state = 'confirming', updated_at = NOW()
        WHERE id = $1 AND tx_hash = $2 AND state = 'broadcasted'`,
      [withdrawal.id, withdrawal.txHash],
    );
    return null;
  });
}

async function transitionState(
  withdrawalId: string,
  expectedState: string,
  nextState: string,
): Promise<void> {
  const result = await withDb(async (db) => db.query(
    `UPDATE withdrawals SET state = $3, execution_error = NULL, updated_at = NOW()
      WHERE id = $1 AND state = $2`,
    [withdrawalId, expectedState, nextState],
  ));
  if (!result.enabled || result.value.rowCount !== 1) {
    throw new Error(`Withdrawal ${withdrawalId} state transition ${expectedState} -> ${nextState} failed`);
  }
}

async function markExecutionFailure(withdrawalId: string, error: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `UPDATE withdrawals SET state = 'failed', execution_error = $2, updated_at = NOW()
        WHERE id = $1 AND state IN ('building_transaction', 'signing', 'broadcasting')`,
      [withdrawalId, error],
    );
    return null;
  });
}

async function broadcastTransaction(
  chainId: ChainId,
  rawTx: Buffer,
  withdrawalId: string,
  expectedTxHash: string,
): Promise<{ txHash: string; broadcastedAt: Date; attempts: number }> {
  const { getRpcClient } = await import("./rpc/client");
  const rpc = getRpcClient(chainId);
  const rawHex = "0x" + rawTx.toString("hex");
  let attempts = 0;
  let lastError: Error = new Error("Broadcast failed");

  for (const delay of [0, 5_000, 15_000]) {
    if (delay > 0) await sleep(delay);
    attempts++;

    try {
      let txHash: string;
      if (chainId === "bitcoin") {
        txHash = await rpc.call<string>("sendrawtransaction", [rawTx.toString("hex")]);
      } else if (chainId === "solana") {
        await rpc.call<string>("sendTransaction", [rawTx.toString("base64"), {
          encoding: "base64",
          preflightCommitment: "confirmed",
        }]);
        txHash = expectedTxHash;
      } else {
        txHash = await rpc.call<string>("eth_sendRawTransaction", [rawHex]);
      }

      if (txHash.toLowerCase() !== expectedTxHash.toLowerCase()) {
        throw new Error(`Broadcast hash mismatch for ${withdrawalId}`);
      }
      return { txHash, broadcastedAt: new Date(), attempts };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      trackWalletMetric("rpc_failures");
      if (attempts > 1) trackWalletMetric("rebroadcast_count");

      if (/already known|alreadyprocessed|txn-already-known/i.test(lastError.message)) {
        logger.info("[executor] durable signed transaction already known", {
          withdrawalId,
          expectedTxHash,
        });
        return { txHash: expectedTxHash, broadcastedAt: new Date(), attempts };
      }
      logger.warn("[executor] broadcast attempt failed", {
        withdrawalId,
        attempts,
        error: lastError.message,
      });
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
