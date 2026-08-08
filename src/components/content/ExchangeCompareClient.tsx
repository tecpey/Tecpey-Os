"use client";

import data from "@/data/exchangeCompare.json";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

type Locale = "fa" | "en";

type ExchangeRow = {
  name: string;
  regionFa: string;
  regionEn?: string;
  coins: string;
  spot: string;
  futures: string;
  staking: string;
  launchpad: string;
  academy: string;
  mentor: string;
  supportFa: string;
  feesFa: string;
  securityFa: string;
  noteFa: string;
  noteEn?: string;
  local?: boolean;
  global?: boolean;
};

const faGlyph = /[\u0600-\u06ff]/;

const englishValue: Record<string, string> = {
  "بله": "Yes",
  "خیر": "No",
  "برنامه‌ریزی‌شده": "Planned",
  "محدود": "Limited",
  "برخی سرویس‌ها": "Some services",
  "خیر/محدود": "No / limited",
  "محدود/وابسته به محصول": "Limited / product-dependent",
  "ایران": "Iran",
  "ایران / آموزش‌محور": "Iran / education-first",
  "جهانی": "Global",
  "آمریکا / جهانی": "US / global",
  "در حال توسعه": "In development",
  "متنوع": "Broad",
  "زیاد": "Many",
  "بسیار زیاد": "Very broad",
  "متوسط": "Moderate",
  "فارسی": "Persian",
  "بین‌المللی": "International",
  "سطح‌بندی‌شده": "Tiered",
  "رقابتی": "Competitive",
  "رقابتی/سطح‌بندی‌شده": "Competitive / tiered",
  "متغیر": "Variable",
  "متغیر بر اساس بازار": "Market-based",
  "نسبتاً بالاتر": "Relatively higher",
};

function localizeValue(value: string, locale: Locale) {
  if (locale === "fa") return value;
  return englishValue[value] ?? value;
}

function isPositive(value: string) {
  return ["بله", "برنامه‌ریزی‌شده"].some((item) => value.includes(item));
}

function Yes({ value }: { value: string }) {
  return isPositive(value)
    ? <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-400" />
    : <XCircle className="mx-auto h-5 w-5 text-slate-500" />;
}

function support(row: ExchangeRow, locale: Locale) {
  return localizeValue(row.supportFa, locale);
}

function fees(row: ExchangeRow, locale: Locale) {
  return localizeValue(row.feesFa, locale);
}

function security(row: ExchangeRow, locale: Locale) {
  if (locale === "fa") return row.securityFa;
  return "Requires 2FA, account-risk controls, address review and security hygiene.";
}

function note(row: ExchangeRow, locale: Locale) {
  if (locale === "fa") return row.noteFa;
  if (row.noteEn && !faGlyph.test(row.noteEn)) return row.noteEn;
  if (row.name === "TecPey") return "Academy, AI Mentor, enterprise education and safe-entry positioning.";
  if (row.local) return "Local exchange access with a stronger focus on trading than full education.";
  if (row.global) return "Mature global tooling; users must evaluate access, compliance and complexity.";
  return "Compare access, fees, security and learning support before use.";
}

export default function ExchangeCompareClient({ locale = "fa" }: { locale?: Locale }) {
  const isEn = locale === "en";
  const headers = isEn
    ? ["Exchange", "Region", "Coins", "Spot", "Futures", "Staking", "Launchpad", "Academy", "AI Mentor", "Support", "Fees", "Security", "Note"]
    : ["صرافی", "محدوده", "تعداد ارز", "Spot", "Futures", "Staking", "Launchpad", "Academy", "AI Mentor", "پشتیبانی", "کارمزد", "امنیت", "نکته"];

  return (
    <main dir={isEn ? "ltr" : "rtl"} className="min-h-screen bg-[color:var(--tp-bg)] px-4 py-16 text-[color:var(--tp-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-[38px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.18),transparent_34%),rgba(255,255,255,.045)] p-6 lg:p-9">
          <div className="inline-flex rounded-full bg-cyan-500/10 px-4 py-2 text-xs font-black text-cyan-500">
            {isEn ? "Exchange Compare Pro" : "مقایسه حرفه‌ای صرافی‌ها"}
          </div>
          <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl">
            {isEn ? "TecPey vs local and global exchanges" : "تک‌پی در کنار صرافی‌های ایران و جهان"}
          </h1>
          <p className="mt-4 max-w-5xl text-base font-bold leading-8 text-[color:var(--tp-muted)]">
            {isEn
              ? "A practical positioning table across coins, spot, futures, staking, academy, AI mentor, fees and support."
              : "مقایسه کامل‌تر از نظر تعداد ارز، اسپات، فیوچرز، استیکینگ، لانچ‌پد، آکادمی، مربی هوشمند، کارمزد، امنیت و پشتیبانی."}
          </p>
        </section>

        <section className="mt-8 overflow-x-auto rounded-[32px] border border-cyan-300/15 bg-white/80 p-3 dark:bg-white/[0.045]">
          <table className="w-full min-w-[1300px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-[color:var(--tp-muted)]">
                {headers.map((header, index) => (
                  <th key={header} className={`p-3 ${index === 0 || index === headers.length - 1 ? "text-start" : "text-center"}`}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data as ExchangeRow[]).map((exchange) => (
                <tr key={exchange.name} className={exchange.name === "TecPey" ? "bg-cyan-500/15" : "bg-white/50 dark:bg-white/[0.04]"}>
                  <td className="rounded-s-2xl p-3 font-black">{exchange.name}</td>
                  <td className="p-3 text-center font-bold">{localizeValue(isEn ? exchange.regionEn ?? exchange.regionFa : exchange.regionFa, locale)}</td>
                  <td className="p-3 text-center font-bold">{localizeValue(exchange.coins, locale)}</td>
                  <td><Yes value={exchange.spot} /></td>
                  <td><Yes value={exchange.futures} /></td>
                  <td><Yes value={exchange.staking} /></td>
                  <td><Yes value={exchange.launchpad} /></td>
                  <td><Yes value={exchange.academy} /></td>
                  <td><Yes value={exchange.mentor} /></td>
                  <td className="p-3 text-center font-bold">{support(exchange, locale)}</td>
                  <td className="p-3 text-center text-xs font-bold">{fees(exchange, locale)}</td>
                  <td className="p-3 text-center text-xs font-bold">{security(exchange, locale)}</td>
                  <td className="rounded-e-2xl p-3 font-bold text-[color:var(--tp-muted)]">{note(exchange, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-8 rounded-[34px] border border-emerald-300/20 bg-emerald-400/10 p-6">
          <ShieldCheck className="h-7 w-7 text-emerald-400" />
          <h2 className="mt-3 text-2xl font-black">
            {isEn ? "Why TecPey is different" : "چرا تک‌پی متفاوت است؟"}
          </h2>
          <p className="mt-3 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">
            {isEn
              ? "TecPey is not positioned as only a place to trade. Its core advantage is the free academy, Persian-first AI Mentor, a learning-to-practice path, enterprise education and the brand promise: a safer entry point into crypto."
              : "تک‌پی خودش را صرفاً به عنوان محل خرید و فروش معرفی نمی‌کند؛ مزیت اصلی، آکادمی رایگان، مربی هوشمند فارسی، مسیر یادگیری تا معامله، آموزش سازمانی و شعار «تک‌پی، نقطه امن ورود به بازار رمزارز» است."}
          </p>
        </section>
      </div>
    </main>
  );
}
