import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  checkLimooVerificationCode,
  getLimooCurrentCredit,
  getLimooMessageStatus,
  getLimooReceivedMessages,
  sendLimooPeerToPeerSms,
  sendLimooPatternMessage,
  sendLimooSms,
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

type ObservedCall = { url: string; key: string; body: unknown };

function successfulFetch(observed: ObservedCall[], data: unknown = { MessageId: ["1"] }) {
  return async (url: string | URL | Request, init?: RequestInit) => {
    observed.push({
      url: String(url),
      key: new Headers(init?.headers).get("ApiKey") ?? "",
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify({ Success: true, Data: data }), { status: 200 });
  };
}

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

  it("uses the official OTP endpoints and ApiKey header", async () => {
    process.env.LIMOO_SMS_API_KEY = "server-secret";
    process.env.LIMOO_SMS_OTP_FOOTER = "TecPey";
    const observed: ObservedCall[] = [];
    const fetchImpl = successfulFetch(observed);

    assert.deepEqual(await sendLimooVerificationCode("09123456789", { fetchImpl }), { ok: true });
    assert.deepEqual(await checkLimooVerificationCode("09123456789", "123456", { fetchImpl }), { ok: true });

    assert.deepEqual(observed, [
      {
        url: "https://api.limosms.com/api/sendcode",
        key: "server-secret",
        body: { Mobile: "09123456789", Footer: "TecPey" },
      },
      {
        url: "https://api.limosms.com/api/checkcode",
        key: "server-secret",
        body: { Mobile: "09123456789", Code: "123456" },
      },
    ]);
  });

  it("matches the official send, peer and pattern contracts", async () => {
    process.env.LIMOO_SMS_API_KEY = "server-secret";
    const observed: ObservedCall[] = [];
    const fetchImpl = successfulFetch(observed);

    await sendLimooSms({
      senderNumber: "30001234",
      message: "hello",
      mobileNumbers: ["09123456789"],
      sendToBlockedNumbers: true,
    }, { fetchImpl });
    await sendLimooPeerToPeerSms({
      senderNumber: "30001234",
      messages: ["first", "second"],
      mobileNumbers: ["09123456789", "09120000000"],
    }, { fetchImpl });
    await sendLimooPatternMessage({
      patternId: 42,
      replaceTokens: ["654321"],
      mobileNumber: "09123456789",
    }, { fetchImpl });

    assert.deepEqual(observed.map(({ url, body }) => ({ url, body })), [
      {
        url: "https://api.limosms.com/api/sendsms",
        body: {
          SenderNumber: "30001234",
          Message: "hello",
          MobileNumber: ["09123456789"],
          SendToBlocksNumber: true,
        },
      },
      {
        url: "https://api.limosms.com/api/sendpeertopeersms",
        body: {
          SenderNumber: "30001234",
          Message: ["first", "second"],
          MobileNumber: ["09123456789", "09120000000"],
          SendToBlocksNumber: false,
        },
      },
      {
        url: "https://api.limosms.com/api/sendpatternmessage",
        body: { OtpId: 42, ReplaceToken: ["654321"], MobileNumber: "09123456789" },
      },
    ]);
  });

  it("matches the official credit, status and received-message contracts", async () => {
    process.env.LIMOO_SMS_API_KEY = "server-secret";
    const observed: ObservedCall[] = [];
    const fetchImpl = successfulFetch(observed, []);

    await getLimooCurrentCredit({ fetchImpl });
    await getLimooMessageStatus(["m1", "m2"], { fetchImpl });
    await getLimooReceivedMessages({ number: "30001234", page: 2, size: 50 }, { fetchImpl });

    assert.deepEqual(observed.map(({ url, body }) => ({ url, body })), [
      { url: "https://api.limosms.com/api/getcurrentcredit", body: {} },
      { url: "https://api.limosms.com/api/getstatus", body: { MessageId: ["m1", "m2"] } },
      {
        url: "https://api.limosms.com/api/getreceivedmessage",
        body: { Number: "30001234", Page: 2, Size: 50 },
      },
    ]);
  });

  it("redacts provider secrets before returning data to the admin route", async () => {
    process.env.LIMOO_SMS_API_KEY = "server-secret";
    const result = await getLimooCurrentCredit({
      fetchImpl: async () => new Response(JSON.stringify({
        Success: true,
        Data: {
          ApiKey: "leaked-api-key",
          accessToken: "leaked-token",
          nested: { password: "leaked-password", credit: 1200 },
        },
      }), { status: 200 }),
    });
    assert.equal(result.ok, true);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /leaked-/);
    assert.match(serialized, /\[redacted\]/);
    assert.match(serialized, /1200/);
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
