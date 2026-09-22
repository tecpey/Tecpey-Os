import assert from "node:assert/strict";
import test from "node:test";
import {
  CommerceWebhookAuthorityError,
  MAX_COMMERCE_WEBHOOK_BYTES,
  verifyCommercialWebhookEnvelope,
} from "../../lib/commerce/commerce-webhook-authority";
import type { CommerceProviderAdapter } from "../../lib/commerce/commerce-authority";

const adapter: CommerceProviderAdapter = {
  provider: "testpay",
  async createCheckout() { return { providerObjectId: "sub-1", redirectUrl: "https://example.invalid" }; },
  async cancel() {},
  async refund() {},
  async verifyAndNormalizeWebhook({ body }) {
    assert.ok(body.byteLength > 0);
    return {
      provider: "testpay",
      providerAccountScope: "merchant-a",
      providerEventId: "evt-1",
      providerObjectId: "sub-1",
      occurredAt: new Date("2026-09-22T00:00:00Z"),
      normalizedState: "active",
      currentPeriodEnd: new Date("2026-10-22T00:00:00Z"),
    };
  },
};

test("verified webhook hashes the exact raw body and retains only bounded redacted metadata", async () => {
  const body = new TextEncoder().encode('{"id":"evt-1","secret":"never-retain-raw"}');
  const out = await verifyCommercialWebhookEnvelope({
    adapter, body, headers: { "x-signature": "adapter-owned" }, eventType: "subscription.updated",
    payloadRedacted: { object: "subscription" }, now: new Date("2026-09-22T00:00:00Z"),
  });
  assert.equal(out.payloadSha256, "b60513a4f739f6b286eb9d77f8f0ae1457edbbfdd79c77781a03e9d44b08cfc9");
  assert.deepEqual(out.payloadRedacted, { object: "subscription" });
  assert.equal(out.payloadExpiresAt.toISOString(), "2026-09-29T00:00:00.000Z");
});

test("webhook authority rejects oversized raw bodies before provider verification", async () => {
  await assert.rejects(
    verifyCommercialWebhookEnvelope({
      adapter, body: new Uint8Array(MAX_COMMERCE_WEBHOOK_BYTES + 1), headers: {}, eventType: "subscription.updated",
    }),
    (error: unknown) => error instanceof CommerceWebhookAuthorityError && error.code === "body_too_large",
  );
});

test("provider identity cannot be switched by normalized webhook data", async () => {
  const forged: CommerceProviderAdapter = {
    ...adapter,
    async verifyAndNormalizeWebhook() {
      return { provider: "other", providerAccountScope: "merchant-a", providerEventId: "evt-x", providerObjectId: "sub-1", occurredAt: new Date(), normalizedState: "active" };
    },
  };
  await assert.rejects(
    verifyCommercialWebhookEnvelope({ adapter: forged, body: new Uint8Array([1]), headers: {}, eventType: "subscription.updated" }),
    (error: unknown) => error instanceof CommerceWebhookAuthorityError && error.code === "provider_mismatch",
  );
});
