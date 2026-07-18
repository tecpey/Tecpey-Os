type WalletRuntimeEnv = Record<string, string | undefined>;

export type UnsupportedKeyStore = "hsm" | "mpc";

export function configuredUnsupportedKeyStores(
  env: WalletRuntimeEnv = process.env,
): UnsupportedKeyStore[] {
  const configured: UnsupportedKeyStore[] = [];

  if (env.HSM_ENDPOINT || env.HSM_KEY_ID) configured.push("hsm");
  if (env.MPC_ENDPOINT || env.MPC_PARTY_ID) configured.push("mpc");

  return configured;
}

/**
 * HSM and MPC classes are interface stubs in the current wallet implementation.
 * Never allow withdrawal workers to start while either backend is configured:
 * createKeyStore() would otherwise select a provider that throws only after a
 * withdrawal reaches the signing path.
 */
export function assertSupportedWalletKeyStoreConfig(
  env: WalletRuntimeEnv = process.env,
): void {
  const unsupported = configuredUnsupportedKeyStores(env);
  if (unsupported.length === 0) return;

  throw new Error(
    `Unsupported wallet keystore configured: ${unsupported.join(", ")}. ` +
      "HSM/MPC signing is not implemented; remove these variables or complete and verify the provider before starting withdrawal workers.",
  );
}
