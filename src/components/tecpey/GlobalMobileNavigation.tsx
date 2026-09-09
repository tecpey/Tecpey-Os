"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { GraduationCap, Home, TrendingUp, Trophy, UserRound } from "lucide-react";
import { LivingMobileNavigation } from "./LivingMobileNavigation";
import { getLocaleFromPathname, localizePath, resolveLocalePath } from "@/i18n/config";
import { resolveAcademyProfileReadState } from "@/lib/academy-profile-read-state";

type ProfileSummary = { display_name?: string | null };

export function GlobalMobileNavigation() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const { path } = resolveLocalePath(pathname);
  const [hasAcademyProfile, setHasAcademyProfile] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/academy-student-profile", {
          cache: "no-store",
          credentials: "include",
        });
        const body = await response.json().catch(() => null);
        if (!active) return;
        const state = resolveAcademyProfileReadState<ProfileSummary>(response, body);
        setHasAcademyProfile(
          state.status === "authenticated" && Boolean(state.profile?.display_name),
        );
      } catch {
        if (active) setHasAcademyProfile(false);
      }
    };

    void refresh();
    window.addEventListener("tecpey-academy-profile-ready", refresh);
    window.addEventListener("tecpey-academy-auth-ready", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("tecpey-academy-profile-ready", refresh);
      window.removeEventListener("tecpey-academy-auth-ready", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (path === "/command-center" || path.startsWith("/command-center/")) return null;
  const isFa = locale === "fa";
  const href = (value: string) => localizePath(locale, value);
  const academyHome = hasAcademyProfile ? href("/academy/profile") : href("/academy");
  const items = [
    {
      label: isFa ? "آکادمی" : "Academy",
      href: academyHome,
      match: [
        href("/academy"),
        href("/academy/profile"),
        href("/academy/curriculum"),
        href("/academy/certificates"),
        href("/academy/achievements"),
      ],
      Icon: GraduationCap,
    },
    { label: isFa ? "آرنا" : "Arena", href: href("/academy/trading-arena"), match: [href("/academy/trading-arena"), href("/academy/simulator")], Icon: Trophy },
    { label: isFa ? "خانه" : "Home", href: href("/"), match: [href("/")], exact: true, Icon: Home },
    { label: isFa ? "بازار" : "Market", href: href("/markets"), match: ["/markets", "/coins", "/crypto-news", "/trading-tools"].map(href), Icon: TrendingUp },
    { label: isFa ? "حساب" : "Account", href: href("/academy/account"), match: ["/academy/account", "/academy/onboarding", "/academy/notifications", "/academy/login", "/academy/signup"].map(href), Icon: UserRound },
  ];
  return <>
    <div aria-hidden="true" className="h-[calc(env(safe-area-inset-bottom)+var(--tp-mobile-shell-clearance,9.5rem))] lg:hidden" />
    <LivingMobileNavigation ariaLabel={isFa ? "ناوبری اصلی تک‌پی" : "TecPey primary navigation"} dir={isFa ? "rtl" : "ltr"} items={items} />
  </>;
}
