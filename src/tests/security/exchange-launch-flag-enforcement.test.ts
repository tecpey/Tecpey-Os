import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isFeatureEnabled } from "../../lib/feature-flags";
import { PRODUCTS } from "../../lib/product-registry";

// SB-016. The launch posture rests on the Exchange being disabled, but
// exchange.enabled was read only by the product registry (surface listing) and
// the admin control-plane matrix (which reports launch_locked). No request
// boundary enforced it, so the control plane could report the Exchange as locked
// while the placement route accepted orders against the seeded active markets.
//
// requireFeature() already existed in route-guards.ts for exactly this purpose
// and nothing called it. These tests lock the enforcement and the two properties
// that make it trustworthy: that it fails closed, and that it does not trap a
// user's funds when the Exchange is switched off.

const PLACEMENT = readFileSync("src/app/api/orders/route.ts", "utf8");
const CANCELLATION = readFileSync("src/app/api/orders/[id]/route.ts", "utf8");

test("the exchange flag is off unless explicitly enabled", () => {
  const previous = process.env.FEATURE_EXCHANGE_ENABLED;
  try {
    delete process.env.FEATURE_EXCHANGE_ENABLED;
    assert.equal(isFeatureEnabled("exchange.enabled"), false, "an unset flag must not enable the Exchange");
    process.env.FEATURE_EXCHANGE_ENABLED = "";
    assert.equal(isFeatureEnabled("exchange.enabled"), false, "an empty flag must not enable the Exchange");
    process.env.FEATURE_EXCHANGE_ENABLED = "yes";
    assert.equal(isFeatureEnabled("exchange.enabled"), false, "only an exact \"true\" may enable the Exchange");
    process.env.FEATURE_EXCHANGE_ENABLED = "true";
    assert.equal(isFeatureEnabled("exchange.enabled"), true);
  } finally {
    if (previous === undefined) delete process.env.FEATURE_EXCHANGE_ENABLED;
    else process.env.FEATURE_EXCHANGE_ENABLED = previous;
  }
});

test("order placement refuses when the Exchange is launch-disabled", () => {
  assert.match(PLACEMENT, /import \{ requireFeature \} from "@\/lib\/route-guards"/);
  assert.match(
    PLACEMENT,
    /const exchangeGate = requireFeature\("exchange\.enabled"\);\s*if \(exchangeGate\) return exchangeGate;/,
  );
});

test("the placement gate runs before any request work", () => {
  // The refusal must not depend on parsing the body, resolving a session, or
  // consuming rate-limit budget — a launch-disabled surface should reject before
  // it does anything on the caller's behalf.
  const gateIdx = PLACEMENT.indexOf('const exchangeGate = requireFeature("exchange.enabled");');
  assert.ok(gateIdx > 0, "the placement gate must exist");
  for (const later of [
    "verifyCsrfOrigin(req)",
    "getCanonicalSession(req",
    'namespace: "orders-place"',
    "readBoundedJsonRequest(req",
  ]) {
    const laterIdx = PLACEMENT.indexOf(later, gateIdx);
    assert.ok(laterIdx > gateIdx, `${later} must come after the launch gate`);
  }
});

test("cancellation stays reachable so a disabled Exchange cannot trap funds", () => {
  // Deliberate asymmetry. Gating cancellation would strand resting orders — and
  // the balance they hold — whenever the Exchange is switched off. Halting a
  // market means refusing new exposure, not refusing to unwind existing
  // exposure, so the cancel route must remain callable.
  assert.ok(
    !CANCELLATION.includes('requireFeature("exchange.enabled")'),
    "cancellation must not be launch-gated: users must always be able to unwind resting orders",
  );
});

test("every flag-carrying product surface is accounted for", () => {
  // Guards against a future surface shipping display-only. Any product that
  // declares a feature flag must be listed here with its enforcement decision,
  // so adding one forces a deliberate choice rather than silent omission.
  const enforcement: Record<string, "route-enforced" | "no-mutating-surface"> = {
    "exchange.enabled": "route-enforced",
    "academy.enabled": "no-mutating-surface",
    "social.enabled": "no-mutating-surface",
    "mentor.enabled": "no-mutating-surface",
    "future.marketplace.enabled": "no-mutating-surface",
  };

  const flagged = Object.values(PRODUCTS).filter((product) => product.featureFlag !== null);
  for (const product of flagged) {
    const flag = product.featureFlag as string;
    assert.ok(
      flag in enforcement,
      `${product.id} declares ${flag} but has no recorded enforcement decision — see SB-016`,
    );
  }
  assert.equal(
    Object.keys(enforcement).length,
    flagged.length,
    "the enforcement table must not drift from the product registry",
  );
});
