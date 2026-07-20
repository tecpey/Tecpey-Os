export const CUSTODY_POLICY_VERSION = "custody-release-gate-v1";
export const CUSTODY_CHAINS = Object.freeze([
  "bitcoin",
  "ethereum",
  "bsc",
  "polygon",
  "tron",
  "solana",
]);
export const CUSTODY_MODES = Object.freeze([
  "disabled",
  "simulation",
  "dev_hot_wallet",
  "external_hsm",
  "external_mpc",
]);

const MODE_SET = new Set(CUSTODY_MODES);
const CHAIN_SET = new Set(CUSTODY_CHAINS);
const PRIVATE_KEY_NAME = /^WALLET_[A-Z0-9_]+_PRIVATE_KEY(?:_\d+)?$/;
const MAX_POLICY_LIMIT_USD = 1_000_000;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function enabled(value) {
  return clean(value) === "1";
}

function productionLike(env) {
  return (
    clean(env.NODE_ENV).toLowerCase() === "production" ||
    clean(env.TECPEY_DEPLOYMENT_ENV).toLowerCase() === "production" ||
    clean(env.VERCEL_ENV).toLowerCase() === "production"
  );
}

function configuredPrivateKeyNames(env) {
  return Object.entries(env)
    .filter(([name, value]) => PRIVATE_KEY_NAME.test(name) && Boolean(clean(value)))
    .map(([name]) => name)
    .sort();
}

function parseChains(value) {
  const values = clean(value)
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(values)];
}

function parsePositiveDecimal(value) {
  const raw = clean(value);
  if (!raw || !/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_POLICY_LIMIT_USD) {
    return null;
  }
  return raw.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function parseApprovals(value, fallback) {
  const raw = clean(value);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) return null;
  return parsed;
}

function pushUnique(values, value) {
  if (!values.includes(value)) values.push(value);
}

export function evaluateCustodyEnvironment(env = process.env) {
  const production = productionLike(env);
  const test = clean(env.NODE_ENV).toLowerCase() === "test";
  const configuredMode = clean(env.TECPEY_CUSTODY_MODE).toLowerCase() || "disabled";
  const mode = MODE_SET.has(configuredMode) ? configuredMode : "disabled";
  const errors = [];
  const privateKeyNames = configuredPrivateKeyNames(env);
  const realWithdrawalsRequested = enabled(env.TECPEY_REAL_WITHDRAWALS_ENABLED);
  const workersRequested = enabled(env.TECPEY_WITHDRAWAL_WORKERS_ENABLED);
  const addressAllocationRequested = enabled(
    env.TECPEY_CUSTODY_ADDRESS_ALLOCATION_ENABLED,
  );
  const circuitOpen = clean(env.TECPEY_CUSTODY_CIRCUIT_OPEN) !== "0";
  const hsmConfigured = Boolean(clean(env.HSM_ENDPOINT) || clean(env.HSM_KEY_ID));
  const mpcConfigured = Boolean(clean(env.MPC_ENDPOINT) || clean(env.MPC_PARTY_ID));

  if (!MODE_SET.has(configuredMode)) {
    pushUnique(errors, "custody_mode_invalid");
  }
  if (production && privateKeyNames.length > 0) {
    pushUnique(errors, "production_environment_private_keys_forbidden");
  }
  if (
    production &&
    (enabled(env.TECPEY_ALLOW_INSECURE_DEV_HOT_WALLET) ||
      enabled(env.TECPEY_SIMULATED_CUSTODY_ENABLED))
  ) {
    pushUnique(errors, "development_custody_flags_forbidden_in_production");
  }
  if (hsmConfigured || mode === "external_hsm") {
    pushUnique(errors, "hsm_signer_not_implemented");
  }
  if (mpcConfigured || mode === "external_mpc") {
    pushUnique(errors, "mpc_signer_not_implemented");
  }

  if (mode === "simulation") {
    if (production) pushUnique(errors, "simulation_custody_forbidden_in_production");
    if (!test && !enabled(env.TECPEY_SIMULATED_CUSTODY_ENABLED)) {
      pushUnique(errors, "simulation_custody_requires_explicit_development_flag");
    }
    if (privateKeyNames.length > 0) {
      pushUnique(errors, "simulation_custody_may_not_load_environment_private_keys");
    }
  }

  if (mode === "dev_hot_wallet") {
    if (production) pushUnique(errors, "development_hot_wallet_forbidden_in_production");
    if (!test && !enabled(env.TECPEY_ALLOW_INSECURE_DEV_HOT_WALLET)) {
      pushUnique(errors, "development_hot_wallet_requires_explicit_flag");
    }
    if (privateKeyNames.length === 0) {
      pushUnique(errors, "development_hot_wallet_private_key_missing");
    }
  }

  if (mode === "disabled" && privateKeyNames.length > 0) {
    pushUnique(errors, "environment_private_keys_require_explicit_dev_hot_wallet_mode");
  }

  const enabledChains = parseChains(env.TECPEY_CUSTODY_ENABLED_CHAINS);
  if (mode !== "disabled" && enabledChains.length === 0) {
    pushUnique(errors, "custody_enabled_chains_required");
  }
  for (const chain of enabledChains) {
    if (!CHAIN_SET.has(chain)) pushUnique(errors, `custody_chain_unsupported:${chain}`);
  }

  const maxWithdrawalUsdByChain = {};
  for (const chain of enabledChains.filter((entry) => CHAIN_SET.has(entry))) {
    const perChain = env[`TECPEY_CUSTODY_MAX_WITHDRAWAL_USD_${chain.toUpperCase()}`];
    const configured = perChain ?? env.TECPEY_CUSTODY_MAX_WITHDRAWAL_USD;
    const limit = parsePositiveDecimal(configured);
    if (!limit) {
      pushUnique(errors, `custody_chain_limit_required:${chain}`);
    } else {
      maxWithdrawalUsdByChain[chain] = limit;
    }
  }

  const requiredApprovals = parseApprovals(
    env.TECPEY_CUSTODY_REQUIRED_APPROVALS,
    production ? 2 : 1,
  );
  if (requiredApprovals === null) {
    pushUnique(errors, "custody_required_approvals_invalid");
  } else if (production && mode !== "disabled" && requiredApprovals < 2) {
    pushUnique(errors, "production_custody_requires_dual_control");
  }

  if (mode === "disabled") {
    if (realWithdrawalsRequested) {
      pushUnique(errors, "real_withdrawals_require_approved_custody");
    }
    if (workersRequested) {
      pushUnique(errors, "withdrawal_workers_require_approved_custody");
    }
    if (addressAllocationRequested) {
      pushUnique(errors, "address_allocation_requires_approved_custody");
    }
  }
  if (workersRequested && !clean(env.REDIS_URL)) {
    pushUnique(errors, "withdrawal_workers_require_redis");
  }

  const signerReady =
    errors.length === 0 &&
    !production &&
    (mode === "simulation" || mode === "dev_hot_wallet");
  const withdrawalsEnabled =
    signerReady && realWithdrawalsRequested && !circuitOpen;
  const workersEnabled = signerReady && workersRequested && Boolean(clean(env.REDIS_URL));
  const addressAllocationEnabled =
    signerReady && addressAllocationRequested && !circuitOpen;

  let reason = "custody_launch_gate_disabled";
  if (errors.length > 0) reason = errors[0];
  else if (circuitOpen && mode !== "disabled") reason = "custody_circuit_breaker_open";
  else if (signerReady && !realWithdrawalsRequested) reason = "real_withdrawals_disabled";
  else if (withdrawalsEnabled) reason = "custody_available";

  return Object.freeze({
    policyVersion: CUSTODY_POLICY_VERSION,
    environment: production ? "production" : test ? "test" : "development",
    mode,
    configurationValid: errors.length === 0,
    errors: Object.freeze([...errors]),
    rawEnvironmentPrivateKeyCount: privateKeyNames.length,
    signerReady,
    realWithdrawalsRequested,
    withdrawalsEnabled,
    workersRequested,
    workersEnabled,
    addressAllocationRequested,
    addressAllocationEnabled,
    circuitOpen,
    enabledChains: Object.freeze([...enabledChains]),
    maxWithdrawalUsdByChain: Object.freeze({ ...maxWithdrawalUsdByChain }),
    requiredApprovals: requiredApprovals ?? 0,
    reason,
  });
}
