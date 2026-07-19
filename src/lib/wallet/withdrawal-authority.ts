import type { FeeSpeed, WithdrawalJobData } from "./types";

export type AuthoritativeWithdrawalIdentity = {
  id: string;
};

const ALLOWED_FEE_SPEEDS: FeeSpeed[] = ["economy", "normal", "fast", "priority"];

/** Queue fields are untrusted hints; only the withdrawal id may select the approved DB record. */
export function assertQueueIdentityMatchesRecord(
  job: WithdrawalJobData,
  record: AuthoritativeWithdrawalIdentity,
): void {
  if (job.withdrawalId !== record.id) {
    throw new Error("Withdrawal queue identity mismatch");
  }
}

/** Fee policy must come from the approved database record, never from the queue payload. */
export function resolveAuthoritativeFeeSpeed(feeConfig: unknown): FeeSpeed {
  if (feeConfig === null || typeof feeConfig !== "object" || Array.isArray(feeConfig)) {
    return "normal";
  }
  const speed = (feeConfig as { speed?: unknown }).speed;
  return typeof speed === "string" && ALLOWED_FEE_SPEEDS.includes(speed as FeeSpeed)
    ? speed as FeeSpeed
    : "normal";
}

export function hasDurablePreparedTransaction(value: {
  rawTx: Uint8Array | null;
  txHash: string | null;
}): boolean {
  return value.rawTx instanceof Uint8Array && value.rawTx.byteLength > 0 && Boolean(value.txHash);
}
