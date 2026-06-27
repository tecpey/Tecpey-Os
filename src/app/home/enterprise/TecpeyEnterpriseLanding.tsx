"use client";

import Link from "next/link";
import Image from "next/image";
import { useBaseCurrenciesPrice } from "@/hooks/useBaseCurrenciesPrice";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  BellRing,
  Award,
  BookOpen,
  ClipboardCheck,
  Gift,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Fingerprint,
  GraduationCap,
  Globe2,
  LineChart,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  Building2,
  ClipboardList,
  MousePointerClick,
  HeartHandshake,
  TrendingDown,
  BookMarked,
  PenLine,
  ShieldAlert,
  PlayCircle,
} from "lucide-react";
import { TermGateLink } from "@/components/academy/TermGateLink";
import { HomeAiMentorSpotlight, HomeLearningJourney, CryptoNewsCenter } from "@/components/home/TecpeyHomeAI";

const freeAcademyHref = "https://my.tecpey.ir/signup";

const marketRows = [
  { symbol: "BTC", name: "Bitcoin", fa: "بیت‌کوین", price: "۶,۸۹۲,۰۰۰,۰۰۰", change: "+۲.۴٪", tone: "up" },
  { symbol: "ETH", name: "Ethereum", fa: "اتریوم", price: "۲۳۵,۴۰۰,۰۰۰", change: "+۱.۱٪", tone: "up" },
  { symbol: "USDT", name: "Tether", fa: "تتر", price: "۸۳,۱۲۰", change: "۰.۰٪", tone: "flat" },
  { symbol: "TON", name: "Toncoin", fa: "تون‌کوین", price: "۲۸۸,۰۰۰", change: "+۳.۲٪", tone: "up" },
];

const proofEvents = [
  "ثبت‌نام سریع و مسیر ورود شفاف برای کاربر تازه‌وارد",
  "نمایش قیمت و بازار قبل از ورود به داشبورد",
  "تأکید روی امنیت، شفافیت کارمزد و پشتیبانی قبل از معامله",
  "دکمه ثبت‌نام همیشه در دسترس کاربر است",
];

function useRotator(items: string[]) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % items.length), 2800);
    return () => clearInterval(timer);
  }, [items.length]);
  return items[index];
}



function formatFaNumber(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "در حال دریافت قیمت";
  return new Intl.NumberFormat("fa-IR").format(Math.round(n));
}

function normalizeSymbol(row: any) {
  return String(row?.symbol ?? row?.priceData?.symbol?.replace("USDT", "") ?? "").replace("USDT", "");
}

function resolveUsdLast(row: any, symbol: string) {
  if (symbol === "USDT") return 1;
  return Number(
    row?.priceData?.last ??
    row?.priceData?.price ??
    row?.priceData?.lastPrice ??
    row?.priceData?.close ??
    row?.last ??
    row?.lastPrice ??
    row?.price ??
    0
  );
}

function resolveIrtPrice(row: any, symbol: string, usdtIrt: unknown) {
  const direct = Number(row?.priceData?.priceIRT ?? row?.priceIRT ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const usd = resolveUsdLast(row, symbol);
  const rate = Number(usdtIrt ?? 0);
  if (symbol === "USDT") return rate > 0 ? rate : 0;
  return usd > 0 && rate > 0 ? usd * rate : 0;
}

function getMarketFallback() {
  return marketRows.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    faName: row.fa,
    priceData: { last: 0, changePercent: Number(row.change.replace(/[+٪]/g, "")) || 0 },
  }));
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--tp-border)] bg-white/70 px-3 py-2 text-xs font-bold text-[color:var(--tp-primary)] shadow-sm backdrop-blur dark:bg-white/5">
      <Sparkles className="h-4 w-4" />
      {children}
    </div>
  );
}

function DeviceFrame() {
  const event = useRotator(proofEvents);
  const { currencies, USDT_IRT } = useBaseCurrenciesPrice(["BTCUSDT", "ETHUSDT", "USDTUSDT", "TONUSDT"]);
  const dynamicRows = (currencies.length ? currencies : getMarketFallback()).slice(0, 6);
  return (
    <div className="relative mx-auto w-full max-w-[560px] lg:max-w-[620px]">
      <div className="absolute -inset-6 rounded-[48px] bg-[radial-gradient(circle_at_30%_20%,rgba(12,217,222,.35),transparent_35%),radial-gradient(circle_at_80%_40%,rgba(37,99,235,.30),transparent_35%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-[34px] border border-white/25 bg-white/80 p-3 shadow-2xl shadow-blue-950/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/70">
        <div className="rounded-[28px] border border-[color:var(--tp-border)] bg-[color:var(--tp-surface)] p-4 sm:p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Image src="/images/tecpey-logo.png" alt="TecPey" width={42} height={42} className="h-10 w-10 rounded-2xl object-contain" priority />
              <div>
                <p className="text-sm font-extrabold text-[color:var(--tp-text)]">بازار تک‌پی</p>
                <p className="truncate text-[11px] text-slate-600 dark:text-[color:var(--tp-muted)]">قیمت لحظه‌ای و مسیر شروع معامله</p>
              </div>
            </div>
            <div className="hidden rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500 sm:block">Online</div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["شروع سریع", "۳ قدم"],
              ["مسیر کاربر", "شفاف"],
              ["بازارها", "زنده"],
              ["پشتیبانی", "۲۴/۷"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-[color:var(--tp-border)] bg-[color:var(--tp-card)] p-3 text-center">
                <p className="text-lg font-black text-[color:var(--tp-text)]">{value}</p>
                <p className="mt-1 text-[11px] text-slate-600 dark:text-[color:var(--tp-muted)]">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-[color:var(--tp-border)] bg-white/[0.06] backdrop-blur-xl dark:bg-white/[0.045]">
            {dynamicRows.map((row: any, index: number) => {
              const symbol = normalizeSymbol(row);
              const faName = row?.faName ?? row?.fa ?? ({ BTC: "بیت‌کوین", ETH: "اتریوم", USDT: "تتر", TON: "تون‌کوین" } as Record<string, string>)[symbol] ?? symbol;
              const name = row?.name ?? symbol;
              const price = resolveIrtPrice(row, symbol, USDT_IRT);
              const change = Number(row?.priceData?.changePercent ?? row?.changePercent ?? 0);
              return (
                <div key={`${symbol}-${index}`} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-[color:var(--tp-border)] px-3 py-2 last:border-b-0 sm:grid-cols-[1.1fr_1fr_auto]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-[color:var(--tp-text)]">{faName}</p>
                    <p className="truncate text-[11px] text-slate-600 dark:text-[color:var(--tp-muted)]">{name} / IRT</p>
                  </div>
                  <p className="hidden text-xs font-bold text-[color:var(--tp-text)] sm:block">{formatFaNumber(price)}</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black sm:px-3 sm:text-xs ${change >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>{Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}٪` : "—"}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-bold text-[color:var(--tp-text)]">
            <BellRing className="h-5 w-5 text-[color:var(--tp-primary)]" />
            <span className="line-clamp-1">{event}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-[color:var(--tp-bg)] pt-24 sm:pt-28 lg:pt-32">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(11,217,222,.20),transparent_30%),radial-gradient(circle_at_10%_30%,rgba(30,64,175,.16),transparent_28%)]" />
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[.95fr_1.05fr] lg:px-8 lg:pb-24">
        <div className="text-center lg:text-right">
          <SectionLabel>آموزش، بازار زنده و ورود امن در یک مسیر شفاف</SectionLabel>
          <h1 className="mt-6 text-balance text-4xl font-black leading-[1.18] tracking-tight text-[color:var(--tp-text)] sm:text-5xl lg:text-6xl">
            تک‌پی، نقطه امن ورود به بازار رمزارز
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-8 text-[color:var(--tp-muted)] sm:text-lg lg:mx-0">
            از اولین آشنایی با بیت‌کوین تا اولین معامله واقعی، آموزش، تحلیل، ابزار و بازار زنده را در یک مسیر شفاف تجربه کنید؛ بدون عجله، بدون سیگنال‌فروشی و با تمرکز روی امنیت و مدیریت ریسک.
          </p>
          <div className="mt-5 inline-flex rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-700 shadow-sm dark:text-cyan-200">
            آموزش رایگان برای همه؛ مسیر رسمی آکادمی یک برنامه جداگانه آنلاین یا حضوری است
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link href="https://my.tecpey.ir" className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--tp-primary)] px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:shadow-2xl sm:text-base">
              ورود به صرافی
              <ArrowLeft className="h-5 w-5 transition group-hover:-translate-x-1" />
            </Link>
            <div className="flex flex-col items-center gap-1.5 sm:items-start">
              <Link href="/academy" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[color:var(--tp-border)] bg-white/70 px-6 py-4 text-sm font-black text-[color:var(--tp-text)] backdrop-blur transition hover:bg-white dark:bg-white/5 dark:hover:bg-white/10 sm:text-base">
                آکادمی رایگان
                <LineChart className="h-5 w-5 text-[color:var(--tp-primary)]" />
              </Link>
              <p className="text-[11px] font-bold text-[color:var(--tp-muted)]">برای شروع مطمئن، آکادمی کنار توست.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-[color:var(--tp-muted)] lg:justify-start">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-2 text-emerald-500"><CheckCircle2 className="h-4 w-4" />۷ ترم آموزشی</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-2 text-blue-500"><ShieldCheck className="h-4 w-4" />۵۰+ پرونده رمزارز</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-2 text-cyan-500"><Clock3 className="h-4 w-4" />۲۰+ ابزار حرفه‌ای</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-2 text-violet-500"><LineChart className="h-4 w-4" />بازار زنده</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-2 text-amber-500"><BookOpen className="h-4 w-4" />آموزش فارسی</span>
          </div>
        </div>
        <DeviceFrame />
      </div>
    </section>
  );
}



function GlobalUxMetrics() {
  const metrics = [
    { value: "۷", label: "ترم آموزشی", hint: "از صفر تا روانشناسی معامله", href: "/academy/curriculum" },
    { value: "۵۰+", label: "پرونده رمزارز", hint: "با Market Data و تحلیل ریسک", href: "/coins" },
    { value: "۲۰+", label: "ابزار حرفه‌ای", hint: "تحلیل، ریسک، آنچین و اقتصاد کلان", href: "/academy/tools" },
    { value: "۱ مسیر", label: "ورود امن", hint: "یادگیری → تحلیل → تمرین → تصمیم", href: "/academy/safe-entry" },
  ];
  return (
    <section className="bg-[color:var(--tp-bg)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-4">
        {metrics.map((item) => (
          <Link key={item.label} href={item.href} className="group block rounded-[28px] border border-cyan-300/15 bg-white/80 p-5 text-center shadow-sm transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-[0_24px_70px_rgba(34,211,238,.16)] focus:outline-none focus:ring-2 focus:ring-cyan-300/60 dark:bg-white/[0.055]">
            <p className="text-3xl font-black text-[color:var(--tp-primary)]">{item.value}</p>
            <p className="mt-2 text-sm font-black text-[color:var(--tp-text)]">{item.label}</p>
            <p className="mt-1 text-xs font-bold leading-6 text-[color:var(--tp-muted)]">{item.hint}</p>
            <span className="mt-3 inline-flex text-[11px] font-black text-cyan-300 opacity-0 transition group-hover:opacity-100">مشاهده مسیر</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TecpeyEcosystemFlow() {
  const steps = [
    { icon: BookOpen, title: "یادگیری", desc: "آکادمی مرحله‌ای از مفاهیم پایه تا روانشناسی معامله", href: "/academy/learning" },
    { icon: ShieldCheck, title: "امنیت", desc: "فیشینگ، 2FA، Seed Phrase، شبکه انتقال و مدیریت بحران", href: "/academy/security" },
    { icon: LineChart, title: "تحلیل", desc: "تکنیکال، فاندامنتال، Market Cap، FDV و حجم بازار", href: "/academy/analysis" },
    { icon: ClipboardList, title: "ابزار", desc: "Position Size، DCA، Fear & Greed، آنچین و اقتصاد کلان", href: "/academy/tools" },
    { icon: MousePointerClick, title: "تمرین", desc: "Quiz، XP، سناریوهای واقعی و سنجش آمادگی کاربر", href: "/academy/practice" },
    { icon: TrendingUp, title: "تصمیم", desc: "ورود مسئولانه به بازار، نه خرید هیجانی یا سیگنال‌محور", href: "/academy/decision" },
  ];
  return (
    <section className="bg-[color:var(--tp-bg)] px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[36px] border border-cyan-300/15 bg-slate-950 p-6 text-white shadow-2xl shadow-cyan-500/10 lg:p-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">TecPey Ecosystem</div>
          <h2 className="mt-5 text-3xl font-black leading-tight sm:text-4xl">کاربر در تک‌پی فقط ثبت‌نام نمی‌کند؛ مسیر یادگیری تا تصمیم را طی می‌کند</h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-300">ساختار تک‌پی مثل یک مسیر امن طراحی شده: اول فهم، بعد امنیت، بعد تحلیل، بعد ابزار، بعد تمرین و در نهایت تصمیم مسئولانه.</p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {steps.map((step, index) => (
            <Link key={step.title} href={step.href} className="group relative block rounded-[28px] border border-white/10 bg-white/[0.06] p-5 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-cyan-300/10 hover:shadow-[0_24px_70px_rgba(34,211,238,.14)] focus:outline-none focus:ring-2 focus:ring-cyan-300/60">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200">
                <step.icon className="h-6 w-6" />
              </div>
              <p className="mt-4 text-xs font-black text-cyan-200">مرحله {index + 1}</p>
              <h3 className="mt-1 text-lg font-black">{step.title}</h3>
              <p className="mt-2 text-xs font-bold leading-6 text-slate-300">{step.desc}</p>
              <span className="mt-3 inline-flex text-[11px] font-black text-cyan-200 opacity-0 transition group-hover:opacity-100">باز کردن بخش</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustStackGlobal() {
  const items = [
    { title: "Education-first", desc: "اول آموزش و سنجش، بعد دعوت به اقدام", href: "/academy/education-first" },
    { title: "Risk-aware", desc: "مدیریت ریسک، کارمزد، شبکه انتقال و حد ضرر در مسیر آموزش", href: "/academy/risk-aware" },
    { title: "Security-first", desc: "2FA، ضد فیشینگ، Seed Phrase و عادت‌های امن کاربر", href: "/academy/security-first" },
    { title: "Market intelligence", desc: "قیمت زنده، Market Cap، FDV، Volume و تحلیل رمزارز", href: "/academy/market-intelligence" },
    { title: "Tool-based decisions", desc: "ماشین‌حساب‌ها و ابزارهای معتبر به جای حدس و هیجان", href: "/academy/tool-based-decisions" },
    { title: "Persian clarity", desc: "محتوای فارسی قابل فهم برای تازه‌کار، نه متن پیچیده و ترسناک", href: "/academy/persian-clarity" },
  ];
  return (
    <section className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/15 bg-white/80 p-6 shadow-xl shadow-cyan-500/10 dark:bg-white/[0.055] lg:p-8">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <SectionLabel>اعتمادسازی در سطح جهانی</SectionLabel>
            <h2 className="mt-4 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl">چرا تجربه تک‌پی باید حس یک محصول جهانی بدهد؟</h2>
            <p className="mt-4 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">کاربر تازه‌کار قبل از دیدن دکمه معامله، باید حس کند که مسیر، ریسک‌ها، ابزارها و آموزش‌ها شفاف هستند. این همان تفاوت یک صرافی معمولی با یک اکوسیستم آموزشی-تحلیلی است.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <Link key={item.title} href={item.href} className="group block rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-4 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-[0_18px_55px_rgba(34,211,238,.14)] focus:outline-none focus:ring-2 focus:ring-cyan-300/60">
                <p className="text-xs font-black text-cyan-700 dark:text-cyan-200">{item.title}</p>
                <p className="mt-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{item.desc}</p>
                <span className="mt-2 inline-flex text-[11px] font-black text-cyan-300 opacity-0 transition group-hover:opacity-100">ادامه</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WhyTecpeyTrust() {
  const items = [
    { icon: ShieldCheck, title: "ورود امن، نه هیجانی", desc: "تک‌پی قبل از دعوت به معامله، امنیت حساب، ریسک انتقال، کارمزد و مدیریت سرمایه را آموزش می‌دهد." },
    { icon: GraduationCap, title: "آموزش رایگان و مرحله‌ای", desc: "کاربر از صفر شروع می‌کند و با آزمون، XP و مسیر مرحله‌ای می‌فهمد برای قدم بعدی آماده است یا نه." },
    { icon: LineChart, title: "بازار زنده و قابل بررسی", desc: "قیمت، حجم، Market Cap، FDV و اطلاعات کلیدی رمزارزها در کنار آموزش نمایش داده می‌شود." },
    { icon: ClipboardList, title: "جعبه ابزار معامله‌گر", desc: "ابزارهای تحلیل، مدیریت ریسک، آنچین، اقتصاد کلان و ماشین‌حساب‌ها در مرکز دانش جمع شده‌اند." },
  ];
  return (
    <section id="why-tecpey" className="bg-[color:var(--tp-bg)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/15 bg-white/[0.07] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl lg:p-8">
        <div className="max-w-3xl">
          <SectionLabel>چرا تک‌پی؟</SectionLabel>
          <h2 className="mt-4 text-3xl font-black text-[color:var(--tp-text)] sm:text-4xl">اول آموزش، بعد تصمیم؛ اول امنیت، بعد معامله</h2>
          <p className="mt-4 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">
            تک‌پی فقط یک مسیر ورود به بازار نیست؛ یک اکوسیستم آموزشی، تحلیلی و رفتاری است که کمک می‌کند کاربر تازه‌کار قبل از هر اقدام، ریسک‌ها و ابزارهای تصمیم‌گیری را بشناسد.
          </p>
        </div>
        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <div key={item.title} className="rounded-[26px] border border-cyan-300/15 bg-white/75 p-5 dark:bg-white/5">
              <item.icon className="h-7 w-7 text-[color:var(--tp-primary)]" />
              <h3 className="mt-4 text-lg font-black text-[color:var(--tp-text)]">{item.title}</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProofRail() {
  const items = [
    { icon: GraduationCap, title: "آموزش رایگان برای همه", desc: "سطوح آموزشی آکادمی تک‌پی برای یادگیری مبانی رمزارز، کار با صرافی، تحلیل تکنیکال، تحلیل فاندامنتال و مدیریت ریسک به‌صورت رایگان در اختیار کاربران قرار می‌گیرد.", href: "https://my.tecpey.ir/signup" },
    { icon: ClipboardCheck, title: "ارزیابی مرحله‌ای و امتیازدهی", desc: "در پایان هر سطح، آزمون‌های کوتاه و کاربردی برگزار می‌شود تا کاربر بداند چقدر آماده ورود به مرحله بعد و تصمیم‌گیری در بازار است.", href: "/academy/evaluation" },
    { icon: Trophy, title: "آمادگی واقعی پیش از ورود", desc: "کاربر پس از یادگیری، آزمون و مرور چک‌لیست‌ها بهتر می‌فهمد چه می‌خرد، چه ریسکی می‌کند و چگونه مسئولانه وارد بازار شود.", href: "/academy/term-7" },
  ];
  return (
    <section className="bg-[color:var(--tp-bg)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
        {items.map((item) => (
          <Link key={item.title} href={item.href} className="group block rounded-[30px] border border-cyan-300/15 bg-white/[0.06] p-6 shadow-[0_18px_55px_rgba(0,0,0,.16)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-[0_24px_70px_rgba(34,211,238,.16)] focus:outline-none focus:ring-2 focus:ring-cyan-300/60 dark:bg-white/[0.045]">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300 shadow-[0_0_28px_rgba(34,211,238,.18)]">
              <item.icon className="h-7 w-7" />
            </div>
            <h3 className="mt-5 text-xl font-black text-[color:var(--tp-text)]">{item.title}</h3>
            <p className="mt-3 text-sm leading-8 text-slate-600 dark:text-[color:var(--tp-muted)]">{item.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-black text-cyan-300 opacity-0 transition group-hover:opacity-100">مشاهده جزئیات <ArrowLeft className="h-4 w-4" /></span>
          </Link>
        ))}
      </div>
    </section>
  );
}



function ConversionJourney() {
  const levels = [
    { icon: ShieldCheck, title: "سطح ۱: ورود امن", desc: "سواد مالی، بیت‌کوین، تتر، بلاکچین، امنیت ایمیل و حساب، 2FA، ابزارهای ضروری مثل TradingView، CoinMarketCap و کار با تک‌پی." },
    { icon: BarChart3, title: "سطح ۲: درک بازار", desc: "مارکت کپ، حجم، نقدشوندگی، چرخه بازار، انواع سفارش، دفتر سفارش، اسپرد و مدیریت سرمایه مقدماتی." },
    { icon: LineChart, title: "سطح ۳: تحلیل تکنیکال", desc: "کندل‌خوانی، روند، حمایت و مقاومت، عرضه و تقاضا، RSI، MACD، میانگین متحرک و پرایس‌اکشن مقدماتی." },
    { icon: TrendingUp, title: "سطح ۴: معامله‌گری حرفه‌ای", desc: "ساخت استراتژی، چند تایم‌فریم، واچ‌لیست، ژورنال معاملاتی، بک‌تست، مدیریت پوزیشن و برنامه معاملاتی." },
    { icon: Globe2, title: "سطح ۵: تحلیل فاندامنتال", desc: "توکنومیکس، وایت‌پیپر، تیم پروژه، TVL، داده‌های On-chain، اخبار کلان، ETF، CPI و نرخ بهره." },
    { icon: Fingerprint, title: "سطح ۶: روانشناسی بازار", desc: "FOMO، FUD، ترس، طمع، انضباط، کنترل احساسات، حد ضرر، مدیریت ریسک و جلوگیری از لیکویید شدن." },
    { icon: Gift, title: "سطح ۷: مسیر کاربران آماده‌تر آکادمی", desc: "آزمون جامع، مسیر رسمی آکادمی تک‌پی، مسیر آموزشی رسمی، مسیر آموزشی تکمیلی و ورود به جامعه یادگیری تک‌پی." },
  ];
  return (
    <section id="academy-path" className="bg-[color:var(--tp-bg)] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>مسیر آموزشی آکادمی تک‌پی</SectionLabel>
          <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl lg:text-5xl">از تازه‌وارد تا کاربر آگاه بازار رمزارز</h2>
          <p className="mt-4 text-base leading-8 text-slate-600 dark:text-[color:var(--tp-muted)]">
            آموزش‌های این بخش برای افزایش آگاهی و ورود مسئولانه به بازار طراحی شده‌اند. تکمیل این مسیر رایگان به معنی دریافت سرمایه، استخدام، مسیر آموزشی رسمی یا مزایای ویژه نیست.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          {levels.map((level, index) => (
            <div key={level.title} className="group relative overflow-hidden rounded-[30px] border border-cyan-200 bg-white/92 p-5 shadow-[0_18px_55px_rgba(15,23,42,.10)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-[0_24px_70px_rgba(34,211,238,.16)] dark:border-cyan-300/15 dark:bg-white/[0.055]">
              <span className="absolute left-4 top-4 text-5xl font-black text-cyan-300/10">۰{index + 1}</span>
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300 shadow-[0_0_28px_rgba(34,211,238,.18)]">
                <level.icon className="h-7 w-7" />
              </div>
              <h3 className="mt-6 text-lg font-black leading-8 text-[color:var(--tp-text)]">{level.title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-[color:var(--tp-muted)]">{level.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ResponsiveShowcase() {
  return (
    <section className="bg-[color:var(--tp-surface)] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[.9fr_1.1fr]">
        <div>
          <SectionLabel>ابزارهای حیاتی برای شروع امن</SectionLabel>
          <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl lg:text-5xl">از روز اول، ابزار درست را یاد می‌گیرید</h2>
          <p className="mt-4 text-base leading-8 text-slate-600 dark:text-[color:var(--tp-muted)]">در ترم اول، کاربر فقط مفاهیم را حفظ نمی‌کند؛ ایمیل امن، مدیریت رمز عبور، 2FA، TradingView، CoinMarketCap، CoinGecko، ژورنال معاملاتی و کار با صرافی را قدم‌به‌قدم یاد می‌گیرد.</p>
          <ul className="mt-6 space-y-3 text-sm font-bold text-[color:var(--tp-text)]">
            {["ساخت ایمیل امن و فعال‌سازی 2FA", "کار با TradingView و واچ‌لیست", "شناخت CoinMarketCap و CoinGecko", "ثبت ژورنال و مدیریت ریسک"].map((x) => (
              <li key={x} className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" />{x}</li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[.75fr_1fr]">
          <div className="mx-auto w-full max-w-[260px] rounded-[34px] border border-[color:var(--tp-border)] bg-[color:var(--tp-card)] p-3 shadow-xl sm:mt-14">
            <div className="rounded-[28px] bg-[color:var(--tp-bg)] p-4">
              <div className="h-3 w-20 rounded-full bg-[color:var(--tp-primary)]/30" />
              <div className="mt-4 h-24 rounded-3xl bg-gradient-to-br from-cyan-400/30 to-blue-700/20" />
              <div className="mt-4 space-y-2">
                <div className="h-3 rounded-full bg-[color:var(--tp-border)]" />
                <div className="h-3 w-2/3 rounded-full bg-[color:var(--tp-border)]" />
              </div>
              <div className="mt-5 h-12 rounded-2xl bg-[color:var(--tp-primary)]" />
            </div>
          </div>
          <div className="rounded-[34px] border border-[color:var(--tp-border)] bg-[color:var(--tp-card)] p-4 shadow-xl">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-36 rounded-3xl bg-gradient-to-br from-cyan-400/25 to-blue-700/10" />
              <div className="space-y-3 rounded-3xl bg-[color:var(--tp-bg)] p-4">
                <div className="h-4 w-28 rounded-full bg-[color:var(--tp-primary)]/30" />
                <div className="h-3 rounded-full bg-[color:var(--tp-border)]" />
                <div className="h-3 w-2/3 rounded-full bg-[color:var(--tp-border)]" />
                <div className="h-10 rounded-2xl bg-[color:var(--tp-primary)]" />
              </div>
              <div className="space-y-3 rounded-3xl bg-[color:var(--tp-bg)] p-4 sm:col-span-2">
                <div className="grid grid-cols-3 gap-3">
                  <div className="h-16 rounded-2xl bg-[color:var(--tp-border)]" />
                  <div className="h-16 rounded-2xl bg-[color:var(--tp-border)]" />
                  <div className="h-16 rounded-2xl bg-[color:var(--tp-border)]" />
                </div>
                <div className="h-12 rounded-2xl bg-cyan-400/20" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


function BrandContentSystem() {
  const cards = [
    { icon: GraduationCap, title: "مدرسه ورود امن، نه پکیج‌فروشی", desc: "تک‌پی آموزش را به جای فروش وعده، رایگان و مرحله‌ای ارائه می‌کند تا کاربر قبل از معامله، ابزار، ریسک و منطق بازار را بشناسد.", tag: "آموزش رایگان" },
    { icon: ClipboardCheck, title: "آزمون‌های کوتاه و جدی", desc: "دانشجو بعد از هر سطح با آزمون‌های کاربردی سنجیده می‌شود؛ امتیازها فقط عدد نیستند، مسیر رشد حرفه‌ای او را مشخص می‌کنند.", tag: "ارزیابی شایستگی" },
    { icon: Award, title: "جامعه یادگیری تک‌پی", desc: "برترین‌ها می‌توانند وارد مسیر ویژه شوند: آموزش پیشرفته، مسیر آموزشی رسمی، مسیر رسمی آکادمی، مسیر آموزشی تکمیلی و کامیونیتی حرفه‌ای.", tag: "مسیر کاربران آماده‌تر آکادمی" },
  ];

  return (
    <section className="bg-[color:var(--tp-bg)] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
          <div>
            <SectionLabel>چرا آکادمی تک‌پی متفاوت است؟</SectionLabel>
            <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl lg:text-5xl">
              تک‌پی فقط محل معامله نیست؛ نقطه‌ای امن برای یادگیری و ورود آگاهانه به بازار رمزارز است
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-600 dark:text-[color:var(--tp-muted)]">
              در تک‌پی هدف این نیست که کاربر سریع‌تر معامله کند؛ هدف این است که آگاه‌تر، امن‌تر و با مسیر رشد روشن وارد بازار رمزارز شود.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {cards.map((card) => (
              <div key={card.title} className="group relative min-h-[270px] overflow-hidden rounded-[30px] border border-cyan-300/15 bg-white/[0.06] p-5 shadow-[0_18px_55px_rgba(0,0,0,.18)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-[0_24px_70px_rgba(34,211,238,.16)] dark:bg-white/[0.045]">
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300 shadow-[0_0_28px_rgba(34,211,238,.18)]">
                    <card.icon className="h-7 w-7" />
                  </div>
                  <Image src="/images/tecpey-logo.png" alt="TecPey" width={38} height={38} className="h-10 w-10 object-contain opacity-80" />
                </div>
                <p className="mt-5 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-black text-cyan-200">{card.tag}</p>
                <h3 className="mt-4 text-xl font-black leading-8 text-white">{card.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/70">{card.desc}</p>
                <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-cyan-400/20 blur-2xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}



function WhyTecpeyWasCreated() {
  return (
    <section id="why-created" className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 rounded-[34px] border border-cyan-300/15 bg-white/[0.06] p-6 shadow-[0_24px_80px_rgba(0,0,0,.18)] backdrop-blur-xl dark:bg-white/[0.045] lg:grid-cols-[.82fr_1.18fr] lg:p-8">
        <div>
          <SectionLabel>چرا تک‌پی ایجاد شد؟</SectionLabel>
          <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl">
            برای اینکه ورود به بازار رمزارز فقط با هیجان و توصیه دیگران شروع نشود
          </h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-[color:var(--tp-muted)]">
            بسیاری از افراد اولین تجربه خود در بازار رمزارز را بدون آموزش، بدون شناخت ریسک و تنها بر اساس توصیه‌های پراکنده آغاز می‌کنند. تک‌پی با این باور شکل گرفت که ورود به بازارهای مالی دیجیتال باید آگاهانه‌تر، امن‌تر و مسئولانه‌تر باشد.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["پلتفرم معاملات رمزارز", "خرید، فروش و مشاهده بازار در کنار تجربه‌ای ساده و قابل فهم."],
            ["آموزش قبل از تصمیم", "یادگیری مفاهیم پایه، امنیت، ابزارها و ریسک‌ها پیش از ورود جدی."],
            ["ارزیابی و تمرین", "آزمون‌های کوتاه و سناریوهای واقعی برای سنجش آمادگی کاربر."],
            ["ورود آگاهانه‌تر", "هدف تک‌پی معامله بیشتر نیست؛ تصمیم آگاهانه‌تر و امن‌تر است."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-[26px] border border-white/10 bg-slate-950/35 p-5">
              <HeartHandshake className="h-7 w-7 text-cyan-600 dark:text-cyan-300" />
              <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-slate-950 dark:text-white">{title}</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyUsersLoseSection() {
  const risks = [
    ["ورود بدون آموزش", "شروع معامله بدون شناخت مفاهیم پایه و ریسک‌ها."],
    ["تصمیم‌های هیجانی", "خرید و فروش بر اساس ترس، طمع یا موج شبکه‌های اجتماعی."],
    ["اعتماد به منابع نامعتبر", "پیروی از سیگنال‌ها، لینک‌ها و توصیه‌های ناشناس."],
    ["نبود مدیریت سرمایه", "استفاده از سرمایه نامناسب یا نداشتن برنامه خروج."],
  ];

  return (
    <section id="risk-awareness" className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/15 bg-white/[0.06] p-6 shadow-[0_24px_80px_rgba(0,0,0,.18)] backdrop-blur-xl dark:bg-white/[0.045] lg:p-8">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>چرا بسیاری از افراد در بازار ضرر می‌کنند؟</SectionLabel>
          <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl">
            مشکل فقط بازار نیست؛ گاهی مسیر ورود اشتباه است
          </h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-[color:var(--tp-muted)]">
            تک‌پی تلاش می‌کند قبل از معامله، مسیر یادگیری، تمرین و ارزیابی را در کنار دسترسی به بازار قرار دهد تا کاربر با آمادگی بیشتری تصمیم بگیرد.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {risks.map(([title, text]) => (
            <div key={title} className="rounded-[28px] border border-rose-200 dark:border-rose-300/15 bg-rose-50 dark:bg-rose-400/10 p-5">
              <TrendingDown className="h-7 w-7 text-rose-600 dark:text-rose-200" />
              <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-slate-950 dark:text-white">{title}</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-rose-700 dark:text-rose-100/85">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-[28px] border border-cyan-200 bg-cyan-50 dark:border-cyan-300/15 dark:bg-cyan-50 p-5 text-center dark:bg-cyan-300/10">
          <p className="text-base font-black leading-8 text-cyan-800 dark:text-cyan-800 dark:text-cyan-100">
            راهکار تک‌پی: یادگیری ← تمرین ← ارزیابی ← ورود آگاهانه
          </p>
        </div>
      </div>
    </section>
  );
}


function AcademyGrowthSystem() {
  const terms = [
    {
      term: "ترم ۱",
      title: "مبانی بلاکچین و رمزارز",
      lessons: ["بلاکچین چیست؟", "بیت‌کوین و تتر چه تفاوتی دارند؟", "کیف پول چیست؟", "چگونه از کلاهبرداری‌های رایج دور بمانیم؟"],
      exam: "آزمون ۱: آمادگی ورود به دنیای رمزارز",
      result: "پس از این ترم، مفاهیم پایه بازار را با زبان ساده می‌شناسید.",
    },
    {
      term: "ترم ۲",
      title: "امنیت حساب و نگهداری دارایی",
      lessons: ["رمز عبور امن", "ورود دومرحله‌ای", "فیشینگ و لینک‌های مشکوک", "اشتباهات امنیتی کاربران تازه‌وارد"],
      exam: "آزمون ۲: امنیت حساب و دارایی",
      result: "پس از این ترم، می‌توانید از حساب و دارایی دیجیتال خود بهتر محافظت کنید.",
    },
    {
      term: "ترم ۳",
      title: "کار با صرافی و معاملات اسپات",
      lessons: ["ثبت‌نام و احراز هویت", "مشاهده بازارها", "خرید و فروش ساده", "واریز، برداشت و انتخاب شبکه انتقال"],
      exam: "آزمون ۳: کار با صرافی و بازار اسپات",
      result: "پس از این ترم، مراحل پایه کار با یک پلتفرم رمزارزی را می‌شناسید.",
    },
    {
      term: "ترم ۴",
      title: "تحلیل تکنیکال مقدماتی",
      lessons: ["کندل‌خوانی", "روند، حمایت و مقاومت", "حجم معاملات", "RSI و MACD در سطح مقدماتی"],
      exam: "آزمون ۴: خواندن نمودار",
      result: "پس از این ترم، می‌توانید نمودار را بدون پیچیدگی‌های غیرضروری بهتر درک کنید.",
    },
    {
      term: "ترم ۵",
      title: "تحلیل فاندامنتال",
      lessons: ["تیم پروژه و وایت‌پیپر", "توکنومیکس", "داده‌های بازار", "اخبار کلان و ریسک‌های پروژه"],
      exam: "آزمون ۵: شناخت پروژه و ارزش‌گذاری اولیه",
      result: "پس از این ترم، می‌توانید درباره پروژه‌ها با دقت و احتیاط بیشتری تحقیق کنید.",
    },
    {
      term: "ترم ۶",
      title: "مدیریت سرمایه و روانشناسی معامله",
      lessons: ["ریسک هر معامله", "حد ضرر", "FOMO و تصمیم هیجانی", "ژورنال معاملاتی"],
      exam: "آزمون ۶: مدیریت ریسک و رفتار معامله‌گر",
      result: "پس از این ترم، یاد می‌گیرید قبل از سود، از سرمایه و آرامش ذهنی خود محافظت کنید.",
    },
    {
      term: "ترم ۷",
      title: "آمادگی ورود حرفه‌ای به بازار",
      lessons: ["مرور مسیر", "تمرین تصمیم‌گیری", "آزمون جامع", "آشنایی با آمادگی واقعی پیش از ورود"],
      exam: "آزمون نهایی: آمادگی ورود آگاهانه",
      result: "پس از این ترم، برای ادامه مسیر حرفه‌ای، مسیر رسمی و ارزیابی تکمیلی کاربران آماده‌تر آماده‌تر می‌شوید.",
    },
  ];

  return (
    <section id="academy-roadmap" className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>مسیر آموزشی آکادمی تک‌پی</SectionLabel>
          <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl lg:text-5xl">
            از آشنایی با بلاکچین تا ورود آگاهانه به بازار رمزارز
          </h2>
          <p className="mt-4 text-sm font-bold leading-8 text-[color:var(--tp-muted)] sm:text-base">
            در این مسیر، هر ترم یک هدف مشخص دارد: یاد می‌گیرید، چند نکته کلیدی را تمرین می‌کنید، در آزمون پایان ترم خودتان را می‌سنجید و برای مرحله بعد آماده می‌شوید.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          {terms.map((item, index) => (
            <article key={item.term} className="group relative overflow-hidden rounded-[30px] border border-cyan-200 bg-white/92 p-5 shadow-[0_18px_55px_rgba(15,23,42,.10)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-[0_24px_70px_rgba(34,211,238,.16)] dark:border-cyan-300/15 dark:bg-white/[0.055]">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full border border-cyan-300/20 bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700 dark:text-cyan-200">{item.term}</span>
                <BookMarked className="h-6 w-6 text-cyan-600 dark:text-cyan-300" />
              </div>
              <h3 className="mt-4 text-lg font-black leading-8 text-[color:var(--tp-text)]">{item.title}</h3>
              <ul className="mt-3 space-y-2">
                {item.lessons.map((lesson) => (
                  <li key={lesson} className="flex gap-2 text-sm font-bold leading-7 text-slate-600 dark:text-[color:var(--tp-muted)]">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
                    <span>{lesson}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-50 p-3 dark:bg-cyan-300/10">
                <p className="text-xs font-black leading-6 text-cyan-800 dark:text-cyan-800 dark:text-cyan-100">{item.exam}</p>
              </div>
              <p className="mt-3 text-xs font-bold leading-6 text-slate-600 dark:text-slate-300">{item.result}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <TermGateLink href={`/academy/term-${index + 1}#term-quiz`} termNumber={index + 1} className="rounded-2xl bg-cyan-500 px-3 py-2 text-center text-xs font-black text-white shadow-[0_10px_25px_rgba(6,182,212,.22)] transition hover:bg-cyan-400" lockedClassName="bg-slate-600 hover:bg-slate-600" locale="fa">آزمون ترم</TermGateLink>
                <TermGateLink href={`/academy/term-${index + 1}`} termNumber={index + 1} className="rounded-2xl border border-cyan-300/35 bg-white/70 px-3 py-2 text-center text-xs font-black text-slate-800 transition hover:border-cyan-400 dark:bg-white/10 dark:text-white" lockedClassName="border-slate-500 bg-slate-600/70 text-white" locale="fa">شروع آموزش</TermGateLink>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["آزمون پایان هر ترم", "در پایان هر ترم، چند سؤال کوتاه کمک می‌کند بفهمید مفاهیم اصلی را یاد گرفته‌اید یا نیاز به مرور دارید."],
            ["گواهینامه آکادمی", "گواهینامه مربوط به مسیر رسمی آکادمی آنلاین یا حضوری است و پس از تکمیل دوره و ارزیابی صادر می‌شود."],
            ["آمادگی واقعی پیش از ورود", "کاربران آماده‌تر می‌توانند برای آموزش تکمیلی، تمرین‌های تکمیلی و مسیر رسمی جداگانه بررسی شوند."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-[28px] border border-white/10 bg-slate-950/35 p-5">
              <ClipboardCheck className="h-7 w-7 text-cyan-600 dark:text-cyan-300" />
              <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-slate-950 dark:text-white">{title}</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
function TrustGrowthSignals() {
  const opportunities = [
    ["ادامه آموزش پیشرفته رایگان", "برای کاربرانی که مسیر را با امتیازهای بالا طی کنند، امکان معرفی به آموزش‌های تکمیلی رایگان فراهم می‌شود."],
    ["تمرین‌های کنترل‌شده آموزشی", "پس از ارزیابی و احراز آمادگی، کاربران آماده‌تر می‌توانند برای تمرین‌های کنترل‌شده آموزشی معرفی شوند."],
    ["گواهینامه آکادمی تک‌پی", "مسیر رسمی آکادمی برای دوره‌های آنلاین یا حضوری و پس از تکمیل مسیر رسمی آموزشی صادر می‌شود."],
    ["مسیر آموزشی تکمیلی ویژه کاربران آماده‌تر", "مسیر آموزشی تکمیلی برای کاربران آماده‌تر، پس از پایان مسیر کامل آکادمی و بر اساس شایستگی بررسی می‌شود."],
  ];

  return (
    <section className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/15 bg-white/[0.06] p-6 shadow-[0_24px_80px_rgba(0,0,0,.18)] backdrop-blur-xl dark:bg-white/[0.045] lg:p-8">
        <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-start">
          <div>
            <SectionLabel>آمادگی واقعی پیش از ورود</SectionLabel>
            <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl">
              آموزش برای همه رایگان است؛ هدف، آمادگی و تصمیم‌گیری مسئولانه است
            </h2>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-[color:var(--tp-muted)]">
              این لندینگ فقط مسیر یادگیری را معرفی می‌کند. برنامه‌های رسمی جداگانه، گواهی و مسیر آموزشی تکمیلی مربوط به نسخه رسمی آکادمی آنلاین یا حضوری است و پس از آزمون‌ها، ارزیابی و تکمیل مسیر آموزشی بررسی می‌شود.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {opportunities.map(([title, text]) => (
              <div key={title} className="rounded-[28px] border border-white/10 bg-slate-950/35 p-5">
                <Award className="h-7 w-7 text-cyan-600 dark:text-cyan-300" />
                <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-slate-950 dark:text-white">{title}</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CorporateAcademySection() {
  const items = [
    ["آموزش رایگان کارکنان", "سطح اول آکادمی برای کارکنان سازمان‌ها و شرکت‌ها قابل ارائه است."],
    ["آزمون و گزارش عملکرد", "مسیر یادگیری، امتیازها و آمادگی افراد به‌صورت مرحله‌ای قابل بررسی است."],
    ["شناسایی استعدادهای برتر", "کاربران آماده‌تر می‌توانند برای مسیر حرفه‌ای، مسیر آموزشی رسمی و مسیر آموزشی تکمیلی معرفی شوند."],
    ["فرهنگ‌سازی مالی", "سازمان‌ها می‌توانند سواد مالی و شناخت بازار رمزارز را با رویکرد امن توسعه دهند."],
  ];

  return (
    <section className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 rounded-[34px] border border-cyan-300/15 bg-white/[0.06] p-6 shadow-[0_24px_80px_rgba(0,0,0,.18)] backdrop-blur-xl dark:bg-white/[0.045] lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <SectionLabel>ویژه سازمان‌ها و شرکت‌ها</SectionLabel>
          <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl">آماده‌سازی کارکنان برای اقتصاد دیجیتال آینده</h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-[color:var(--tp-muted)]">آکادمی تک‌پی با آموزش مفاهیم بلاکچین، رمزارز، امنیت دیجیتال و مدیریت ریسک، مسیر آشنایی مسئولانه با بازارهای مالی دیجیتال را برای کارکنان سازمان‌ها و شرکت‌ها فراهم می‌کند.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map(([title, text]) => (
            <div key={title} className="rounded-[26px] border border-white/10 bg-slate-950/35 p-5">
              <Building2 className="h-7 w-7 text-cyan-600 dark:text-cyan-300" />
              <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-slate-950 dark:text-white">{title}</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}



function AcademyOfficialClarification() {
  return (
    <section id="official-academy-clarification" className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-amber-300/25 bg-amber-300/10 p-6 shadow-[0_24px_80px_rgba(0,0,0,.16)] backdrop-blur-xl lg:p-8">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>شفافیت آکادمی تک‌پی</SectionLabel>
          <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl">
            تفاوت مسیر رایگان و آکادمی رسمی تک‌پی
          </h2>
          <p className="mt-4 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">
            مسیر رایگان داخل سایت برای افزایش آگاهی، سنجش اولیه و آماده‌سازی ذهنی کاربران طراحی شده است. دوره‌های تکمیلی یا گواهینامه رسمی فقط در برنامه‌های جداگانه آنلاین یا حضوری آکادمی تک‌پی تعریف می‌شوند و جزو مسیر لندینگ رایگان نیستند.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-[28px] border border-cyan-300/15 bg-white/90 p-5 shadow-sm dark:bg-white/[0.055]">
            <h3 className="text-xl font-black text-slate-950 dark:text-white">مسیر رایگان داخل سایت</h3>
            <ul className="mt-4 space-y-3 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">
              {["آموزش مقدماتی", "آزمون‌های مرحله‌ای", "سنجش اولیه دانش", "آشنایی با بازار رمزارز", "آمادگی برای تصمیم مسئولانه‌تر"].map((item) => (
                <li key={item} className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-500" />{item}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-[28px] border border-amber-300/25 bg-white/90 p-5 shadow-sm dark:bg-white/[0.055]">
            <h3 className="text-xl font-black text-slate-950 dark:text-white">آکادمی رسمی تک‌پی</h3>
            <ul className="mt-4 space-y-3 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">
              {["کلاس آنلاین یا حضوری", "مدرس و منتور", "تمرین، پروژه و ارزیابی تکمیلی", "گواهینامه رسمی آکادمی", "برنامه کاربران آماده‌تر و فرصت‌های آموزشی ویژه"].map((item) => (
                <li key={item} className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-amber-500" />{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-6 rounded-3xl border border-rose-300/20 bg-rose-50 p-4 text-center text-sm font-black leading-8 text-rose-800 dark:bg-rose-400/10 dark:text-rose-100">
          تکمیل مسیر رایگان آکادمی به‌تنهایی موجب دریافت مسیر آموزشی تکمیلی، مسیر آموزشی رسمی، استخدام یا گواهینامه رسمی نمی‌شود.
        </p>
      </div>
    </section>
  );
}


function LearningExperienceSystem() {
  const cards = [
    { icon: PlayCircle, title: "درس کوتاه", text: "هر درس روی یک موضوع مشخص تمرکز دارد؛ مثل تتر، کیف پول، فیشینگ یا حد ضرر." },
    { icon: PenLine, title: "سؤال سریع", text: "بعد از هر درس، یک سؤال ساده کمک می‌کند مطمئن شوید نکته اصلی را فهمیده‌اید." },
    { icon: ShieldAlert, title: "تمرین موقعیت واقعی", text: "با موقعیت‌هایی مثل لینک مشکوک، ریزش بازار یا انتخاب شبکه انتقال روبه‌رو می‌شوید." },
    { icon: ClipboardCheck, title: "آزمون پایان ترم", text: "در پایان هر ترم، آزمون کوتاه نشان می‌دهد برای مرحله بعد آماده هستید یا بهتر است مرور کنید." },
  ];

  return (
    <section id="learning-experience" className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/15 bg-white/[0.06] p-6 shadow-[0_24px_80px_rgba(0,0,0,.18)] backdrop-blur-xl dark:bg-white/[0.045] lg:p-8">
        <div className="grid gap-8 lg:grid-cols-[.78fr_1.22fr] lg:items-start">
          <div>
            <SectionLabel>روش یادگیری در تک‌پی</SectionLabel>
            <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl">
              یادگیری ساده، مرحله‌ای و قابل لمس
            </h2>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-[color:var(--tp-muted)]">
              قرار نیست از همان روز اول وارد اصطلاحات سنگین شوید. در تک‌پی ابتدا مفاهیم پایه را می‌فهمید، بعد تمرین می‌کنید، سپس با آزمون کوتاه میزان آمادگی خود را می‌سنجید.
            </p>
            <div className="mt-5 rounded-3xl border border-cyan-200 bg-cyan-50 dark:border-cyan-300/15 dark:bg-cyan-300/10 p-4">
              <p className="text-sm font-black leading-7 text-cyan-800 dark:text-cyan-100">
                مسیر پیشنهادی: درس کوتاه ← سؤال سریع ← تمرین موقعیت واقعی ← آزمون پایان ترم ← آمادگی برای مرحله بعد
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {cards.map((item) => (
              <div key={item.title} className="rounded-[28px] border border-white/10 bg-slate-950/35 p-5">
                <div className="flex h-13 w-13 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300">
                  <item.icon className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
function SeoGeoSection() {
  const cards = [
    { icon: BookOpen, title: "آکادمی تک‌پی", desc: "مقالات آموزشی درباره خرید تتر، بیت‌کوین، امنیت حساب، کارمزد و شروع معامله برای تصمیم‌گیری بهتر." },
    { icon: LineChart, title: "صفحات قیمت رمزارز", desc: "صفحات آموزشی و قیمتی برای رمزارزهای پرجست‌وجو مثل بیت‌کوین، تتر، اتریوم و تون‌کوین." },
    { icon: Globe2, title: "پاسخ‌گویی هوشمند", desc: "پرسش‌وپاسخ‌های کوتاه و روشن برای سوالاتی که قبل از ثبت‌نام در ذهن کاربر شکل می‌گیرد." },
  ];
  return (
    <section id="seo-geo" className="bg-[color:var(--tp-bg)] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>راهنمای شروع و تصمیم‌گیری</SectionLabel>
          <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl lg:text-5xl">در تک‌پی، قیمت‌ها، آموزش و مسیر شروع باید روشن و قابل اعتماد باشند</h2>
          <p className="mt-4 text-base leading-8 text-slate-600 dark:text-[color:var(--tp-muted)]">قبل از معامله، با مفاهیم پایه، ریسک‌ها، امنیت حساب، کارمزدها و روش شروع آشنا شوید تا تصمیم آگاهانه‌تری بگیرید.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <div key={card.title} className="rounded-3xl border border-[color:var(--tp-border)] bg-white/[0.06] p-6 text-center shadow-[0_18px_55px_rgba(0,0,0,.14)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-[0_24px_70px_rgba(34,211,238,.15)] dark:bg-white/[0.045]">
              <card.icon className="mx-auto h-9 w-9 text-[color:var(--tp-primary)]" />
              <h3 className="mt-4 text-xl font-black text-[color:var(--tp-text)]">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-[color:var(--tp-muted)]">{card.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <Link href="/academy" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--tp-primary)] px-6 py-4 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5">
            ورود به آکادمی رایگان تک‌پی
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}


function GrowthLinks() {
  const links = [
    { href: "/academy", title: "آکادمی تک‌پی", desc: "مقالات آموزشی برای خرید تتر، بیت‌کوین، امنیت و شروع معامله." },
    { href: "/glossary", title: "واژه‌نامه رمزارز", desc: "توضیح ساده اصطلاحات مهم بازار رمزارز." },
    { href: "/compare", title: "مقایسه صرافی‌ها", desc: "راهنمای مقایسه و انتخاب آگاهانه صرافی." },
    { href: "/faq", title: "پایگاه سوالات پرتکرار", desc: "پاسخ‌های روشن برای سوالات پرتکرار کاربران." },
  ];

  return (
    <section className="bg-[color:var(--tp-surface)] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>راهنمای کاربران تازه‌وارد</SectionLabel>
          <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl lg:text-5xl">
            با آموزش رایگان، مسیر ورود امن به بازار رمزارز را شروع کنید
          </h2>
          <p className="mt-4 text-base leading-8 text-slate-600 dark:text-[color:var(--tp-muted)]">
            اگر تازه وارد بازار رمزارز شده‌اید، این بخش‌ها کمک می‌کنند مفاهیم پایه، کارمزدها، امنیت حساب و مسیر خرید را ساده‌تر و سریع‌تر بشناسید.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {links.map((item) => (
            <Link key={item.href} href={item.href} className="group rounded-3xl border border-[color:var(--tp-border)] bg-white/[0.06] p-6 shadow-[0_18px_55px_rgba(0,0,0,.14)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-[0_24px_70px_rgba(34,211,238,.15)] dark:bg-white/[0.045]">
              <h3 className="text-xl font-black text-[color:var(--tp-text)]">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-[color:var(--tp-muted)]">{item.desc}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[color:var(--tp-primary)]">
                مشاهده
                <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}


function Faq() {
  const [open, setOpen] = useState(0);
  const faqs = useMemo(() => [
    ["آیا آموزش‌های آکادمی تک‌پی رایگان است؟", "بله. مسیر آموزشی آکادمی تک‌پی برای همه کاربران رایگان است؛ از مبانی رمزارز و کار با صرافی تا تحلیل تکنیکال، تحلیل فاندامنتال، مدیریت ریسک و روانشناسی بازار."],
    ["چرا تک‌پی آموزش را رایگان ارائه می‌کند؟", "چون تک‌پی می‌خواهد نقطه امن ورود به بازار رمزارز باشد. کاربر آگاه، هم تصمیم‌های بهتری می‌گیرد و هم کامیونیتی حرفه‌ای‌تری برای آینده تک‌پی می‌سازد."],
    ["آیا همه کاربران مسیر آموزشی تکمیلی دریافت می‌کنند؟", "خیر. آموزش برای همه رایگان است؛ اما فرصت‌هایی مثل مسیر آموزشی رسمی، مسیر آموزشی تکمیلی و مسیر ویژه بر اساس آزمون‌ها، امتیازهای بالا و شایستگی دانشجو فعال می‌شود."],
    ["این دوره برای کارمندان و افراد کاملاً مبتدی مناسب است؟", "بله. مسیر از صفر شروع می‌شود: ابزارهای ضروری، ثبت‌نام در سایت‌های حیاتی، امنیت حساب، کار با صرافی، شناخت بازار و سپس تحلیل و مدیریت ریسک."],
    ["تک‌پی چه تفاوتی با دوره‌های معمولی ترید دارد؟", "تک‌پی فقط تحلیل تکنیکال آموزش نمی‌دهد؛ مسیر کامل ورود امن، آموزش رایگان، ارزیابی، کامیونیتی، مسیر رسمی، مسیر آموزشی رسمی و مسیر آموزشی تکمیلی برای کاربران آماده‌تر را ارائه می‌کند."],
  ], []);
  return (
    <section className="bg-[color:var(--tp-surface)] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.75fr_1.25fr]">
        <div>
          <SectionLabel>پرسش‌های مهم قبل از شروع</SectionLabel>
          <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl">سوالاتی که قبل از ورود به بازار رمزارز باید پاسخ داده شوند</h2>
        </div>
        <div className="space-y-3">
          {faqs.map(([q, a], i) => (
            <div key={q} className="overflow-hidden rounded-3xl border border-[color:var(--tp-border)] bg-white/[0.06] backdrop-blur-xl dark:bg-white/[0.045]">
              <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-4 px-5 py-5 text-right text-base font-black text-[color:var(--tp-text)]">
                {q}
                <ChevronLeft className={`h-5 w-5 text-[color:var(--tp-primary)] transition ${open === i ? "-rotate-90" : ""}`} />
              </button>
              {open === i && <p className="px-5 pb-5 text-sm leading-8 text-slate-600 dark:text-[color:var(--tp-muted)]">{a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-[color:var(--tp-bg)] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[36px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.35),transparent_30%),linear-gradient(135deg,#07111f,#0f172a)] px-6 py-10 text-center shadow-2xl shadow-cyan-500/10 sm:px-10 lg:px-16 lg:py-16">
        <Image src="/images/tecpey-logo.png" alt="TecPey" width={74} height={74} className="mx-auto h-16 w-16 object-contain" />
        <h2 className="mx-auto mt-6 max-w-3xl text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">تک‌پی، نقطه امن ورود به بازار رمزارز</h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-8 text-white/70 sm:text-base">آموزش‌های رایگان آکادمی را شروع کنید، بازار زنده را ببینید، در آزمون‌ها امتیاز بگیرید و اگر جزو کاربران آماده‌تر باشید، وارد مسیر حرفه‌ای تک‌پی شوید.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="https://my.tecpey.ir/signup" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-black text-slate-950 transition hover:-translate-y-0.5">
            شروع معامله
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Link href="https://my.tecpey.ir/signin" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-6 py-4 text-sm font-black text-white backdrop-blur transition hover:bg-white/15">
            ورود کاربران
          </Link>
        </div>
      </div>
    </section>
  );
}

function StickyMobileCta() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/92 px-4 py-3 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl sm:hidden">
      <div className="mx-auto flex max-w-md items-center gap-2">
        <Link href={freeAcademyHref} className="flex-1 rounded-2xl bg-[color:var(--tp-primary)] px-4 py-3.5 text-center text-xs font-black text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110">
          ورود به آکادمی رایگان
        </Link>
      </div>
    </div>
  );
}

export default function TecpeyEnterpriseLanding() {
  return (
    <main className="tecpey-enterprise min-h-screen bg-[color:var(--tp-bg)] pb-24 sm:pb-0">
      <Hero />
      <CryptoNewsCenter locale="fa" compact />
      <HomeAiMentorSpotlight locale="fa" />
      <HomeLearningJourney locale="fa" />
      <GlobalUxMetrics />
      <ProofRail />
      <WhyTecpeyTrust />
      <TecpeyEcosystemFlow />
      <TrustStackGlobal />
      <WhyTecpeyWasCreated />
      <WhyUsersLoseSection />
      <ConversionJourney />
      <AcademyGrowthSystem />
      <AcademyOfficialClarification />
      <section className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl rounded-[30px] border border-cyan-300/15 bg-cyan-300/10 p-6 text-center"><h2 className="text-2xl font-black text-[color:var(--tp-text)]">مرکز دانش: جعبه ابزار معامله‌گر</h2><p className="mt-3 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">برای خروج از سردرگمی، ابزارهای کاربردی تحلیل، مدیریت ریسک، اخبار، آنچین و بررسی پروژه‌ها را به زبان ساده یاد بگیرید.</p><a href="/trading-tools" className="mt-5 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">مشاهده ابزارهای ترید</a></div></section>
      <LearningExperienceSystem />
      <TrustGrowthSignals />
      <CorporateAcademySection />
      
      <ResponsiveShowcase />
      <BrandContentSystem />
      <SeoGeoSection />
      <GrowthLinks />
      <Faq />
      <FinalCta />
      <StickyMobileCta />
    </main>
  );
}
