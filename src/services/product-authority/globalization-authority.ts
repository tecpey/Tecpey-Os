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

export const GLOBALIZATION_AUTO_PUBLISH_SURFACES = [
  "news",
  "markets",
  "coins",
  "tools",
  "seo",
] as const satisfies readonly GlobalContentSurface[];
export type GlobalAutoPublishSurface = (typeof GLOBALIZATION_AUTO_PUBLISH_SURFACES)[number];

export type LocalizationRiskLevel = "low" | "medium" | "high" | "very_high";

export const GLOBALIZATION_AUTOMATION_POLICY = {
  sourceMustBeVerified: true,
  simultaneousDraftFanOut: true,
  independentLocaleQualityGate: true,
  machineTranslationDirectPublish: false,
  qualityGatedAutomatedPublish: true,
  automatedPublishMinimumConfidence: 0.97,
  automatedPublishMaxRiskLevel: "low" as const,
  independentSemanticEvaluatorRequiredForAutoPublish: true,
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

export type AutomatedLocalizationReleaseEvidence = LocalizationEvidence &
  Readonly<{
    riskLevel: LocalizationRiskLevel;
    automatedQualityConfidence: number;
    independentSemanticEvaluatorPassed: boolean;
  }>;

export type AutomatedLocalizationPublicationDecision = Readonly<{
  autoPublishable: boolean;
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

export function decideAutomatedLocalizationPublication(
  evidence: AutomatedLocalizationReleaseEvidence,
): AutomatedLocalizationPublicationDecision {
  const base = decideLocalizationPublication(evidence);
  const reasons = [...base.reasons];

  if (!base.publicPublishable) reasons.push("base-publication-authority-not-passed");

  if (!(GLOBALIZATION_AUTO_PUBLISH_SURFACES as readonly GlobalContentSurface[]).includes(evidence.surface)) {
    reasons.push("surface-not-eligible-for-automated-publish");
  }

  if (evidence.riskLevel !== GLOBALIZATION_AUTOMATION_POLICY.automatedPublishMaxRiskLevel) {
    reasons.push("automated-publish-risk-too-high");
  }

  if (
    !Number.isFinite(evidence.automatedQualityConfidence) ||
    evidence.automatedQualityConfidence < GLOBALIZATION_AUTOMATION_POLICY.automatedPublishMinimumConfidence ||
    evidence.automatedQualityConfidence > 1
  ) {
    reasons.push("automated-publish-confidence-too-low");
  }

  if (
    GLOBALIZATION_AUTOMATION_POLICY.independentSemanticEvaluatorRequiredForAutoPublish &&
    !evidence.independentSemanticEvaluatorPassed
  ) {
    reasons.push("independent-semantic-evaluator-required");
  }

  if (evidence.surface === "legal") reasons.push("legal-automation-forbidden");

  const uniqueReasons = [...new Set(reasons)];
  const autoPublishable =
    GLOBALIZATION_AUTOMATION_POLICY.qualityGatedAutomatedPublish && uniqueReasons.length === 0;

  return {
    autoPublishable,
    indexable: autoPublishable && base.indexable,
    reasons: uniqueReasons,
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
    throw new Error("Ungated machine translation may not publish directly");
  }

  if (!GLOBALIZATION_AUTOMATION_POLICY.qualityGatedAutomatedPublish) {
    throw new Error("Governed high-confidence automation is required for global content scale");
  }

  if (GLOBALIZATION_AUTOMATION_POLICY.legalAutoPublish) {
    throw new Error("Legal/compliance localization may never auto-publish");
  }

  if (!GLOBALIZATION_AUTOMATION_POLICY.independentLocaleQualityGate) {
    throw new Error("Each locale must retain an independent fail-closed quality gate");
  }
}
