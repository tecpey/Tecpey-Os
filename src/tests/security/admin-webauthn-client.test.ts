import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  base64UrlToArrayBuffer,
  bufferSourceToBase64Url,
} from "@/lib/admin-webauthn-client";

describe("admin WebAuthn browser encoding", () => {
  it("round-trips binary data through unpadded base64url", () => {
    const original = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
    const encoded = bufferSourceToBase64Url(original);
    const decoded = new Uint8Array(base64UrlToArrayBuffer(encoded));

    assert.match(encoded, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual([...decoded], [...original]);
  });

  it("rejects non-base64url input instead of permissive decoding", () => {
    assert.throws(() => base64UrlToArrayBuffer("abc+/="), /invalid_base64url/);
    assert.throws(() => base64UrlToArrayBuffer(""), /invalid_base64url/);
  });

  it("preserves sliced typed-array boundaries", () => {
    const source = new Uint8Array([9, 8, 7, 6, 5]);
    const slice = source.subarray(1, 4);
    const encoded = bufferSourceToBase64Url(slice);
    const decoded = new Uint8Array(base64UrlToArrayBuffer(encoded));

    assert.deepEqual([...decoded], [8, 7, 6]);
  });
});
