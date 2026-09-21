"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CircleGauge,
  GraduationCap,
  LineChart,
  Newspaper,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Wrench,
} from "lucide-react";

type Locale = "fa" | "en";

const COPY = {
  fa: {
    dir: "rtl",
    kicker: "سیستم یادگیری تک‌پی",
    title: "چهار بخش جدا نیستند؛ یک مسیر پیوسته‌اند.",
    body:
      "آکادمی مفهوم را می‌سازد، منتور ابهام را روشن می‌کند، آرنا تصمیم را بدون پول واقعی تمرین می‌دهد و خبرها و ابزارها زمینهٔ بازار را اضافه می‌کنند.",
    modules: [
      {
        label: "۱",
        title: "یاد بگیر",
        text: "۷ ترم پایه + ترم رشد بی‌پایان، آزمون، فلش‌کارت و تمرین.",
        action: "دیدن مسیر آکادمی",
        href: "/academy",
      },
      {
        label: "۲",
        title: "بپرس",
        text: "منتور آموزشی با زمینهٔ مسیر یادگیری؛ بدون فروش سیگنال.",
        action: "گفتگو با منتور",
        href: "/academy/ai-guide",
      },
      {
        label: "۳",
        title: "تمرین کن",
        text: "تریدینگ آرنا با سرمایهٔ مجازی، ژورنال و کنترل ریسک.",
        action: "ورود به تریدینگ آرنا",
        href: "/academy/trading-arena",
      },
      {
        label: "۴",
        title: "زمینه را ببین",
        text: "خبر، دادهٔ بازار، پروندهٔ رمزارز و ابزارهای تصمیم‌گیری.",
        action: "دیدن زمینهٔ بازار",
        href: "/crypto-news",
      },
    ],
    academyKicker: "مسیر آموزشی",
    academyTitle: "از «از کجا شروع کنم؟» تا «چطور تصمیمم را ارزیابی کنم؟»",
    academyBody:
      "صفحهٔ آکادمی باید همیشه یک سؤال را پاسخ دهد: قدم بعدی من چیست؟ هفت ترم پایه، مهارت‌های ضروری را می‌سازند و ترم هشتم مسیر رشد پیوسته را با عملکرد واقعی کاربر ادامه می‌دهد.",
    terms: [
      "مبانی رمزارز",
      "امنیت",
      "کار با بازار",
      "تحلیل بنیادی",
      "نمودارخوانی",
      "مدیریت ریسک",
      "روانشناسی و آمادگی",
      "رشد بی‌پایان",
    ],
    academyCta: "دیدن مسیر کامل آکادمی",
    workspaceKicker: "منتور × تریدینگ آرنا",
    workspaceTitle: "یادگیری وقتی ارزشمند می‌شود که به تصمیم قابل‌بررسی تبدیل شود.",
    workspaceBody:
      "در Workspace، منتور به‌جای تولید هیجان، سؤال می‌پرسد، ریسک را یادآوری می‌کند و در زمان مناسب یک چالش آرنا یا درس مرتبط را پیشنهاد می‌دهد.",
    mentorTitle: "منتور آموزشی",
    mentorPrompt: "«چرا این تصمیم ریسک بالایی دارد؟»",
    mentorReply:
      "قبل از ورود، اندازه موقعیت، حد زیان و سناریوی خروج را مشخص کن. بعد همان تصمیم را در آرنا امتحان کنیم.",
    arenaTitle: "Trading Arena",
    arenaVirtual: "۱۰۰٬۰۰۰ دلار سرمایهٔ مجازی",
    arenaRisk: "ریسک و ژورنال، بخشی از تمرین",
    arenaCta: "تمرین در آرنا",
    exploreKicker: "هوش بازار برای یادگیری",
    exploreTitle: "خبر، کوین و ابزار؛ فقط وقتی به سؤال کاربر پاسخ می‌دهند.",
    exploreBody:
      "به‌جای دیوار اطلاعات، هر سطح باید زمینه، منبع، زمان و دلیل اهمیت را نشان دهد و کاربر را به درس یا تمرین مرتبط وصل کند.",
    exploreItems: [
      ["خبرها", "رویدادهای مهم با منبع و زمان انتشار", "/crypto-news"],
      ["رمزارزها", "کاربرد، توکنومیکس، ریسک و دادهٔ مرجع", "/coins"],
      ["ابزارها", "ابزارهای تحلیل و مدیریت ریسک با راهنمای استفاده", "/trading-tools"],
    ],
    trustKicker: "مرز شفاف محصول",
    trustTitle: "آموزش و تمرین فعال است؛ خدمات پول واقعی تا عبور از گیت‌های راه‌اندازی فعال نمی‌شود.",
    trustBody:
      "تک‌پی در این نسخه وعدهٔ سود، سیگنال خریدوفروش یا نتیجهٔ تضمین‌شده ارائه نمی‌کند. قیمت‌ها و خبرها برای زمینهٔ آموزشی‌اند و تصمیم مالی نیازمند بررسی مستقل ریسک است.",
    riskLink: "بیانیه ریسک",
    securityLink: "مرکز امنیت",
  },
  en: {
    dir: "ltr",
    kicker: "The TecPey learning system",
    title: "Not four separate features. One connected learning loop.",
    body:
      "Academy builds understanding, Mentor clears ambiguity, Arena turns decisions into virtual-capital practice, and market intelligence adds context.",
    modules: [
      {
        label: "1",
        title: "Learn",
        text: "7 foundation terms + continuous growth, assessments, flashcards and practice.",
        action: "Explore Academy",
        href: "/en/academy",
      },
      {
        label: "2",
        title: "Ask",
        text: "A learning mentor grounded in your journey—not a signal seller.",
        action: "Ask the Mentor",
        href: "/en/academy/ai-guide",
      },
      {
        label: "3",
        title: "Practice",
        text: "Trading Arena with virtual capital, journaling and risk controls.",
        action: "Open Trading Arena",
        href: "/en/academy/trading-arena",
      },
      {
        label: "4",
        title: "Add context",
        text: "News, market data, coin research and decision-support tools.",
        action: "Explore market context",
        href: "/en/crypto-news",
      },
    ],
    academyKicker: "Learning path",
    academyTitle: "From “where do I start?” to “how do I review my decision?”",
    academyBody:
      "Academy should always answer one question: what is my next step? Seven foundation terms build essential skills; Term 8 turns progress into an ongoing growth path informed by real learning performance.",
    terms: [
      "Crypto foundations",
      "Security",
      "Market mechanics",
      "Fundamental analysis",
      "Chart literacy",
      "Risk management",
      "Psychology & readiness",
      "Continuous growth",
    ],
    academyCta: "Explore the full Academy path",
    workspaceKicker: "Mentor × Trading Arena",
    workspaceTitle: "Learning becomes useful when a decision can be examined.",
    workspaceBody:
      "Inside the workspace, Mentor reduces hype: it asks for reasoning, surfaces risk, and can suggest a relevant Arena challenge or lesson at the right moment.",
    mentorTitle: "Learning Mentor",
    mentorPrompt: "“Why is this decision high risk?”",
    mentorReply:
      "Define position size, loss limit and an exit scenario first. Then test the same decision in Arena.",
    arenaTitle: "Trading Arena",
    arenaVirtual: "$100,000 virtual capital",
    arenaRisk: "Risk controls and journaling are part of practice",
    arenaCta: "Practice in Arena",
    exploreKicker: "Market intelligence for learning",
    exploreTitle: "News, coins and tools only matter when they answer a user question.",
    exploreBody:
      "Instead of an information wall, every surface should show context, source, freshness and why it matters—then connect the user to a relevant lesson or practice task.",
    exploreItems: [
      ["News", "Important events with sources and publication time", "/en/crypto-news"],
      ["Coins", "Utility, token economics, risks and reference data", "/en/coins"],
      ["Tools", "Analysis and risk tools with clear usage guidance", "/en/trading-tools"],
    ],
    trustKicker: "A clear product boundary",
    trustTitle: "Education and virtual practice are active. Real-money services remain launch-gated.",
    trustBody:
      "This release does not promise returns or provide buy/sell signals. Prices and news provide educational context; financial decisions require independent risk review.",
    riskLink: "Risk disclosure",
    securityLink: "Security center",
  },
} as const;

const MODULE_ICONS = [BookOpen, BrainCircuit, Trophy, CircleGauge] as const;

export function HomeProductStory({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const isFa = locale === "fa";
  const Arrow = isFa ? ArrowLeft : ArrowRight;
  const prefix = isFa ? "" : "/en";

  return (
    <div data-home-product-story dir={copy.dir}>
      <section
        data-home-section="system"
        className="bg-[color:var(--tp-bg)] px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <div className="tecpey-kicker">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {copy.kicker}
            </div>
            <h2 className="mt-6 text-balance text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-5xl">
              {copy.title}
            </h2>
            <p className="mt-5 max-w-3xl text-pretty text-base font-semibold leading-8 text-[color:var(--tp-muted)] sm:text-lg">
              {copy.body}
            </p>
          </div>

          <div className="mt-10 grid border-y border-[color:var(--tp-border)] md:grid-cols-4">
            {copy.modules.map((item, index) => {
              const Icon = MODULE_ICONS[index];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group relative min-h-[230px] border-b border-[color:var(--tp-border)] px-1 py-7 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--tp-focus)] md:border-b-0 md:border-s md:px-6 md:first:border-s-0"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-black text-[color:var(--tp-primary)]">
                      {item.label}
                    </span>
                    <Icon className="h-6 w-6 text-[color:var(--tp-primary)]" aria-hidden="true" />
                  </div>
                  <h3 className="mt-10 text-2xl font-black text-[color:var(--tp-text)]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm font-semibold leading-7 text-[color:var(--tp-muted)]">
                    {item.text}
                  </p>
                  <span className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-black text-[color:var(--tp-primary)]">
                    {item.action}
                    <Arrow className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section
        data-home-section="academy-path"
        className="bg-[color:var(--tp-surface)] px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
      >
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)] lg:items-center">
          <div>
            <div className="tecpey-kicker">
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
              {copy.academyKicker}
            </div>
            <h2 className="mt-6 text-balance text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-5xl">
              {copy.academyTitle}
            </h2>
            <p className="mt-5 text-pretty text-base font-semibold leading-8 text-[color:var(--tp-muted)]">
              {copy.academyBody}
            </p>
            <Link href={`${prefix}/academy/curriculum`} className="tecpey-action-primary mt-7">
              {copy.academyCta}
              <Arrow className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>

          <div className="relative overflow-hidden rounded-[32px] border border-[color:var(--tp-border)] bg-[color:var(--tp-card)] p-5 shadow-[var(--tp-shadow-panel)] sm:p-7">
            <div className="absolute inset-y-8 start-[2.05rem] w-px bg-gradient-to-b from-cyan-400 via-blue-500 to-violet-500 opacity-50 sm:start-[2.55rem]" aria-hidden="true" />
            <ol className="relative space-y-1">
              {copy.terms.map((term, index) => (
                <li key={term} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 rounded-2xl px-1 py-3 sm:grid-cols-[52px_1fr_auto] sm:px-2">
                  <span className="relative z-10 grid h-9 w-9 place-items-center rounded-full border border-cyan-300/25 bg-[color:var(--tp-surface)] text-xs font-black text-[color:var(--tp-primary)] sm:h-10 sm:w-10">
                    {new Intl.NumberFormat(isFa ? "fa-IR" : "en-US").format(index + 1)}
                  </span>
                  <span className="text-sm font-black text-[color:var(--tp-text)] sm:text-base">{term}</span>
                  <span className="hidden text-xs font-bold text-[color:var(--tp-muted)] sm:block">
                    {index === 7 ? (isFa ? "پیوسته" : "Ongoing") : isFa ? "پایه" : "Foundation"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section
        data-home-section="mentor-arena"
        className="bg-[color:var(--tp-bg)] px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
      >
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[36px] border border-cyan-300/15 bg-[#06111f] text-white shadow-[0_32px_100px_rgba(2,8,23,.28)]">
          <div className="grid lg:grid-cols-[.86fr_1.14fr]">
            <div className="p-6 sm:p-8 lg:p-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-4 py-2 text-xs font-black text-cyan-100">
                <BrainCircuit className="h-4 w-4" aria-hidden="true" />
                {copy.workspaceKicker}
              </div>
              <h2 className="mt-6 text-balance text-3xl font-black leading-tight sm:text-5xl">
                {copy.workspaceTitle}
              </h2>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-8 text-slate-300">
                {copy.workspaceBody}
              </p>
            </div>

            <div className="border-t border-white/10 bg-white/[0.035] p-4 sm:p-6 lg:border-s lg:border-t-0 lg:p-8">
              <div className="grid gap-4 xl:grid-cols-[1.06fr_.94fr]">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-200">
                      <BrainCircuit className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-black">{copy.mentorTitle}</p>
                      <p className="text-xs font-semibold text-slate-400">{isFa ? "زمینه‌محور و آموزشی" : "Context-aware learning"}</p>
                    </div>
                  </div>
                  <div className="mt-6 rounded-2xl bg-white/[0.07] p-4 text-sm font-bold leading-7 text-white/90">
                    {copy.mentorPrompt}
                  </div>
                  <div className="mt-3 rounded-2xl border border-cyan-200/15 bg-cyan-300/10 p-4 text-sm font-semibold leading-7 text-cyan-50">
                    {copy.mentorReply}
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-[#091827] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-black">{copy.arenaTitle}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">{copy.arenaVirtual}</p>
                    </div>
                    <LineChart className="h-7 w-7 text-emerald-300" aria-hidden="true" />
                  </div>
                  <div className="mt-7 h-24 rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(16,185,129,.12),transparent),repeating-linear-gradient(90deg,transparent,transparent_42px,rgba(255,255,255,.04)_43px)] p-4">
                    <svg viewBox="0 0 260 70" className="h-full w-full" role="img" aria-label={copy.arenaTitle}>
                      <path d="M2 58 C30 54 41 20 67 36 S108 63 130 38 S166 12 188 28 S225 49 258 10" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-300" />
                    </svg>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-300">
                    <ShieldCheck className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                    {copy.arenaRisk}
                  </div>
                  <Link href={`${prefix}/academy/trading-arena`} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-black text-cyan-200">
                    {copy.arenaCta}
                    <Arrow className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        data-home-section="market-intelligence"
        className="bg-[color:var(--tp-surface)] px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <div className="tecpey-kicker">
              <Target className="h-4 w-4" aria-hidden="true" />
              {copy.exploreKicker}
            </div>
            <h2 className="mt-6 text-balance text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-5xl">
              {copy.exploreTitle}
            </h2>
            <p className="mt-5 max-w-3xl text-base font-semibold leading-8 text-[color:var(--tp-muted)]">
              {copy.exploreBody}
            </p>
          </div>

          <div className="mt-10 divide-y divide-[color:var(--tp-border)] border-y border-[color:var(--tp-border)]">
            {copy.exploreItems.map(([title, description, href], index) => {
              const Icon = [Newspaper, CircleGauge, Wrench][index];
              return (
                <Link
                  key={href}
                  href={href}
                  className="group grid min-h-[112px] grid-cols-[48px_1fr_auto] items-center gap-4 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--tp-focus)] sm:grid-cols-[64px_1fr_auto]"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[color:var(--tp-primary-soft)] text-[color:var(--tp-primary)] sm:h-12 sm:w-12">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-lg font-black text-[color:var(--tp-text)] sm:text-xl">{title}</span>
                    <span className="mt-1 block text-sm font-semibold leading-6 text-[color:var(--tp-muted)]">{description}</span>
                  </span>
                  <Arrow className="h-5 w-5 text-[color:var(--tp-primary)] transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section
        data-home-section="trust-boundary"
        className="bg-[color:var(--tp-bg)] px-4 py-14 sm:px-6 lg:px-8 lg:py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-7 border-y border-[color:var(--tp-border)] py-10 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
          <div className="flex items-center gap-3 text-[color:var(--tp-primary)]">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            <span className="text-sm font-black">{copy.trustKicker}</span>
          </div>
          <div>
            <h2 className="text-balance text-2xl font-black leading-10 text-[color:var(--tp-text)] sm:text-3xl">
              {copy.trustTitle}
            </h2>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-8 text-[color:var(--tp-muted)] sm:text-base">
              {copy.trustBody}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`${prefix}/risk-disclosure`} className="tecpey-action-secondary tecpey-action-compact">
                {copy.riskLink}
              </Link>
              <Link href={`${prefix}/security`} className="tecpey-action-ghost tecpey-action-compact">
                {copy.securityLink}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
