import assert from "node:assert/strict";
import test from "node:test";

import {
  EDUCATION_PAYMENT_BOUNDARY,
  FIRST_RELEASE_POSITIONING,
  FIRST_RELEASE_PRIMARY_ACTIONS,
  FIRST_RELEASE_SURFACES,
  PRODUCT_EXPERIENCE_PRINCIPLES,
  RESTRICTED_FINANCIAL_SURFACES,
  SAFE_EXCHANGE_BOUNDARY,
  assertFirstReleaseFinancialBoundary,
  isFirstReleaseSurface,
  isRestrictedFinancialSurface,
} from "@/lib/product-experience-authority";
import { PRODUCTS } from "@/lib/product-registry";

test("first release is academy-first and mentor-led", () => {
  assert.equal(FIRST_RELEASE_POSITIONING.primaryProduct, "academy");
  assert.equal(FIRST_RELEASE_POSITIONING.primaryDifferentiator, "mentor");
  assert.equal(FIRST_RELEASE_POSITIONING.exchangeIsPrimarySurface, false);
  assert.equal(
    FIRST_RELEASE_POSITIONING.financialExecutionInPrimaryExperience,
    false,
  );

  assert.ok(FIRST_RELEASE_SURFACES.includes("academy"));
  assert.ok(FIRST_RELEASE_SURFACES.includes("mentor"));
  assert.ok(FIRST_RELEASE_SURFACES.includes("trading_arena"));

  assert.ok(FIRST_RELEASE_PRIMARY_ACTIONS.includes("start_free_academy"));
  assert.ok(FIRST_RELEASE_PRIMARY_ACTIONS.includes("talk_to_mentor"));
  assert.ok(FIRST_RELEASE_PRIMARY_ACTIONS.includes("practice_in_simulator"));
});

test("real financial execution cannot leak into first-release surfaces", () => {
  assertFirstReleaseFinancialBoundary();

  for (const surface of RESTRICTED_FINANCIAL_SURFACES) {
    assert.equal(
      isFirstReleaseSurface(surface),
      false,
      `${surface} leaked into the first-release surface registry`,
    );
    assert.equal(isRestrictedFinancialSurface(surface), true);
  }

  assert.equal(isRestrictedFinancialSurface("academy"), false);
  assert.equal(isRestrictedFinancialSurface("mentor"), false);
});

test("safe exchange remains future-gated and outside primary navigation", () => {
  assert.equal(PRODUCTS.exchange.featureFlag, "exchange.enabled");
  assert.equal(SAFE_EXCHANGE_BOUNDARY.releaseState, "future_gated");
  assert.equal(SAFE_EXCHANGE_BOUNDARY.discoverability, "recommended_tool_only");
  assert.equal(SAFE_EXCHANGE_BOUNDARY.primaryNavigation, false);
  assert.equal(SAFE_EXCHANGE_BOUNDARY.academyNavigation, false);
  assert.equal(SAFE_EXCHANGE_BOUNDARY.mentorMayExecuteOrders, false);
  assert.equal(SAFE_EXCHANGE_BOUNDARY.mentorMayMoveFunds, false);
  assert.equal(SAFE_EXCHANGE_BOUNDARY.requiresSeparateEligibility, true);
  assert.equal(SAFE_EXCHANGE_BOUNDARY.requiresLegalAndRegulatoryGate, true);
  assert.equal(SAFE_EXCHANGE_BOUNDARY.requiresIndependentRiskBoundary, true);
});

test("education payments cannot create crypto or trading exposure", () => {
  assert.equal(
    EDUCATION_PAYMENT_BOUNDARY.purpose,
    "education_and_academy_services_only",
  );

  for (const forbidden of [
    EDUCATION_PAYMENT_BOUNDARY.mayFundExchangeBalance,
    EDUCATION_PAYMENT_BOUNDARY.mayFundCustodialWallet,
    EDUCATION_PAYMENT_BOUNDARY.mayPurchaseCrypto,
    EDUCATION_PAYMENT_BOUNDARY.mayCreateWithdrawableSimulatorCredit,
    EDUCATION_PAYMENT_BOUNDARY.mayCreateTradingExposure,
  ]) {
    assert.equal(forbidden, false);
  }
});

test("product principles preserve education, evidence and user-control posture", () => {
  for (const principle of [
    "education_before_execution",
    "mentor_as_learning_core_not_chatbot",
    "simulation_before_real_financial_exposure",
    "clear_separation_of_learning_and_financial_execution",
    "no_hidden_financial_surface",
    "no_personalized_buy_sell_signal",
    "evidence_before_claim",
    "user_control_before_automation",
  ] as const) {
    assert.ok(
      PRODUCT_EXPERIENCE_PRINCIPLES.includes(principle),
      `missing product principle: ${principle}`,
    );
  }
});
