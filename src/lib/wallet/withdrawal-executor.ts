// Withdrawal Executor — Phase 38
// Orchestrates: build → sign → broadcast → confirm.
// Idempotency: if tx_hash already set on the withdrawal, broadcast is skipped.
// State machine transitions tracked in the withdrawals table.

import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createKeyStore } from "./signing/keystore";
import { getProvider } from "./providers/registry";
import { enqueueConfirmationWatch, moveToDeadLetter } from "./queue/withdrawal-queue";
import { trackWalletMetric, recordLatency } from "./observability";
import { buildTimeoutAt } from "./confirmation/engine";
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
  fromAddress: string | null;
  feeSpeed: FeeSpeed;
};

// ── Public: execute a withdrawal job from queue ───────────────────────────────

export async function executeWithdrawal(job: WithdrawalJobData): Promise<void> {
  const { withdrawalId, chainId, amount, destinationAddress, asset, feeSpeed } = job;

  // Fetch the withdrawal record
  const fetchResult = await withDb(async (db) => {
    const res = await db.query<WithdrawalRecord>(
      `SELECT id, user_id, asset, amount, destination_address, network, state,
              tx_hash, idempotency_key
       FROM withdrawals WHERE id = $1`,
      [withdrawalId],
    );
    return res.rows[0] ?? null;
  });

  if (!fetchResult.enabled || !fetchResult.value) {
    throw new Error(`Withdrawal ${withdrawalId} not found`);
  }

  const withdrawal = fetchResult.value;

  // Only execute if in approved state
  if (withdrawal.state !== "approved") {
    logger.warn("[executor] skipping non-approved withdrawal", { withdrawalId, state: withdrawal.state });
    return;
  }

  // Idempotency: check if already has tx_hash (in case of duplicate job)
  if (withdrawal.txHash) {
    trackWalletMetric("idempotency_duplicate_blocked");
    logger.info("[executor] duplicate detected, already broadcasted", { withdrawalId, txHash: withdrawal.txHash });
    return;
  }

  const keyStore = createKeyStore();
  const provider = getProvider(chainId as ChainId);

  // Get wallet address for this chain
  const fromAddress = await keyStore.getAddress(chainId as ChainId);

  try {
    // ── 1. Build Transaction ──────────────────────────────────────────────────
    await updateWithdrawalState(withdrawalId, "building_transaction");
    const buildStart = Date.now();
    const built = await provider.buildTransaction({
      withdrawalId,
      chainId: chainId as ChainId,
      asset,
      amount,
      destinationAddress,
      feeConfig: { speed: feeSpeed ?? "normal" },
      fromAddress,
    });
    recordLatency("withdraw_build_ms", buildStart);

    // ── 2. Sign ───────────────────────────────────────────────────────────────
    await updateWithdrawalState(withdrawalId, "signing");
    const signStart = Date.now();
    const signature = await keyStore.sign(chainId as ChainId, built.signingHash);
    const publicKey = Buffer.from(await keyStore.getAddress(chainId as ChainId), "utf8");
    // For signing public key, use secp256k1 or Ed25519 public key bytes — derived from keystore
    const signed = await provider.applySignature(built, signature, publicKey);
    recordLatency("withdraw_sign_ms", signStart);

    // ── 3. Broadcast ─────────────────────────────────────────────────────────
    await updateWithdrawalState(withdrawalId, "broadcasting");
    const broadcastStart = Date.now();
    const broadcastResult = await broadcastTransaction(chainId as ChainId, signed.rawTx, withdrawalId);
    recordLatency("withdraw_broadcast_ms", broadcastStart);

    // ── 4. Persist tx_hash (idempotency lock) ────────────────────────────────
    await withDb(async (db) => {
      await db.query(
        `UPDATE withdrawals SET
           state = 'broadcasted',
           tx_hash = $2,
           broadcast_attempts = COALESCE(broadcast_attempts, 0) + 1,
           last_broadcast_at = NOW(),
           network_fee = $3,
           fee_currency = $4,
           updated_at = NOW()
         WHERE id = $1`,
        [withdrawalId, broadcastResult.txHash, built.fee, built.feeCurrency],
      );
      return null;
    });

    // ── 5. Enqueue Confirmation Watch ─────────────────────────────────────────
    const confirmations = provider.requiredConfirmations("normal");
    await enqueueConfirmationWatch({
      withdrawalId,
      txHash: broadcastResult.txHash,
      chainId: chainId as ChainId,
      requiredConfirmations: confirmations,
      broadcastedAt: broadcastResult.broadcastedAt.toISOString(),
      timeoutAt: buildTimeoutAt(chainId as ChainId),
    });

    await updateWithdrawalState(withdrawalId, "confirming");

    logger.info("[executor] withdrawal broadcasted", {
      withdrawalId,
      txHash: broadcastResult.txHash,
      chainId,
      fee: built.fee,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[executor] withdrawal failed", { withdrawalId, error: errorMsg });

    await updateWithdrawalState(withdrawalId, "failed", errorMsg);

    // Move to DLQ for manual review
    await moveToDeadLetter(job, errorMsg);
    throw err; // rethrow so BullMQ marks job as failed
  }
}

// ── Broadcast with retry ──────────────────────────────────────────────────────

async function broadcastTransaction(
  chainId: ChainId,
  rawTx: Buffer,
  withdrawalId: string,
): Promise<{ txHash: string; broadcastedAt: Date; rpcEndpoint: string; attempts: number }> {
  const { getRpcClient } = await import("./rpc/client");
  const rpc = getRpcClient(chainId);
  const rawHex = "0x" + rawTx.toString("hex");

  let attempts = 0;
  let lastError: Error = new Error("Broadcast failed");

  // 3 attempts with increasing delays
  for (const delay of [0, 5_000, 15_000]) {
    if (delay > 0) await sleep(delay);
    attempts++;

    try {
      let txHash: string;

      switch (chainId) {
        case "bitcoin": {
          txHash = await rpc.call<string>("sendrawtransaction", [rawTx.toString("hex")]);
          break;
        }
        case "solana": {
          const { getProvider: getP } = await import("./providers/registry");
          const p = getP(chainId);
          txHash = p.computeTxHash(rawTx);
          await rpc.call<string>("sendTransaction", [rawTx.toString("base64"), {
            encoding: "base64",
            preflightCommitment: "confirmed",
          }]);
          break;
        }
        default: {
          // EVM chains: eth_sendRawTransaction
          txHash = await rpc.call<string>("eth_sendRawTransaction", [rawHex]);
          break;
        }
      }

      return { txHash, broadcastedAt: new Date(), rpcEndpoint: "primary", attempts };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      trackWalletMetric("rpc_failures");
      if (attempts > 1) trackWalletMetric("rebroadcast_count");

      logger.warn("[executor] broadcast attempt failed", { withdrawalId, attempts, error: lastError.message });

      // If already known (duplicate submission), extract tx hash
      if (lastError.message.includes("already known") || lastError.message.includes("AlreadyProcessed")) {
        // Transaction already in mempool — this is fine
        logger.info("[executor] transaction already known", { withdrawalId });
        // We can't recover the txHash here without the signed tx — callers should use idempotency
        throw new Error(`Transaction already submitted for ${withdrawalId}`);
      }
    }
  }

  throw lastError;
}

// ── State machine helper ──────────────────────────────────────────────────────

async function updateWithdrawalState(
  withdrawalId: string,
  state: string,
  error?: string,
): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `UPDATE withdrawals SET
         state = $2,
         execution_error = $3,
         updated_at = NOW()
       WHERE id = $1`,
      [withdrawalId, state, error ?? null],
    );
    return null;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
