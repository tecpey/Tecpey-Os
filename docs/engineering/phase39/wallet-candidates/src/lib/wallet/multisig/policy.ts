// Multisig Policy Engine — Phase 39
// Determines multisig scheme based on withdrawal amount and chain.

import type { ChainId } from "../types";
import type { MultisigScheme } from "./types";

export type MultisigPolicyRule = {
  chainId: ChainId | "*";
  minAmountUsd: number;
  maxAmountUsd: number;
  scheme: MultisigScheme;
  maxDelaySeconds: number;
};

// Default policy: escalating thresholds by USD amount
const DEFAULT_RULES: MultisigPolicyRule[] = [
  { chainId: "*", minAmountUsd: 0, maxAmountUsd: 10_000, scheme: "1-of-1", maxDelaySeconds: 300 },
  { chainId: "*", minAmountUsd: 10_000, maxAmountUsd: 100_000, scheme: "2-of-3", maxDelaySeconds: 1_800 },
  { chainId: "*", minAmountUsd: 100_000, maxAmountUsd: Infinity, scheme: "3-of-5", maxDelaySeconds: 7_200 },
];

export function resolveMultisigScheme(
  chainId: ChainId,
  amountUsd: number,
  customRules?: MultisigPolicyRule[],
): { scheme: MultisigScheme; maxDelaySeconds: number } {
  const rules = customRules ?? DEFAULT_RULES;

  const matching = rules
    .filter((r) => (r.chainId === "*" || r.chainId === chainId))
    .filter((r) => amountUsd >= r.minAmountUsd && amountUsd < r.maxAmountUsd)
    .sort((a, b) => b.minAmountUsd - a.minAmountUsd);

  if (matching.length === 0) {
    return { scheme: "3-of-5", maxDelaySeconds: 7_200 };
  }

  return { scheme: matching[0].scheme, maxDelaySeconds: matching[0].maxDelaySeconds };
}

export function getRequiredSignatures(scheme: MultisigScheme): { required: number; total: number } {
  switch (scheme) {
    case "1-of-1": return { required: 1, total: 1 };
    case "2-of-3": return { required: 2, total: 3 };
    case "3-of-5": return { required: 3, total: 5 };
  }
}
