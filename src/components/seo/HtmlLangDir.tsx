"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getLocaleDefinition, getLocaleFromPathname } from "@/i18n/config";

export default function HtmlLangDir() {
  const pathname = usePathname();

  useEffect(() => {
    const locale = getLocaleFromPathname(pathname);
    const definition = getLocaleDefinition(locale);
    document.documentElement.lang = definition.htmlLang;
    document.documentElement.dir = definition.direction;
  }, [pathname]);

  return null;
}
