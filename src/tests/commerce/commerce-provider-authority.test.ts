import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCommercePurchaseReadiness,
  hashCommerceProviderOperation,
} from "../../lib/commerce/commerce-provider-authority";

test("commerce purchase readiness is fail-closed until every commercial disclosure and provider control is configured", () => {
  const blocked = evaluateCommercePurchaseReadiness({
    providerConfigured: false,
    providerSupportsIdempotency: false,
    webhookVerificationConfigured: false,
    pricingConfigured: false,
  });
  assert.equal(blocked.enabled, false);
  if (!blocked.enabled) {
    assert.deepEqual(blocked.reasons, [
      "provider_not_configured",
      "provider_idempotency_unproven",
      "webhook_verification_not_configured",
      "pricing_not_configured",
      "refund_policy_not_configured",
      "cancellation_policy_not_configured",
      "legal_disclosure_not_configured",
    ]);
  }
});

test("commerce purchase readiness binds active plan legal copy to the disclosed version", () => {
  const base = {
    providerConfigured: true,
    providerSupportsIdempotency: true,
    webhookVerificationConfigured: true,
    pricingConfigured: true,
    refundPolicyVersion: "refund.v1",
    cancellationPolicyVersion: "cancel.v1",
    legalDisclosureVersion: "commerce.v2",
  };
  assert.deepEqual(evaluateCommercePurchaseReadiness({ ...base, planLegalCopyVersion: "commerce.v1" }), {
    enabled: false, reasons: ["legal_copy_mismatch"],
  });
  assert.deepEqual(evaluateCommercePurchaseReadiness({ ...base, planLegalCopyVersion: "commerce.v2" }), { enabled: true });
});

test("provider operation request hashes are canonical and preserve integer minor-unit identity", () => {
  const a = hashCommerceProviderOperation({
    tenantId: "tecpey", workspaceId: "main", provider: "testpay", operationType: "refund",
    providerPaymentId: "pay-1", amountMinor: 1234567890123456789n, currency: "USD",
  });
  const b = hashCommerceProviderOperation({
    currency: "USD", amountMinor: 1234567890123456789n, providerPaymentId: "pay-1",
    operationType: "refund", provider: "testpay", workspaceId: "main", tenantId: "tecpey",
  });
  const changed = hashCommerceProviderOperation({
    tenantId: "tecpey", workspaceId: "main", provider: "testpay", operationType: "refund",
    providerPaymentId: "pay-1", amountMinor: 1234567890123456790n, currency: "USD",
  });
  assert.equal(a, b);
  assert.notEqual(a, changed);
  assert.match(a, /^[0-9a-f]{64}$/);
});
