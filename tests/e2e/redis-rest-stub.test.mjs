import assert from "node:assert/strict";
import { test } from "node:test";
import { startRedisRestStub } from "./redis-rest-stub.mjs";

const TOKEN = "deterministic-browser-qa-redis-rest-token";

test("stub is loopback-only and exposes only authenticated GET /ping", async () => {
  const stub = await startRedisRestStub({ port: 0, token: TOKEN });

  try {
    assert.equal(stub.host, "127.0.0.1");
    assert.match(stub.url, /^http:\/\/127\.0\.0\.1:\d+$/);

    const unauthorized = await fetch(`${stub.url}/ping`);
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { error: "unauthorized" });

    const wrongPath = await fetch(`${stub.url}/other`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(wrongPath.status, 404);
    assert.deepEqual(await wrongPath.json(), { error: "not_found" });

    const wrongMethod = await fetch(`${stub.url}/ping`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(wrongMethod.status, 404);

    const ping = await fetch(`${stub.url}/ping`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(ping.status, 200);
    assert.match(ping.headers.get("content-type") ?? "", /^application\/json/);
    assert.deepEqual(await ping.json(), { result: "PONG" });
  } finally {
    await stub.stop();
  }
});

test("stop is idempotent and closes the listening endpoint", async () => {
  const stub = await startRedisRestStub({ port: 0, token: TOKEN });

  await Promise.all([stub.stop(), stub.stop()]);
  await assert.rejects(fetch(`${stub.url}/ping`));
});
