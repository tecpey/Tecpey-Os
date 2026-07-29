// Wallet Policy Engine — Phase 39
// Enforces per-chain spending limits and approval thresholds.

import type { ChainId } from "../types";
import type { OperatorId, PolicyCheckResult, PolicyViolation, WalletPolicy } from "./types";
import { getPolicyCache } from "./cache";

// ── Default Policy ────────────────────────────────────────────────────────────

function getDefaultPolicy(chainId: ChainId): WalletPolicy {
  return {
    id: `default:${chainId}`,
    chainId,
    mode: "active",
    singleWithdrawLimitUsd: 500_000,
    dailyWithdrawLimitUsd: 5_000_000,
    hourlyWithdrawLimitUsd: 1_000_000,
    autoApproveUpToUsd: 1_000,
    requireSingleApprovalAboveUsd: 1_000,
    requireDualApprovalAboveUsd: 50_000,
    allowedOperators: [],
    rotationGeneration: 1,
    updatedAt: new Date(0),
    updatedBy: "system",
  };
}

// ── Policy Engine ─────────────────────────────────────────────────────────────

export async function checkWithdrawalPolicy(
  chainId: ChainId,
  amountUsd: number,
  operatorId: OperatorId | null,
): Promise<PolicyCheckResult> {
  const policy = await loadPolicy(chainId);
  const violations: PolicyViolation[] = [];

  // Maintenance / suspended mode
  if (policy.mode === "suspended") {
    violations.push({ rule: "mode", detail: `Chain ${chainId} wallet is suspended`, fatal: true });
    return { allowed: false, violations, requiresApproval: false, requiredApprovals: 0 };
  }

  if (policy.mode === "maintenance") {
    violations.push({ rule: "mode", detail: `Chain ${chainId} wallet is in maintenance mode`, fatal: true });
    return { allowed: false, violations, requiresApproval: false, requiredApprovals: 0 };
  }

  // Single withdrawal limit
  if (amountUsd > policy.singleWithdrawLimitUsd) {
    violations.push({
      rule: "single_limit",
      detail: `Amount $${amountUsd.toFixed(2)} exceeds single withdrawal limit $${policy.singleWithdrawLimitUsd}`,
      fatal: true,
    });
  }

  // Operator access
  if (operatorId && policy.allowedOperators.length > 0 && !policy.allowedOperators.includes(operatorId)) {
    violations.push({ rule: "operator", detail: `Operator ${operatorId} not allowed for ${chainId}`, fatal: true });
  }

  // Rolling limit checks (delegated to cache)
  const cache = getPolicyCache();
  if (cache) {
    const hourlySpent = await cache.getSpent(chainId, "1h");
    const dailySpent = await cache.getSpent(chainId, "24h");

    if (hourlySpent + amountUsd > policy.hourlyWithdrawLimitUsd) {
      violations.push({
        rule: "hourly_limit",
        detail: `Hourly limit $${policy.hourlyWithdrawLimitUsd} would be exceeded (spent: $${hourlySpent.toFixed(2)})`,
        fatal: true,
      });
    }

    if (dailySpent + amountUsd > policy.dailyWithdrawLimitUsd) {
      violations.push({
        rule: "daily_limit",
        detail: `Daily limit $${policy.dailyWithdrawLimitUsd} would be exceeded (spent: $${dailySpent.toFixed(2)})`,
        fatal: true,
      });
    }
  }

  const hasFatalViolation = violations.some((v) => v.fatal);
  if (hasFatalViolation) {
    return { allowed: false, violations, requiresApproval: false, requiredApprovals: 0 };
  }

  // Determine approval requirement
  let requiredApprovals = 0;
  let requiresApproval = false;

  if (amountUsd >= policy.requireDualApprovalAboveUsd) {
    requiresApproval = true;
    requiredApprovals = 2;
  } else if (amountUsd >= policy.requireSingleApprovalAboveUsd) {
    requiresApproval = true;
    requiredApprovals = 1;
  }

  return { allowed: true, violations, requiresApproval, requiredApprovals };
}

export async function recordWithdrawalSpend(chainId: ChainId, amountUsd: number): Promise<void> {
  const cache = getPolicyCache();
  if (!cache) return;
  await cache.recordSpend(chainId, amountUsd);
}

async function loadPolicy(chainId: ChainId): Promise<WalletPolicy> {
  const cache = getPolicyCache();
  if (cache) {
    const cached = await cache.getPolicy(chainId);
    if (cached) return cached;
  }
  return getDefaultPolicy(chainId);
}
