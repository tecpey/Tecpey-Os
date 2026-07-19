// Withdrawal Executor — Phase 38 hardening.
// Queue payloads are identity triggers only. Approved financial and destination values come from PostgreSQL.
// Idempotency: an atomic state claim blocks concurrent workers; the expected signed hash recovers already-known broadcasts.

import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createKeyStore } from "./signing/keystore";
import { getProvider } from "./providers/registry";
import { enqueueConfirmationWatch, moveToDeadLetter } from "./queue/withdrawal-queue";
import { trackWalletMetric, recordLatency } from "./observability";
import { buildTimeoutAt } from "./confirmation/engine";
import { assertQueueIdentityMatchesRecord } from "./withdrawal-authority";
import type { ChainId, FeeSpeed, WithdrawalJobData } from "./types";

type WithdrawalRecord = {
  id: string;
  userId: string;
  asset: string;
  amount: string;
  destinationAddress: string;
  network: ChainId;
  state: string;
  txHash: string | null;
  idempotencyKey: string | null;
  feeSpeed: FeeSpeed;
};

export async function executeWithdrawal(job: WithdrawalJobData): Promise<void> {
  const withdrawal = await claimApprovedWithdrawal(job.withdrawalId);
  if (!withdrawal) return;

  assertQueueIdentityMatchesRecord(job, withdrawal);

  const { id: withdrawalId, network, asset, amount, destinationAddress, feeSpeed } = withdrawal;
  const keyStore = createKeyStore();
  const provider = getProvider(network);
  const fromAddress = await keyStore.getAddress(network);

  try {
    const buildStart = Date.now();
    const built = await provider.buildTransaction({
      withdrawalId,
      chainId: network,
      asset,
      amount,
      destinationAddress,
      feeConfig: { speed: feeSpeed },
      fromAddress,
    });
    recordLatency("withdraw_build_ms", buildStart);

    await updateWithdrawalState(withdrawalId, "signing");
    const signStart = Date.now();
    const signature = await keyStore.sign(network, built.signingHash);
    const publicKey = await keyStore.getPublicKey(network);
    const signed = await provider.applySignature(built, signature, publicKey);
    recordLatency("withdraw_sign_ms", signStart);

    await updateWithdrawalState(withdrawalId, "broadcasting");
    const broadcastStart = Date.now();
    const expectedTxHash = signed.txHash || provider.computeTxHash(signed.rawTx);
    const broadcastResult = await broadcastTransaction(
      network,
      signed.rawTx,
      withdrawalId,
      expectedTxHash,
    );
    recordLatency("withdraw_broadcast_ms", broadcastStart);

    const persisted = await withDb(async (db) => db.query(
      `UPDATE withdrawals SET
         state = 'broadcasted',
         tx_hash = $2,
         broadcast_attempts = COALESCE(broadcast_attempts, 0) + $3,
         last_broadcast_at = NOW(),
         network_fee = $4,
         fee_currency = $5,
         updated_at = NOW()
       WHERE id = $1 AND tx_hash IS NULL AND state = 'broadcasting'`,
      [withdrawalId, broadcastResult.txHash, broadcastResult.attempts, built.fee, built.feeCurrency],
    ));
    if (!persisted.enabled || persisted.value.rowCount !== 1) {
      throw new Error(`Withdrawal ${withdrawalId} broadcast result could not be committed`);
    }

    const confirmations = provider.requiredConfirmations(feeSpeed);
    await enqueueConfirmationWatch({
      withdrawalId,
      txHash: broadcastResult.txHash,
      chainId: network,
      requiredConfirmations: confirmations,
      broadcastedAt: broadcastResult.broadcastedAt.toISOString(),
      timeoutAt: buildTimeoutAt(network),
    });

    await updateWithdrawalState(withdrawalId, "confirming");
    logger.info("[executor] withdrawal broadcasted", {
      withdrawalId,
      txHash: broadcastResult.txHash,
      chainId: network,
      fee: built.fee,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[executor] withdrawal failed", { withdrawalId, error: errorMsg });
    await updateWithdrawalState(withdrawalId, "failed", errorMsg);
    await moveToDeadLetter(job, errorMsg);
    throw err;
  }
}

async function claimApprovedWithdrawal(withdrawalId: string): Promise<WithdrawalRecord | null> {
  const result = await withDb(async (db) => {
    const claimed = await db.query<WithdrawalRecord>(
      `UPDATE withdrawals
          SET state = 'building_transaction', execution_error = NULL, updated_at = NOW()
        WHERE id = $1 AND state = 'approved' AND tx_hash IS NULL
        RETURNING id, user_id, asset, amount::text, destination_address, network, state,
                  tx_hash, idempotency_key, COALESCE(fee_speed, 'normal') AS fee_speed`,
      [withdrawalId],
    );
    if (claimed.rows[0]) return claimed.rows[0];

    const existing = await db.query<{ state: string; txHash: string | null }>(
      `SELECT state, tx_hash FROM withdrawals WHERE id = $1`,
      [withdrawalId],
    );
    const row = existing.rows[0];
    if (!row) throw new Error(`Withdrawal ${withdrawalId} not found`);
    if (row.txHash) {
      trackWalletMetric("idempotency_duplicate_blocked");
      logger.info("[executor] duplicate detected, already broadcasted", { withdrawalId, txHash: row.txHash });
    } else {
      logger.warn("[executor] skipping non-approved or already claimed withdrawal", {
        withdrawalId,
        state: row.state,
      });
    }
    return null;
  });

  if (!result.enabled) throw new Error("Withdrawal database unavailable");
  return result.value;
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
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      trackWalletMetric("rpc_failures");
      if (attempts > 1) trackWalletMetric("rebroadcast_count");

      if (/already known|alreadyprocessed|txn-already-known/i.test(lastError.message)) {
        logger.info("[executor] signed transaction already known", { withdrawalId, expectedTxHash });
        return { txHash: expectedTxHash, broadcastedAt: new Date(), attempts };
      }
      logger.warn("[executor] broadcast attempt failed", { withdrawalId, attempts, error: lastError.message });
    }
  }

  throw lastError;
}

async function updateWithdrawalState(
  withdrawalId: string,
  state: string,
  error?: string,
): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `UPDATE withdrawals SET state = $2, execution_error = $3, updated_at = NOW() WHERE id = $1`,
      [withdrawalId, state, error ?? null],
    );
    return null;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
