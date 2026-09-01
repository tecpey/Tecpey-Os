"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Flame, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import type { GrowthTrendRadarAuthority } from "@/lib/growth-trend-authority";
import type { RankedTrendEntity, TrendWindow } from "@/lib/growth-trend-intelligence";
import { coinSlugForSymbol } from "@/lib/news-taxonomy";

const WINDOWS: TrendWindow[] = ["24h", "7d", "30d"];

function entityHref(entity: RankedTrendEntity, locale: "fa" | "en") {
  const prefix = locale === "en" ? "/en" : "";
  if (entity.entityType === "tool") return `${prefix}/trading-tools/${entity.entityId}`;
  if (entity.entityType === "coin") {
    const slug = coinSlugForSymbol(entity.entityId.toUpperCase());
    return slug ? `${prefix}/coins/${slug}` : `${prefix}/coins`;
  }
  return `${prefix}/crypto-news?tag=${encodeURIComponent(entity.entityId)}`;
}

function tierCopy(tier: RankedTrendEntity["tier"], locale: "fa" | "en") {
  if (locale === "en") return tier === "breakout" ? "Breakout" : tier === "sustained" ? "Sustained" : tier === "emerging" ? "Emerging" : "Watch";
  return tier === "breakout" ? "جهش معتبر" : tier === "sustained" ? "روند پایدار" : tier === "emerging" ? "در حال رشد" : "زیر نظر";
}

export function TrendRadarWidget({ data, locale }: { data: GrowthTrendRadarAuthority; locale: "fa" | "en" }) {
  const [window, setWindow] = useState<TrendWindow>("24h");
  const isFa = locale === "fa";
  const selected = data.radar.windows[window];
  const groups = useMemo(() => [
    { key: "coins", title: isFa ? "کوین‌های ترند" : "Trending coins", icon: Flame, items: selected.coins },
    { key: "tools", title: isFa ? "ابزارهای ترند" : "Trending tools", icon: Wrench, items: selected.tools },
    { key: "topics", title: isFa ? "موضوعات داغ" : "Trending topics", icon: Sparkles, items: selected.topics },
  ], [isFa, selected]);
  const highlights = data.news[window].slice(0, 4);
  const coverage = [
    { key: "market", label: isFa ? "بازار" : "Market", ready: data.radar.evidence.marketCoverage },
    { key: "news", label: isFa ? "خبر" : "News", ready: data.radar.evidence.newsCoverage },
    { key: "social", label: isFa ? "سوشال" : "Social", ready: data.radar.evidence.socialCoverage },
    { key: "search", label: isFa ? "جست‌وجو" : "Search", ready: data.radar.evidence.searchCoverage },
  ];
  const Arrow = isFa ? ArrowLeft : ArrowRight;

  return (
    <section aria-labelledby="tecpey-trend-radar-title" className="px-4 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px] overflow-hidden rounded-[34px] border border-cyan-300/20 bg-slate-950/92 text-white shadow-[0_24px_90px_rgba(8,145,178,.16)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-black text-cyan-100">
              <Activity className="h-4 w-4" aria-hidden="true" />
              {isFa ? "TecPey Trend Intelligence" : "TecPey Trend Intelligence"}
            </div>
            <h2 id="tecpey-trend-radar-title" className="mt-3 text-2xl font-black sm:text-3xl">
              {isFa ? "رادار ترند بازار و کامیونیتی" : "Market & community trend radar"}
            </h2>
            <p className="mt-2 max-w-3xl text-xs font-bold leading-6 text-slate-300 sm:text-sm">
              {isFa
                ? "رتبه‌بندی چندمنبعی با تأیید متقاطع خبر، بازار، وب و سوشال؛ سیگنال‌های تک‌منبعی و مستعد پامپ عمداً تنزل رتبه می‌گیرند."
                : "Multi-source ranking across news, market, web and social evidence. Single-source and pump-prone signals are deliberately down-ranked."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2" aria-label={isFa ? "پوشش منابع رادار" : "Radar source coverage"}>
              {coverage.map((item) => (
                <span
                  key={item.key}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${item.ready ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200" : "border-amber-300/20 bg-amber-300/5 text-amber-100"}`}
                >
                  {item.label} · {item.ready ? (isFa ? "فعال" : "covered") : (isFa ? "در انتظار داده" : "awaiting data")}
                </span>
              ))}
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${data.radar.status === "healthy" ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-amber-300/20 bg-amber-300/5 text-amber-100"}`}>
                {isFa ? "کیفیت شواهد" : "Evidence quality"} · {data.radar.status === "healthy" ? (isFa ? "کامل" : "healthy") : (isFa ? "محدود" : "degraded")}
              </span>
            </div>
          </div>
          <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.05] p-1" role="tablist" aria-label={isFa ? "بازه ترند" : "Trend window"}>
            {WINDOWS.map((value) => (
              <button key={value} type="button" role="tab" aria-selected={window === value} onClick={() => setWindow(value)} className={`rounded-xl px-4 py-2 text-xs font-black transition ${window === value ? "bg-cyan-500 text-white" : "text-slate-300 hover:bg-white/10"}`}>
                {value === "24h" ? (isFa ? "۲۴ ساعت" : "24h") : value === "7d" ? (isFa ? "۷ روز" : "7d") : (isFa ? "۳۰ روز" : "30d")}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-[1.55fr_.85fr]">
          <div className="grid gap-4 md:grid-cols-3">
            {groups.map(({ key, title, icon: Icon, items }) => (
              <div key={key} className="rounded-[26px] border border-white/10 bg-white/[0.045] p-4">
                <h3 className="flex items-center gap-2 text-sm font-black"><Icon className="h-4 w-4 text-cyan-300" aria-hidden="true" />{title}</h3>
                <div className="mt-4 space-y-2">
                  {items.length ? items.slice(0, 6).map((item, index) => (
                    <Link key={`${item.entityType}:${item.entityId}`} href={entityHref(item, locale)} className="group flex items-center gap-3 rounded-2xl border border-white/8 bg-black/15 p-3 transition hover:border-cyan-300/30 hover:bg-cyan-300/10">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-xs font-black text-cyan-200">{index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">{item.label}</span>
                        <span className="mt-1 block text-[10px] font-bold text-slate-400">{tierCopy(item.tier, locale)} · {item.evidence.sourceFamilies.length} {isFa ? "خانواده منبع" : "source families"}</span>
                      </span>
                      <span className="text-sm font-black text-cyan-300">{item.score}</span>
                    </Link>
                  )) : <p className="rounded-2xl border border-white/8 p-3 text-xs font-bold text-slate-400">{isFa ? "هنوز شواهد چندمنبعی کافی نیست." : "Not enough multi-source evidence yet."}</p>}
                </div>
              </div>
            ))}
          </div>

          <aside className="rounded-[26px] border border-cyan-300/15 bg-cyan-300/[0.06] p-4">
            <h3 className="flex items-center gap-2 text-sm font-black"><ShieldCheck className="h-4 w-4 text-cyan-300" aria-hidden="true" />{isFa ? "خبرهای مهم همین بازه" : "Important news in this window"}</h3>
            <div className="mt-4 space-y-2">
              {highlights.length ? highlights.map((item) => (
                <Link key={item.id} href={item.newsUrl ?? `${isFa ? "" : "/en"}/crypto-news?date=${encodeURIComponent(item.day)}`} className="group block rounded-2xl border border-white/10 bg-black/15 p-3 transition hover:border-cyan-300/30">
                  <p className="line-clamp-2 text-xs font-black leading-6 text-white">{item.title}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-bold text-slate-400"><span>{item.sourceName}</span><span>{isFa ? "اثر" : "Impact"} {item.impactScore}/10</span></div>
                </Link>
              )) : <p className="text-xs font-bold leading-6 text-slate-400">{isFa ? "خبر آرشیوشده کافی برای این بازه هنوز موجود نیست." : "No archived news evidence is available for this window yet."}</p>}
            </div>
            <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/5 p-3 text-[10px] font-bold leading-5 text-amber-100">
              {isFa ? "ترند بودن به معنی فرصت خرید نیست؛ رادار برای کشف موضوع و تحقیق ساخته شده، نه سیگنال معامله." : "Trending does not mean buy. This radar is for discovery and research, not trading signals."}
            </div>
            <Link href={isFa ? "/crypto-news" : "/en/crypto-news"} className="mt-4 inline-flex items-center gap-2 text-xs font-black text-cyan-200">{isFa ? "باز کردن مرکز اخبار" : "Open News Center"}<Arrow className="h-4 w-4" aria-hidden="true" /></Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
