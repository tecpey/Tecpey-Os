import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import {
  readBoundedJsonRequest,
  readJsonBody,
  type BoundedJsonBodyResult,
} from "../../lib/security/bounded-request-body";

const encoder = new TextEncoder();

type StreamingRequestInit = RequestInit & { duplex: "half" };

function streamingRequest(input: {
  chunks: Uint8Array[];
  headers?: Record<string, string>;
  onCancel?: (reason: unknown) => void;
  failAtChunk?: number;
}): Request {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (input.failAtChunk === index) {
        controller.error(new Error("forced_stream_failure"));
        return;
      }
      const chunk = input.chunks[index++];
      if (!chunk) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
    cancel(reason) {
      input.onCancel?.(reason);
    },
  });
  return new Request("https://tecpey.test/api/test", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...input.headers,
    },
    body,
    duplex: "half",
  } as StreamingRequestInit);
}

function expectFailure(
  result: BoundedJsonBodyResult,
  error: string,
  status: number,
): void {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, error);
  assert.equal(result.status, status);
}

describe("streaming bounded JSON body authority", () => {
  it("accepts an exact-boundary JSON document", async () => {
    const bytes = encoder.encode('{"value":"exact"}');
    const result = await readJsonBody<{ value: string }>(
      streamingRequest({ chunks: [bytes] }),
      { maxBytes: bytes.byteLength },
    );
    assert.deepEqual(result, {
      ok: true,
      value: { value: "exact" },
      bytesRead: bytes.byteLength,
    });
  });

  it("rejects one byte over the boundary and cancels the reader", async () => {
    const bytes = encoder.encode('{"value":"oversized"}');
    let cancelled = false;
    const result = await readJsonBody(
      streamingRequest({
        chunks: [bytes.subarray(0, bytes.length - 1), bytes.subarray(bytes.length - 1)],
        onCancel: () => {
          cancelled = true;
        },
      }),
      { maxBytes: bytes.byteLength - 1 },
    );
    expectFailure(result, "payload_too_large", 413);
    assert.equal(cancelled, true);
  });

  it("counts actual chunked bytes when Content-Length is absent", async () => {
    const result = await readJsonBody(
      streamingRequest({
        chunks: [encoder.encode('{"a":"'), encoder.encode("123456789"), encoder.encode('"}')],
      }),
      { maxBytes: 8 },
    );
    expectFailure(result, "payload_too_large", 413);
  });

  it("does not trust a forged smaller Content-Length", async () => {
    const result = await readJsonBody(
      streamingRequest({
        chunks: [encoder.encode('{"value":"larger-than-declared"}')],
        headers: { "content-length": "2" },
      }),
      { maxBytes: 12 },
    );
    expectFailure(result, "payload_too_large", 413);
  });

  it("rejects an oversized declared length before reading", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(encoder.encode("{}"));
        controller.close();
      },
    });
    const request = new Request("https://tecpey.test/api/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "9999",
      },
      body,
      duplex: "half",
    } as StreamingRequestInit);
    const result = await readJsonBody(request, { maxBytes: 32 });
    expectFailure(result, "payload_too_large", 413);
    assert.equal(pulls <= 1, true);
  });

  it("rejects malformed Content-Length metadata", async () => {
    const result = await readJsonBody(
      streamingRequest({
        chunks: [encoder.encode("{}")],
        headers: { "content-length": "not-a-number" },
      }),
      { maxBytes: 32 },
    );
    expectFailure(result, "invalid_content_length", 400);
  });

  it("rejects compressed request bodies before decompression", async () => {
    const result = await readJsonBody(
      streamingRequest({
        chunks: [encoder.encode("compressed-bytes")],
        headers: { "content-encoding": "gzip" },
      }),
      { maxBytes: 64 },
    );
    expectFailure(result, "unsupported_content_encoding", 415);
  });

  it("requires JSON media types by default and accepts +json", async () => {
    const rejected = await readJsonBody(
      streamingRequest({
        chunks: [encoder.encode("{}")],
        headers: { "content-type": "text/plain" },
      }),
      { maxBytes: 32 },
    );
    expectFailure(rejected, "unsupported_media_type", 415);

    const accepted = await readJsonBody(
      streamingRequest({
        chunks: [encoder.encode('{"ok":true}')],
        headers: { "content-type": "application/problem+json" },
      }),
      { maxBytes: 32 },
    );
    assert.equal(accepted.ok, true);
  });

  it("returns bounded failures for invalid UTF-8 and malformed JSON", async () => {
    const invalidUtf8 = await readJsonBody(
      streamingRequest({ chunks: [new Uint8Array([0xc3, 0x28])] }),
      { maxBytes: 16 },
    );
    expectFailure(invalidUtf8, "invalid_utf8", 400);

    const invalidJson = await readJsonBody(
      streamingRequest({ chunks: [encoder.encode('{"broken":')] }),
      { maxBytes: 32 },
    );
    expectFailure(invalidJson, "invalid_json", 400);
  });

  it("fails closed when the request stream errors", async () => {
    const result = await readJsonBody(
      streamingRequest({
        chunks: [encoder.encode("{")],
        failAtChunk: 1,
      }),
      { maxBytes: 32 },
    );
    expectFailure(result, "body_read_failed", 400);
  });

  it("allows an explicit empty-object compatibility mode", async () => {
    const request = new Request("https://tecpey.test/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    assert.deepEqual(
      await readJsonBody<Record<string, unknown>>(request, {
        maxBytes: 32,
        allowEmptyObject: true,
      }),
      { ok: true, value: {}, bytesRead: 0 },
    );
  });

  it("rejects invalid or unsafe configured limits", async () => {
    const request = streamingRequest({ chunks: [encoder.encode("{}")] });
    const result = await readJsonBody(request, { maxBytes: 0 });
    expectFailure(result, "invalid_body_limit", 500);
  });

  it("reconstructs a safe NextRequest without losing route context", async () => {
    const original = new NextRequest("https://tecpey.test/api/test?locale=fa", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "content-length": "22",
        cookie: "tecpey_session=test-token",
        "x-tecpey-request-id": "request-123",
      },
      body: JSON.stringify({ visibility: "private" }),
    });

    const result = await readBoundedJsonRequest<{ visibility: string }>(original, {
      maxBytes: 64,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.request.method, "PATCH");
    assert.equal(result.request.nextUrl.pathname, "/api/test");
    assert.equal(result.request.nextUrl.searchParams.get("locale"), "fa");
    assert.equal(result.request.cookies.get("tecpey_session")?.value, "test-token");
    assert.equal(result.request.headers.get("x-tecpey-request-id"), "request-123");
    assert.equal(result.request.headers.get("content-length"), null);
    assert.equal(result.request.headers.get("content-encoding"), null);
    assert.equal(result.request.headers.get("transfer-encoding"), null);
    assert.equal(
      result.request.headers.get("content-type"),
      "application/json; charset=utf-8",
    );
    assert.deepEqual(await result.request.json(), { visibility: "private" });
    assert.deepEqual(result.value, { visibility: "private" });
  });
});
