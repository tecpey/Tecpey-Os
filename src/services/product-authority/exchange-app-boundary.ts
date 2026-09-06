export const EXCHANGE_APP_BOUNDARY_POLICY_VERSION =
  "tecpey-exchange-app-boundary-v2" as const;

export const TECPEY_EXCHANGE_ORIGIN_ENV = "TECPEY_EXCHANGE_ORIGIN" as const;

export type ExchangeAffiliation = "independent" | "tecpey";

export type ExchangeOriginRejectionReason =
  | "missing_origin"
  | "invalid_url"
  | "https_required"
  | "credentials_forbidden"
  | "origin_only_required"
  | "core_domain_forbidden"
  | "legacy_origin_forbidden";

export type ExchangeOriginResolution =
  | { ok: true; origin: string }
  | { ok: false; reason: ExchangeOriginRejectionReason };

export const EXCHANGE_DISCOVERY_POLICY = {
  corePlacement: "tools_and_exchange_discovery_only",
  primaryNavigation: false,
  academyNavigation: false,
  directExecutionInsideCore: false,
  sharedIdentityPlaneWithCore: true,
  consentBasedAccountLinking: true,
  sharedKycAssuranceWithCore: true,
  sharedKycDocumentStoreWithCore: false,
  mentorReadOnlySignalsViaConsent: true,
  sharedFinancialSessionWithCore: false,
  sharedExecutionAuthWithCore: false,
  sharedCustodySurfaceWithCore: false,
  separateRegistrableDomainRequired: true,
  separateProductSessionRequired: true,
  leavingCoreDisclosureRequired: true,
  affiliationDisclosureRequired: true,
  affiliationAffectsRanking: false,
  securityClaims: "evidence_only",
  missingOrInvalidOriginBehavior: "hide_execution_link",
} as const;

export const EXCHANGE_PROVIDER_ASSESSMENT_DIMENSIONS = [
  "regulatory_transparency",
  "custody_and_security_evidence",
  "proof_or_attestation",
  "liquidity",
  "fees",
  "jurisdiction_and_user_support",
  "incident_history",
  "market_and_feature_availability",
] as const;

export const TECPEY_EXCHANGE_PROVIDER = {
  affiliation: "tecpey" as ExchangeAffiliation,
  disclosureRequired: true,
  rankingBoostFromAffiliation: false,
  executionSurface: "external_app",
  identityRelationship: "shared_identity_distinct_product_account",
  originEnv: TECPEY_EXCHANGE_ORIGIN_ENV,
} as const;

export const LEGACY_EXCHANGE_ORIGINS = ["https://my.tecpey.ir"] as const;

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
}

function hostnameBelongsToDomain(hostname: string, domain: string): boolean {
  const normalizedHostname = normalizeDomain(hostname);
  const normalizedDomain = normalizeDomain(domain);

  return (
    normalizedHostname === normalizedDomain ||
    normalizedHostname.endsWith(`.${normalizedDomain}`)
  );
}

export function resolveTecpeyExchangeOrigin(
  rawOrigin: string | undefined | null,
  options: {
    coreRegistrableDomains: readonly string[];
    forbiddenOrigins?: readonly string[];
  },
): ExchangeOriginResolution {
  const value = rawOrigin?.trim();
  if (!value) {
    return { ok: false, reason: "missing_origin" };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "https_required" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "credentials_forbidden" };
  }

  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    return { ok: false, reason: "origin_only_required" };
  }

  if (
    options.coreRegistrableDomains.some((domain) =>
      hostnameBelongsToDomain(parsed.hostname, domain),
    )
  ) {
    return { ok: false, reason: "core_domain_forbidden" };
  }

  const forbiddenOrigins = options.forbiddenOrigins ?? LEGACY_EXCHANGE_ORIGINS;
  if (
    forbiddenOrigins.some((origin) => {
      try {
        return new URL(origin).origin === parsed.origin;
      } catch {
        return false;
      }
    })
  ) {
    return { ok: false, reason: "legacy_origin_forbidden" };
  }

  return { ok: true, origin: parsed.origin };
}

export function assertExchangeAppBoundary(): void {
  if (
    EXCHANGE_DISCOVERY_POLICY.primaryNavigation ||
    EXCHANGE_DISCOVERY_POLICY.academyNavigation ||
    EXCHANGE_DISCOVERY_POLICY.directExecutionInsideCore ||
    EXCHANGE_DISCOVERY_POLICY.sharedFinancialSessionWithCore ||
    EXCHANGE_DISCOVERY_POLICY.sharedExecutionAuthWithCore ||
    EXCHANGE_DISCOVERY_POLICY.sharedKycDocumentStoreWithCore ||
    EXCHANGE_DISCOVERY_POLICY.sharedCustodySurfaceWithCore
  ) {
    throw new Error("Exchange execution or sensitive authority leaked into TecPey Core");
  }

  if (
    !EXCHANGE_DISCOVERY_POLICY.sharedIdentityPlaneWithCore ||
    !EXCHANGE_DISCOVERY_POLICY.consentBasedAccountLinking ||
    !EXCHANGE_DISCOVERY_POLICY.sharedKycAssuranceWithCore ||
    !EXCHANGE_DISCOVERY_POLICY.mentorReadOnlySignalsViaConsent
  ) {
    throw new Error("TecPey identity, consent or Mentor linkage boundary missing");
  }

  if (
    !EXCHANGE_DISCOVERY_POLICY.separateRegistrableDomainRequired ||
    !EXCHANGE_DISCOVERY_POLICY.separateProductSessionRequired
  ) {
    throw new Error("TecPey Exchange must keep a separate domain and product session");
  }

  if (
    !EXCHANGE_DISCOVERY_POLICY.affiliationDisclosureRequired ||
    EXCHANGE_DISCOVERY_POLICY.affiliationAffectsRanking ||
    TECPEY_EXCHANGE_PROVIDER.rankingBoostFromAffiliation
  ) {
    throw new Error("Exchange discovery neutrality or affiliation disclosure violated");
  }

  if (EXCHANGE_DISCOVERY_POLICY.securityClaims !== "evidence_only") {
    throw new Error("Exchange security claims must remain evidence-based");
  }
}
