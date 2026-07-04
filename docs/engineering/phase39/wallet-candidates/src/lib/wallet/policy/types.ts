// Wallet Key Policy Types — Phase 39

import type { ChainId } from "../types";

export type OperatorId = string;

export type PolicyMode = "active" | "maintenance" | "rotation" | "suspended";

export type WalletPolicy = {
  id: string;
  chainId: ChainId;
  mode: PolicyMode;

  // Limits
  singleWithdrawLimitUsd: number;     // max per withdrawal
  dailyWithdrawLimitUsd: number;      // rolling 24h limit
  hourlyWithdrawLimitUsd: number;     // rolling 1h limit

  // Approval thresholds
  autoApproveUpToUsd: number;         // below this → auto-approve (no human needed)
  requireSingleApprovalAboveUsd: number;
  requireDualApprovalAboveUsd: number;

  // Operators
  allowedOperators: OperatorId[];

  // Rotation
  rotationGeneration: number;
  rotationScheduledAt?: Date;

  updatedAt: Date;
  updatedBy: OperatorId;
};

export type PolicyViolation = {
  rule: string;
  detail: string;
  fatal: boolean;       // if true, the withdrawal must be blocked
};

export type PolicyCheckResult = {
  allowed: boolean;
  violations: PolicyViolation[];
  requiresApproval: boolean;
  requiredApprovals: number;
};
