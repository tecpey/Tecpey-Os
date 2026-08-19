import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isActivePath,
  resolveActiveIndex,
  type LivingNavMatch,
} from "../../components/tecpey/living-nav-active";

// The living mobile navigation renders exactly what these pure functions decide:
// which single tab is active (aria-current="page" + highlight + halo). These
// tests pin the two properties the component depends on — a single active tab
// even when match sets overlap, and no active tab on an unmatched route.

describe("living navigation active resolution", () => {
  it("matches an exact path and nested paths, but not a same-prefix sibling", () => {
    const item: LivingNavMatch = { match: ["/academy/trading-arena"] };
    assert.equal(isActivePath("/academy/trading-arena", item), true);
    assert.equal(isActivePath("/academy/trading-arena/replay", item), true);
    // A sibling that merely shares the prefix must not match.
    assert.equal(isActivePath("/academy/trading-arena-history", item), false);
  });

  it("returns the first matching item so exactly one tab is ever active", () => {
    // Two tabs whose match sets overlap on the same route. resolveActiveIndex
    // must pick the first, so the highlight and halo agree and only one link
    // carries aria-current="page" — the regression that previously lit both the
    // Home and Account tabs on /academy/profile.
    const items: LivingNavMatch[] = [
      { match: ["/academy/profile"] }, // Home
      { match: ["/academy/certificates"] }, // Account (correct: no profile overlap)
      { match: ["/academy/profile", "/academy/certificates"] }, // deliberately overlapping
    ];
    assert.equal(resolveActiveIndex("/academy/profile", items), 0);
    assert.equal(resolveActiveIndex("/academy/certificates", items), 1);
  });

  it("returns -1 for an unmatched route rather than defaulting to the first tab", () => {
    const items: LivingNavMatch[] = [
      { match: ["/academy/profile"] },
      { match: ["/academy/certificates"] },
    ];
    // A dashboard-adjacent route that no tab claims must light nothing — the old
    // Math.max(0, findIndex) coerced this to 0 and falsely highlighted Home.
    assert.equal(resolveActiveIndex("/academy/mentor-coach", items), -1);
  });

  it("keeps the real dashboard Home and Account tabs mutually exclusive", () => {
    // Mirrors the shipped AcademyStudentDashboardV2 nav item shapes after the fix.
    const home: LivingNavMatch = { match: ["/academy/profile"] };
    const account: LivingNavMatch = {
      match: ["/academy/certificates", "/academy/achievements"],
    };
    assert.equal(isActivePath("/academy/profile", home), true);
    assert.equal(isActivePath("/academy/profile", account), false);
    assert.equal(isActivePath("/academy/certificates", home), false);
    assert.equal(isActivePath("/academy/certificates", account), true);
  });
});
