// Provider Registry — Phase 38
// Single point of access for all WalletProvider instances.

import type { ChainId, WalletProvider } from "../types";
import { BitcoinProvider } from "./bitcoin";
import { EthereumProvider, BscProvider, PolygonProvider, TronProvider } from "./ethereum";
import { SolanaProvider } from "./solana";

const providers = new Map<ChainId, WalletProvider>();
const testOverrides = new Map<ChainId, WalletProvider>();

function initProviders(): void {
  providers.set("bitcoin", new BitcoinProvider());
  providers.set("ethereum", new EthereumProvider());
  providers.set("bsc", new BscProvider());
  providers.set("polygon", new PolygonProvider());
  providers.set("tron", new TronProvider());
  providers.set("solana", new SolanaProvider());
}

export function getProvider(chainId: ChainId): WalletProvider {
  const override = testOverrides.get(chainId);
  if (override) return override;
  if (providers.size === 0) initProviders();
  const provider = providers.get(chainId);
  if (!provider) throw new Error(`No provider registered for chain: ${chainId}`);
  return provider;
}

function assertOverridesAllowed(): void {
  // The override map lets a test drive the signing/broadcast path with a
  // deterministic provider. It must NEVER be reachable in production: a swapped
  // provider could redirect real funds. Production fails closed here.
  if (process.env.NODE_ENV === "production") {
    throw new Error("wallet_provider_override_forbidden_in_production");
  }
}

/** Test-only: install a provider for a chain. Refuses to run in production. */
export function setWalletProviderOverrideForTest(
  chainId: ChainId,
  provider: WalletProvider | null,
): void {
  assertOverridesAllowed();
  if (provider) testOverrides.set(chainId, provider);
  else testOverrides.delete(chainId);
}

/** Test-only: clear every installed provider override. Refuses in production. */
export function clearWalletProviderOverridesForTest(): void {
  assertOverridesAllowed();
  testOverrides.clear();
}
