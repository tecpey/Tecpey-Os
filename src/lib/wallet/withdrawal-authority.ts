import type { WithdrawalJobData } from "./types";

export type AuthoritativeWithdrawalIdentity = {
  id: string;
};

/** Queue fields are untrusted hints; only the withdrawal id may select the approved DB record. */
export function assertQueueIdentityMatchesRecord(
  job: WithdrawalJobData,
  record: AuthoritativeWithdrawalIdentity,
): void {
  if (job.withdrawalId !== record.id) {
    throw new Error("Withdrawal queue identity mismatch");
  }
}
