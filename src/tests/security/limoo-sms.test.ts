import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getLimooCurrentCredit,
  getLimooMessageStatus,
  getLimooReceivedMessages,
  sendLimooPeerToPeerSms,
  sendLimooPatternMessage,
  sendLimooSms,
  sendLimooVerificationCode,
} from "../../lib/security/limoo-sms";

const originalApiKey = process.env.LIMOO_SMS_API_KEY;
const originalPatternId = process.env.LIMOO_SMS_PATTERN_ID;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.LIMOO_SMS_API_KEY;
  else process.env.LIMOO_SMS_API_KEY = originalApiKey;
  if (originalPatternId === undefined) delete process.env.LIMOO_SMS_PATTERN_ID;
  else process.env.LIMOO_SMS_PATTERN_ID = originalPatternId;
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
    process.env.LIMOO_SMS_PATTERN_ID = "42";
    let called = false;
    const result = await sendLimooVerificationCode("09123456789", "123456", {
      fetchImpl: async () => {
        called = true;
        return new Response(JSON.stringify({ Success: true }));
      },
    });
    assert.deepEqual(result, { ok: false, reason: "disabled" });
    assert.equal(called, false);
  });

  it("sends a TecPey-generated OTP through the official Pattern endpoint", async () => {
    process.env.LIMOO_SMS_API_KEY = "server-secret";
    process.env.LIMOO_SMS_PATTERN_ID = "42";
    const observed: ObservedCall[] = [];
    const fetchImpl = successfulFetch(observed);

    assert.deepEqual(
      await sendLimooVerificationCode("09123456789", "123456", { fetchImpl }),
      { ok: true },
    );

    assert.deepEqual(observed, [
      {
        url: "https://api.limosms.com/api/sendpatternmessage",
        key: "server-secret",
        body: { OtpId: "42", ReplaceToken: ["123456"], MobileNumber: "09123456789" },
      },
    ]);
  });

  it("fails closed before the network when the Pattern ID or code is invalid", async () => {
    process.env.LIMOO_SMS_API_KEY = "server-secret";
    delete process.env.LIMOO_SMS_PATTERN_ID;
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response(JSON.stringify({ Success: true }));
    };

    assert.deepEqual(
      await sendLimooVerificationCode("09123456789", "123456", { fetchImpl }),
      { ok: false, reason: "disabled" },
    );
    process.env.LIMOO_SMS_PATTERN_ID = "42";
    assert.deepEqual(
      await sendLimooVerificationCode("09123456789", "12345", { fetchImpl }),
      { ok: false, reason: "invalid_response" },
    );
    assert.equal(calls, 0);
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
      patternId: "315421354564",
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
        body: { OtpId: "315421354564", ReplaceToken: ["654321"], MobileNumber: "09123456789" },
      },
    ]);
  });

  it("preserves the official signed 64-bit Pattern ID without number coercion", async () => {
    process.env.LIMOO_SMS_API_KEY = "server-secret";
    process.env.LIMOO_SMS_PATTERN_ID = "9223372036854775807";
    const observed: ObservedCall[] = [];

    assert.deepEqual(
      await sendLimooVerificationCode("09123456789", "000042", {
        fetchImpl: successfulFetch(observed),
      }),
      { ok: true },
    );
    assert.equal(
      (observed[0]?.body as { OtpId?: unknown }).OtpId,
      "9223372036854775807",
    );
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
    process.env.LIMOO_SMS_PATTERN_ID = "42";
    const malformed = await sendLimooVerificationCode("09123456789", "123456", {
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    });
    assert.deepEqual(malformed, { ok: false, reason: "invalid_response" });
    const oversized = await sendLimooVerificationCode("09123456789", "123456", {
      fetchImpl: async () => new Response("x".repeat(9_000), { status: 200 }),
    });
    assert.deepEqual(oversized, { ok: false, reason: "invalid_response" });
  });
});
