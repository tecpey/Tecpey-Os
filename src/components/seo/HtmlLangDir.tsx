"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isRtlLocale } from "@/i18n/config";

export default function HtmlLangDir() {
  const pathname = usePathname();
  useEffect(() => {
    // Current routing convention: /en[/...] = English (LTR), everything else = Farsi (RTL).
    // When future locales gain dedicated route segments, derive locale from the segment instead.
    const isEnPath = pathname.startsWith("/en");
    const locale = isEnPath ? "en" : "fa";
    document.documentElement.lang = isEnPath ? "en-US" : "fa-IR";
    document.documentElement.dir = isRtlLocale(locale) ? "rtl" : "ltr";
  }, [pathname]);

  return null;
}
