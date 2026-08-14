import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BitcoinProvider } from "../../lib/wallet/providers/bitcoin";
import {
  BscProvider,
  EthereumProvider,
  PolygonProvider,
  TronProvider,
} from "../../lib/wallet/providers/ethereum";
import { SolanaProvider } from "../../lib/wallet/providers/solana";

const originalFetch = globalThis.fetch;
const originalRpcEnv = new Map<string, string | undefined>();
const rpcEnvKeys = [
  "BTC_RPC_URL_1",
  "ETH_RPC_URL_1",
  "BSC_RPC_URL_1",
  "POLYGON_RPC_URL_1",
  "TRON_RPC_URL_1",
  "SOLANA_RPC_URL_1",
] as const;

type FixtureMode = "not_found" | "known_pending" | "malformed";
let fixtureMode: FixtureMode = "not_found";

function rpcResult(result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id: 1, result });
}

before(() => {
  for (const key of rpcEnvKeys) {
    originalRpcEnv.set(key, process.env[key]);
    process.env[key] = `https://rpc-fixture.test/${key.toLowerCase()}`;
  }

  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as { method: string };
    if (payload.method === "eth_getTransactionReceipt") {
      if (fixtureMode === "malformed") return rpcResult({ status: "0x1" });
      return rpcResult(null);
    }
    if (payload.method === "eth_getTransactionByHash") {
      return rpcResult(
        fixtureMode === "known_pending"
          ? { hash: `0x${"a".repeat(64)}` }
          : null,
      );
    }
    if (payload.method === "getrawtransaction") {
      return rpcResult(fixtureMode === "known_pending" ? { confirmations: 0 } : {});
    }
    if (payload.method === "getSignatureStatuses") {
      if (fixtureMode === "known_pending") {
        return rpcResult({ value: [{ confirmationStatus: "processed", slot: 1 }] });
      }
      return rpcResult(
        fixtureMode === "malformed"
          ? { value: [{ confirmationStatus: "invented", slot: -1 }] }
          : { value: [null] },
      );
    }
    throw new Error(`unexpected_rpc_method:${payload.method}`);
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const key of rpcEnvKeys) {
    const value = originalRpcEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Wallet provider ambiguous RPC fixtures", () => {
  const txHash = `0x${"a".repeat(64)}`;
  const evmProviders = [
    new EthereumProvider(),
    new BscProvider(),
    new PolygonProvider(),
    new TronProvider(),
  ];

  it("keeps every chain unknown when the provider cannot prove transaction presence", async () => {
    fixtureMode = "not_found";
    const statuses = await Promise.all([
      ...evmProviders.map((provider) => provider.getConfirmationStatus(txHash)),
      new BitcoinProvider().getConfirmationStatus("b".repeat(64)),
      new SolanaProvider().getConfirmationStatus("3".repeat(88)),
    ]);
    assert.deepEqual(statuses.map((status) => status.status), Array(6).fill("unknown"));
    assert.equal(statuses.every((status) => !status.isComplete), true);
  });

  it("accepts pending only when each provider returns positive presence evidence", async () => {
    fixtureMode = "known_pending";
    const statuses = await Promise.all([
      ...evmProviders.map((provider) => provider.getConfirmationStatus(txHash)),
      new BitcoinProvider().getConfirmationStatus("b".repeat(64)),
      new SolanaProvider().getConfirmationStatus("3".repeat(88)),
    ]);
    assert.deepEqual(statuses.map((status) => status.status), [
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
      "included",
    ]);
  });

  it("fails malformed provider payloads closed instead of manufacturing presence", async () => {
    fixtureMode = "malformed";
    const statuses = await Promise.all([
      ...evmProviders.map((provider) => provider.getConfirmationStatus(txHash)),
      new BitcoinProvider().getConfirmationStatus("b".repeat(64)),
      new SolanaProvider().getConfirmationStatus("3".repeat(88)),
    ]);
    assert.deepEqual(statuses.map((status) => status.status), Array(6).fill("unknown"));
  });
});
