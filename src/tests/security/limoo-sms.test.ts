import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  checkLimooVerificationCode,
  sendLimooVerificationCode,
} from "../../lib/security/limoo-sms";

const originalApiKey = process.env.LIMOO_SMS_API_KEY;
const originalFooter = process.env.LIMOO_SMS_OTP_FOOTER;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.LIMOO_SMS_API_KEY;
  else process.env.LIMOO_SMS_API_KEY = originalApiKey;
  if (originalFooter === undefined) delete process.env.LIMOO_SMS_OTP_FOOTER;
  else process.env.LIMOO_SMS_OTP_FOOTER = originalFooter;
});

describe("Limoo SMS provider boundary", () => {
  it("fails closed without a server-side API key", async () => {
    delete process.env.LIMOO_SMS_API_KEY;
    let called = false;
    const result = await sendLimooVerificationCode("09123456789", {
      fetchImpl: async () => {
        called = true;
        return new Response(JSON.stringify({ Success: true }));
      },
    });
    assert.deepEqual(result, { ok: false, reason: "disabled" });
    assert.equal(called, false);
  });

  it("uses the fixed official sendcode endpoint and ApiKey header", async () => {
    process.env.LIMOO_SMS_API_KEY = "server-secret";
    process.env.LIMOO_SMS_OTP_FOOTER = "TecPey";
    let observedUrl = "";
    let observedKey = "";
    let observedBody: unknown = null;
    const result = await sendLimooVerificationCode("09123456789", {
      fetchImpl: async (url, init) => {
        observedUrl = String(url);
        observedKey = new Headers(init?.headers).get("ApiKey") ?? "";
        observedBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ Success: true }), { status: 200 });
      },
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(observedUrl, "https://api.limosms.com/api/sendcode");
    assert.equal(observedKey, "server-secret");
    assert.deepEqual(observedBody, { Mobile: "09123456789", Footer: "TecPey" });
  });

  it("checks the code through the fixed checkcode endpoint", async () => {
    process.env.LIMOO_SMS_API_KEY = "server-secret";
    let observedUrl = "";
    let observedBody: unknown = null;
    const result = await checkLimooVerificationCode("09123456789", "123456", {
      fetchImpl: async (url, init) => {
        observedUrl = String(url);
        observedBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      },
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(observedUrl, "https://api.limosms.com/api/checkcode");
    assert.deepEqual(observedBody, { Mobile: "09123456789", Code: "123456" });
  });

  it("bounds provider responses and rejects malformed payloads", async () => {
    process.env.LIMOO_SMS_API_KEY = "server-secret";
    const malformed = await sendLimooVerificationCode("09123456789", {
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    });
    assert.deepEqual(malformed, { ok: false, reason: "invalid_response" });
    const oversized = await sendLimooVerificationCode("09123456789", {
      fetchImpl: async () => new Response("x".repeat(9_000), { status: 200 }),
    });
    assert.deepEqual(oversized, { ok: false, reason: "invalid_response" });
  });
});
