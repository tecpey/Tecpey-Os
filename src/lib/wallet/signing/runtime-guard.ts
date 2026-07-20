import {
  assertCustodyBootSafe,
  type CustodyRuntimeStatus,
} from "../custody-policy";

type WalletRuntimeEnv = Record<string, string | undefined>;

export type UnsupportedKeyStore = "hsm" | "mpc";

export function configuredUnsupportedKeyStores(
  env: WalletRuntimeEnv = process.env,
): UnsupportedKeyStore[] {
  const configured: UnsupportedKeyStore[] = [];
  if (env.HSM_ENDPOINT || env.HSM_KEY_ID || env.TECPEY_CUSTODY_MODE === "external_hsm") {
    configured.push("hsm");
  }
  if (env.MPC_ENDPOINT || env.MPC_PARTY_ID || env.TECPEY_CUSTODY_MODE === "external_mpc") {
    configured.push("mpc");
  }
  return configured;
}

/**
 * Compatibility surface for older callers. The canonical runtime authority is
 * now the complete custody policy, not only the HSM/MPC stub detector.
 */
export function assertSupportedWalletKeyStoreConfig(
  env: WalletRuntimeEnv = process.env,
): CustodyRuntimeStatus {
  return assertCustodyBootSafe(env);
}
