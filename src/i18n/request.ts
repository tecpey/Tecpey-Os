import { getUserLocale } from "@/lib/locale";
import { defaultLocale, isActiveLocale } from "@/i18n/config";

export default async function getRequestConfig() {
  const locale = await getUserLocale();

  // Guard: only ever load a fully-translated active locale.
  const safeLocale = isActiveLocale(locale) ? locale : defaultLocale;

  let messages: Record<string, unknown>;
  try {
    messages = (await import(`./messages/${safeLocale}.json`)).default;
  } catch {
    // Final safety net: if the message file is missing or corrupt, fall back to fa.
    // This prevents a broken locale file from crashing the whole app.
    messages = (await import(`./messages/fa.json`)).default;
  }

  return { locale: safeLocale, messages };
}
