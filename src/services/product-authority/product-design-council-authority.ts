export const PRODUCT_DESIGN_COUNCIL_VERSION =
  "tecpey-product-design-council-v1" as const;

export const PRODUCT_DESIGN_COUNCIL_ROLES = [
  "product_director",
  "ux_ui_design_director",
  "ai_mentor_director",
  "growth_content_director",
  "security_privacy_director",
  "compliance_risk_director",
  "engineering_lead",
] as const;

export const PRODUCT_EXPERIENCE_SCORE_DIMENSIONS = [
  "hierarchy",
  "clarity",
  "density",
  "typography",
  "navigation",
  "accessibility",
  "content",
  "trust",
  "platform_fit",
  "craft",
] as const;

export type ProductExperienceScoreDimension =
  (typeof PRODUCT_EXPERIENCE_SCORE_DIMENSIONS)[number];

export const P0_EXPERIENCE_TARGET_SCORE = 9 as const;

export const P0_CORE_JOURNEY = [
  "auth",
  "home",
  "academy",
  "mentor",
  "trading_arena",
  "news_trend",
  "profile_settings",
] as const;

export type ProductSurfaceClass =
  | "core_learning"
  | "supporting_learning"
  | "educational_reference"
  | "restricted_financial";

export const PRODUCT_SURFACE_REGISTRY = {
  home: {
    class: "core_learning",
    routes: ["/", "/en"],
  },
  academy: {
    class: "core_learning",
    routes: ["/academy", "/en/academy"],
  },
  mentor: {
    class: "core_learning",
    routes: [
      "/academy/mentor-coach",
      "/academy/mentor-v2",
      "/academy/ai-guide",
      "/en/academy/mentor-coach",
      "/en/academy/ai-guide",
    ],
  },
  trading_arena: {
    class: "core_learning",
    routes: [
      "/academy/trading-arena",
      "/en/academy/trading-arena",
    ],
  },
  profile_settings: {
    class: "core_learning",
    routes: ["/academy/profile", "/en/academy/profile"],
  },
  educational_news: {
    class: "supporting_learning",
    routes: ["/crypto-news", "/en/crypto-news"],
  },
  markets_reference: {
    class: "educational_reference",
    routes: ["/markets", "/en/markets"],
  },
  coins_reference: {
    class: "educational_reference",
    routes: ["/coins", "/en/coins"],
  },
  comparison_reference: {
    class: "educational_reference",
    routes: [
      "/compare",
      "/compare-exchanges",
      "/en/compare",
      "/en/compare-exchanges",
    ],
  },
  swap: {
    class: "restricted_financial",
    routes: ["/swap", "/en/swap"],
  },
  exchange_auth: {
    class: "restricted_financial",
    routes: ["/signin", "/signup", "/en/signin", "/en/signup"],
  },
} as const satisfies Record<
  string,
  {
    class: ProductSurfaceClass;
    routes: readonly string[];
  }
>;

export const FIRST_RELEASE_NAVIGATION_POLICY = {
  primaryDestinations: [
    "home",
    "academy",
    "mentor",
    "trading_arena",
    "profile_settings",
  ],
  exchangePrimaryNavigationAllowed: false,
  swapPrimaryNavigationAllowed: false,
  exchangePrimaryCtaAllowed: false,
  exchangeStickyMobileCtaAllowed: false,
  educationalMarketReferenceAllowed: true,
  educationalCoinReferenceAllowed: true,
  exchangeComparisonEducationAllowed: true,
} as const;

export const FIRST_RELEASE_HOME_ACTIONS = [
  "start_free_academy",
  "continue_learning",
  "talk_to_mentor",
  "assess_learning_level",
  "practice_in_trading_arena",
] as const;

export const DESIGN_SYSTEM_V2_PRINCIPLES = [
  "content_before_decoration",
  "hierarchy_before_card_count",
  "structured_rows_before_repetitive_cards",
  "compact_but_touch_safe",
  "typographic_precision",
  "semantic_surfaces",
  "restrained_radius",
  "restrained_shadow",
  "restrained_glass",
  "rtl_ltr_isolation",
  "accessible_focus",
  "dynamic_type_resilience",
  "reduced_motion_resilience",
  "ios_safe_area",
  "dark_mode_parity",
  "clear_loading_empty_error_success_states",
] as const;

export type FindingSeverity = "P0" | "P1" | "P2" | "P3";

export type ExperienceFindingStatus =
  | "unreviewed"
  | "finding_open"
  | "remediation"
  | "verified";

export type ExperienceFinding = Readonly<{
  id: string;
  surface: string;
  severity: FindingSeverity;
  owner: (typeof PRODUCT_DESIGN_COUNCIL_ROLES)[number];
  status: ExperienceFindingStatus;
  acceptanceCriteria: readonly string[];
  requiredEvidence: readonly string[];
}>;

export const EXPERIENCE_VERIFICATION_REQUIREMENTS = [
  "implementation",
  "responsive_mobile",
  "rtl_ltr",
  "accessibility",
  "content_quality",
  "interaction_states",
  "automated_regression",
  "staging_evidence",
] as const;

export function mayCloseExperienceFinding(
  finding: ExperienceFinding,
  evidence: readonly string[],
): boolean {
  if (finding.status !== "verified") return false;
  if (finding.acceptanceCriteria.length === 0) return false;

  return EXPERIENCE_VERIFICATION_REQUIREMENTS.every((requirement) =>
    evidence.includes(requirement),
  );
}

export function assertFirstReleaseExperienceBoundary(): void {
  if (FIRST_RELEASE_NAVIGATION_POLICY.exchangePrimaryNavigationAllowed) {
    throw new Error("Exchange leaked into first-release primary navigation");
  }

  if (FIRST_RELEASE_NAVIGATION_POLICY.swapPrimaryNavigationAllowed) {
    throw new Error("Swap leaked into first-release primary navigation");
  }

  if (FIRST_RELEASE_NAVIGATION_POLICY.exchangePrimaryCtaAllowed) {
    throw new Error("Exchange leaked into first-release primary CTA");
  }

  if (FIRST_RELEASE_NAVIGATION_POLICY.exchangeStickyMobileCtaAllowed) {
    throw new Error("Exchange leaked into first-release mobile CTA");
  }

  if (P0_EXPERIENCE_TARGET_SCORE < 9) {
    throw new Error("P0 experience quality target weakened");
  }
}
