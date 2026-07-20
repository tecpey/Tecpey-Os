import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readJsonBody } from "../../lib/security/request-body";

function streamRequest(
  chunks: Uint8Array[],
  headers: Record<string, string> = {},
  onCancel?: () => void,
): Request {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[index]);
      index += 1;
    },
    cancel() {
      onCancel?.();
    },
  });
  return new Request("https://tecpey.invalid/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe("streaming bounded JSON request bodies", () => {
  it("accepts an exact-boundary body without Content-Length", async () => {
    const payload = '{"a":1}';
    const result = await readJsonBody<{ a: number }>(
      streamRequest([bytes(payload)]),
      { maxBytes: bytes(payload).byteLength },
    );
    assert.deepEqual(result, {
      ok: true,
      value: { a: 1 },
      bytesRead: bytes(payload).byteLength,
    });
  });

  it("rejects one byte over the boundary and cancels the stream", async () => {
    let cancelled = false;
    const result = await readJsonBody(
      streamRequest([bytes('{"a":'), bytes("1}")], {}, () => {
        cancelled = true;
      }),
      { maxBytes: 6 },
    );
    assert.deepEqual(result, {
      ok: false,
      error: "payload_too_large",
      status: 413,
    });
    assert.equal(cancelled, true);
  });

  it("does not trust a forged low Content-Length", async () => {
    const result = await readJsonBody(
      streamRequest([bytes('{"value":"large"}')], { "content-length": "1" }),
      { maxBytes: 8 },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "payload_too_large");
  });

  it("rejects a declared over-limit body before reading", async () => {
    let pulled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled = true;
        controller.enqueue(bytes("{}"));
        controller.close();
      },
    });
    const request = new Request("https://tecpey.invalid/api/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "999",
      },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const result = await readJsonBody(request, { maxBytes: 16 });
    assert.equal(result.ok, false);
    assert.equal(pulled, false);
  });

  it("rejects compressed content before reading", async () => {
    let pulled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled = true;
        controller.enqueue(bytes("{}"));
        controller.close();
      },
    });
    const request = new Request("https://tecpey.invalid/api/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
      },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const result = await readJsonBody(request, { maxBytes: 16 });
    assert.deepEqual(result, {
      ok: false,
      error: "unsupported_content_encoding",
      status: 415,
    });
    assert.equal(pulled, false);
  });

  it("rejects explicit non-JSON media types", async () => {
    const result = await readJsonBody(
      streamRequest([bytes("{}")], { "content-type": "text/plain" }),
      { maxBytes: 16 },
    );
    assert.deepEqual(result, {
      ok: false,
      error: "unsupported_media_type",
      status: 415,
    });
  });

  it("returns safe errors for malformed JSON and invalid UTF-8", async () => {
    const malformed = await readJsonBody(
      streamRequest([bytes('{"a":')]),
      { maxBytes: 32 },
    );
    assert.equal(malformed.ok, false);
    if (!malformed.ok) assert.equal(malformed.error, "invalid_json");

    const invalidUtf8 = await readJsonBody(
      streamRequest([new Uint8Array([0xc3, 0x28])]),
      { maxBytes: 32 },
    );
    assert.equal(invalidUtf8.ok, false);
    if (!invalidUtf8.ok) assert.equal(invalidUtf8.error, "invalid_body_encoding");
  });

  it("can preserve empty-object compatibility without accepting malformed JSON", async () => {
    const empty = await readJsonBody<Record<string, unknown>>(
      new Request("https://tecpey.invalid/api/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
      { maxBytes: 16, allowEmptyObject: true },
    );
    assert.deepEqual(empty, { ok: true, value: {}, bytesRead: 0 });

    const malformed = await readJsonBody(
      streamRequest([bytes("{")]),
      { maxBytes: 16, allowEmptyObject: true },
    );
    assert.equal(malformed.ok, false);
  });
});
