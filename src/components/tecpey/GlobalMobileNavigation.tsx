"use client";

import { usePathname } from "next/navigation";
import { GraduationCap, Home, TrendingUp, Trophy, UserRound } from "lucide-react";
import { LivingMobileNavigation } from "./LivingMobileNavigation";
import { getLocaleFromPathname, localizePath, resolveLocalePath } from "@/i18n/config";

export function GlobalMobileNavigation() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const { path } = resolveLocalePath(pathname);
  if (path === "/command-center" || path.startsWith("/command-center/")) return null;
  const isFa = locale === "fa";
  const href = (value: string) => localizePath(locale, value);
  const items = [
    { label: isFa ? "آکادمی" : "Academy", href: href("/academy"), match: [href("/academy")], Icon: GraduationCap },
    { label: isFa ? "آرنا" : "Arena", href: href("/academy/trading-arena"), match: [href("/academy/trading-arena"), href("/academy/simulator")], Icon: Trophy },
    { label: isFa ? "خانه" : "Home", href: href("/"), match: [href("/")], exact: true, Icon: Home },
    { label: isFa ? "بازار" : "Market", href: href("/markets"), match: ["/markets", "/coins", "/crypto-news", "/trading-tools"].map(href), Icon: TrendingUp },
    { label: isFa ? "حساب" : "Account", href: href("/academy/account"), match: ["/academy/account", "/academy/profile", "/academy/onboarding", "/academy/notifications", "/academy/certificates", "/academy/achievements", "/academy/login", "/academy/signup"].map(href), Icon: UserRound },
  ];
  return <>
    <div aria-hidden="true" className="h-[calc(env(safe-area-inset-bottom)+var(--tp-mobile-shell-clearance,9.5rem))] lg:hidden" />
    <LivingMobileNavigation ariaLabel={isFa ? "ناوبری اصلی تک‌پی" : "TecPey primary navigation"} dir={isFa ? "rtl" : "ltr"} items={items} />
  </>;
}
