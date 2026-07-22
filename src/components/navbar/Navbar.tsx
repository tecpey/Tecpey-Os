"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BrainCircuit,
  ChevronDown,
  Globe2,
  LogOut,
  Menu,
  UserIcon,
  X,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

export interface User {
  id: number;
  name: string;
  family: string;
  email: string;
  mobile: string;
  avatar: string;
  package: { id: number };
}

const primaryLinks = [
  { label: "خانه", href: "/" },
  { label: "بازارها", href: "/markets" },
  { label: "رمزارزها", href: "/coins" },
  { label: "اخبار", href: "/crypto-news" },
  { label: "آکادمی", href: "/academy" },
  { label: "امنیت", href: "/security" },
  { label: "تماس", href: "/contact-us" },
];

const primaryLinksEn = [
  { label: "Home", href: "/en" },
  { label: "Markets", href: "/en/markets" },
  { label: "Coins", href: "/en/coins" },
  { label: "News", href: "/en/crypto-news" },
  { label: "Academy", href: "/en/academy" },
  { label: "Security", href: "/en/security" },
  { label: "Contact", href: "/en/contact-us" },
];

const knowledgeLinks = [
  { label: "تریدینگ آرنا", href: "/academy/trading-arena" },
  { label: "منتور هوشمند", href: "/academy/ai-guide" },
  { label: "راهنمای شروع", href: "/start-guide" },
  { label: "سؤالات پرتکرار", href: "/faq" },
  { label: "واژه‌نامه رمزارز", href: "/glossary" },
  { label: "جعبه ابزار معامله‌گر", href: "/trading-tools" },
  { label: "مقایسه صرافی‌ها", href: "/compare" },
  { label: "کارمزدها", href: "/fees" },
  { label: "قوانین", href: "/rules" },
  { label: "بیانیه ریسک", href: "/risk-disclosure" },
];

const knowledgeLinksEn = [
  { label: "Trading Arena", href: "/en/academy/trading-arena" },
  { label: "AI Learning Mentor", href: "/en/academy/ai-guide" },
  { label: "Start Guide", href: "/en/start-guide" },
  { label: "FAQ", href: "/en/faq" },
  { label: "Glossary", href: "/en/glossary" },
  { label: "Trader Toolbox", href: "/en/trading-tools" },
  { label: "Exchange Comparisons", href: "/en/compare" },
  { label: "Fees", href: "/en/fees" },
  { label: "Rules", href: "/en/rules" },
  { label: "Risk Disclosure", href: "/en/risk-disclosure" },
];

function isNavActive(pathname: string, href: string) {
  if (href === "/" || href === "/en") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navLinkClass(active: boolean) {
  return `relative transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "text-primary after:absolute after:-bottom-2 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-primary" : "hover:text-primary"}`;
}

export default function Navbar({
  user,
}: {
  user: User | null;
  metaData?: any;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [mobileKnowledgeOpen, setMobileKnowledgeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [academyProfileReady, setAcademyProfileReady] = useState(false);
  const [academyAuthReady, setAcademyAuthReady] = useState(false);
  const [_academyProfileChecked, setAcademyProfileChecked] = useState(false);
  const loggedIn = !!user;
  const menuRef = useRef<HTMLLIElement>(null);
  const knowledgeButtonRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const appUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
  const officialLogo = "/images/tecpey-logo.png";
  const appLink = (path = "") => (appUrl ? `${appUrl}${path}` : path || "/");
  const authLink = (path: "/signin" | "/signup") =>
    appUrl ? `${appUrl}${path}` : `https://my.tecpey.ir${path}`;
  const pathname = usePathname();
  const normalizedPath =
    pathname === "/" ? "" : pathname.replace(/^\/en(?=\/|$)/, "");
  const faHref = normalizedPath || "/";
  const enHref = `/en${normalizedPath}`.replace(/\/$/, "") || "/en";
  const isEnglish = pathname.startsWith("/en");
  const isAcademyArea =
    pathname === "/academy" ||
    pathname.startsWith("/academy/") ||
    pathname === "/en/academy" ||
    pathname.startsWith("/en/academy/");
  const activePrimaryLinks = isEnglish ? primaryLinksEn : primaryLinks;
  const activeKnowledgeLinks = isEnglish ? knowledgeLinksEn : knowledgeLinks;
  const homeHref = isEnglish ? "/en" : "/";
  const knowledgeLabel = isEnglish ? "Knowledge Center" : "مرکز دانش";
  const loginLabel = isEnglish ? "Login" : "ورود";
  const signupLabel = isEnglish ? "Sign Up" : "ثبت‌نام";
  const accountLabel = isEnglish ? "Account" : "حساب کاربری";
  const profileLabel = isEnglish ? "My Profile" : "پروفایل من";
  const kycLabel = isEnglish ? "Verification" : "احراز هویت";
  const logoutLabel = isEnglish ? "Logout" : "خروج";
  const smartCenterLabel = isEnglish ? "Smart Center" : "مرکز هوشمند";
  const completeAccountLabel = isEnglish
    ? "Create academy profile"
    : "ساخت پروفایل آکادمی";
  const mobileDashboardLabel = isEnglish
    ? "Learning dashboard"
    : "داشبورد یادگیری";
  const smartCenterHref = isEnglish
    ? "/en/academy/profile"
    : "/academy/profile";
  const academyOnboardingHref = isEnglish
    ? "/en/academy/onboarding"
    : "/academy/onboarding";
  const academyLoginHref = isEnglish ? "/en/academy/login" : "/academy/login";
  const academySignupHref = isEnglish
    ? "/en/academy/signup"
    : "/academy/signup";
  const resolvedLoginHref = isAcademyArea
    ? academyLoginHref
    : authLink("/signin");
  const resolvedSignupHref = isAcademyArea
    ? academySignupHref
    : authLink("/signup");
  const menuAriaLabel = isEnglish ? "Open menu" : "باز کردن منو";
  const knowledgeMenuId = "tecpey-knowledge-center-menu";
  const mobileKnowledgeMenuId = "tecpey-mobile-knowledge-center-menu";

  useEffect(() => {
    let active = true;
    const checkAcademyProfile = async () => {
      try {
        const [authResponse, profileResponse] = await Promise.all([
          fetch("/api/academy-auth", { cache: "no-store", credentials: "include" }),
          fetch("/api/academy-student-profile", { cache: "no-store", credentials: "include" }),
        ]);
        const authData = await authResponse.json();
        const profileData = await profileResponse.json();
        if (!active) return;
        setAcademyAuthReady(
          Boolean(authData?.authenticated || profileData?.authenticated),
        );
        setAcademyProfileReady(Boolean(profileData?.profile?.display_name));
      } catch {
        if (active) {
          setAcademyAuthReady(false);
          setAcademyProfileReady(false);
        }
      } finally {
        if (active) setAcademyProfileChecked(true);
      }
    };
    void checkAcademyProfile();
    window.addEventListener("tecpey-academy-auth-ready", checkAcademyProfile);
    window.addEventListener(
      "tecpey-academy-profile-ready",
      checkAcademyProfile,
    );
    window.addEventListener("focus", checkAcademyProfile);
    return () => {
      active = false;
      window.removeEventListener(
        "tecpey-academy-auth-ready",
        checkAcademyProfile,
      );
      window.removeEventListener(
        "tecpey-academy-profile-ready",
        checkAcademyProfile,
      );
      window.removeEventListener("focus", checkAcademyProfile);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node))
        setKnowledgeOpen(false);
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      )
        setProfileOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (knowledgeOpen) {
        setKnowledgeOpen(false);
        knowledgeButtonRef.current?.focus();
      }
      setProfileOpen(false);
      setMobileKnowledgeOpen(false);
      setIsOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [knowledgeOpen]);

  useEffect(() => {
    setKnowledgeOpen(false);
    setMobileKnowledgeOpen(false);
    setProfileOpen(false);
    setIsOpen(false);
  }, [pathname]);

  return (
    <nav
      dir={isEnglish ? "ltr" : "rtl"}
      className="sticky left-0 top-0 z-[100] w-full border-b border-black/5 bg-navbar-bg/95 text-fg backdrop-blur-xl dark:border-white/10"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 lg:px-5 lg:py-3">
        <div className="flex items-center gap-5">
          <Link
            href={homeHref}
            className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="TecPey Home"
          >
            <Image
              src={officialLogo}
              alt="TecPey"
              width={120}
              height={48}
              className="h-11 w-auto object-contain md:h-12 lg:h-14"
            />
          </Link>

          <ul className="hidden items-center gap-4 text-[14px] font-bold lg:flex xl:gap-5">
            {activePrimaryLinks.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={navLinkClass(isNavActive(pathname, item.href))}
                >
                  {item.label}
                </Link>
              </li>
            ))}

            <li className="relative" ref={menuRef}>
              <button
                ref={knowledgeButtonRef}
                type="button"
                onClick={() => setKnowledgeOpen((prev) => !prev)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setKnowledgeOpen(true);
                    window.setTimeout(() => {
                      document
                        .querySelector<HTMLAnchorElement>(`#${knowledgeMenuId} a`)
                        ?.focus();
                    }, 0);
                  }
                }}
                className="flex items-center gap-1 rounded-full px-2 py-1 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-haspopup="menu"
                aria-expanded={knowledgeOpen}
                aria-controls={knowledgeMenuId}
              >
                {knowledgeLabel}
                <ChevronDown
                  size={15}
                  aria-hidden="true"
                  className={`transition-transform ${knowledgeOpen ? "rotate-180" : ""}`}
                />
              </button>
              {knowledgeOpen && (
                <div
                  id={knowledgeMenuId}
                  role="menu"
                  aria-label={knowledgeLabel}
                  className="absolute end-0 top-full z-[120] mt-3 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[color:var(--tp-border)] bg-[color:var(--tp-surface)] text-[color:var(--tp-text)] shadow-[0_24px_80px_rgba(2,8,23,.28)]"
                >
                  <div className="max-h-[min(70vh,520px)] overflow-y-auto p-2">
                    {activeKnowledgeLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        onClick={() => setKnowledgeOpen(false)}
                        className="block rounded-xl px-4 py-3 text-sm font-bold transition hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </li>
          </ul>
        </div>

        <div className="hidden items-center gap-3 lg:flex xl:gap-4">
          {loggedIn || academyAuthReady || academyProfileReady ? (
            <>
              {academyProfileReady ? (
                <Link
                  href={smartCenterHref}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-cyan-500 to-violet-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:brightness-110"
                >
                  <BrainCircuit className="h-4 w-4" /> {smartCenterLabel}
                </Link>
              ) : academyAuthReady && isAcademyArea ? (
                <Link
                  href={academyOnboardingHref}
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-300/35 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-700 transition hover:bg-cyan-400/15 dark:text-cyan-100"
                >
                  <UserIcon className="h-4 w-4" /> {completeAccountLabel}
                </Link>
              ) : null}
              {loggedIn ? (
                <a
                  href={appLink()}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110"
                >
                  {accountLabel}
                </a>
              ) : null}
              {loggedIn ? (
                <div className="relative" ref={profileRef}>
                  <button
                    type="button"
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="flex items-center justify-center"
                    aria-expanded={profileOpen}
                    aria-label={profileLabel}
                  >
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/20 transition hover:border-primary/60">
                      {user?.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UserIcon className="h-5 w-5 text-fg/80" />
                      )}
                    </div>
                  </button>
                  {profileOpen && (
                    <div className="absolute left-0 z-[120] mt-3 w-56 overflow-hidden rounded-xl border border-white/10 bg-bg shadow-2xl">
                      <div className="border-b border-white/10 px-4 py-3 text-sm">
                        <p className="font-bold text-fg">
                          {user?.name} {user?.family}
                        </p>
                        <p className="mt-1 text-xs text-muted">{user?.email}</p>
                      </div>
                      <a
                        href={appLink("/profile")}
                        className="block px-4 py-3 text-sm transition hover:bg-primary/10"
                      >
                        {profileLabel}
                      </a>
                      <a
                        href={appLink("/kyc")}
                        className="block px-4 py-3 text-sm transition hover:bg-primary/10"
                      >
                        {kycLabel}
                      </a>
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="flex w-full items-center gap-2 px-4 py-3 text-sm text-red-400 transition hover:bg-red-500/10"
                      >
                        <LogOut size={15} /> {logoutLabel}
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <a
                href={resolvedLoginHref}
                className="text-sm font-bold transition hover:text-primary"
              >
                {loginLabel}
              </a>
              <a
                href={resolvedSignupHref}
                className="rounded-full bg-primary px-4 py-2 text-sm font-black text-white shadow-lg shadow-primary/20 transition hover:brightness-110"
              >
                {signupLabel}
              </a>
            </>
          )}
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-xs font-black shadow-sm">
            <Globe2 className="mx-2 h-4 w-4 text-primary" />
            <Link
              href={faHref}
              className={`rounded-full px-3 py-2 transition ${!isEnglish ? "bg-primary text-white" : "text-fg/75 hover:bg-primary/10 hover:text-primary"}`}
            >
              FA
            </Link>
            <Link
              href={enHref}
              className={`rounded-full px-3 py-2 transition ${isEnglish ? "bg-primary text-white" : "text-fg/75 hover:bg-primary/10 hover:text-primary"}`}
            >
              EN
            </Link>
          </div>
          <div className="border-s border-white/10 ps-3">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 lg:hidden">
          <div className="flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/65 p-1 text-xs font-black shadow-sm dark:border-white/10 dark:bg-white/5">
            <Globe2 className="mx-1 h-4 w-4 text-primary sm:mx-2" />
            <Link
              href={faHref}
              className={`rounded-full px-2 py-2 transition sm:px-3 ${!isEnglish ? "bg-primary text-white" : "text-slate-700 hover:bg-primary/10 hover:text-primary dark:text-white/80"}`}
            >
              FA
            </Link>
            <Link
              href={enHref}
              className={`rounded-full px-2 py-2 transition sm:px-3 ${isEnglish ? "bg-primary text-white" : "text-slate-700 hover:bg-primary/10 hover:text-primary dark:text-white/80"}`}
            >
              EN
            </Link>
          </div>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={menuAriaLabel}
            aria-expanded={isOpen}
          >
            {isOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-x-0 top-[88px] z-[110] h-[calc(100dvh-88px)] overflow-y-auto bg-navbar-bg/98 px-5 pb-20 pt-4 text-fg shadow-2xl lg:hidden">
          <div className="flex flex-col gap-2">
            {activePrimaryLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`rounded-2xl p-4 font-bold transition ${isNavActive(pathname, item.href) ? "bg-primary/10 text-primary" : "hover:bg-white/5"}`}
              >
                {item.label}
              </Link>
            ))}
            <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/5">
              <button
                type="button"
                onClick={() => setMobileKnowledgeOpen((prev) => !prev)}
                className="flex w-full items-center justify-between p-4 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-expanded={mobileKnowledgeOpen}
                aria-controls={mobileKnowledgeMenuId}
              >
                {knowledgeLabel}
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className={`transition-transform ${mobileKnowledgeOpen ? "rotate-180" : ""}`}
                />
              </button>
              {mobileKnowledgeOpen && (
                <div id={mobileKnowledgeMenuId} className="flex flex-col gap-1 px-3 pb-3">
                  {activeKnowledgeLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        setMobileKnowledgeOpen(false);
                        setIsOpen(false);
                      }}
                      className="rounded-xl px-4 py-3 text-sm text-muted transition hover:bg-white/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="my-3 h-px bg-white/5" />
            {loggedIn || academyAuthReady || academyProfileReady ? (
              <>
                {academyProfileReady ? (
                  <Link
                    href={smartCenterHref}
                    onClick={() => setIsOpen(false)}
                    className="rounded-2xl bg-gradient-to-l from-cyan-500 to-violet-500 p-4 text-center font-black text-white shadow-lg shadow-cyan-500/20"
                  >
                    {smartCenterLabel}
                  </Link>
                ) : academyAuthReady && isAcademyArea ? (
                  <Link
                    href={academyOnboardingHref}
                    onClick={() => setIsOpen(false)}
                    className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-4 text-center font-black text-cyan-700 dark:text-cyan-100"
                  >
                    {completeAccountLabel}
                  </Link>
                ) : null}
                {academyProfileReady ? (
                  <Link
                    href={smartCenterHref}
                    onClick={() => setIsOpen(false)}
                    className="rounded-2xl border border-white/10 p-4 text-center font-black"
                  >
                    {mobileDashboardLabel}
                  </Link>
                ) : null}
                {loggedIn ? (
                  <a
                    href={appLink()}
                    className="rounded-2xl bg-primary p-4 text-center font-black text-white shadow-lg shadow-primary/20"
                  >
                    {accountLabel}
                  </a>
                ) : null}
              </>
            ) : (
              <>
                <a
                  href={resolvedLoginHref}
                  className="rounded-2xl border border-white/10 p-4 text-center font-black"
                >
                  {loginLabel}
                </a>
                <a
                  href={resolvedSignupHref}
                  className="rounded-2xl bg-primary p-4 text-center font-black text-white shadow-lg shadow-primary/20"
                >
                  {signupLabel}
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
