import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectBodyLimitEvidence } from "./api-security-body-limit-policy.mjs";

describe("API body limit authority", () => {
  it("does not trust Content-Length or checkBodySize as enforceable", () => {
    const evidence = detectBodyLimitEvidence(`
      if (!checkBodySize(req.headers.get("content-length"), 4096)) throw new Error();
      const body = await req.json();
    `);
    assert.equal(evidence.headerHint, true);
    assert.equal(evidence.enforceable, false);
    assert.equal(evidence.authority, null);
  });

  it("does not trust a size constant without a bounded reader", () => {
    const evidence = detectBodyLimitEvidence(`
      const MAX_BODY_BYTES = 4096;
      const body = await req.json();
    `);
    assert.equal(evidence.enforceable, false);
  });

  it("accepts a governed bounded reader", () => {
    const evidence = detectBodyLimitEvidence(`
      const body = await readBoundedJson(req, { maxBytes: 4096 });
    `);
    assert.equal(evidence.enforceable, true);
    assert.equal(evidence.authority, "readBoundedJson");
  });

  it("accepts a streaming reader only with byte counting and abort behavior", () => {
    const evidence = detectBodyLimitEvidence(`
      const reader = req.body.getReader();
      let totalBytes = 0;
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("payload_too_large");
      }
    `);
    assert.equal(evidence.enforceable, true);
    assert.equal(evidence.authority, "streaming-reader-with-byte-counter");
  });

  it("rejects a streaming reader that counts but never aborts", () => {
    const evidence = detectBodyLimitEvidence(`
      const reader = req.body.getReader();
      let totalBytes = 0;
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_BODY_BYTES) console.warn("large");
    `);
    assert.equal(evidence.enforceable, false);
  });
});
