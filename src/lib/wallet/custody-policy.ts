import Decimal from "decimal.js";
import type { ChainId } from "./types";
import {
  CUSTODY_CHAINS,
  CUSTODY_MODES,
  CUSTODY_POLICY_VERSION,
  evaluateCustodyEnvironment as evaluateCore,
} from "./custody-policy-core.mjs";

export { CUSTODY_CHAINS, CUSTODY_MODES, CUSTODY_POLICY_VERSION };

export type CustodyMode =
  | "disabled"
  | "simulation"
  | "dev_hot_wallet"
  | "external_hsm"
  | "external_mpc";

export type CustodyRuntimeStatus = {
  policyVersion: string;
  environment: "production" | "test" | "development";
  mode: CustodyMode;
  configurationValid: boolean;
  errors: readonly string[];
  rawEnvironmentPrivateKeyCount: number;
  signerReady: boolean;
  realWithdrawalsRequested: boolean;
  withdrawalsEnabled: boolean;
  workersRequested: boolean;
  workersEnabled: boolean;
  addressAllocationRequested: boolean;
  addressAllocationEnabled: boolean;
  circuitOpen: boolean;
  enabledChains: readonly string[];
  maxWithdrawalUsdByChain: Readonly<Record<string, string>>;
  requiredApprovals: number;
  reason: string;
};

export type PublicCustodyStatus = {
  policyVersion: string;
  operational: boolean;
  withdrawalsEnabled: boolean;
  depositAddressAllocationEnabled: boolean;
  reason: string;
  enabledChains: string[];
};

export class CustodyConfigurationError extends Error {
  readonly codes: readonly string[];

  constructor(codes: readonly string[]) {
    super(`custody_configuration_invalid:${codes.join(",")}`);
    this.name = "CustodyConfigurationError";
    this.codes = [...codes];
  }
}

export class CustodyGateError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "CustodyGateError";
    this.code = code;
  }
}

export function getCustodyRuntimeStatus(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): CustodyRuntimeStatus {
  return evaluateCore(env as NodeJS.ProcessEnv) as CustodyRuntimeStatus;
}

export function assertCustodyBootSafe(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): CustodyRuntimeStatus {
  const status = getCustodyRuntimeStatus(env);
  if (!status.configurationValid) {
    throw new CustodyConfigurationError(status.errors);
  }
  return status;
}

function publicReason(status: CustodyRuntimeStatus): string {
  if (!status.configurationValid) return "custody_unavailable";
  if (status.circuitOpen && status.mode !== "disabled") {
    return "custody_temporarily_paused";
  }
  if (!status.withdrawalsEnabled) return "custody_launch_gate_disabled";
  return "custody_available";
}

export function getPublicCustodyStatus(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): PublicCustodyStatus {
  const status = getCustodyRuntimeStatus(env);
  return {
    policyVersion: status.policyVersion,
    operational: status.withdrawalsEnabled,
    withdrawalsEnabled: status.withdrawalsEnabled,
    depositAddressAllocationEnabled: status.addressAllocationEnabled,
    reason: publicReason(status),
    enabledChains: status.withdrawalsEnabled
      ? status.enabledChains.filter((chain) => CUSTODY_CHAINS.includes(chain))
      : [],
  };
}

export function assertCustodyWorkerStartupAllowed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): CustodyRuntimeStatus {
  const status = assertCustodyBootSafe(env);
  if (!status.workersEnabled) {
    throw new CustodyGateError(status.reason || "custody_workers_disabled");
  }
  return status;
}

export function assertCustodyObservationAllowed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): CustodyRuntimeStatus {
  const status = assertCustodyBootSafe(env);
  if (!status.signerReady || !status.workersEnabled) {
    throw new CustodyGateError(status.reason || "custody_workers_disabled");
  }
  return status;
}

export function assertCustodyExecutionEnvironmentAllowed(input: {
  chainId?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
} = {}): CustodyRuntimeStatus {
  const status = assertCustodyBootSafe(input.env ?? process.env);
  if (!status.withdrawalsEnabled || !status.workersEnabled) {
    throw new CustodyGateError(status.reason || "custody_launch_gate_disabled");
  }
  if (input.chainId && !status.enabledChains.includes(input.chainId)) {
    throw new CustodyGateError("custody_chain_disabled");
  }
  return status;
}

export function assertCustodyWithdrawalAllowed(input: {
  chainId: ChainId | string;
  amountUsd: string | number;
  approvalCount?: number;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): CustodyRuntimeStatus {
  const status = assertCustodyExecutionEnvironmentAllowed({
    chainId: input.chainId,
    env: input.env,
  });
  const limit = status.maxWithdrawalUsdByChain[input.chainId];
  if (!limit) throw new CustodyGateError("custody_chain_limit_missing");

  let amount: Decimal;
  try {
    amount = new Decimal(input.amountUsd);
  } catch {
    throw new CustodyGateError("custody_amount_invalid");
  }
  if (!amount.isFinite() || amount.lte(0)) {
    throw new CustodyGateError("custody_amount_invalid");
  }
  if (amount.gt(new Decimal(limit))) {
    throw new CustodyGateError("custody_withdrawal_limit_exceeded");
  }

  const approvalCount = input.approvalCount ?? 1;
  if (!Number.isInteger(approvalCount) || approvalCount < status.requiredApprovals) {
    throw new CustodyGateError("custody_approval_quorum_incomplete");
  }
  return status;
}

export function isEnvironmentKeySignerAllowed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  const status = getCustodyRuntimeStatus(env);
  return status.configurationValid && status.mode === "dev_hot_wallet" && status.signerReady;
}

export function isSimulationSignerAllowed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  if (env.NODE_ENV === "test" && !env.TECPEY_CUSTODY_MODE) return true;
  const status = getCustodyRuntimeStatus(env);
  return status.configurationValid && status.mode === "simulation" && status.signerReady;
}
