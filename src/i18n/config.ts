// ── TecPey globalization locale authority ──────────────────────────────────────
//
// Runtime rule:
// - `activeLocales` are production-safe and may be served/indexed.
// - `futureLocales` are Global Core locales under quality-gated localization.
// - No future locale is promoted merely because a message file exists.
//
// URL rule:
// - Persian keeps the historic unprefixed canonical paths (`/academy`).
// - Every other locale uses a stable lowercase prefix (`/en/academy`, `/pt-br/academy`).
// - Route prefixes and BCP-47/OG locale tags are intentionally decoupled.

export type Locale =
  | "fa"
  | "en"
  | "es"
  | "pt-BR"
  | "ar"
  | "tr"
  | "id"
  | "hi"
  | "vi"
  | "fr";

export const activeLocales = ["fa", "en"] as const satisfies readonly Locale[];
export type ActiveLocale = (typeof activeLocales)[number];

export const futureLocales = [
  "es",
  "pt-BR",
  "ar",
  "tr",
  "id",
  "hi",
  "vi",
  "fr",
] as const satisfies readonly Locale[];
export type FutureLocale = (typeof futureLocales)[number];

/** Global Core = ten total languages, including the existing Persian and English editions. */
export const locales = [...activeLocales, ...futureLocales] as const;
export const targetLocales = locales;

/**
 * Tier 2 is deliberately not activated until search demand, retention and content-quality
 * telemetry justify the operational cost. The runtime does not recognize these as Locale.
 */
export const tierTwoCandidateLocales = ["de", "ja", "ko", "zh-Hans", "ru"] as const;

export type LocaleRolloutStatus = "active" | "quality_gated";
export type LocaleDirection = "ltr" | "rtl";

export type LocaleDefinition = Readonly<{
  code: Locale;
  routeSegment: string;
  htmlLang: string;
  hreflang: string;
  ogLocale: string;
  direction: LocaleDirection;
  nativeName: string;
  englishName: string;
  rolloutStatus: LocaleRolloutStatus;
  primaryMarkets: readonly string[];
  contentStyle: string;
}>;

export const localeRegistry = [
  {
    code: "fa",
    routeSegment: "",
    htmlLang: "fa-IR",
    hreflang: "fa-IR",
    ogLocale: "fa_IR",
    direction: "rtl",
    nativeName: "فارسی",
    englishName: "Persian",
    rolloutStatus: "active",
    primaryMarkets: ["Iran", "Persian-speaking diaspora"],
    contentStyle: "native Iranian Persian; clear, professional, education-first",
  },
  {
    code: "en",
    routeSegment: "en",
    htmlLang: "en-US",
    hreflang: "en",
    ogLocale: "en_US",
    direction: "ltr",
    nativeName: "English",
    englishName: "English",
    rolloutStatus: "active",
    primaryMarkets: ["Global"],
    contentStyle: "neutral international English; concise and evidence-led",
  },
  {
    code: "es",
    routeSegment: "es",
    htmlLang: "es",
    hreflang: "es",
    ogLocale: "es_ES",
    direction: "ltr",
    nativeName: "Español",
    englishName: "Spanish",
    rolloutStatus: "quality_gated",
    primaryMarkets: ["Latin America", "Spain", "US Spanish-speaking audience"],
    contentStyle: "neutral international Spanish; avoid country-specific slang",
  },
  {
    code: "pt-BR",
    routeSegment: "pt-br",
    htmlLang: "pt-BR",
    hreflang: "pt-BR",
    ogLocale: "pt_BR",
    direction: "ltr",
    nativeName: "Português (Brasil)",
    englishName: "Brazilian Portuguese",
    rolloutStatus: "quality_gated",
    primaryMarkets: ["Brazil"],
    contentStyle: "native Brazilian Portuguese; modern financial-education vocabulary",
  },
  {
    code: "ar",
    routeSegment: "ar",
    htmlLang: "ar",
    hreflang: "ar",
    ogLocale: "ar_SA",
    direction: "rtl",
    nativeName: "العربية",
    englishName: "Arabic",
    rolloutStatus: "quality_gated",
    primaryMarkets: ["MENA", "Arabic-speaking diaspora"],
    contentStyle: "Modern Standard Arabic; natural fintech terminology; RTL-safe",
  },
  {
    code: "tr",
    routeSegment: "tr",
    htmlLang: "tr",
    hreflang: "tr",
    ogLocale: "tr_TR",
    direction: "ltr",
    nativeName: "Türkçe",
    englishName: "Turkish",
    rolloutStatus: "quality_gated",
    primaryMarkets: ["Türkiye", "Turkish-speaking diaspora"],
    contentStyle: "native Turkish; direct, educational and non-promotional",
  },
  {
    code: "id",
    routeSegment: "id",
    htmlLang: "id",
    hreflang: "id",
    ogLocale: "id_ID",
    direction: "ltr",
    nativeName: "Bahasa Indonesia",
    englishName: "Indonesian",
    rolloutStatus: "quality_gated",
    primaryMarkets: ["Indonesia"],
    contentStyle: "native Bahasa Indonesia; accessible educational register",
  },
  {
    code: "hi",
    routeSegment: "hi",
    htmlLang: "hi",
    hreflang: "hi",
    ogLocale: "hi_IN",
    direction: "ltr",
    nativeName: "हिन्दी",
    englishName: "Hindi",
    rolloutStatus: "quality_gated",
    primaryMarkets: ["India", "Hindi-speaking diaspora"],
    contentStyle: "natural modern Hindi; retain accepted fintech terms where native usage prefers them",
  },
  {
    code: "vi",
    routeSegment: "vi",
    htmlLang: "vi",
    hreflang: "vi",
    ogLocale: "vi_VN",
    direction: "ltr",
    nativeName: "Tiếng Việt",
    englishName: "Vietnamese",
    rolloutStatus: "quality_gated",
    primaryMarkets: ["Vietnam", "Vietnamese-speaking diaspora"],
    contentStyle: "native Vietnamese; precise, plain-language financial education",
  },
  {
    code: "fr",
    routeSegment: "fr",
    htmlLang: "fr",
    hreflang: "fr",
    ogLocale: "fr_FR",
    direction: "ltr",
    nativeName: "Français",
    englishName: "French",
    rolloutStatus: "quality_gated",
    primaryMarkets: ["France", "Francophone Africa", "Canada", "Belgium", "Switzerland"],
    contentStyle: "neutral international French; professional and education-first",
  },
] as const satisfies readonly LocaleDefinition[];

const localeRegistryByCode = new Map<Locale, LocaleDefinition>(
  localeRegistry.map((definition) => [definition.code, definition] as const),
);

const localeRegistryByRoute = new Map(
  localeRegistry
    .filter((definition) => definition.routeSegment.length > 0)
    .map((definition) => [definition.routeSegment.toLowerCase(), definition] as const),
);

export const rtlLocales = localeRegistry
  .filter((definition) => definition.direction === "rtl")
  .map((definition) => definition.code) as readonly ("fa" | "ar")[];
export type RtlLocale = (typeof rtlLocales)[number];

export const defaultLocale: ActiveLocale = "fa";

export function isActiveLocale(value: unknown): value is ActiveLocale {
  return (activeLocales as readonly string[]).includes(value as string);
}

export function isLocale(value: unknown): value is Locale {
  return (locales as readonly string[]).includes(value as string);
}

export function isRtlLocale(value: unknown): value is RtlLocale {
  return (rtlLocales as readonly string[]).includes(value as string);
}

export function getLocaleDefinition(locale: Locale): LocaleDefinition {
  const definition = localeRegistryByCode.get(locale);
  if (!definition) {
    throw new Error(`Unknown TecPey locale: ${locale}`);
  }
  return definition;
}

export function getLocaleByRouteSegment(segment: string): Locale | null {
  return localeRegistryByRoute.get(segment.toLowerCase())?.code ?? null;
}

function normalizePath(pathname: string): string {
  const value = pathname.trim() || "/";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) return collapsed.slice(0, -1);
  return collapsed;
}

/** Resolve locale from URL while preserving Persian's historic unprefixed routes. */
export function resolveLocalePath(pathname: string): Readonly<{ locale: Locale; path: string }> {
  const normalized = normalizePath(pathname);
  const [firstSegment = ""] = normalized.slice(1).split("/");
  const matchedLocale = getLocaleByRouteSegment(firstSegment);

  if (!matchedLocale) return { locale: defaultLocale, path: normalized };

  const prefix = `/${getLocaleDefinition(matchedLocale).routeSegment}`;
  const path = normalized === prefix ? "/" : normalized.slice(prefix.length) || "/";
  return { locale: matchedLocale, path: normalizePath(path) };
}

/** Convert any supported localized URL to the same semantic route in another locale. */
export function localizePath(locale: Locale, pathname: string): string {
  const { path } = resolveLocalePath(pathname);
  const definition = getLocaleDefinition(locale);
  if (!definition.routeSegment) return path;
  return path === "/" ? `/${definition.routeSegment}` : `/${definition.routeSegment}${path}`;
}

export function getLocaleFromPathname(pathname: string): Locale {
  return resolveLocalePath(pathname).locale;
}
