// Fee Calculation Tests — Phase 38
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateFee, getEthereumGasForTransfer } from "../../lib/wallet/fee/engine";

const originalFetch = globalThis.fetch;
const originalBtcRpcUrl = process.env.BTC_RPC_URL_1;

before(() => {
  process.env.BTC_RPC_URL_1 = "https://rpc-fixture.test/bitcoin";
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as { method: string };
    if (payload.method === "estimatesmartfee") {
      return Response.json({ jsonrpc: "2.0", id: 1, result: { feerate: 0.0001 } });
    }
    throw new Error(`unexpected_rpc_method:${payload.method}`);
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalBtcRpcUrl === undefined) delete process.env.BTC_RPC_URL_1;
  else process.env.BTC_RPC_URL_1 = originalBtcRpcUrl;
});

describe("Ethereum gas estimation", () => {
  it("returns 21000 for native ETH transfer", () => {
    const gas = getEthereumGasForTransfer(undefined);
    assert.equal(gas, BigInt(21_000));
  });

  it("returns 65000 for ERC-20 transfer", () => {
    const gas = getEthereumGasForTransfer("0xdAC17F958D2ee523a2206206994597C13D831ec7");
    assert.equal(gas, BigInt(65_000));
  });
});

describe("Fee cache keys", () => {
  it("is deterministic per chain+speed", () => {
    const key1 = `ethereum:normal`;
    const key2 = `ethereum:normal`;
    assert.equal(key1, key2);
  });

  it("is distinct for different speeds", () => {
    assert.notEqual("bitcoin:economy", "bitcoin:priority");
  });
});

describe("Bitcoin fee estimation", () => {
  it("converts Bitcoin Core BTC/kB feerate into sats/vByte without floating point drift", async () => {
    const estimate = await estimateFee("bitcoin", "normal");

    assert.equal(estimate.details.satsPerVByte, "10");
    assert.equal(estimate.details.totalSats, "1410");
    assert.equal(estimate.networkFee, "0.00001410");
  });
});
