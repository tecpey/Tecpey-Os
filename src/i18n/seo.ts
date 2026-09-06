import { getCanonicalUrl } from "@/lib/seo";
import {
  activeLocales,
  getLocaleDefinition,
  localizePath,
  type Locale,
} from "@/i18n/config";

/** Build the canonical URL for one semantic route in one TecPey locale. */
export function getLocalizedCanonicalUrl(locale: Locale, pathname: string): string {
  return getCanonicalUrl(localizePath(locale, pathname));
}

/**
 * Build a reciprocal hreflang set for the variants that actually exist.
 *
 * Important: callers must pass the same `availableLocales` set on every variant
 * of the page. This keeps return links reciprocal and prevents advertising a
 * locale whose page has not passed localization quality gates yet.
 */
export function buildLocalizedAlternates(
  pathname: string,
  availableLocales: readonly Locale[] = activeLocales,
): Record<string, string> {
  const languages: Record<string, string> = {};

  for (const locale of availableLocales) {
    const definition = getLocaleDefinition(locale);
    languages[definition.hreflang] = getLocalizedCanonicalUrl(locale, pathname);
  }

  languages["x-default"] = getLocalizedCanonicalUrl("fa", pathname);
  return languages;
}

/** Values used by html, JSON-LD and OpenGraph without duplicating locale rules. */
export function getLocaleSeoIdentity(locale: Locale) {
  const definition = getLocaleDefinition(locale);
  return {
    htmlLang: definition.htmlLang,
    hreflang: definition.hreflang,
    ogLocale: definition.ogLocale,
    direction: definition.direction,
  } as const;
}
