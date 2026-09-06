export const PRODUCT_EXPERIENCE_POLICY_VERSION =
  "tecpey-product-experience-v1" as const;

export type FirstReleaseSurface =
  | "academy"
  | "mentor"
  | "knowledge"
  | "educational_news"
  | "trend_intelligence"
  | "trading_arena"
  | "league"
  | "profile_settings";

export type RestrictedFinancialSurface =
  | "exchange"
  | "custodial_wallet"
  | "real_asset_deposit"
  | "real_asset_withdrawal"
  | "spot_execution"
  | "futures"
  | "leverage";

export const FIRST_RELEASE_POSITIONING = {
  identity: "financial_education_operating_system",
  primaryProduct: "academy",
  primaryDifferentiator: "mentor",
  exchangeIsPrimarySurface: false,
  financialExecutionInPrimaryExperience: false,
} as const;

export const FIRST_RELEASE_SURFACES: readonly FirstReleaseSurface[] = [
  "academy",
  "mentor",
  "knowledge",
  "educational_news",
  "trend_intelligence",
  "trading_arena",
  "league",
  "profile_settings",
] as const;

export const FIRST_RELEASE_PRIMARY_ACTIONS = [
  "start_free_academy",
  "continue_learning_path",
  "talk_to_mentor",
  "assess_learning_level",
  "practice_in_simulator",
] as const;

export const RESTRICTED_FINANCIAL_SURFACES: readonly RestrictedFinancialSurface[] = [
  "exchange",
  "custodial_wallet",
  "real_asset_deposit",
  "real_asset_withdrawal",
  "spot_execution",
  "futures",
  "leverage",
] as const;

export const SAFE_EXCHANGE_BOUNDARY = {
  releaseState: "future_gated",
  discoverability: "recommended_tool_only",
  primaryNavigation: false,
  academyNavigation: false,
  mentorMayExecuteOrders: false,
  mentorMayMoveFunds: false,
  requiresSeparateEligibility: true,
  requiresKycWhenApplicable: true,
  requiresLegalAndRegulatoryGate: true,
  requiresIndependentRiskBoundary: true,
  targetInfrastructureBoundary: "separate_service_domain_or_server",
  commercialModel: "transparent_service_or_trading_fee",
} as const;

export const EDUCATION_PAYMENT_BOUNDARY = {
  purpose: "education_and_academy_services_only",
  mayFundExchangeBalance: false,
  mayFundCustodialWallet: false,
  mayPurchaseCrypto: false,
  mayCreateWithdrawableSimulatorCredit: false,
  mayCreateTradingExposure: false,
} as const;

export const PRODUCT_EXPERIENCE_PRINCIPLES = [
  "education_before_execution",
  "mentor_as_learning_core_not_chatbot",
  "simulation_before_real_financial_exposure",
  "clear_separation_of_learning_and_financial_execution",
  "no_hidden_financial_surface",
  "no_personalized_buy_sell_signal",
  "evidence_before_claim",
  "user_control_before_automation",
] as const;

export function isFirstReleaseSurface(
  value: string,
): value is FirstReleaseSurface {
  return (FIRST_RELEASE_SURFACES as readonly string[]).includes(value);
}

export function isRestrictedFinancialSurface(
  value: string,
): value is RestrictedFinancialSurface {
  return (RESTRICTED_FINANCIAL_SURFACES as readonly string[]).includes(value);
}

export function assertFirstReleaseFinancialBoundary(): void {
  const overlap = RESTRICTED_FINANCIAL_SURFACES.filter((surface) =>
    (FIRST_RELEASE_SURFACES as readonly string[]).includes(surface),
  );

  if (overlap.length > 0) {
    throw new Error(
      `Restricted financial surfaces leaked into first release: ${overlap.join(", ")}`,
    );
  }

  if (
    SAFE_EXCHANGE_BOUNDARY.primaryNavigation ||
    SAFE_EXCHANGE_BOUNDARY.academyNavigation ||
    SAFE_EXCHANGE_BOUNDARY.mentorMayExecuteOrders ||
    SAFE_EXCHANGE_BOUNDARY.mentorMayMoveFunds
  ) {
    throw new Error("Safe Exchange boundary violated");
  }

  if (
    EDUCATION_PAYMENT_BOUNDARY.mayFundExchangeBalance ||
    EDUCATION_PAYMENT_BOUNDARY.mayFundCustodialWallet ||
    EDUCATION_PAYMENT_BOUNDARY.mayPurchaseCrypto ||
    EDUCATION_PAYMENT_BOUNDARY.mayCreateWithdrawableSimulatorCredit ||
    EDUCATION_PAYMENT_BOUNDARY.mayCreateTradingExposure
  ) {
    throw new Error("Education payment boundary violated");
  }
}
