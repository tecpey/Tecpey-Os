"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Search, Tags } from "lucide-react";
import type { NewsArchiveItem } from "@/lib/news-growth-authority";
import { newsTaxonomyTagLabel } from "@/lib/news-taxonomy";

type ArchiveResponse = { day: string; today: string; items: NewsArchiveItem[]; availableDays: string[] };

function tagList(item: NewsArchiveItem): string[] {
  return Array.from(new Set([
    ...(item.taxonomy.coinSymbols ?? []).map((value) => `coin:${String(value).toLowerCase()}`),
    ...(item.taxonomy.toolSlugs ?? []).map((value) => `tool:${String(value).toLowerCase()}`),
    ...(item.taxonomy.topicTags ?? []).map((value) => `topic:${String(value).toLowerCase()}`),
  ])).slice(0, 30);
}

function faDigits(value: string) {
  return value.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function formatDate(value: string, locale: "fa" | "en") {
  const date = new Date(`${value}T12:00:00+03:30`);
  const rendered = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { year: "numeric", month: "long", day: "numeric" }).format(date);
  return locale === "fa" ? faDigits(rendered) : rendered;
}

function formatTime(value: string, locale: "fa" | "en") {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function normalizeRequestedTags(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).flatMap((raw) => {
    const value = raw.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9:_-]{1,80}$/.test(value)) return [];
    return value.includes(":") ? [value] : [`topic:${value}`];
  }))).slice(0, 6);
}

export function DailyNewsArchive({
  initial,
  locale,
  initialTags = [],
}: {
  initial: ArchiveResponse;
  locale: "fa" | "en";
  initialTags?: string[];
}) {
  const [state, setState] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>(() => normalizeRequestedTags(initialTags));
  const isFa = locale === "fa";

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    state.items.flatMap(tagList).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 36);
  }, [state.items]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale === "fa" ? "fa-IR" : "en-US");
    return state.items.filter((item) => {
      const text = `${item.displayTitle} ${item.displayLead} ${item.sourceTitle} ${item.sourceName}`.toLocaleLowerCase(locale === "fa" ? "fa-IR" : "en-US");
      if (q && !text.includes(q)) return false;
      const itemTags = new Set(tagList(item));
      return activeTags.every((tag) => itemTags.has(tag));
    });
  }, [activeTags, locale, query, state.items]);

  const dayIndex = state.availableDays.indexOf(state.day);
  const newer = dayIndex > 0 ? state.availableDays[dayIndex - 1] : null;
  const older = dayIndex >= 0 && dayIndex + 1 < state.availableDays.length ? state.availableDays[dayIndex + 1] : null;

  function syncUrl(day: string, tagsToSync: string[]) {
    const params = new URLSearchParams();
    if (day !== state.today) params.set("date", day);
    for (const tag of tagsToSync) params.append("tag", tag.replace(/^topic:/, ""));
    const queryString = params.toString();
    window.history.replaceState(
      null,
      "",
      `${locale === "en" ? "/en" : ""}/crypto-news${queryString ? `?${queryString}` : ""}`,
    );
  }

  async function loadDay(day: string) {
    if (loading || day === state.day) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/crypto-news?locale=${locale}&date=${encodeURIComponent(day)}`, { headers: { accept: "application/json" } });
      if (!res.ok) return;
      const payload = await res.json() as Partial<ArchiveResponse> & { archiveItems?: NewsArchiveItem[] };
      if (
        typeof payload.day === "string" &&
        typeof payload.today === "string" &&
        Array.isArray(payload.archiveItems) &&
        Array.isArray(payload.availableDays)
      ) {
        setState({
          day: payload.day,
          today: payload.today,
          items: payload.archiveItems,
          availableDays: payload.availableDays,
        });
        setQuery("");
        syncUrl(day, activeTags);
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleTag(tag: string) {
    setActiveTags((current) => {
      const next = current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag].slice(-6);
      syncUrl(state.day, next);
      return next;
    });
  }

  return (
    <section className="px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px] rounded-[36px] border border-cyan-300/20 bg-white/82 p-5 shadow-[0_24px_90px_rgba(8,145,178,.10)] backdrop-blur-xl dark:bg-slate-950/70 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-black text-cyan-700 dark:text-cyan-100"><CalendarDays className="h-4 w-4" />{isFa ? "آرشیو روزانه خبر تک‌پی" : "TecPey daily news archive"}</div>
            <h1 className="mt-4 text-3xl font-black text-slate-950 dark:text-white sm:text-5xl">{isFa ? `اخبار ${formatDate(state.day, locale)}` : `News for ${formatDate(state.day, locale)}`}</h1>
            <p className="mt-3 max-w-3xl text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{isFa ? "همه خبرهای دریافت‌شده در روز انتخابی، با منبع اصلی، زمان انتشار، ترجمهٔ کنترل‌شده، تگ‌های موضوعی و مسیر تحقیق. خبر روزهای دیگر با این صفحه مخلوط نمی‌شود." : "All ingested news for the selected day, with publisher source, publish time, governed translation, topic tags and research context. Other days are not mixed into this view."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!newer || loading} onClick={() => newer && loadDay(newer)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-cyan-300/20 px-4 text-xs font-black disabled:opacity-40"><ChevronRight className="h-4 w-4 rtl-flip" />{isFa ? "روز جدیدتر" : "Newer"}</button>
            <select value={state.day} onChange={(event) => loadDay(event.target.value)} className="min-h-11 rounded-2xl border border-cyan-300/20 bg-transparent px-4 text-xs font-black text-slate-800 outline-none dark:text-white" aria-label={isFa ? "انتخاب تاریخ خبر" : "Select news date"}>
            {state.availableDays.map((day) => <option key={day} value={day}>{formatDate(day, locale)}</option>)}
            </select>
            <button type="button" disabled={!older || loading} onClick={() => older && loadDay(older)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-cyan-300/20 px-4 text-xs font-black disabled:opacity-40">{isFa ? "روز قدیمی‌تر" : "Older"}<ChevronLeft className="h-4 w-4 rtl-flip" /></button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isFa ? "جست‌وجو در تمام خبرهای این روز..." : "Search all news from this day..."} className="min-h-12 w-full rounded-2xl border border-cyan-300/20 bg-white/70 ps-11 pe-4 text-sm font-bold text-slate-900 outline-none focus:border-cyan-400 dark:bg-white/5 dark:text-white" />
          </label>
          <div className="inline-flex min-h-12 items-center rounded-2xl border border-cyan-300/20 px-4 text-xs font-black text-slate-600 dark:text-slate-300">{isFa ? `${visible.length} خبر از ${state.items.length}` : `${visible.length} of ${state.items.length} news items`}</div>
        </div>

        {tags.length > 0 && <div className="mt-4 flex gap-2 overflow-x-auto pb-2" aria-label={isFa ? "فیلتر تگ خبر" : "News tag filters"}><span className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-slate-500"><Tags className="h-4 w-4" />{isFa ? "تگ‌ها" : "Tags"}</span>{tags.map(([tag, count]) => <button type="button" key={tag} aria-pressed={activeTags.includes(tag)} onClick={() => toggleTag(tag)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-black transition ${activeTags.includes(tag) ? "border-cyan-400 bg-cyan-500 text-white" : "border-cyan-300/20 bg-cyan-500/5 text-cyan-700 dark:text-cyan-100"}`}>{newsTaxonomyTagLabel(tag, locale)} · {count}</button>)}</div>}

        <div className="mt-7 space-y-4" aria-busy={loading}>
          {visible.map((item) => (
            <article key={item.archiveId} className="rounded-[28px] border border-cyan-300/15 bg-white/72 p-5 dark:bg-white/[0.04] sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-black text-slate-500 dark:text-slate-400"><span>{item.sourceName} · {formatTime(item.publishedAt, locale)}</span><span className={`rounded-full border px-2.5 py-1 ${item.translationStatus === "completed" ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-300/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"}`}>{isFa ? (item.translationStatus === "completed" ? "ترجمهٔ فارسی تأییدشده" : "متن اصلی · ترجمه در انتظار/ناموفق") : "Publisher feed"}</span></div>
              {item.newsUrl ? (
                <Link href={item.newsUrl} className="group mt-4 block rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                  <h2 className="text-xl font-black leading-9 text-slate-950 transition group-hover:text-cyan-700 dark:text-white dark:group-hover:text-cyan-200 sm:text-2xl">{item.displayTitle}</h2>
                </Link>
              ) : (
                <h2 className="mt-4 text-xl font-black leading-9 text-slate-950 dark:text-white sm:text-2xl">{item.displayTitle}</h2>
              )}
              {isFa && item.translationStatus === "completed" && item.displayTitle !== item.sourceTitle && <p className="mt-2 text-xs font-bold leading-6 text-slate-500 dark:text-slate-400" dir="ltr">Original: {item.sourceTitle}</p>}
              <p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-200">{item.displayLead}</p>
              <details className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-500/5 p-4"><summary className="cursor-pointer text-xs font-black text-cyan-700 dark:text-cyan-100">{isFa ? "نمایش متن کامل موجود در فید ناشر" : "Show full publisher-provided feed text"}</summary><p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-8 text-slate-700 dark:text-slate-200">{item.displayBody}</p>{isFa && item.translationStatus === "completed" && <details className="mt-4 border-t border-cyan-300/15 pt-3"><summary className="cursor-pointer text-[11px] font-black text-slate-500">متن اصلی</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-7 text-slate-500" dir="ltr">{item.sourceBody}</p></details>}</details>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">{tagList(item).slice(0, 10).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 dark:bg-white/8 dark:text-slate-300">{newsTaxonomyTagLabel(tag, locale)}</span>)}</div>
                <div className="flex flex-wrap items-center gap-3">
                  {item.newsUrl && <Link href={item.newsUrl} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-700 transition hover:bg-cyan-500/15 dark:text-cyan-100">{isFa ? "زمینه و تحلیل تک‌پی" : "TecPey context"}</Link>}
                  <a href={item.articleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-black text-cyan-700 underline underline-offset-4 dark:text-cyan-200">{isFa ? "منبع اصلی خبر" : "Original source"}<ExternalLink className="h-3.5 w-3.5" /></a>
                </div>
              </div>
            </article>
          ))}
          {!loading && visible.length === 0 && <div className="rounded-[28px] border border-dashed border-cyan-300/25 p-10 text-center"><p className="text-sm font-black text-slate-700 dark:text-slate-200">{isFa ? "برای این تاریخ/فیلتر خبر ثبت‌شده‌ای وجود ندارد." : "No archived news matches this day/filter."}</p><p className="mt-2 text-xs font-bold text-slate-500">{isFa ? "سیستم خبر روز دیگری را به‌جای آن نمایش نمی‌دهد." : "TecPey does not substitute news from another day."}</p></div>}
        </div>
      </div>
    </section>
  );
}
