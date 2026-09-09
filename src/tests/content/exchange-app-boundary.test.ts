import assert from "node:assert/strict";
import test from "node:test";

import {
  EXCHANGE_DISCOVERY_POLICY,
  EXCHANGE_PROVIDER_ASSESSMENT_DIMENSIONS,
  LEGACY_EXCHANGE_ORIGINS,
  TECPEY_EXCHANGE_ORIGIN_ENV,
  TECPEY_EXCHANGE_PROVIDER,
  assertExchangeAppBoundary,
  resolveTecpeyExchangeOrigin,
} from "@/services/product-authority/exchange-app-boundary";
import { SAFE_EXCHANGE_BOUNDARY } from "@/services/product-authority/product-experience-authority";

const CORE_DOMAINS = ["tecpey.com", "tecpey.ir", "tecp.ir"] as const;

function resolve(origin: string | undefined) {
  return resolveTecpeyExchangeOrigin(origin, {
    coreRegistrableDomains: CORE_DOMAINS,
  });
}

test("TecPey Exchange is a distinct product surface on the shared identity plane", () => {
  assertExchangeAppBoundary();

  assert.equal(EXCHANGE_DISCOVERY_POLICY.primaryNavigation, false);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.academyNavigation, false);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.directExecutionInsideCore, false);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.sharedIdentityPlaneWithCore, true);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.consentBasedAccountLinking, true);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.sharedKycAssuranceWithCore, true);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.sharedKycDocumentStoreWithCore, false);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.mentorReadOnlySignalsViaConsent, true);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.sharedFinancialSessionWithCore, false);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.sharedExecutionAuthWithCore, false);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.sharedCustodySurfaceWithCore, false);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.separateRegistrableDomainRequired, true);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.separateProductSessionRequired, true);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.leavingCoreDisclosureRequired, true);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.affiliationDisclosureRequired, true);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.securityClaims, "evidence_only");
  assert.equal(
    SAFE_EXCHANGE_BOUNDARY.targetInfrastructureBoundary,
    "separate_registrable_domain_and_service",
  );
});

test("TecPey affiliation is disclosed and cannot improve provider ranking", () => {
  assert.equal(TECPEY_EXCHANGE_PROVIDER.affiliation, "tecpey");
  assert.equal(TECPEY_EXCHANGE_PROVIDER.disclosureRequired, true);
  assert.equal(TECPEY_EXCHANGE_PROVIDER.rankingBoostFromAffiliation, false);
  assert.equal(EXCHANGE_DISCOVERY_POLICY.affiliationAffectsRanking, false);
  assert.equal(
    TECPEY_EXCHANGE_PROVIDER.identityRelationship,
    "shared_identity_distinct_product_account",
  );
  assert.equal(TECPEY_EXCHANGE_PROVIDER.originEnv, TECPEY_EXCHANGE_ORIGIN_ENV);

  for (const dimension of [
    "regulatory_transparency",
    "custody_and_security_evidence",
    "proof_or_attestation",
    "liquidity",
    "fees",
    "jurisdiction_and_user_support",
    "incident_history",
    "market_and_feature_availability",
  ] as const) {
    assert.ok(EXCHANGE_PROVIDER_ASSESSMENT_DIMENSIONS.includes(dimension));
  }
});

test("exchange origin fails closed when missing, insecure, malformed or not origin-only", () => {
  assert.deepEqual(resolve(undefined), { ok: false, reason: "missing_origin" });
  assert.deepEqual(resolve("not-a-url"), { ok: false, reason: "invalid_url" });
  assert.deepEqual(resolve("http://exchange-example.com"), {
    ok: false,
    reason: "https_required",
  });
  assert.deepEqual(resolve("https://user:pass@exchange-example.com"), {
    ok: false,
    reason: "credentials_forbidden",
  });
  assert.deepEqual(resolve("https://exchange-example.com/trade"), {
    ok: false,
    reason: "origin_only_required",
  });
});

test("exchange origin rejects every TecPey Core domain and subdomain", () => {
  for (const origin of [
    "https://tecpey.com",
    "https://trade.tecpey.com",
    "https://tecpey.ir",
    "https://exchange.tecpey.ir",
    "https://tecp.ir",
    "https://exchange.tecp.ir",
  ]) {
    assert.deepEqual(resolve(origin), {
      ok: false,
      reason: "core_domain_forbidden",
    });
  }
});

test("legacy exchange subdomain is explicitly forbidden even outside a future Core-domain set", () => {
  assert.ok(LEGACY_EXCHANGE_ORIGINS.includes("https://my.tecpey.ir"));

  const result = resolveTecpeyExchangeOrigin("https://my.tecpey.ir", {
    coreRegistrableDomains: ["tecpey.com"],
  });

  assert.deepEqual(result, { ok: false, reason: "legacy_origin_forbidden" });
});

test("a separate HTTPS registrable domain is eligible without inventing the production domain", () => {
  assert.deepEqual(resolve("https://exchange-example.com"), {
    ok: true,
    origin: "https://exchange-example.com",
  });

  assert.equal(
    EXCHANGE_DISCOVERY_POLICY.missingOrInvalidOriginBehavior,
    "hide_execution_link",
  );
});
