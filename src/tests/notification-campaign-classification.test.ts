import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyLegacyNotification } from "../lib/notifications/repository";
import { evaluateNotificationPolicy } from "../lib/notifications/policy";
import type { NotificationPolicyInput } from "../lib/notifications/types";

test("campaign-stamped legacy rows migrate as the consent-gated marketing class", () => {
  // Command Center broadcasts are written with type "system" but carry
  // metadata.campaign, so they must classify as marketing_campaign, not the
  // near-mandatory product_support class.
  assert.equal(
    classifyLegacyNotification("system", { campaign: "command-center", audience: "all" }),
    "marketing_campaign",
  );
  // Genuine system/support and other notifications keep their real class.
  assert.equal(classifyLegacyNotification("system", {}), "product_support");
  assert.equal(classifyLegacyNotification("system", null), "product_support");
  assert.equal(classifyLegacyNotification("mentor", { fingerprint: "abc" }), "mentor_ai");
  // A non-string/empty campaign marker is not treated as a campaign.
  assert.equal(classifyLegacyNotification("system", { campaign: "" }), "product_support");
  assert.equal(classifyLegacyNotification("system", { campaign: true }), "product_support");
});

test("the legacy migration classifies rows through the campaign-aware helper", () => {
  const repo = readFileSync("src/lib/notifications/repository.ts", "utf8");
  assert.match(repo, /classifyLegacyNotification\(item\.type, item\.metadata\)/);
  // The raw legacyClass must no longer be the migration's classifier.
  assert.doesNotMatch(repo, /\n\s*legacyClass\(item\.type\),/);
});

// The point of the reclassification: marketing_campaign requires consent, so the
// governed policy engine suppresses it for a recipient who never granted
// marketing consent — whereas product_support does not. Pin that difference.
function policyInput(notificationClass: "marketing_campaign" | "product_support"): NotificationPolicyInput {
  return {
    now: "2026-08-19T12:00:00.000Z",
    intent: {
      notificationClass,
      channel: "in_app",
      audienceScope: "principal",
      dispatchMode: "event",
      urgency: "normal",
      cadence: "instant",
      correlationKey: "campaign-consent-test",
      expiresAt: null,
      locale: "fa",
      templateAvailable: true,
      grantedApprovals: 0,
    },
    recipient: {
      eligible: true,
      jurisdictionAllowed: true,
      categoryEnabled: true,
      channelEnabled: true,
      destinationVerified: true,
      marketingConsent: false,
      muted: false,
      inQuietHours: false,
      quietHoursEndAt: null,
      instantEnabled: true,
      digestEnabled: true,
      duplicateSeen: false,
      recentCategoryDeliveries: 0,
      categoryFrequencyCap: null,
    },
  };
}

test("marketing_campaign is suppressed without consent while product_support is not", () => {
  const marketing = evaluateNotificationPolicy(policyInput("marketing_campaign"));
  assert.equal(marketing.decision, "suppress");
  assert.equal(marketing.reason, "marketing_consent_required");

  const support = evaluateNotificationPolicy(policyInput("product_support"));
  assert.notEqual(support.reason, "marketing_consent_required");
});
