import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readBoundedJsonResponse } from "../lib/runtime-bounded-json";

describe("bounded upstream JSON authority", () => {
  it("parses a valid JSON response under the byte limit", async () => {
    const response = new Response(JSON.stringify({ ok: true, value: 42 }), {
      headers: { "content-type": "application/json" },
    });

    assert.deepEqual(await readBoundedJsonResponse(response, 1024), {
      ok: true,
      value: 42,
    });
  });

  it("rejects an oversized declared content length before consuming the body", async () => {
    const response = new Response("{}", {
      headers: { "content-length": "4096" },
    });

    assert.equal(await readBoundedJsonResponse(response, 1024), null);
  });

  it("rejects an oversized streamed body even without a content-length header", async () => {
    const response = new Response(JSON.stringify({ payload: "x".repeat(2048) }));

    assert.equal(await readBoundedJsonResponse(response, 512), null);
  });

  it("fails closed for malformed JSON and empty responses", async () => {
    assert.equal(await readBoundedJsonResponse(new Response("{"), 1024), null);
    assert.equal(await readBoundedJsonResponse(new Response(null), 1024), null);
  });
});
