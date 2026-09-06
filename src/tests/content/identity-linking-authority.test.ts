import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_LINKING_PROTOCOL,
  IDENTITY_SECURITY_SIGNAL_POLICY,
  KYC_ASSURANCE_SHARING_POLICY,
  MENTOR_EXCHANGE_ACCESS_POLICY,
  PRODUCT_SESSION_BOUNDARY,
  TECPEY_IDENTITY_PLANE,
  assertIdentityLinkingBoundary,
  isMentorExchangeScopeAllowed,
  isMentorExchangeScopeForbidden,
} from "@/services/product-authority/identity-linking-authority";

test("TecPey uses one canonical identity with distinct product accounts", () => {
  assertIdentityLinkingBoundary();

  assert.equal(TECPEY_IDENTITY_PLANE.canonicalPrincipalRegistry, "platform_principals");
  assert.equal(TECPEY_IDENTITY_PLANE.sharedIdentityPlane, true);
  assert.equal(TECPEY_IDENTITY_PLANE.productAccountsRemainDistinct, true);
  assert.equal(TECPEY_IDENTITY_PLANE.sharedBrowserSessionAcrossProducts, false);
  assert.equal(TECPEY_IDENTITY_PLANE.crossRegistrableDomainCookieSharing, false);
  assert.equal(TECPEY_IDENTITY_PLANE.emailPhoneOrKycAutoLinking, false);
  assert.equal(TECPEY_IDENTITY_PLANE.explicitAccountLinkingRequired, true);
  assert.equal(TECPEY_IDENTITY_PLANE.dualSideAuthenticationRequiredForLinking, true);
  assert.equal(TECPEY_IDENTITY_PLANE.explicitConsentRequiredForLinking, true);
});

test("KYC sharing is assurance-only and raw evidence stays outside Core and Mentor", () => {
  assert.equal(KYC_ASSURANCE_SHARING_POLICY.exchangeOwnsKycWorkflow, true);
  assert.equal(KYC_ASSURANCE_SHARING_POLICY.coreMayConsumeVerifiedAssurance, true);
  assert.equal(KYC_ASSURANCE_SHARING_POLICY.mentorMayConsumeVerifiedAssurance, false);
  assert.equal(KYC_ASSURANCE_SHARING_POLICY.rawDocumentsMayEnterCore, false);
  assert.equal(KYC_ASSURANCE_SHARING_POLICY.rawDocumentsMayEnterMentor, false);
  assert.equal(KYC_ASSURANCE_SHARING_POLICY.rawBiometricEvidenceMayEnterCore, false);
  assert.equal(KYC_ASSURANCE_SHARING_POLICY.rawBiometricEvidenceMayEnterMentor, false);
  assert.equal(
    KYC_ASSURANCE_SHARING_POLICY.verifiedClaimsSchemaTarget,
    "openid_identity_assurance_1_0",
  );
});

test("account linking targets financial-grade OAuth with server-side token handling", () => {
  assert.equal(ACCOUNT_LINKING_PROTOCOL.browserPattern, "backend_for_frontend");
  assert.equal(
    ACCOUNT_LINKING_PROTOCOL.authorizationProfileTarget,
    "fapi_2_0_security_profile",
  );
  assert.equal(ACCOUNT_LINKING_PROTOCOL.authorizationCodeFlow, true);
  assert.equal(ACCOUNT_LINKING_PROTOCOL.pkceRequired, true);
  assert.equal(ACCOUNT_LINKING_PROTOCOL.pushedAuthorizationRequestsTarget, true);
  assert.equal(ACCOUNT_LINKING_PROTOCOL.exactRedirectUriMatching, true);
  assert.equal(ACCOUNT_LINKING_PROTOCOL.stepUpRequired, true);
  assert.equal(ACCOUNT_LINKING_PROTOCOL.serverSideTokenStorageOnly, true);
  assert.equal(
    ACCOUNT_LINKING_PROTOCOL.senderConstrainedAccessTokensTarget,
    "dpop_or_mtls",
  );
});

test("Mentor receives only consented read-only intelligence scopes", () => {
  for (const scope of MENTOR_EXCHANGE_ACCESS_POLICY.allowedScopes) {
    assert.equal(isMentorExchangeScopeAllowed(scope), true);
    assert.equal(isMentorExchangeScopeForbidden(scope), false);
  }

  for (const scope of MENTOR_EXCHANGE_ACCESS_POLICY.forbiddenScopes) {
    assert.equal(isMentorExchangeScopeForbidden(scope), true);
    assert.equal(isMentorExchangeScopeAllowed(scope), false);
  }

  assert.equal(MENTOR_EXCHANGE_ACCESS_POLICY.directOrderExecution, false);
  assert.equal(MENTOR_EXCHANGE_ACCESS_POLICY.directOrderCancellation, false);
  assert.equal(MENTOR_EXCHANGE_ACCESS_POLICY.withdrawalAuthority, false);
  assert.equal(MENTOR_EXCHANGE_ACCESS_POLICY.walletSigningAuthority, false);
  assert.equal(MENTOR_EXCHANGE_ACCESS_POLICY.custodyKeyAccess, false);
  assert.equal(MENTOR_EXCHANGE_ACCESS_POLICY.rawKycDocumentAccess, false);
});

test("financial sessions remain isolated from Core and Mentor delegation", () => {
  assert.equal(PRODUCT_SESSION_BOUNDARY.financialSessionIndependentFromCoreSession, true);
  assert.equal(PRODUCT_SESSION_BOUNDARY.financialOperationsRequireExchangeAuthorization, true);
  assert.equal(PRODUCT_SESSION_BOUNDARY.coreSessionCannotBePresentedToFinancialResourceServer, true);
  assert.equal(PRODUCT_SESSION_BOUNDARY.mentorDelegationCannotBecomeFinancialExecutionAuthority, true);
});

test("security state changes are designed for continuous cross-product attenuation", () => {
  assert.equal(
    IDENTITY_SECURITY_SIGNAL_POLICY.eventModelTarget,
    "openid_shared_signals_caep_1_0",
  );
  assert.equal(IDENTITY_SECURITY_SIGNAL_POLICY.propagateSessionRevocation, true);
  assert.equal(IDENTITY_SECURITY_SIGNAL_POLICY.propagateCredentialChange, true);
  assert.equal(IDENTITY_SECURITY_SIGNAL_POLICY.propagateAssuranceLevelChange, true);
  assert.equal(IDENTITY_SECURITY_SIGNAL_POLICY.propagateAccountDisabled, true);
  assert.equal(IDENTITY_SECURITY_SIGNAL_POLICY.propagateLinkRevoked, true);
});
