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
  // Recorded as an open gap, not blessed. PATCH /api/community/profile is an
  // active mutating route owned by the Social product ("Community, groups,
  // journals, and leaderboards") and carries no feature guard. It is deliberately
  // not gated here: the community surface ships live — PeerJournals,
  // ChallengeCenter, AchievementCenter and CommunityCareerPanel all reach it — so
  // gating it behind an off-by-default flag would take a working Academy feature
  // offline. The real defect is the contradiction between a live surface and an
  // off-by-default product flag, and resolving that is a product decision, not a
  // mechanical one. Tracked in docs/SECURITY_BLOCKERS.md under SB-016.
  "social.enabled": "unenforced-mutating-surface",
  "future.marketplace.enabled": "no-mutating-surface",
  "academy.enabled": "default-on-not-a-launch-claim",
  "mentor.enabled": "default-on-not-a-launch-claim",
};

const KNOWN_UNENFORCED_ROUTES = ["src/app/api/community/profile/route.ts"];

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
  const flagged = Object.values(PRODUCTS).filter((product) => product.featureFlag !== null);
  for (const product of flagged) {
    const flag = product.featureFlag as string;
    assert.ok(
      flag in ENFORCEMENT,
      `${product.id} declares ${flag} but has no recorded enforcement decision — see SB-016`,
    );
  }
  assert.equal(
    Object.keys(ENFORCEMENT).length,
    flagged.length,
    "the enforcement table must not drift from the product registry",
  );
});

test("a flag recorded as off-by-default really is off by default", () => {
  // The classification is only meaningful if the defaults match it. If a flag
  // recorded as a launch claim silently flips to default-on, or vice versa, the
  // table's reasoning collapses without anything failing.
  const previous = process.env.FEATURE_EXCHANGE_ENABLED;
  try {
    delete process.env.FEATURE_EXCHANGE_ENABLED;
    for (const [flag, decision] of Object.entries(ENFORCEMENT)) {
      const expectedOn = decision === "default-on-not-a-launch-claim";
      const actual = isFeatureEnabled(flag as Parameters<typeof isFeatureEnabled>[0]);
      assert.equal(
        actual,
        expectedOn,
        `${flag} is recorded as "${decision}" but its default is ${actual ? "on" : "off"}`,
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
    ["social.enabled"],
    "a new unenforced mutating surface appeared — gate it or record it deliberately (SB-016)",
  );
});
