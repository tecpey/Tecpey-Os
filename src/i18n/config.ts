// ── Locale strategy ───────────────────────────────────────────────────────────
//
// activeLocales  — have complete translation files; shown in the UI switcher.
// futureLocales  — defined but not yet translated; never served directly.
// rtlLocales     — require dir="rtl" layout.
//
// To promote a future locale to active:
//   1. Complete its messages file in src/i18n/messages/<code>.json
//   2. Move the code from futureLocales → activeLocales below.
//   3. Add a matching route tree under src/app/<code>/ if needed.

export const activeLocales = ["fa", "en"] as const;
export type ActiveLocale = (typeof activeLocales)[number];

// ISO 639-1 codes. "zh" = Chinese (Mandarin), "tr" = Turkish.
// NOTE: old files used "ch" and "tu" — those are kept on disk but not referenced.
export const futureLocales = ["ar", "tr", "de", "es", "ru", "zh"] as const;
export type FutureLocale = (typeof futureLocales)[number];

// Union of all declared locales (active + future).
export const locales = [...activeLocales, ...futureLocales] as const;
export type Locale = ActiveLocale | FutureLocale;

// RTL locales — determines dir="rtl" and font/layout decisions.
export const rtlLocales = ["fa", "ar"] as const satisfies readonly Locale[];
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
