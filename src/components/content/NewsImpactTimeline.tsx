import Link from "next/link";
import { Clock3, Newspaper, ShieldAlert, TrendingUp } from "lucide-react";
import {
  formatNewsImpactDateTime,
  getNewsImpactDetailPath,
  type NewsImpactHistoryItem,
} from "@/lib/news-impact-history";
import type { ContentLocale } from "@/lib/content-growth";

function toneLabel(tone: NewsImpactHistoryItem["tone"], locale: ContentLocale) {
  if (locale === "fa") {
    if (tone === "bullish") return "مثبت";
    if (tone === "bearish") return "منفی";
    if (tone === "risk") return "ریسک";
    return "خنثی";
  }
  if (tone === "bullish") return "Bullish";
  if (tone === "bearish") return "Bearish";
  if (tone === "risk") return "Risk";
  return "Neutral";
}

function toneClass(tone: NewsImpactHistoryItem["tone"]) {
  if (tone === "bullish") return "border-emerald-300/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (tone === "bearish") return "border-rose-300/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  if (tone === "risk") return "border-amber-300/35 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-cyan-300/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200";
}

export function NewsImpactTimeline({
  items,
  locale,
  subject,
}: {
  items: NewsImpactHistoryItem[];
  locale: ContentLocale;
  subject: string;
}) {
  const isFa = locale === "fa";

  return (
    <section className="mt-8 rounded-[32px] border border-cyan-300/15 bg-white/82 p-5 shadow-xl shadow-cyan-500/5 dark:bg-white/[0.045] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-700 dark:text-cyan-100">
            <Newspaper className="h-4 w-4" aria-hidden="true" />
            {isFa ? "هیستوری خبرهای اثرگذار" : "High-priority news history"}
          </div>
          <h2 className="mt-4 text-2xl font-black leading-9 text-[color:var(--tp-text)]">
            {isFa ? `خبرهایی که روی اولویت ${subject} اثر گذاشته‌اند` : `News that affected ${subject} priority`}
          </h2>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-8 text-[color:var(--tp-muted)]">
            {isFa
              ? "هر خبری که در ranking تک‌پی اثر جدی داشته باشد، با زمان انتشار و زمان ثبت داخلی اینجا نگه داشته می‌شود تا کاربر دلیل برجسته شدن ابزار یا کوین را ببیند."
              : "News that materially affects TecPey ranking is preserved here with publish time and TecPey record time so users can see why a tool or coin is highlighted."}
          </p>
        </div>
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-700 dark:text-cyan-100">
          {isFa ? `${items.length} خبر با اولویت بالا` : `${items.length} high-priority items`}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-[26px] border border-slate-200 bg-slate-50 p-5 text-sm font-bold leading-8 text-slate-600 dark:border-white/10 dark:bg-slate-950/35 dark:text-slate-300">
          {isFa
            ? "فعلاً خبر اثرگذار با اولویت بالا برای این صفحه ثبت نشده است. بعد از اتصال کامل خبرخوان و موتور ranking، این بخش به صورت پویا پر می‌شود."
            : "No high-priority impact news is recorded for this page yet. This section will be populated dynamically after the full news-ranking pipeline is connected."}
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {items.map((item) => (
            <article key={item.id} className="rounded-[26px] border border-cyan-300/15 bg-cyan-500/[0.055] p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${toneClass(item.tone)}`}>
                      {toneLabel(item.tone, locale)}
                    </span>
                    <span className="rounded-full border border-cyan-300/20 bg-white/70 px-3 py-1 text-[11px] font-black text-cyan-700 dark:bg-white/5 dark:text-cyan-100">
                      {isFa ? "اولویت" : "Priority"} {item.priority}/100
                    </span>
                    <span className="rounded-full border border-cyan-300/20 bg-white/70 px-3 py-1 text-[11px] font-black text-cyan-700 dark:bg-white/5 dark:text-cyan-100">
                      {isFa ? "اثر" : "Impact"} {item.impactScore}/10
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-black leading-8 text-[color:var(--tp-text)]">{item.title}</h3>
                  <p className="mt-2 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">{item.summary}</p>
                  <p className="mt-3 rounded-2xl border border-cyan-300/15 bg-white/70 p-3 text-xs font-black leading-6 text-slate-700 dark:bg-white/5 dark:text-slate-200">
                    {isFa ? item.reasonFa : item.reasonEn}
                  </p>
                </div>
                <Link
                  href={getNewsImpactDetailPath(item)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-600 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  {isFa ? "مشاهده زمینه خبر" : "Open context"}
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>

              <div className="mt-4 grid gap-3 text-xs font-black text-slate-600 dark:text-slate-300 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
                  <span className="flex items-center gap-2 text-cyan-700 dark:text-cyan-100">
                    <Clock3 className="h-4 w-4" aria-hidden="true" />
                    {isFa ? "انتشار" : "Published"}
                  </span>
                  <time className="mt-2 block" dateTime={item.publishedAt}>
                    {formatNewsImpactDateTime(item.publishedAt, locale)}
                  </time>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
                  <span className="flex items-center gap-2 text-cyan-700 dark:text-cyan-100">
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    {isFa ? "ثبت در تک‌پی" : "Recorded by TecPey"}
                  </span>
                  <time className="mt-2 block" dateTime={item.recordedAt}>
                    {formatNewsImpactDateTime(item.recordedAt, locale)}
                  </time>
                </div>
                <a
                  href={item.sourceUrl}
                  target={item.sourceUrl.startsWith("http") ? "_blank" : undefined}
                  rel={item.sourceUrl.startsWith("http") ? "noreferrer" : undefined}
                  className="rounded-2xl border border-slate-200 bg-white/70 p-3 text-cyan-700 dark:border-white/10 dark:bg-white/5 dark:text-cyan-100"
                >
                  <span className="block text-slate-500 dark:text-slate-400">{isFa ? "منبع" : "Source"}</span>
                  <span className="mt-2 block">{item.sourceName}</span>
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
