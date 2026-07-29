import type { ChainId } from "./types";

export type WalletRuntimeEnv = Record<string, string | undefined>;

export type CustodyCapability =
  | "deposit_address_allocation"
  | "withdrawal_approval"
  | "withdrawal_worker"
  | "transaction_signing"
  | "transaction_broadcast";

export type CustodyRuntimeMode =
  | "disabled"
  | "simulation"
  | "development_hot_wallet";

export type CustodyLaunchReason =
  | "custody_not_production_ready"
  | "real_withdrawals_forbidden"
  | "environment_private_keys_forbidden"
  | "unsupported_signer_backend"
  | "simulation_forbidden"
  | "custody_circuit_breaker_open"
  | "chain_not_enabled";

export type CustodyLaunchStatus = {
  mode: CustodyRuntimeMode;
  productionReady: false;
  enabled: boolean;
  withdrawalApprovalEnabled: boolean;
  workerEnabled: boolean;
  depositAddressAllocationEnabled: boolean;
  signingEnabled: boolean;
  broadcastEnabled: boolean;
  circuitBreakerOpen: boolean;
  enabledChains: ChainId[];
  reasons: CustodyLaunchReason[];
};

const SUPPORTED_CHAINS: readonly ChainId[] = [
  "bitcoin",
  "ethereum",
  "bsc",
  "polygon",
  "tron",
  "solana",
];

const PRIVATE_KEY_NAME = /^WALLET_[A-Z0-9_]+_PRIVATE_KEY(?:_\d+)?$/;

function production(env: WalletRuntimeEnv): boolean {
  return env.NODE_ENV === "production";
}

export function configuredEnvironmentPrivateKeyNames(
  env: WalletRuntimeEnv = process.env,
): string[] {
  return Object.keys(env)
    .filter((name) => PRIVATE_KEY_NAME.test(name) && Boolean(env[name]?.trim()))
    .sort();
}

export function configuredUnimplementedSignerBackends(
  env: WalletRuntimeEnv = process.env,
): Array<"hsm" | "mpc"> {
  const configured: Array<"hsm" | "mpc"> = [];
  if (env.HSM_ENDPOINT?.trim() || env.HSM_KEY_ID?.trim()) configured.push("hsm");
  if (env.MPC_ENDPOINT?.trim() || env.MPC_PARTY_ID?.trim()) configured.push("mpc");
  return configured;
}

function configuredChains(env: WalletRuntimeEnv): ChainId[] {
  const raw = env.TECPEY_CUSTODY_ENABLED_CHAINS?.trim();
  if (!raw) return production(env) ? [] : [...SUPPORTED_CHAINS];

  const values = [...new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )];
  return values.filter((value): value is ChainId =>
    SUPPORTED_CHAINS.includes(value as ChainId),
  );
}

export function invalidConfiguredCustodyChains(
  env: WalletRuntimeEnv = process.env,
): string[] {
  const raw = env.TECPEY_CUSTODY_ENABLED_CHAINS?.trim();
  if (!raw) return [];
  return [...new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .filter((value) => !SUPPORTED_CHAINS.includes(value as ChainId)),
  )].sort();
}

/**
 * Current production stance: TecPey has no approved non-exportable signer.
 * Therefore every real custody capability is disabled in production. The
 * status is intentionally safe to expose and never includes secret values or
 * secret-bearing environment variable names.
 */
export function getCustodyLaunchStatus(
  env: WalletRuntimeEnv = process.env,
): CustodyLaunchStatus {
  const isProduction = production(env);
  const rawKeysConfigured = configuredEnvironmentPrivateKeyNames(env).length > 0;
  const unsupportedBackends = configuredUnimplementedSignerBackends(env);
  const realWithdrawalsRequested = env.TECPEY_REAL_WITHDRAWALS_ENABLED === "1";
  const simulationRequested = env.TECPEY_CUSTODY_SIMULATION_ENABLED === "1";
  const circuitBreakerOpen = env.TECPEY_CUSTODY_KILL_SWITCH === "1";
  const enabledChains = configuredChains(env);
  const reasons: CustodyLaunchReason[] = [];

  if (isProduction) {
    reasons.push("custody_not_production_ready");
    if (realWithdrawalsRequested) reasons.push("real_withdrawals_forbidden");
    if (rawKeysConfigured) reasons.push("environment_private_keys_forbidden");
    if (unsupportedBackends.length > 0) reasons.push("unsupported_signer_backend");
    if (simulationRequested) reasons.push("simulation_forbidden");
    if (circuitBreakerOpen) reasons.push("custody_circuit_breaker_open");

    return {
      mode: "disabled",
      productionReady: false,
      enabled: false,
      withdrawalApprovalEnabled: false,
      workerEnabled: false,
      depositAddressAllocationEnabled: false,
      signingEnabled: false,
      broadcastEnabled: false,
      circuitBreakerOpen,
      enabledChains: [],
      reasons: [...new Set(reasons)],
    };
  }

  const mode: CustodyRuntimeMode = rawKeysConfigured
    ? "development_hot_wallet"
    : "simulation";
  const operational = !circuitBreakerOpen && unsupportedBackends.length === 0;
  if (unsupportedBackends.length > 0) reasons.push("unsupported_signer_backend");
  if (circuitBreakerOpen) reasons.push("custody_circuit_breaker_open");

  return {
    mode,
    productionReady: false,
    enabled: operational,
    withdrawalApprovalEnabled: operational && realWithdrawalsRequested,
    workerEnabled: operational,
    depositAddressAllocationEnabled: operational,
    signingEnabled: operational,
    broadcastEnabled: operational,
    circuitBreakerOpen,
    enabledChains,
    reasons: [...new Set(reasons)],
  };
}

export function isCustodyCapabilityEnabled(
  capability: CustodyCapability,
  chainId?: ChainId,
  env: WalletRuntimeEnv = process.env,
): boolean {
  const status = getCustodyLaunchStatus(env);
  if (chainId && !status.enabledChains.includes(chainId)) return false;

  switch (capability) {
    case "deposit_address_allocation":
      return status.depositAddressAllocationEnabled;
    case "withdrawal_approval":
      return status.withdrawalApprovalEnabled;
    case "withdrawal_worker":
      return status.workerEnabled;
    case "transaction_signing":
      return status.signingEnabled;
    case "transaction_broadcast":
      return status.broadcastEnabled;
  }
}

export function assertCustodyCapability(
  capability: CustodyCapability,
  options: { chainId?: ChainId; env?: WalletRuntimeEnv } = {},
): void {
  const env = options.env ?? process.env;
  if (isCustodyCapabilityEnabled(capability, options.chainId, env)) return;

  const status = getCustodyLaunchStatus(env);
  const reason =
    options.chainId && !status.enabledChains.includes(options.chainId)
      ? "chain_not_enabled"
      : status.reasons[0] ?? "custody_not_production_ready";
  throw new Error(`custody_capability_disabled:${capability}:${reason}`);
}

/**
 * Production may safely boot in custody-disabled mode. It must fail boot when
 * configuration attempts to activate an unapproved signer or exposes raw key
 * material to the production process.
 */
export function assertProductionCustodyConfiguration(
  env: WalletRuntimeEnv = process.env,
): void {
  if (!production(env)) return;

  const status = getCustodyLaunchStatus(env);
  const unsafe = status.reasons.filter(
    (reason) => reason !== "custody_not_production_ready" &&
      reason !== "custody_circuit_breaker_open",
  );
  const invalidChains = invalidConfiguredCustodyChains(env);
  if (unsafe.length === 0 && invalidChains.length === 0) return;

  throw new Error(
    `unsafe_production_custody_configuration:${[
      ...unsafe,
      ...(invalidChains.length ? ["invalid_chain_configuration"] : []),
    ].join(",")}`,
  );
}
