import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { RpcClient } from "../../lib/wallet/rpc/client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Wallet RPC failover authority", () => {
  it("uses a healthy peer endpoint within the same bounded logical call", async () => {
    const requests: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/primary")) {
        return new Response("unavailable", { status: 503 });
      }
      return Response.json({ jsonrpc: "2.0", id: 1, result: "accepted" });
    };

    const client = new RpcClient(
      "ethereum",
      ["https://rpc-fixture.test/primary", "https://rpc-fixture.test/secondary"],
      100,
    );
    assert.equal(await client.call<string>("eth_chainId"), "accepted");
    assert.deepEqual(requests, [
      "https://rpc-fixture.test/primary",
      "https://rpc-fixture.test/secondary",
    ]);
  });

  it("opens a failed single-endpoint circuit and rejects subsequent calls without network I/O", async () => {
    let requests = 0;
    globalThis.fetch = async () => {
      requests += 1;
      return new Response("unavailable", { status: 503 });
    };

    const client = new RpcClient(
      "bitcoin",
      ["https://rpc-fixture.test/only"],
      100,
    );
    await assert.rejects(client.call("getblockcount"), /HTTP 503/);
    assert.equal(requests, 3);
    await assert.rejects(
      client.call("getblockcount"),
      /all endpoints unhealthy for bitcoin/,
    );
    assert.equal(requests, 3, "an open circuit must suppress additional network calls");
  });
});
