"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Brain,
  Activity,
  Flame,
  GraduationCap,
  LineChart,
  Newspaper,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useBaseCurrenciesPrice } from "@/hooks/useBaseCurrenciesPrice";

type Locale = "fa" | "en";
type Tone = "bullish" | "bearish" | "neutral";

type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  category: string;
  tone: Tone;
  impact: number;
  isBreaking?: boolean;
  trendScore?: number;
  editorPick?: boolean;
  relatedLesson?: string;
};

type NewsResponse = {
  mode: "live" | "fallback";
  updatedAt: string;
  marketIntelligence?: {
    headline: string;
    risk: string;
    action: string;
    tone: Tone;
  };
  items: NewsItem[];
};

const faMentorExamples = [
  ["من تازه‌واردم؛ از کجا شروع کنم؟", "از ترم ۱ شروع کن: مبانی رمزارز، امنیت حساب، مدیریت ریسک و بعد تمرین در شبیه‌ساز."],
  ["آیا الان بیت‌کوین بخرم؟", "من سیگنال خرید نمی‌دهم؛ اول ریسک، افق زمانی، حجم ورود و سناریوی خروج را بررسی کنیم."],
  ["چرا در معامله ضرر می‌کنم؟", "معمولاً ترکیبی از ورود هیجانی، نداشتن حد ضرر و حجم نامناسب است. بیا از Practice Lab شروع کنیم."],
];

const enMentorExamples = [
  ["I am new. Where should I start?", "Start with Term 1: crypto basics, account security, risk management and then practice in the simulator."],
  ["Should I buy Bitcoin now?", "I do not give buy signals. Let’s review risk, time horizon, position size and exit planning first."],
  ["Why do I lose in trades?", "It is often emotional entries, no stop plan and poor sizing. Practice Lab is the right next step."],
];

function useRotatingPair(locale: Locale) {
  const list = locale === "fa" ? faMentorExamples : enMentorExamples;
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % list.length), 3500);
    return () => clearInterval(timer);
  }, [list.length]);
  return list[index];
}

function toneLabel(tone: Tone, locale: Locale) {
  if (locale === "fa") {
    if (tone === "bullish") return "مثبت";
    if (tone === "bearish") return "منفی";
    return "خنثی";
  }
  if (tone === "bullish") return "Bullish";
  if (tone === "bearish") return "Bearish";
  return "Neutral";
}

function toneClass(tone: Tone) {
  if (tone === "bullish") return "border-emerald-300/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  if (tone === "bearish") return "border-rose-300/30 bg-rose-500/10 text-rose-600 dark:text-rose-300";
  return "border-cyan-300/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200";
}

function formatTime(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === "fa" ? "به‌روزرسانی اخیر" : "Recently updated";
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fallbackItems(locale: Locale): NewsItem[] {
  const now = new Date().toISOString();
  if (locale === "fa") {
    return [
      { id: "fa-local-1", title: "بازار رمزارز امروز را با تمرکز روی ریسک دنبال کنید", summary: "اخبار بازار باید کنار آموزش، مدیریت سرمایه و پرهیز از تصمیم‌های هیجانی بررسی شود.", source: "اتاق خبر تک‌پی", url: "/crypto-news", publishedAt: now, category: "بازار", tone: "neutral", impact: 8 },
      { id: "fa-local-2", title: "آموزش امنیت همچنان مهم‌ترین قدم قبل از معامله است", summary: "قبل از هر خرید و فروش، امنیت حساب، 2FA و شناخت فیشینگ را جدی بگیرید.", source: "آکادمی تک‌پی", url: "/academy/term-2", publishedAt: now, category: "امنیت", tone: "neutral", impact: 9 },
    ];
  }
  return [
    { id: "en-local-1", title: "Follow crypto news with a risk-first mindset", summary: "Market news should be reviewed with education, risk management and emotional control.", source: "TecPey News Desk", url: "/en/crypto-news", publishedAt: now, category: "Market", tone: "neutral", impact: 8 },
    { id: "en-local-2", title: "Security education is still the first step before trading", summary: "Before trading, users should understand 2FA, phishing and safe account habits.", source: "TecPey Academy", url: "/en/academy/term-2", publishedAt: now, category: "Security", tone: "neutral", impact: 9 },
  ];
}

export function HomeAiMentorSpotlight({ locale }: { locale: Locale }) {
  const [question, answer] = useRotatingPair(locale);
  const isFa = locale === "fa";
  const steps = isFa
    ? ["یاد بگیر", "تمرین کن", "از مربی بپرس", "شبیه‌سازی کن", "فارغ‌التحصیل شو", "ایمن معامله کن"]
    : ["Learn", "Practice", "Ask Mentor", "Simulate", "Graduate", "Trade Safely"];
  const cards = isFa
    ? [
        [Brain, "مربی هوشمند", "پاسخ آموزشی، ضد هیجان و متمرکز بر امنیت و مدیریت ریسک.", "/academy/ai-guide"],
        [GraduationCap, "آکادمی مرحله‌ای", "۷ ترم، آزمون، XP، Badge، تمرین و مسیر ورود حرفه‌ای.", "/academy"],
        [LineChart, "شبیه‌ساز تصمیم", "سناریوی خرید، فروش، نگهداری، ریزش بازار و مدیریت سبد.", "/academy/simulator"],
        [ShieldCheck, "امنیت قبل از معامله", "Seed Phrase، فیشینگ، 2FA و عادت‌های ضروری محافظت از دارایی.", "/academy/term-2"],
      ]
    : [
        [Brain, "AI Mentor", "Educational, calm and risk-aware answers for safer crypto learning.", "/en/academy/ai-guide"],
        [GraduationCap, "Step-by-step Academy", "7 terms, exams, XP, badges, practice and graduation path.", "/en/academy"],
        [LineChart, "Decision Simulator", "Buy, sell, hold, crash and portfolio scenarios for real practice.", "/en/academy/simulator"],
        [ShieldCheck, "Security before trading", "Seed phrase, phishing, 2FA and asset protection habits.", "/en/academy/term-2"],
      ];

  return (
    <section className="relative overflow-hidden bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-10 h-64 bg-[radial-gradient(circle_at_center,rgba(6,182,212,.18),transparent_55%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-[36px] border border-cyan-300/20 bg-slate-950 p-6 text-white shadow-2xl shadow-cyan-500/10 lg:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
            <Sparkles className="h-4 w-4" />
            {isFa ? "مزیت اصلی تک‌پی" : "TecPey signature advantage"}
          </div>
          <h2 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">
            {isFa ? "با مربی هوشمند یاد بگیر، تمرین کن و امن‌تر وارد بازار شو" : "Learn, practice and enter crypto more safely with TecPey AI Mentor"}
          </h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-300 sm:text-base">
            {isFa
              ? "در تک‌پی فقط معامله نمی‌کنید؛ یاد می‌گیرید، تمرین می‌کنید، از مربی هوشمند کمک می‌گیرید و قبل از هر تصمیم، ریسک و امنیت را می‌سنجید."
              : "With TecPey, you do more than trade. You learn, practice, ask your AI Mentor and review risk before every market decision."}
          </p>
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            {steps.slice(0, 6).map((step, index) => (
              <div key={step} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center text-xs font-black text-cyan-100">
                <span className="block text-lg text-white">{index + 1}</span>
                {step}
              </div>
            ))}
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href={isFa ? "/academy/ai-guide" : "/en/academy/ai-guide"} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5">
              {isFa ? "شروع گفتگو با مربی" : "Ask the AI Mentor"}
              {isFa ? <ArrowLeft className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
            </Link>
            <Link href={isFa ? "/academy" : "/en/academy"} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-6 py-4 text-sm font-black text-white transition hover:bg-white/15">
              {isFa ? "ورود به آکادمی" : "Open Academy"}
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[34px] border border-cyan-300/20 bg-white/85 p-5 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl dark:bg-white/[0.055] lg:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500 text-white shadow-lg shadow-cyan-500/20">
                  <Brain className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-950 dark:text-white">{isFa ? "TecPey AI Mentor" : "TecPey AI Mentor"}</p>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-300">{isFa ? "آموزش ۲۴ ساعته، بدون سیگنال‌فروشی" : "24/7 learning, no signal selling"}</p>
                </div>
              </div>
              <span className="rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-300">Online</span>
            </div>
            <div className="mt-5 space-y-3">
              <div className="max-w-[88%] rounded-3xl rounded-br-md bg-slate-100 p-4 text-sm font-bold leading-7 text-slate-700 dark:bg-white/10 dark:text-slate-200">
                {question}
              </div>
              <div className="mr-auto max-w-[92%] rounded-3xl rounded-bl-md border border-cyan-300/25 bg-cyan-500/10 p-4 text-sm font-bold leading-7 text-cyan-800 dark:text-cyan-100">
                {answer}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {cards.map(([Icon, title, text, href]) => {
              const CardIcon = Icon as typeof Brain;
              return (
                <Link key={String(title)} href={String(href)} className="group rounded-[28px] border border-cyan-300/15 bg-white/75 p-5 shadow-xl shadow-cyan-500/5 backdrop-blur-xl transition hover:-translate-y-1 hover:border-cyan-300/45 dark:bg-white/[0.055]">
                  <CardIcon className="h-8 w-8 text-cyan-500" />
                  <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">{String(title)}</h3>
                  <p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{String(text)}</p>
                  <span className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-700 transition group-hover:bg-cyan-500 group-hover:text-white dark:text-cyan-100">
                    {isFa ? (String(title).includes("شبیه") ? "شروع شبیه‌ساز" : "ادامه") : (String(title).includes("Simulator") ? "Start simulator" : "Continue")}
                    {isFa ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="rounded-[28px] border border-cyan-300/20 bg-slate-950 p-5 text-white shadow-xl shadow-cyan-500/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-cyan-200">{isFa ? "حافظه آموزشی Mentor" : "Mentor learning memory"}</p>
                <h3 className="mt-2 text-xl font-black">{isFa ? "پیشنهاد امروز بر اساس مسیر شما" : "Today’s guidance from your learning path"}</h3>
              </div>
              <BadgeCheck className="h-9 w-9 text-cyan-300" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(isFa
                ? [["پیشرفت", "۳ ترم کامل"], ["نقطه قابل تقویت", "مدیریت ریسک"], ["گام بعدی", "Crash Simulator"]]
                : [["Progress", "3 terms done"], ["Focus area", "Risk control"], ["Next step", "Crash Simulator"]]
              ).map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                  <p className="text-[11px] font-black text-cyan-100/80">{label}</p>
                  <p className="mt-1 text-sm font-black text-white">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm font-bold leading-7 text-slate-300">
              {isFa ? "با اتصال حساب کاربری، Mentor می‌تواند آزمون‌ها، تمرین‌ها و سوالات قبلی شما را در پاسخ‌های بعدی لحاظ کند." : "After account connection, the Mentor can use your exams, practice history and previous questions to guide your next steps."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}


function isExternal(url: string) {
  return /^https?:\/\//i.test(url || "");
}

function newsSections(items: NewsItem[]) {
  const breaking = items.filter((item) => item.isBreaking).slice(0, 2);
  const trending = [...items].sort((a, b) => (b.trendScore ?? b.impact) - (a.trendScore ?? a.impact)).slice(0, 3);
  const editorPicks = items.filter((item) => item.editorPick).slice(0, 3);
  return { breaking, trending, editorPicks };
}

function LiveMarketIntelligence({ locale, intelligence }: { locale: Locale; intelligence?: NewsResponse["marketIntelligence"] }) {
  const isFa = locale === "fa";
  const { currencies } = useBaseCurrenciesPrice(["BTCUSDT", "ETHUSDT"]);
  const btc = currencies.find((coin: any) => String(coin?.symbol ?? coin?.priceData?.symbol ?? "").includes("BTC"));
  const eth = currencies.find((coin: any) => String(coin?.symbol ?? coin?.priceData?.symbol ?? "").includes("ETH"));
  const btcChange = Number((btc as any)?.priceData?.changePercent ?? (btc as any)?.changePercent ?? 0);
  const ethChange = Number((eth as any)?.priceData?.changePercent ?? (eth as any)?.changePercent ?? 0);
  const defaultBrief = isFa
    ? { headline: "بازار را با نظم، نه هیجان، دنبال کنید.", risk: "نوسان کوتاه‌مدت می‌تواند تصمیم‌های عجولانه ایجاد کند.", action: "اگر تازه‌کار هستید، قبل از هر تصمیم سری به ترم مدیریت ریسک بزنید.", tone: "neutral" as Tone }
    : { headline: "Follow the market with discipline, not emotion.", risk: "Short-term volatility can trigger rushed decisions.", action: "If you are new, review risk management before acting.", tone: "neutral" as Tone };
  const brief = intelligence ?? defaultBrief;
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
      <div className="rounded-[28px] border border-cyan-300/20 bg-slate-950 p-5 text-white shadow-xl shadow-cyan-500/10">
        <div className="flex items-center gap-2 text-xs font-black text-cyan-200"><Activity className="h-4 w-4" />{isFa ? "هوش زنده بازار" : "Live Market Intelligence"}</div>
        <h3 className="mt-3 text-2xl font-black leading-9">{brief.headline}</h3>
        <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{brief.risk}</p>
        <p className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-3 text-sm font-black leading-7 text-cyan-100">{brief.action}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[["BTC", btcChange], ["ETH", ethChange]].map(([symbol, change]) => {
          const numeric = Number(change);
          return (
            <div key={String(symbol)} className="rounded-[28px] border border-cyan-300/15 bg-white/75 p-5 shadow-xl shadow-cyan-500/5 dark:bg-slate-950/45">
              <div className="flex items-center justify-between"><span className="text-sm font-black text-slate-500 dark:text-slate-300">{String(symbol)} / USDT</span><TrendingUp className="h-5 w-5 text-cyan-500" /></div>
              <p className={`mt-4 text-3xl font-black ${numeric >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{Number.isFinite(numeric) ? `${numeric >= 0 ? "+" : ""}${numeric.toFixed(2)}%` : "—"}</p>
              <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">{isFa ? "تغییرات ۲۴ ساعت اخیر" : "24h change"}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CryptoNewsCenter({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const isFa = locale === "fa";
  const [state, setState] = useState<NewsResponse>({ mode: "fallback", updatedAt: new Date().toISOString(), items: fallbackItems(locale) });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/crypto-news?locale=${locale}&limit=${compact ? 4 : 8}`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("news failed")))
      .then((data: NewsResponse) => {
        if (active && Array.isArray(data.items)) setState(data);
      })
      .catch(() => {
        if (active) setState({ mode: "fallback", updatedAt: new Date().toISOString(), items: fallbackItems(locale) });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [compact, locale]);

  const topItems = useMemo(() => state.items.slice(0, compact ? 4 : 8), [compact, state.items]);
  const sections = useMemo(() => newsSections(state.items), [state.items]);

  return (
    <section className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[36px] border border-cyan-300/20 bg-white/80 p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl dark:bg-white/[0.055] lg:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-4 py-2 text-xs font-black text-cyan-700 dark:text-cyan-100">
              <Newspaper className="h-4 w-4" />
              {isFa ? "مرکز خبر هوشمند کریپتو" : "AI-powered Crypto News"}
            </div>
            <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-5xl">
              {isFa ? "اخبار مهم بازار، با خلاصه آموزشی تک‌پی" : "Market news with TecPey educational context"}
            </h2>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300 sm:text-base">
              {isFa
                ? "خبرها به‌صورت پویا از منابع معتبر دریافت می‌شوند و کنار هر خبر، اثر احتمالی، لحن بازار و مسیر آموزشی مرتبط نمایش داده می‌شود."
                : "News is fetched dynamically from trusted crypto sources and paired with market impact, sentiment and related learning paths."}
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm font-black text-slate-500 dark:text-slate-300 lg:text-left">
            <span>{isFa ? "به‌روزرسانی" : "Updated"}: {formatTime(state.updatedAt, locale)}</span>
            <span className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-700 dark:text-cyan-100">{loading ? (isFa ? "در حال دریافت خبرها" : "Fetching news") : state.mode === "live" ? (isFa ? "خبر زنده" : "Live feeds") : (isFa ? "حالت پشتیبان" : "Fallback mode")}</span>
          </div>
        </div>

        <LiveMarketIntelligence locale={locale} intelligence={state.marketIntelligence} />

        {!compact && (
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            {[
              [isFa ? "خبر فوری" : "Breaking", sections.breaking],
              [isFa ? "داغ‌ترین‌ها" : "Trending", sections.trending],
              [isFa ? "انتخاب تک‌پی" : "Editor Picks", sections.editorPicks],
            ].map(([title, list]) => (
              <div key={String(title)} className="rounded-[26px] border border-cyan-300/15 bg-white/70 p-4 dark:bg-slate-950/40">
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white"><Flame className="h-4 w-4 text-cyan-500" />{String(title)}</h3>
                <div className="mt-3 space-y-2">
                  {(list as NewsItem[]).length ? (list as NewsItem[]).map((item) => (
                    <a key={item.id} href={item.url || (isFa ? "/crypto-news" : "/en/crypto-news")} target={isExternal(item.url) ? "_blank" : undefined} rel={isExternal(item.url) ? "noreferrer" : undefined} className="block rounded-2xl border border-cyan-300/10 bg-cyan-500/5 p-3 text-xs font-black leading-6 text-slate-700 transition hover:bg-cyan-500/10 dark:text-slate-200">
                      {item.title}
                    </a>
                  )) : <p className="rounded-2xl border border-cyan-300/10 bg-cyan-500/5 p-3 text-xs font-bold text-slate-500 dark:text-slate-300">{isFa ? "در حال تکمیل با خبرهای جدید" : "Waiting for fresh headlines"}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 grid gap-4 lg:grid-cols-4">
          {topItems.map((item, index) => (
            <a key={`${item.id}-${index}`} href={item.url || (isFa ? "/crypto-news" : "/en/crypto-news")} target={isExternal(item.url) ? "_blank" : undefined} rel={isExternal(item.url) ? "noreferrer" : undefined} className="group flex min-h-[280px] flex-col rounded-[28px] border border-cyan-300/15 bg-white/75 p-5 shadow-xl shadow-cyan-500/5 transition hover:-translate-y-1 hover:border-cyan-300/45 dark:bg-slate-950/45">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-black text-cyan-700 dark:text-cyan-100">{item.category}</span>
                <div className="flex items-center gap-2">
                  {item.isBreaking && <span className="rounded-full border border-rose-300/30 bg-rose-500/10 px-2 py-1 text-[10px] font-black text-rose-500">{isFa ? "فوری" : "BREAKING"}</span>}
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${toneClass(item.tone)}`}>{toneLabel(item.tone, locale)}</span>
                </div>
              </div>
              <h3 className="mt-4 line-clamp-3 text-lg font-black leading-8 text-slate-950 dark:text-white">{item.title}</h3>
              <p className="mt-3 line-clamp-4 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{item.summary}</p>
              <div className="mt-auto pt-5">
                <div className="mb-3 flex items-center justify-between text-xs font-black text-slate-500 dark:text-slate-400">
                  <span>{item.source}</span>
                  <span>{formatTime(item.publishedAt, locale)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                    <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(30, Math.min(100, item.impact * 10))}%` }} />
                  </div>
                  <span className="text-xs font-black text-cyan-700 dark:text-cyan-100">{isFa ? "اثر" : "Impact"} {item.impact}/10</span>
                </div>
                {item.relatedLesson && <p className="mt-3 rounded-2xl border border-cyan-300/15 bg-cyan-500/5 p-2 text-[11px] font-black text-cyan-700 dark:text-cyan-100">{isFa ? "درس مرتبط" : "Related lesson"}: {item.relatedLesson}</p>}
              </div>
            </a>
          ))}
        </div>

        <div className="mt-7 flex flex-col items-center justify-between gap-4 rounded-[28px] border border-cyan-300/20 bg-cyan-500/10 p-5 md:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500 text-white">
              <Brain className="h-7 w-7" />
            </div>
            <p className="text-sm font-black leading-7 text-slate-800 dark:text-cyan-50">
              {isFa ? "هر خبر را می‌توانی از مربی هوشمند بپرسی: چرا مهم است؟ ریسک آن چیست؟ چه درس مرتبطی باید بخوانم؟" : "Ask the AI Mentor about any news: why it matters, what the risks are and which lesson explains it."}
            </p>
          </div>
          {compact && (
            <Link href={isFa ? "/crypto-news" : "/en/crypto-news"} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">
              {isFa ? "مشاهده همه اخبار" : "Open News Center"}
              {isFa ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export function HomeLearningJourney({ locale }: { locale: Locale }) {
  const isFa = locale === "fa";
  const items = isFa
    ? [
        [Route, "مسیر تک‌پی", "یادگیری مرحله‌ای به جای ورود هیجانی."],
        [Target, "تمرین واقعی", "تمرین سناریوهای ریزش، فومو، ریسک و سبد سرمایه."],
        [BadgeCheck, "ارزیابی آمادگی", "آزمون، XP، Badge، گواهی و دعوت به دوره تخصصی."],
        [Zap, "بازگشت روزانه", "با خبرهای مهم، ماموریت روزانه و پیشنهاد Mentor هر روز یک دلیل تازه برای یادگیری دارید."],
      ]
    : [
        [Route, "TecPey Method", "A guided path instead of hype-driven entry."],
        [Target, "Real practice", "Crash, FOMO, risk and portfolio scenarios."],
        [BadgeCheck, "Readiness checks", "Exams, XP, badges, certificate and advanced academy invitation."],
        [Zap, "Daily return loop", "News, daily missions and mentor prompts give you a fresh reason to learn every day."],
      ];
  return (
    <section className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[36px] border border-cyan-300/20 bg-slate-950 p-6 text-white shadow-2xl shadow-cyan-500/10 lg:p-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
            {isFa ? "روش یادگیری تک‌پی" : "TecPey Learning Method"}
          </div>
          <h2 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">
            {isFa ? "یاد بگیر → تمرین کن → از مربی بپرس → شبیه‌سازی کن → فارغ‌التحصیل شو → امن معامله کن" : "Learn → Practice → Ask → Simulate → Graduate → Trade Safely"}
          </h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-300 sm:text-base">
            {isFa ? "در این مسیر، شما فقط به دکمه خرید و فروش نمی‌رسید؛ قدم‌به‌قدم یاد می‌گیرید، تمرین می‌کنید و با آمادگی بیشتری وارد بازار می‌شوید." : "This path helps you move beyond a trading button: learn, practice and enter the market with better preparation."}
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {items.map(([Icon, title, text]) => {
            const CardIcon = Icon as typeof Route;
            return (
              <div key={String(title)} className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5">
                <CardIcon className="h-8 w-8 text-cyan-300" />
                <h3 className="mt-4 text-lg font-black text-white">{String(title)}</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{String(text)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
