import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FLAG_CONFIG, isFeatureEnabled } from "../../lib/feature-flags";
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
const COMMUNITY_PROFILE = readFileSync("src/app/api/community/profile/route.ts", "utf8");

// Only a flag that defaults OFF is ever cited as a launch control, so only those
// carry the SB-016 risk: the platform claiming a surface is disabled while its
// routes stay open. A flag that defaults ON makes no such claim.
type Enforcement =
  | "route-enforced"
  | "no-mutating-surface"
  | "unenforced-mutating-surface"
  | "default-on-not-a-launch-claim";

const ENFORCEMENT: Record<string, Enforcement> = {
  "exchange.enabled": "route-enforced",
  // Resolved by issue #510. The community surface that made this unenforced was
  // never Social's to own: social.enabled gates the unshipped social-auth
  // provider capability in the admin control plane, while community profiles and
  // journals ship today under community.enabled. Social is now groups and
  // leaderboards, which carry no mutating route. True because the surface moved,
  // not because the label changed.
  "social.enabled": "no-mutating-surface",
  "community.enabled": "route-enforced",
  "future.marketplace.enabled": "no-mutating-surface",
  "academy.enabled": "default-on-not-a-launch-claim",
  "mentor.enabled": "default-on-not-a-launch-claim",
};

// Empty since issue #510 closed the last entry. Kept so a future deliberate
// exception has a place to be recorded rather than left implicit.
const KNOWN_UNENFORCED_ROUTES: string[] = [];

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

test("every route-enforced flag actually has its guard at the route", () => {
  // "route-enforced" is a claim about code, so it must be checked against code.
  // Without this, the table could record a surface as enforced while the guard
  // had been deleted — the exact failure mode SB-016 is about, one level up.
  const ENFORCED_AT: Record<string, string> = {
    "exchange.enabled": PLACEMENT,
    "community.enabled": COMMUNITY_PROFILE,
  };
  const claimed = Object.entries(ENFORCEMENT)
    .filter(([, decision]) => decision === "route-enforced")
    .map(([flag]) => flag)
    .sort();
  assert.deepEqual(
    claimed,
    Object.keys(ENFORCED_AT).sort(),
    "every flag recorded as route-enforced needs a source to check it against",
  );
  for (const [flag, source] of Object.entries(ENFORCED_AT)) {
    assert.ok(
      source.includes(`requireFeature("${flag}")`),
      `${flag} is recorded as route-enforced but its route does not call requireFeature("${flag}")`,
    );
  }
});

test("every feature flag is accounted for, not only product-declared ones", () => {
  // Guards against a future surface shipping display-only. Deliberately keyed on
  // the flag registry rather than the product registry: community.enabled governs
  // a live mutating route without being a product entry, so a product-only sweep
  // would have missed exactly the flag this issue was about.
  const declared = Object.keys(FLAG_CONFIG).sort();
  assert.deepEqual(
    Object.keys(ENFORCEMENT).sort(),
    declared,
    "the enforcement table must list every feature flag, and no flag it does not have",
  );

  // A product that names a flag must still resolve to a recorded decision.
  for (const product of Object.values(PRODUCTS)) {
    if (product.featureFlag === null) continue;
    assert.ok(
      product.featureFlag in ENFORCEMENT,
      `${product.id} declares ${product.featureFlag} but has no recorded enforcement decision — see SB-016`,
    );
  }
});

test("a flag recorded as off-by-default really is off by default", () => {
  // The classification is only meaningful if the defaults match it. If a flag
  // recorded as a launch claim silently flips to default-on, or vice versa, the
  // table's reasoning collapses without anything failing.
  const previous = process.env.FEATURE_EXCHANGE_ENABLED;
  try {
    delete process.env.FEATURE_EXCHANGE_ENABLED;
    // A flag classified as a launch claim must actually default off; one
    // classified as making no such claim must actually default on. Enforcement
    // kind is orthogonal — community.enabled is route-enforced *and* defaults on,
    // because enforcing a live surface is about making the switch real, not about
    // claiming the surface is off.
    const LAUNCH_CLAIM: Record<string, boolean> = {
      "exchange.enabled": true,
      "social.enabled": true,
      "future.marketplace.enabled": true,
      "academy.enabled": false,
      "mentor.enabled": false,
      "community.enabled": false,
    };
    for (const flag of Object.keys(ENFORCEMENT)) {
      const claimsDisabled = LAUNCH_CLAIM[flag];
      assert.equal(
        typeof claimsDisabled,
        "boolean",
        `${flag} has no recorded launch-claim expectation`,
      );
      const actual = isFeatureEnabled(flag as Parameters<typeof isFeatureEnabled>[0]);
      assert.equal(
        actual,
        !claimsDisabled,
        `${flag} is recorded as ${claimsDisabled ? "off-by-default" : "on-by-default"} but its default is ${actual ? "on" : "off"}`,
      );
    }
  } finally {
    if (previous === undefined) delete process.env.FEATURE_EXCHANGE_ENABLED;
    else process.env.FEATURE_EXCHANGE_ENABLED = previous;
  }
});

test("the known-unenforced surface ledger cannot grow or go stale silently", () => {
  // This is a debt ledger, not an approval. Each listed route belongs to an
  // off-by-default product and still serves mutations. The assertion is
  // two-sided on purpose: if someone gates one of these, it fails and forces the
  // ledger to be updated rather than leaving a stale "unenforced" record behind.
  for (const routePath of KNOWN_UNENFORCED_ROUTES) {
    const source = readFileSync(routePath, "utf8");
    assert.ok(
      !source.includes("requireFeature("),
      `${routePath} is now feature-gated — update ENFORCEMENT and KNOWN_UNENFORCED_ROUTES (SB-016)`,
    );
  }
  const unenforced = Object.entries(ENFORCEMENT)
    .filter(([, decision]) => decision === "unenforced-mutating-surface")
    .map(([flag]) => flag)
    .sort();
  assert.deepEqual(
    unenforced,
    [],
    "a new unenforced mutating surface appeared — gate it or record it deliberately (SB-016)",
  );
});
