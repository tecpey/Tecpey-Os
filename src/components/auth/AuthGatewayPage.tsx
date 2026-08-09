import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { TecpeyMark } from "@/components/brand/TecpeyMark";

type Locale = "fa" | "en";
type Mode = "signin" | "signup";

const EXCHANGE_AUTH_URLS = {
  signin: "https://my.tecpey.ir/signin",
  signup: "https://my.tecpey.ir/signup",
} as const;

const copy = {
  fa: {
    signin: {
      eyebrow: "درگاه امن ورود تک‌پی",
      title: "ورود به حساب صرافی تک‌پی",
      body: "برای ورود به حساب مالی، فقط وارد دامنه رسمی صرافی شو. اطلاعات حساب در همین سایت عمومی دریافت نمی‌شود.",
      primary: "ادامه ورود در my.tecpey.ir",
      secondary: "ورود به آکادمی",
    },
    signup: {
      eyebrow: "شروع کنترل‌شده حساب تک‌پی",
      title: "ثبت‌نام حساب صرافی تک‌پی",
      body: "ساخت حساب مالی از محیط رسمی صرافی انجام می‌شود. قبل از ثبت اطلاعات، دامنه و قفل مرورگر را بررسی کن.",
      primary: "ادامه ثبت‌نام در my.tecpey.ir",
      secondary: "ثبت‌نام آکادمی رایگان",
    },
    home: "بازگشت به صفحه اصلی",
    domainLabel: "دامنه رسمی",
    domainValue: "my.tecpey.ir",
    safeTitle: "قبل از ورود بررسی کن",
    safeBody: "آدرس باید دقیقاً روی دامنه رسمی باشد. تک‌پی رمز عبور یا کد امنیتی را در پیام‌رسان‌ها درخواست نمی‌کند.",
    checks: [
      "ورود صرافی فقط از دامنه رسمی",
      "آموزش و تمرین از مسیر آکادمی",
      "تصمیم مالی بعد از بررسی ریسک",
    ],
    academyHref: "/academy/login",
    academySignupHref: "/academy/signup",
    homeHref: "/",
    dir: "rtl",
  },
  en: {
    signin: {
      eyebrow: "Secure TecPey entry",
      title: "Log in to your TecPey exchange account",
      body: "Financial account access belongs on the official exchange domain. This public site never collects exchange credentials.",
      primary: "Continue to my.tecpey.ir",
      secondary: "Academy login",
    },
    signup: {
      eyebrow: "Controlled TecPey account start",
      title: "Create your TecPey exchange account",
      body: "Exchange signup continues on the official exchange surface. Check the domain and browser lock before entering account details.",
      primary: "Continue signup on my.tecpey.ir",
      secondary: "Free Academy signup",
    },
    home: "Back to home",
    domainLabel: "Official domain",
    domainValue: "my.tecpey.ir",
    safeTitle: "Check before you continue",
    safeBody: "The address must be the exact official domain. TecPey never asks for passwords or security codes in messengers.",
    checks: [
      "Exchange access only on the official domain",
      "Education and practice through Academy",
      "Financial action after risk review",
    ],
    academyHref: "/en/academy/login",
    academySignupHref: "/en/academy/signup",
    homeHref: "/en",
    dir: "ltr",
  },
} as const;

export function AuthGatewayPage({
  locale,
  mode,
}: {
  locale: Locale;
  mode: Mode;
}) {
  const isFa = locale === "fa";
  const content = copy[locale];
  const page = content[mode];
  const ArrowIcon = isFa ? ArrowLeft : ArrowRight;
  const academyHref =
    mode === "signin" ? content.academyHref : content.academySignupHref;

  return (
    <main
      dir={content.dir}
      className="tecpey-enterprise relative isolate min-h-[100dvh] overflow-hidden bg-[color:var(--tp-bg)] px-4 py-10 text-[color:var(--tp-text)] sm:px-6 lg:px-8"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(8,217,214,.16),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(7,94,171,.14),transparent_24%)]" />
      <section className="mx-auto grid max-w-7xl gap-6 lg:min-h-[calc(100dvh-7rem)] lg:grid-cols-[minmax(0,1.02fr)_minmax(360px,.78fr)] lg:items-center">
        <div className="rounded-[34px] border border-[color:var(--tp-border)] bg-[color:var(--tp-card)] p-6 shadow-[0_24px_90px_rgba(7,94,171,.13)] backdrop-blur md:p-8 lg:p-10">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border border-cyan-300/20 bg-white shadow-[0_18px_50px_rgba(7,94,171,.16)] dark:bg-white/[0.08]">
              <TecpeyMark
                alt="TecPey"
                width={48}
                height={48}
                priority
                className="h-12 w-12 object-contain"
              />
            </span>
            <div>
              <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">
                {page.eyebrow}
              </p>
              <p className="mt-1 text-sm font-bold text-[color:var(--tp-muted)]">
                TecPey | تک‌پی
              </p>
            </div>
          </div>

          <h1 className="mt-8 max-w-3xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
            {page.title}
          </h1>
          <p className="mt-5 max-w-2xl text-base font-bold leading-8 text-[color:var(--tp-muted)]">
            {page.body}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={EXCHANGE_AUTH_URLS[mode]}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:bg-cyan-700 hover:shadow-2xl hover:shadow-cyan-500/25 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/60"
            >
              {page.primary}
              <ArrowIcon className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={academyHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[color:var(--tp-border)] bg-white/[0.70] px-5 py-3 text-sm font-black text-[color:var(--tp-text)] transition-[transform,border-color,background-color] duration-150 ease-out hover:border-cyan-300/50 hover:bg-cyan-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/50 dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
            >
              <GraduationCap className="h-4 w-4 text-cyan-600 dark:text-cyan-300" aria-hidden="true" />
              {page.secondary}
            </Link>
          </div>

          <Link
            href={content.homeHref}
            className="mt-6 inline-flex text-sm font-black text-cyan-700 underline underline-offset-4 transition hover:text-cyan-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/50 dark:text-cyan-200"
          >
            {content.home}
          </Link>
        </div>

        <aside className="rounded-[34px] border border-[color:var(--tp-border)] bg-[#06111f] p-6 text-white shadow-[0_28px_100px_rgba(6,17,31,.28)] md:p-8">
          <div className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.07] p-4">
            <div>
              <p className="text-xs font-black text-cyan-200">
                {content.domainLabel}
              </p>
              <p className="mt-1 font-black text-white">{content.domainValue}</p>
            </div>
            <LockKeyhole className="h-8 w-8 text-cyan-300" aria-hidden="true" />
          </div>

          <div className="mt-6 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-5">
            <ShieldCheck className="h-8 w-8 text-cyan-200" aria-hidden="true" />
            <h2 className="mt-4 text-2xl font-black">{content.safeTitle}</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-slate-300">
              {content.safeBody}
            </p>
          </div>

          <div className="mt-5 grid gap-3">
            {content.checks.map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-sm font-bold leading-7 text-slate-200"
              >
                <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
