import assert from "node:assert/strict";
import test from "node:test";

import {
  DESIGN_SYSTEM_V2_PRINCIPLES,
  EXPERIENCE_VERIFICATION_REQUIREMENTS,
  FIRST_RELEASE_HOME_ACTIONS,
  FIRST_RELEASE_NAVIGATION_POLICY,
  P0_CORE_JOURNEY,
  P0_EXPERIENCE_TARGET_SCORE,
  PRODUCT_DESIGN_COUNCIL_ROLES,
  PRODUCT_EXPERIENCE_SCORE_DIMENSIONS,
  PRODUCT_SURFACE_REGISTRY,
  assertFirstReleaseExperienceBoundary,
  mayCloseExperienceFinding,
} from "@/lib/product-design-council-authority";

test("design council contains every required authority role", () => {
  assert.deepEqual(PRODUCT_DESIGN_COUNCIL_ROLES, [
    "product_director",
    "ux_ui_design_director",
    "ai_mentor_director",
    "growth_content_director",
    "security_privacy_director",
    "compliance_risk_director",
    "engineering_lead",
  ]);
});

test("P0 journey covers the complete first-release learning loop", () => {
  assert.deepEqual(P0_CORE_JOURNEY, [
    "auth",
    "home",
    "academy",
    "mentor",
    "trading_arena",
    "news_trend",
    "profile_settings",
  ]);

  assert.equal(P0_EXPERIENCE_TARGET_SCORE, 9);
  assert.equal(PRODUCT_EXPERIENCE_SCORE_DIMENSIONS.length, 10);
});

test("exchange execution surfaces are classified separately from education", () => {
  assert.equal(PRODUCT_SURFACE_REGISTRY.academy.class, "core_learning");
  assert.equal(PRODUCT_SURFACE_REGISTRY.mentor.class, "core_learning");
  assert.equal(
    PRODUCT_SURFACE_REGISTRY.markets_reference.class,
    "educational_reference",
  );
  assert.equal(
    PRODUCT_SURFACE_REGISTRY.coins_reference.class,
    "educational_reference",
  );
  assert.equal(PRODUCT_SURFACE_REGISTRY.swap.class, "restricted_financial");
  assert.equal(
    PRODUCT_SURFACE_REGISTRY.exchange_auth.class,
    "restricted_financial",
  );
});

test("first release cannot expose exchange as primary navigation or CTA", () => {
  assertFirstReleaseExperienceBoundary();

  assert.equal(
    FIRST_RELEASE_NAVIGATION_POLICY.exchangePrimaryNavigationAllowed,
    false,
  );
  assert.equal(
    FIRST_RELEASE_NAVIGATION_POLICY.exchangePrimaryCtaAllowed,
    false,
  );
  assert.equal(
    FIRST_RELEASE_NAVIGATION_POLICY.exchangeStickyMobileCtaAllowed,
    false,
  );
  assert.equal(
    FIRST_RELEASE_NAVIGATION_POLICY.educationalMarketReferenceAllowed,
    true,
  );
});

test("home actions are education, mentor and practice first", () => {
  assert.deepEqual(FIRST_RELEASE_HOME_ACTIONS, [
    "start_free_academy",
    "continue_learning",
    "talk_to_mentor",
    "assess_learning_level",
    "practice_in_trading_arena",
  ]);
});

test("design system v2 explicitly removes decorative excess", () => {
  for (const principle of [
    "content_before_decoration",
    "hierarchy_before_card_count",
    "structured_rows_before_repetitive_cards",
    "restrained_radius",
    "restrained_shadow",
    "restrained_glass",
    "ios_safe_area",
    "reduced_motion_resilience",
  ] as const) {
    assert.ok(DESIGN_SYSTEM_V2_PRINCIPLES.includes(principle));
  }
});

test("a finding cannot close without complete multidisciplinary evidence", () => {
  const finding = {
    id: "PX-P0-001",
    surface: "home",
    severity: "P0",
    owner: "product_director",
    status: "verified",
    acceptanceCriteria: ["Academy is the primary first-release action"],
    requiredEvidence: EXPERIENCE_VERIFICATION_REQUIREMENTS,
  } as const;

  assert.equal(
    mayCloseExperienceFinding(finding, EXPERIENCE_VERIFICATION_REQUIREMENTS),
    true,
  );

  assert.equal(
    mayCloseExperienceFinding(
      finding,
      EXPERIENCE_VERIFICATION_REQUIREMENTS.filter(
        (item) => item !== "staging_evidence",
      ),
    ),
    false,
  );
});
