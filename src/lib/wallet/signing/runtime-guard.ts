import {
  assertProductionCustodyConfiguration,
  configuredUnimplementedSignerBackends,
  type WalletRuntimeEnv,
} from "../custody-launch-policy";

export type UnsupportedKeyStore = "hsm" | "mpc";

export function configuredUnsupportedKeyStores(
  env: WalletRuntimeEnv = process.env,
): UnsupportedKeyStore[] {
  return configuredUnimplementedSignerBackends(env);
}

/**
 * Preserve the historical entry point while enforcing the complete custody
 * launch policy. In production, raw environment private keys, real-withdrawal
 * activation, simulation and unimplemented signer backends are rejected before
 * workers or signing code can start.
 */
export function assertSupportedWalletKeyStoreConfig(
  env: WalletRuntimeEnv = process.env,
): void {
  assertProductionCustodyConfiguration(env);

  const unsupported = configuredUnsupportedKeyStores(env);
  if (unsupported.length === 0) return;

  throw new Error(
    `Unsupported wallet keystore configured: ${unsupported.join(", ")}. ` +
      "HSM/MPC signing is not implemented; remove these variables or complete and verify the provider before starting withdrawal workers.",
  );
}
