import { headers } from "next/headers";
import { defaultLocale } from "@/i18n/config";
import { resolveRequestLocale } from "@/i18n/runtime";
import { REQUEST_ROUTE_CONTEXT_HEADER } from "@/lib/request-route-context";

export default async function getRequestConfig() {
  const requestHeaders = await headers();
  const requestPath = requestHeaders.get(REQUEST_ROUTE_CONTEXT_HEADER) ?? "/";
  const runtimeLocale = resolveRequestLocale(requestPath);

  // The canonical URL is the rendering authority. Quality-gated locales are
  // rejected by the root layout; this fallback only keeps next-intl's message
  // bootstrap deterministic until that fail-closed boundary runs.
  const safeLocale =
    runtimeLocale.status === "active" ? runtimeLocale.locale : defaultLocale;

  let messages: Record<string, unknown>;
  try {
    messages = (await import(`./messages/${safeLocale}.json`)).default;
  } catch {
    // Final safety net: a damaged active-locale message bundle must not crash
    // the entire application. Persian remains the controlled fallback bundle.
    messages = (await import(`./messages/${defaultLocale}.json`)).default;
  }

  return { locale: safeLocale, messages };
}
