// Withdrawal Executor — durable external-effect authority.
// Queue payloads are identity triggers only. PostgreSQL owns every execution,
// prepared-transaction, broadcast-attempt, reconciliation and confirmation fact.

import { logger } from "@/lib/logger";
import {
  beginWithdrawalBroadcastAttempt,
  claimWithdrawalExecution,
  commitPreparedWithdrawalExecution,
  failWithdrawalPreparation,
  finalizeWithdrawalBroadcastAccepted,
  finalizeWithdrawalBroadcastFailure,
  publishWithdrawalConfirmationOutbox,
  reconcileAmbiguousWithdrawalBroadcast,
  type AuthoritativeWithdrawalExecutionRecord,
  type WithdrawalBroadcastAttempt,
} from "@/lib/security/withdrawal-external-effect-authority";
import {
  fingerprintExpectedTransactionHash,
  fingerprintWithdrawalExecution,
} from "@/lib/security/withdrawal-external-effect-evidence";
import { recoverExpiredWithdrawalBroadcastAttempt } from "@/lib/security/withdrawal-external-effect-recovery";
import { createKeyStore } from "./signing/keystore";
import { assertCustodyCapability } from "./custody-launch-policy";
import { getProvider } from "./providers/registry";
import { enqueueRecovery } from "./queue/withdrawal-queue";
import { trackWalletMetric, recordLatency } from "./observability";
import {
  assertQueueIdentityMatchesRecord,
  hasDurablePreparedTransaction,
  resolveAuthoritativeFeeSpeed,
} from "./withdrawal-authority";
import type { ChainId, FeeSpeed, WithdrawalJobData } from "./types";

const BROADCAST_LEASE_RECOVERY_DELAY_MS = 130_000;

function workerIdentity(): string {
  return `withdrawal-executor:${process.env.HOSTNAME ?? "local"}:${process.pid}`;
}

function providerClass(provider: object, chainId: ChainId): string {
  const name = provider.constructor?.name?.trim();
  return name && name !== "Object" ? name : `chain-provider-${chainId}`;
}

export async function executeWithdrawal(job: WithdrawalJobData): Promise<void> {
  // Gate before PostgreSQL claim so a disabled custody runtime cannot move an
  // approved withdrawal into an execution state.
  assertCustodyCapability("withdrawal_worker");
  const identity = workerIdentity();

  // A worker may die after durable attempt creation and before result commit.
  // An active lease gets one delayed, deduplicated recovery job. An expired
  // `calling` lease becomes ambiguous before claim, forcing deterministic
  // reconciliation rather than a second RPC submission.
  const leaseRecovery = await recoverExpiredWithdrawalBroadcastAttempt(
    job.withdrawalId,
  );
  if (leaseRecovery === "active") {
    await enqueueRecovery(job, {
      delay: BROADCAST_LEASE_RECOVERY_DELAY_MS,
    });
    return;
  }

  let plan = await claimWithdrawalExecution({
    withdrawalId: job.withdrawalId,
    workerIdentity: identity,
  });
  if (!plan) return;

  assertQueueIdentityMatchesRecord(job, plan.withdrawal);

  if (plan.mode === "confirm") {
    await publishWithdrawalConfirmationOutbox(plan.withdrawal.id);
    return;
  }

  if (plan.mode === "reconcile") {
    const reconciled = await reconcileAttempt({
      withdrawal: plan.withdrawal,
      attemptId: plan.attemptId,
    });
    if (reconciled === "accepted") {
      await publishWithdrawalConfirmationOutbox(plan.withdrawal.id);
      return;
    }
    if (reconciled === "still_ambiguous") {
      throw new Error("withdrawal_broadcast_reconciliation_inconclusive");
    }

    plan = await claimWithdrawalExecution({
      withdrawalId: job.withdrawalId,
      workerIdentity: identity,
    });
    if (!plan || plan.mode === "confirm" || plan.mode === "reconcile") return;
  }

  const withdrawal = plan.withdrawal;
  const feeSpeed = resolveAuthoritativeFeeSpeed(withdrawal.feeConfig);
  let prepared = withdrawal;

  if (plan.mode === "build") {
    try {
      prepared = await buildSignAndPersist({
        withdrawal,
        intentId: plan.intentId,
        generation: plan.generation,
        feeSpeed,
      });
    } catch (error) {
      await failWithdrawalPreparation({
        withdrawalId: withdrawal.id,
        intentId: plan.intentId,
        generation: plan.generation,
        error,
      });
      throw error;
    }
  }

  if (!hasDurablePreparedTransaction(prepared)) {
    throw new Error("withdrawal_prepared_transaction_missing");
  }

  const provider = getProvider(prepared.network);
  const attemptResult = await beginWithdrawalBroadcastAttempt({
    withdrawalId: prepared.id,
    workerIdentity: identity,
    providerClass: providerClass(provider, prepared.network),
  });
  if (attemptResult.status === "already_claimed") return;
  if (attemptResult.status === "reconcile_required") {
    throw new Error("withdrawal_broadcast_reconciliation_required");
  }

  const attempt = attemptResult.attempt;
  const startedAt = Date.now();
  try {
    const outcome = await broadcastOnce(attempt);
    recordLatency("withdraw_broadcast_ms", startedAt);
    await finalizeWithdrawalBroadcastAccepted({
      withdrawalId: attempt.withdrawalId,
      attemptId: attempt.id,
      expectedTxHash: attempt.expectedTxHash,
      outcome,
    });
    const published = await publishWithdrawalConfirmationOutbox(
      attempt.withdrawalId,
    );

    logger.info("[executor] withdrawal broadcast committed", {
      withdrawalFingerprint: fingerprintWithdrawalExecution(
        attempt.withdrawalId,
      ),
      transactionFingerprint: fingerprintExpectedTransactionHash(
        attempt.expectedTxHash,
      ),
      chainId: attempt.chainId,
      attemptNumber: attempt.attemptNumber,
      broadcastOutcome: outcome,
      confirmationProjectionPending: !published,
    });
  } catch (error) {
    recordLatency("withdraw_broadcast_ms", startedAt);
    const finalState = await finalizeWithdrawalBroadcastFailure({
      withdrawalId: attempt.withdrawalId,
      attemptId: attempt.id,
      error,
    });
    trackWalletMetric("rpc_failures");
    logger.error("[executor] withdrawal broadcast not accepted", {
      withdrawalFingerprint: fingerprintWithdrawalExecution(
        attempt.withdrawalId,
      ),
      transactionFingerprint: fingerprintExpectedTransactionHash(
        attempt.expectedTxHash,
      ),
      chainId: attempt.chainId,
      attemptNumber: attempt.attemptNumber,
      durableAttemptState: finalState,
    });
    throw error;
  }
}

async function buildSignAndPersist(input: {
  withdrawal: AuthoritativeWithdrawalExecutionRecord;
  intentId: string;
  generation: number;
  feeSpeed: FeeSpeed;
}): Promise<AuthoritativeWithdrawalExecutionRecord> {
  const { withdrawal } = input;
  assertCustodyCapability("transaction_signing", {
    chainId: withdrawal.network,
  });
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
    feeConfig: { speed: input.feeSpeed },
    fromAddress,
  });
  recordLatency("withdraw_build_ms", buildStart);

  const signStart = Date.now();
  const signature = await keyStore.sign(
    withdrawal.network,
    built.signingHash,
  );
  const publicKey = await keyStore.getPublicKey(withdrawal.network);
  const signed = await provider.applySignature(built, signature, publicKey);
  recordLatency("withdraw_sign_ms", signStart);

  const expectedTxHash =
    signed.txHash || provider.computeTxHash(signed.rawTx);
  if (!expectedTxHash) throw new Error("withdrawal_tx_hash_unavailable");

  return commitPreparedWithdrawalExecution({
    withdrawalId: withdrawal.id,
    intentId: input.intentId,
    generation: input.generation,
    rawTx: Buffer.from(signed.rawTx),
    expectedTxHash,
    chainId: withdrawal.network,
    networkFee: String(built.fee),
    feeCurrency: built.feeCurrency,
    requiredConfirmations: provider.requiredConfirmations(input.feeSpeed),
    signerType: keyStore.constructor?.name ?? "configured-keystore",
    signerKeyReference: null,
  });
}

async function broadcastOnce(
  attempt: WithdrawalBroadcastAttempt,
): Promise<"accepted" | "already_known"> {
  assertCustodyCapability("transaction_broadcast", {
    chainId: attempt.chainId,
  });
  const { getRpcClient } = await import("./rpc/client");
  const rpc = getRpcClient(attempt.chainId);
  const rawHex = `0x${attempt.rawTx.toString("hex")}`;

  try {
    let txHash: string;
    if (attempt.chainId === "bitcoin") {
      txHash = await rpc.call<string>("sendrawtransaction", [
        attempt.rawTx.toString("hex"),
      ]);
    } else if (attempt.chainId === "solana") {
      await rpc.call<string>("sendTransaction", [
        attempt.rawTx.toString("base64"),
        {
          encoding: "base64",
          preflightCommitment: "confirmed",
        },
      ]);
      txHash = attempt.expectedTxHash;
    } else {
      txHash = await rpc.call<string>("eth_sendRawTransaction", [rawHex]);
    }

    if (txHash.toLowerCase() !== attempt.expectedTxHash.toLowerCase()) {
      throw new Error("withdrawal_broadcast_hash_mismatch");
    }
    return "accepted";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already known|alreadyprocessed|txn-already-known/i.test(message)) {
      return "already_known";
    }
    throw error;
  }
}

async function reconcileAttempt(input: {
  withdrawal: AuthoritativeWithdrawalExecutionRecord;
  attemptId: string;
}): Promise<"accepted" | "retry_allowed" | "still_ambiguous"> {
  if (!input.withdrawal.txHash) {
    throw new Error("withdrawal_reconciliation_hash_missing");
  }
  assertCustodyCapability("transaction_broadcast", {
    chainId: input.withdrawal.network,
  });
  const provider = getProvider(input.withdrawal.network);

  try {
    const status = await provider.getConfirmationStatus(
      input.withdrawal.txHash,
    );
    const observed = status.status === "dropped"
      ? "absent"
      : status.isComplete ||
          ["pending", "included", "safe", "finalized"].includes(
            status.status,
          )
        ? "present"
        : "unknown";
    return reconcileAmbiguousWithdrawalBroadcast({
      withdrawalId: input.withdrawal.id,
      attemptId: input.attemptId,
      observed,
    });
  } catch {
    return "still_ambiguous";
  }
}
