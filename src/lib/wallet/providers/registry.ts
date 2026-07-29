// Provider Registry — Phase 38
// Single point of access for all WalletProvider instances.

import type { ChainId, WalletProvider } from "../types";
import { BitcoinProvider } from "./bitcoin";
import { EthereumProvider, BscProvider, PolygonProvider, TronProvider } from "./ethereum";
import { SolanaProvider } from "./solana";

const providers = new Map<ChainId, WalletProvider>();

function initProviders(): void {
  providers.set("bitcoin", new BitcoinProvider());
  providers.set("ethereum", new EthereumProvider());
  providers.set("bsc", new BscProvider());
  providers.set("polygon", new PolygonProvider());
  providers.set("tron", new TronProvider());
  providers.set("solana", new SolanaProvider());
}

export function getProvider(chainId: ChainId): WalletProvider {
  if (providers.size === 0) initProviders();
  const provider = providers.get(chainId);
  if (!provider) throw new Error(`No provider registered for chain: ${chainId}`);
  return provider;
}
