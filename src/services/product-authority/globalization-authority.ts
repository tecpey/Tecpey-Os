import {
  activeLocales,
  getLocaleDefinition,
  targetLocales,
  type Locale,
} from "@/i18n/config";

export const GLOBALIZATION_POLICY_VERSION = "tecpey-globalization-os-v1" as const;

export const GLOBALIZATION_TARGET_LOCALES = targetLocales;
export const GLOBALIZATION_ACTIVE_LOCALES = activeLocales;

export const GLOBAL_CONTENT_SURFACES = [
  "ui",
  "navigation",
  "academy",
  "mentor",
  "news",
  "markets",
  "coins",
  "tools",
  "notifications",
  "seo",
  "legal",
] as const;
export type GlobalContentSurface = (typeof GLOBAL_CONTENT_SURFACES)[number];

export const GLOBALIZATION_AUTOMATION_POLICY = {
  sourceMustBeVerified: true,
  simultaneousDraftFanOut: true,
  independentLocaleQualityGate: true,
  machineTranslationDirectPublish: false,
  legalAutoPublish: false,
  localeSpecificSeoMetadataRequired: true,
  localeSpecificAeoGeoRequired: true,
  schemaInLanguageRequired: true,
  reciprocalHreflangRequired: true,
  publishSuccessfulLocalesIndependently: true,
  allLocaleBatchCompleteOnlyWhenEveryTargetPasses: true,
  neverAdvertiseUnavailableLocaleInHreflang: true,
} as const;

export const GLOBALIZATION_QUALITY_REQUIREMENTS = [
  "source_provenance",
  "source_digest",
  "numeric_integrity",
  "entity_integrity",
  "url_integrity",
  "placeholder_integrity",
  "terminology_integrity",
  "semantic_fidelity",
  "locale_native_fluency",
  "no_added_financial_advice",
  "directionality_integrity",
  "metadata_localized",
  "schema_in_language",
  "canonical_self_reference",
  "reciprocal_hreflang",
  "no_fallback_language_leakage",
] as const;

export type GlobalizationQualityRequirement =
  (typeof GLOBALIZATION_QUALITY_REQUIREMENTS)[number];

export type LocalizationEvidence = Readonly<{
  surface: GlobalContentSurface;
  sourceLocale: Locale;
  targetLocale: Locale;
  sourceId: string;
  sourceDigest: string;
  sourceProvenanceVerified: boolean;
  translationProvider: string;
  translationModel: string;
  glossaryVersion: string;
  semanticEvaluatorVersion: string;
  numericIntegrity: boolean;
  entityIntegrity: boolean;
  urlIntegrity: boolean;
  placeholderIntegrity: boolean;
  terminologyIntegrity: boolean;
  semanticFidelity: boolean;
  localeNativeFluency: boolean;
  noAddedFinancialAdvice: boolean;
  directionalityIntegrity: boolean;
  metadataLocalized: boolean;
  schemaInLanguage: boolean;
  canonicalSelfReference: boolean;
  reciprocalHreflang: boolean;
  fallbackLanguageLeakageDetected: boolean;
  humanReviewApproved?: boolean;
}>;

export type LocalizationPublicationDecision = Readonly<{
  draftReady: boolean;
  publicPublishable: boolean;
  indexable: boolean;
  reasons: readonly string[];
}>;

function hasOperationalIdentity(evidence: LocalizationEvidence): boolean {
  return (
    evidence.sourceId.trim().length > 0 &&
    evidence.sourceDigest.trim().length >= 16 &&
    evidence.translationProvider.trim().length > 0 &&
    evidence.translationModel.trim().length > 0 &&
    evidence.glossaryVersion.trim().length > 0 &&
    evidence.semanticEvaluatorVersion.trim().length > 0
  );
}

/**
 * Fail-closed publication authority for any localized TecPey artifact.
 *
 * `draftReady` means the artifact may exist in a review queue.
 * `publicPublishable` means it may be exposed publicly.
 * `indexable` is intentionally stricter and is false for quality-gated locales
 * until that locale is explicitly promoted to active after route/content QA.
 */
export function decideLocalizationPublication(
  evidence: LocalizationEvidence,
): LocalizationPublicationDecision {
  const reasons: string[] = [];

  if (evidence.sourceLocale === evidence.targetLocale) {
    reasons.push("source-and-target-locale-must-differ");
  }
  if (!hasOperationalIdentity(evidence)) reasons.push("missing-operational-identity");
  if (!evidence.sourceProvenanceVerified) reasons.push("source-provenance-not-verified");
  if (!evidence.numericIntegrity) reasons.push("numeric-integrity-failed");
  if (!evidence.entityIntegrity) reasons.push("entity-integrity-failed");
  if (!evidence.urlIntegrity) reasons.push("url-integrity-failed");
  if (!evidence.placeholderIntegrity) reasons.push("placeholder-integrity-failed");
  if (!evidence.terminologyIntegrity) reasons.push("terminology-integrity-failed");
  if (!evidence.semanticFidelity) reasons.push("semantic-fidelity-failed");
  if (!evidence.localeNativeFluency) reasons.push("locale-native-fluency-failed");
  if (!evidence.noAddedFinancialAdvice) reasons.push("financial-safety-failed");
  if (!evidence.directionalityIntegrity) reasons.push("directionality-integrity-failed");
  if (!evidence.metadataLocalized) reasons.push("metadata-localization-failed");
  if (!evidence.schemaInLanguage) reasons.push("schema-language-failed");
  if (!evidence.canonicalSelfReference) reasons.push("canonical-self-reference-failed");
  if (!evidence.reciprocalHreflang) reasons.push("reciprocal-hreflang-failed");
  if (evidence.fallbackLanguageLeakageDetected) reasons.push("fallback-language-leakage");

  if (evidence.surface === "legal" && !evidence.humanReviewApproved) {
    reasons.push("legal-human-review-required");
  }

  const draftReady =
    hasOperationalIdentity(evidence) &&
    evidence.sourceProvenanceVerified &&
    evidence.sourceLocale !== evidence.targetLocale;

  const qualityPassed = reasons.length === 0;
  const localeDefinition = getLocaleDefinition(evidence.targetLocale);
  const localeIsActive = localeDefinition.rolloutStatus === "active";

  const publicPublishable = qualityPassed && localeIsActive;
  const indexable = publicPublishable;

  if (qualityPassed && !localeIsActive) {
    reasons.push("locale-quality-gated-not-active");
  }

  return {
    draftReady,
    publicPublishable,
    indexable,
    reasons,
  };
}

export function assertGlobalizationAuthority(): void {
  if (GLOBALIZATION_TARGET_LOCALES.length !== 10) {
    throw new Error("Global Core locale count drifted from the approved ten-language strategy");
  }

  if (!GLOBALIZATION_TARGET_LOCALES.includes("fa") || !GLOBALIZATION_TARGET_LOCALES.includes("en")) {
    throw new Error("Existing Persian and English editions must remain in Global Core");
  }

  if (GLOBALIZATION_AUTOMATION_POLICY.machineTranslationDirectPublish) {
    throw new Error("Machine translation may not publish directly");
  }

  if (!GLOBALIZATION_AUTOMATION_POLICY.independentLocaleQualityGate) {
    throw new Error("Each locale must retain an independent fail-closed quality gate");
  }
}
