import assert from "node:assert/strict";
import test from "node:test";

import {
  activeLocales,
  futureLocales,
  getLocaleDefinition,
  localizePath,
  localeRegistry,
  resolveLocalePath,
  rtlLocales,
  targetLocales,
  tierTwoCandidateLocales,
  type Locale,
} from "@/i18n/config";
import { buildLocalizedAlternates } from "@/i18n/seo";
import {
  GLOBALIZATION_AUTOMATION_POLICY,
  assertGlobalizationAuthority,
  decideLocalizationPublication,
  type LocalizationEvidence,
} from "@/services/product-authority/globalization-authority";
import {
  assessDeterministicLocalizationIntegrity,
  normalizeLocalizedDigits,
} from "@/services/product-authority/localization-integrity";

function passingEvidence(targetLocale: Locale, surface: LocalizationEvidence["surface"] = "news"):
  LocalizationEvidence {
  return {
    surface,
    sourceLocale: "fa",
    targetLocale,
    sourceId: "news:verified-example",
    sourceDigest: "0123456789abcdef0123456789abcdef",
    sourceProvenanceVerified: true,
    translationProvider: "governed-provider",
    translationModel: "locale-native-v1",
    glossaryVersion: "tecpey-global-glossary-v1",
    semanticEvaluatorVersion: "semantic-native-qa-v1",
    numericIntegrity: true,
    entityIntegrity: true,
    urlIntegrity: true,
    placeholderIntegrity: true,
    terminologyIntegrity: true,
    semanticFidelity: true,
    localeNativeFluency: true,
    noAddedFinancialAdvice: true,
    directionalityIntegrity: true,
    metadataLocalized: true,
    schemaInLanguage: true,
    canonicalSelfReference: true,
    reciprocalHreflang: true,
    fallbackLanguageLeakageDetected: false,
    humanReviewApproved: surface === "legal",
  };
}

test("Global Core is ten quality-governed languages, not twelve shallow translations", () => {
  assertGlobalizationAuthority();
  assert.deepEqual(activeLocales, ["fa", "en"]);
  assert.deepEqual(futureLocales, ["es", "pt-BR", "ar", "tr", "id", "hi", "vi", "fr"]);
  assert.equal(targetLocales.length, 10);
  assert.equal(localeRegistry.length, 10);
  assert.deepEqual(rtlLocales, ["fa", "ar"]);
  assert.deepEqual(tierTwoCandidateLocales, ["de", "ja", "ko", "zh-Hans", "ru"]);

  const routeSegments = localeRegistry.map((locale) => locale.routeSegment);
  assert.equal(new Set(routeSegments).size, routeSegments.length);
  const hreflangCodes = localeRegistry.map((locale) => locale.hreflang);
  assert.equal(new Set(hreflangCodes).size, hreflangCodes.length);

  for (const locale of futureLocales) {
    assert.equal(getLocaleDefinition(locale).rolloutStatus, "quality_gated");
  }
});

test("localized routing preserves Persian canonicals and stable prefixed alternates", () => {
  assert.equal(localizePath("fa", "/academy"), "/academy");
  assert.equal(localizePath("en", "/academy"), "/en/academy");
  assert.equal(localizePath("es", "/en/academy"), "/es/academy");
  assert.equal(localizePath("pt-BR", "/faqs"), "/pt-br/faqs");
  assert.equal(localizePath("ar", "/pt-br/crypto-news"), "/ar/crypto-news");

  assert.deepEqual(resolveLocalePath("/pt-br/academy"), {
    locale: "pt-BR",
    path: "/academy",
  });
  assert.deepEqual(resolveLocalePath("/academy"), { locale: "fa", path: "/academy" });
});

test("hreflang generation advertises only variants that actually exist", () => {
  assert.deepEqual(buildLocalizedAlternates("/academy", ["fa", "en", "es", "pt-BR"]), {
    "fa-IR": "https://tecpey.ir/academy",
    en: "https://tecpey.ir/en/academy",
    es: "https://tecpey.ir/es/academy",
    "pt-BR": "https://tecpey.ir/pt-br/academy",
    "x-default": "https://tecpey.ir/academy",
  });
});

test("deterministic localization QA preserves multilingual digits, URLs, placeholders and entities", () => {
  assert.equal(normalizeLocalizedDigits("١٢.٥٪ / ۱۲.۵٪ / १२.५%"), "12.5% / 12.5% / 12.5%");

  const integrity = assessDeterministicLocalizationIntegrity({
    source: "BTC moved 12.5% in 24 hours. Read https://tecpey.ir/coins/bitcoin for {userName}.",
    target:
      "تحرك BTC بنسبة ١٢.٥٪ خلال ٢٤ ساعة. اقرأ https://tecpey.ir/coins/bitcoin للمستخدم {userName}.",
    protectedTerms: ["BTC", "TecPey"],
  });

  // TecPey is intentionally absent from the target and must be caught even though the
  // numeric, URL and interpolation-token floors all pass.
  assert.equal(integrity.numericIntegrity, true);
  assert.equal(integrity.urlIntegrity, true);
  assert.equal(integrity.placeholderIntegrity, true);
  assert.equal(integrity.protectedTermsIntegrity, false);
  assert.deepEqual(integrity.missingProtectedTerms, ["TecPey"]);
});

test("public localization remains fail-closed until quality and locale activation are both proven", () => {
  const english = decideLocalizationPublication(passingEvidence("en"));
  assert.equal(english.draftReady, true);
  assert.equal(english.publicPublishable, true);
  assert.equal(english.indexable, true);
  assert.deepEqual(english.reasons, []);

  const spanish = decideLocalizationPublication(passingEvidence("es"));
  assert.equal(spanish.draftReady, true);
  assert.equal(spanish.publicPublishable, false);
  assert.equal(spanish.indexable, false);
  assert.deepEqual(spanish.reasons, ["locale-quality-gated-not-active"]);

  const unsafe = decideLocalizationPublication({
    ...passingEvidence("en"),
    numericIntegrity: false,
    fallbackLanguageLeakageDetected: true,
  });
  assert.equal(unsafe.publicPublishable, false);
  assert.ok(unsafe.reasons.includes("numeric-integrity-failed"));
  assert.ok(unsafe.reasons.includes("fallback-language-leakage"));

  const legalWithoutReview = decideLocalizationPublication({
    ...passingEvidence("en", "legal"),
    humanReviewApproved: false,
  });
  assert.equal(legalWithoutReview.publicPublishable, false);
  assert.ok(legalWithoutReview.reasons.includes("legal-human-review-required"));

  assert.equal(GLOBALIZATION_AUTOMATION_POLICY.machineTranslationDirectPublish, false);
  assert.equal(GLOBALIZATION_AUTOMATION_POLICY.simultaneousDraftFanOut, true);
  assert.equal(GLOBALIZATION_AUTOMATION_POLICY.independentLocaleQualityGate, true);
});
