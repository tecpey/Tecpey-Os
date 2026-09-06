import {
  getLocaleDefinition,
  isActiveLocale,
  resolveLocalePath,
  type ActiveLocale,
  type Locale,
} from "@/i18n/config";

export type ActiveRuntimeLocale = Readonly<{
  status: "active";
  locale: ActiveLocale;
  semanticPath: string;
  htmlLang: string;
  direction: "ltr" | "rtl";
  routeSegment: string;
}>;

export type QualityGatedRuntimeLocale = Readonly<{
  status: "quality_gated";
  locale: Exclude<Locale, ActiveLocale>;
  semanticPath: string;
  htmlLang: string;
  direction: "ltr" | "rtl";
  routeSegment: string;
}>;

export type RuntimeLocaleResolution =
  | ActiveRuntimeLocale
  | QualityGatedRuntimeLocale;

/**
 * Resolve the request locale from TecPey's canonical route model.
 *
 * Persian remains the unprefixed default. A recognized future locale is returned
 * as `quality_gated` rather than silently falling back to Persian; server layouts
 * must fail closed for that state until the locale is explicitly activated.
 */
export function resolveRequestLocale(pathname: string): RuntimeLocaleResolution {
  const { locale, path: semanticPath } = resolveLocalePath(pathname);
  const definition = getLocaleDefinition(locale);
  const shared = {
    semanticPath,
    htmlLang: definition.htmlLang,
    direction: definition.direction,
    routeSegment: definition.routeSegment,
  } as const;

  if (isActiveLocale(locale)) {
    return {
      status: "active",
      locale,
      ...shared,
    };
  }

  return {
    status: "quality_gated",
    locale: locale as Exclude<Locale, ActiveLocale>,
    ...shared,
  };
}
