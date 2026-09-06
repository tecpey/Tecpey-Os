export const IDENTITY_LINKING_POLICY_VERSION =
  "tecpey-identity-linking-v1" as const;

export type TecpeyProductAccount = "academy" | "exchange";

export const TECPEY_IDENTITY_PLANE = {
  canonicalPrincipalRegistry: "platform_principals",
  oneCanonicalPrincipalPerHumanWithinTenant: true,
  productAccountsRemainDistinct: true,
  sharedIdentityPlane: true,
  sharedBrowserSessionAcrossProducts: false,
  crossRegistrableDomainCookieSharing: false,
  emailPhoneOrKycAutoLinking: false,
  explicitAccountLinkingRequired: true,
  dualSideAuthenticationRequiredForLinking: true,
  explicitConsentRequiredForLinking: true,
  reversibleByUser: true,
  auditable: true,
} as const;

export const KYC_ASSURANCE_SHARING_POLICY = {
  exchangeOwnsKycWorkflow: true,
  coreMayConsumeVerifiedAssurance: true,
  mentorMayConsumeVerifiedAssurance: false,
  rawDocumentsMayEnterCore: false,
  rawDocumentsMayEnterMentor: false,
  rawBiometricEvidenceMayEnterCore: false,
  rawBiometricEvidenceMayEnterMentor: false,
  verifiedClaimsSchemaTarget: "openid_identity_assurance_1_0",
  minimumSharedFields: [
    "status",
    "assurance_level",
    "jurisdiction",
    "verified_at",
    "expires_at",
  ],
} as const;

export const ACCOUNT_LINKING_PROTOCOL = {
  browserPattern: "backend_for_frontend",
  authorizationProfileTarget: "fapi_2_0_security_profile",
  authorizationCodeFlow: true,
  pkceRequired: true,
  pushedAuthorizationRequestsTarget: true,
  exactRedirectUriMatching: true,
  stateRequired: true,
  nonceRequiredWhenOpenIdConnectIsUsed: true,
  stepUpRequired: true,
  shortLivedAuthorizationCode: true,
  singleUseAuthorizationCode: true,
  serverSideTokenStorageOnly: true,
  senderConstrainedAccessTokensTarget: "dpop_or_mtls",
  richAuthorizationDetailsTarget: true,
  tokenExchangeForServiceDelegationTarget: true,
} as const;

export const MENTOR_EXCHANGE_ACCESS_POLICY = {
  defaultState: "disconnected",
  accessMode: "consent_scoped_read_only",
  directOrderExecution: false,
  directOrderCancellation: false,
  withdrawalAuthority: false,
  depositAuthority: false,
  walletSigningAuthority: false,
  custodyKeyAccess: false,
  rawKycDocumentAccess: false,
  exchangeCredentialAccess: false,
  apiKeySecretAccess: false,
  revokeImmediatelyOnConsentWithdrawal: true,
  allowedScopes: [
    "exchange.profile.summary.read",
    "exchange.kyc.status.read",
    "exchange.portfolio.risk_summary.read",
    "exchange.activity.summary.read",
    "exchange.behavior.risk_signals.read",
    "exchange.performance.summary.read",
  ],
  forbiddenScopes: [
    "exchange.orders.write",
    "exchange.orders.cancel",
    "exchange.withdrawals.write",
    "exchange.deposits.write",
    "exchange.wallet.sign",
    "exchange.custody.keys.read",
    "exchange.kyc.documents.read",
    "exchange.credentials.read",
    "exchange.api_keys.secret.read",
  ],
} as const;

export const PRODUCT_SESSION_BOUNDARY = {
  academySessionIssuerAudience: "tecpey-core",
  exchangeSessionIssuerAudience: "tecpey-exchange",
  financialSessionIndependentFromCoreSession: true,
  financialOperationsRequireExchangeAuthorization: true,
  financialOperationsRequireStepUpWhenRiskPolicyDemands: true,
  coreSessionCannotBePresentedToFinancialResourceServer: true,
  mentorDelegationCannotBecomeFinancialExecutionAuthority: true,
} as const;

export const IDENTITY_SECURITY_SIGNAL_POLICY = {
  eventModelTarget: "openid_shared_signals_caep_1_0",
  propagateSessionRevocation: true,
  propagateCredentialChange: true,
  propagateAssuranceLevelChange: true,
  propagateAccountDisabled: true,
  propagateLinkRevoked: true,
  failClosedOnMaterialSecuritySignalDeliveryFailure: true,
} as const;

export function isMentorExchangeScopeAllowed(scope: string): boolean {
  return (MENTOR_EXCHANGE_ACCESS_POLICY.allowedScopes as readonly string[]).includes(
    scope,
  );
}

export function isMentorExchangeScopeForbidden(scope: string): boolean {
  return (
    MENTOR_EXCHANGE_ACCESS_POLICY.forbiddenScopes as readonly string[]
  ).includes(scope);
}

export function assertIdentityLinkingBoundary(): void {
  if (!TECPEY_IDENTITY_PLANE.sharedIdentityPlane) {
    throw new Error("TecPey products must resolve through the identity plane");
  }

  if (
    TECPEY_IDENTITY_PLANE.sharedBrowserSessionAcrossProducts ||
    TECPEY_IDENTITY_PLANE.crossRegistrableDomainCookieSharing ||
    TECPEY_IDENTITY_PLANE.emailPhoneOrKycAutoLinking
  ) {
    throw new Error("Unsafe product-account linking shortcut enabled");
  }

  if (
    !TECPEY_IDENTITY_PLANE.explicitAccountLinkingRequired ||
    !TECPEY_IDENTITY_PLANE.dualSideAuthenticationRequiredForLinking ||
    !TECPEY_IDENTITY_PLANE.explicitConsentRequiredForLinking
  ) {
    throw new Error("Account linking must be explicit, authenticated and consented");
  }

  if (
    !KYC_ASSURANCE_SHARING_POLICY.exchangeOwnsKycWorkflow ||
    KYC_ASSURANCE_SHARING_POLICY.rawDocumentsMayEnterCore ||
    KYC_ASSURANCE_SHARING_POLICY.rawDocumentsMayEnterMentor ||
    KYC_ASSURANCE_SHARING_POLICY.rawBiometricEvidenceMayEnterCore ||
    KYC_ASSURANCE_SHARING_POLICY.rawBiometricEvidenceMayEnterMentor
  ) {
    throw new Error("KYC data-minimization boundary violated");
  }

  if (
    MENTOR_EXCHANGE_ACCESS_POLICY.directOrderExecution ||
    MENTOR_EXCHANGE_ACCESS_POLICY.directOrderCancellation ||
    MENTOR_EXCHANGE_ACCESS_POLICY.withdrawalAuthority ||
    MENTOR_EXCHANGE_ACCESS_POLICY.depositAuthority ||
    MENTOR_EXCHANGE_ACCESS_POLICY.walletSigningAuthority ||
    MENTOR_EXCHANGE_ACCESS_POLICY.custodyKeyAccess ||
    MENTOR_EXCHANGE_ACCESS_POLICY.rawKycDocumentAccess ||
    MENTOR_EXCHANGE_ACCESS_POLICY.exchangeCredentialAccess ||
    MENTOR_EXCHANGE_ACCESS_POLICY.apiKeySecretAccess
  ) {
    throw new Error("Mentor financial authority boundary violated");
  }

  if (
    !PRODUCT_SESSION_BOUNDARY.financialSessionIndependentFromCoreSession ||
    !PRODUCT_SESSION_BOUNDARY.financialOperationsRequireExchangeAuthorization ||
    !PRODUCT_SESSION_BOUNDARY.coreSessionCannotBePresentedToFinancialResourceServer ||
    !PRODUCT_SESSION_BOUNDARY.mentorDelegationCannotBecomeFinancialExecutionAuthority
  ) {
    throw new Error("Financial session isolation boundary violated");
  }
}
