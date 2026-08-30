import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readBoundedResponseText } from "../../lib/bounded-http-body";

describe("bounded HTTP response bodies", () => {
  it("reads a response that stays within the byte budget", async () => {
    const response = new Response("خبر امن", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });

    assert.equal(
      await readBoundedResponseText(response, { maxBytes: 64, errorCode: "too_large" }),
      "خبر امن",
    );
  });

  it("rejects an oversized declared content length before reading", async () => {
    const response = new Response("small", { headers: { "content-length": "65" } });
    await assert.rejects(
      readBoundedResponseText(response, { maxBytes: 64, errorCode: "too_large" }),
      /too_large/,
    );
  });

  it("stops a chunked response once its actual byte budget is exceeded", async () => {
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(40));
        controller.enqueue(new Uint8Array(40));
        controller.close();
      },
    }));

    await assert.rejects(
      readBoundedResponseText(response, { maxBytes: 64, errorCode: "too_large" }),
      /too_large/,
    );
  });
});
