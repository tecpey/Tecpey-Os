"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  ImageIcon,
  Languages,
  Newspaper,
  Search,
  Tags,
} from "lucide-react";
import type { NewsArchivePresentationItem } from "@/services/news/archive-presentation-authority";
import { newsTaxonomyTagLabel } from "@/lib/news-taxonomy";

type ArchiveResponse = {
  day: string;
  today: string;
  items: NewsArchivePresentationItem[];
  availableDays: string[];
};

function tagList(item: NewsArchivePresentationItem): string[] {
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
  const rendered = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
  return locale === "fa" ? faDigits(rendered) : rendered;
}

function formatTime(value: string, locale: "fa" | "en") {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizedNewsText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function hasDistinctBody(lead: string, body: string): boolean {
  const normalizedLead = normalizedNewsText(lead);
  const normalizedBody = normalizedNewsText(body);
  return Boolean(normalizedBody) && normalizedBody !== normalizedLead;
}

function normalizeRequestedTags(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).flatMap((raw) => {
    const value = raw.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9:_-]{1,80}$/.test(value)) return [];
    return value.includes(":") ? [value] : [`topic:${value}`];
  }))).slice(0, 6);
}

function coverageLabel(item: NewsArchivePresentationItem, isFa: boolean): string {
  if (item.sourceCoverage === "article_full") return isFa ? "شواهد کامل داخلی" : "Full evidence captured";
  if (item.sourceCoverage === "feed_full") return isFa ? "شواهد کامل فید" : "Full feed captured";
  if (item.sourceCoverage === "feed_summary") return isFa ? "خلاصه فید" : "Feed summary";
  return isFa ? "شواهد آرشیوی" : "Archived evidence";
}

function translationLabel(item: NewsArchivePresentationItem, isFa: boolean): string {
  if (!isFa) return item.publicSummaryAllowed ? "Publisher excerpt" : "Metadata only";
  if (!item.translationPending) return "ترجمه کامل و کنترل‌شده";
  if (!item.persianEditorialAllowed) return "نمایش متادیتا · محدودیت بازنشر";
  if (item.translationStatus === "failed") return "ترجمه در بازپردازش · خلاصه مجاز منبع";
  return "ترجمه در صف · خلاصه مجاز منبع";
}

function NewsCardMedia({ item, isFa }: { item: NewsArchivePresentationItem; isFa: boolean }) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[22px] border border-cyan-300/15 bg-gradient-to-br from-slate-950 via-cyan-950 to-slate-900">
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <div className="flex flex-col items-center gap-3 text-center text-white/70">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur"><Newspaper className="h-7 w-7" /></div>
          <span className="max-w-[80%] text-[11px] font-black tracking-wide">{item.sourceName}</span>
        </div>
      </div>
      {item.thumbnailUrl && (
        // The media path is a governed same-origin redirect to provider-approved source media.
        // eslint-disable-next-line @next/next/no-img-element -- #643: governed same-origin source media requires native fallback handling.
        <img src={item.thumbnailUrl} alt={item.thumbnailAlt} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover object-center" onError={(event) => { event.currentTarget.style.display = "none"; }} />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/80 to-transparent" />
      <div className="absolute bottom-3 start-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/70 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur-md"><ImageIcon className="h-3 w-3" />{item.thumbnailUrl ? (isFa ? "تصویر مجاز منبع" : "Governed source media") : (isFa ? "نمای امن تک‌پی" : "TecPey safe fallback")}</span>
        {item.thumbnailUrl && item.thumbnailAttributionRequired && <span className="rounded-full border border-white/15 bg-slate-950/70 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur-md">{isFa ? `اعتبار تصویر: ${item.sourceName}` : `Media: ${item.sourceName}`}</span>}
      </div>
    </div>
  );
}

export function DailyNewsArchive({ initial, locale, initialTags = [] }: { initial: ArchiveResponse; locale: "fa" | "en"; initialTags?: string[] }) {
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
      const text = `${item.displayTitle} ${item.displayLead} ${item.displayBody} ${item.sourceTitle} ${item.sourceName}`.toLocaleLowerCase(locale === "fa" ? "fa-IR" : "en-US");
      if (q && !text.includes(q)) return false;
      const itemTags = new Set(tagList(item));
      return activeTags.every((tag) => itemTags.has(tag));
    });
  }, [activeTags, locale, query, state.items]);

  const pendingTranslations = isFa ? state.items.filter((item) => item.translationPending).length : 0;
  const dayIndex = state.availableDays.indexOf(state.day);
  const newer = dayIndex > 0 ? state.availableDays[dayIndex - 1] : null;
  const older = dayIndex >= 0 && dayIndex + 1 < state.availableDays.length ? state.availableDays[dayIndex + 1] : null;

  function syncUrl(day: string, tagsToSync: string[]) {
    const params = new URLSearchParams();
    if (day !== state.today) params.set("date", day);
    for (const tag of tagsToSync) params.append("tag", tag.replace(/^topic:/, ""));
    const queryString = params.toString();
    window.history.replaceState(null, "", `${locale === "en" ? "/en" : ""}/crypto-news${queryString ? `?${queryString}` : ""}`);
  }

  async function loadDay(day: string) {
    if (loading || day === state.day) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/crypto-news?locale=${locale}&date=${encodeURIComponent(day)}`, { headers: { accept: "application/json" } });
      if (!res.ok) return;
      const payload = await res.json() as Partial<ArchiveResponse> & { archiveItems?: NewsArchivePresentationItem[] };
      if (typeof payload.day === "string" && typeof payload.today === "string" && Array.isArray(payload.archiveItems) && Array.isArray(payload.availableDays)) {
        setState({ day: payload.day, today: payload.today, items: payload.archiveItems, availableDays: payload.availableDays });
        setQuery("");
        syncUrl(day, activeTags);
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleTag(tag: string) {
    setActiveTags((current) => {
      const next = current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag].slice(-6);
      syncUrl(state.day, next);
      return next;
    });
  }

  return (
    <section className="px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px] rounded-[36px] border border-cyan-300/20 bg-white/82 p-5 shadow-[0_24px_90px_rgba(8,145,178,.10)] backdrop-blur-xl dark:bg-slate-950/70 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-black text-cyan-700 dark:text-cyan-100"><CalendarDays className="h-4 w-4" />{isFa ? "آرشیو کامل روزانه تک‌پی" : "TecPey complete daily archive"}</div>
            <h1 className="mt-4 text-3xl font-black text-slate-950 dark:text-white sm:text-5xl">{isFa ? `اخبار ${formatDate(state.day, locale)}` : `News for ${formatDate(state.day, locale)}`}</h1>
            <p className="mt-3 max-w-3xl text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{isFa ? "همه خبرهای ثبت‌شده از منابع مجاز این روز حفظ می‌شوند. متن کامل ناشر داخل مرز شواهد می‌ماند؛ سطح عمومی فقط متادیتا/خلاصهٔ مجاز یا ترجمهٔ فارسی governed را نمایش می‌دهد." : "Every governed capture remains discoverable. Full publisher text stays inside the evidence boundary; the public surface shows only cleared metadata/excerpts or governed Persian rendering."}</p>
            {isFa && pendingTranslations > 0 && <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-2 text-xs font-black text-amber-700 dark:text-amber-200"><Languages className="h-4 w-4" />{pendingTranslations} خبر هنوز ترجمهٔ قابل انتشار ندارد؛ رکورد حذف نشده و طبق مجوز منبع به‌صورت خلاصه یا متادیتا دیده می‌شود.</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!newer || loading} onClick={() => newer && loadDay(newer)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-cyan-300/20 px-4 text-xs font-black disabled:opacity-40"><ChevronRight className="h-4 w-4 rtl-flip" />{isFa ? "روز جدیدتر" : "Newer"}</button>
            <select value={state.day} onChange={(event) => loadDay(event.target.value)} className="min-h-11 rounded-2xl border border-cyan-300/20 bg-transparent px-4 text-xs font-black text-slate-800 outline-none dark:text-white" aria-label={isFa ? "انتخاب تاریخ خبر" : "Select news date"}>{state.availableDays.map((day) => <option key={day} value={day}>{formatDate(day, locale)}</option>)}</select>
            <button type="button" disabled={!older || loading} onClick={() => older && loadDay(older)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-cyan-300/20 px-4 text-xs font-black disabled:opacity-40">{isFa ? "روز قدیمی‌تر" : "Older"}<ChevronLeft className="h-4 w-4 rtl-flip" /></button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className="relative block"><Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isFa ? "جست‌وجو در خبرهای قابل نمایش این روز..." : "Search public news evidence for this day..."} className="min-h-12 w-full rounded-2xl border border-cyan-300/20 bg-white/70 ps-11 pe-4 text-sm font-bold text-slate-900 outline-none focus:border-cyan-400 dark:bg-white/5 dark:text-white" /></label>
          <div className="inline-flex min-h-12 items-center rounded-2xl border border-cyan-300/20 px-4 text-xs font-black text-slate-600 dark:text-slate-300">{isFa ? `${visible.length} خبر از ${state.items.length}` : `${visible.length} of ${state.items.length} news items`}</div>
        </div>

        {tags.length > 0 && <div className="mt-4 flex gap-2 overflow-x-auto pb-2" aria-label={isFa ? "فیلتر تگ خبر" : "News tag filters"}><span className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-slate-500"><Tags className="h-4 w-4" />{isFa ? "تگ‌ها" : "Tags"}</span>{tags.map(([tag, count]) => <button type="button" key={tag} aria-pressed={activeTags.includes(tag)} onClick={() => toggleTag(tag)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-black transition ${activeTags.includes(tag) ? "border-cyan-400 bg-cyan-500 text-white" : "border-cyan-300/20 bg-cyan-500/5 text-cyan-700 dark:text-cyan-100"}`}>{newsTaxonomyTagLabel(tag, locale)} · {count}</button>)}</div>}

        <div className="mt-7 space-y-5" aria-busy={loading}>
          {visible.map((item) => {
            const sourceTextDirection = isFa && item.translationPending && item.publicSummaryAllowed ? "ltr" : undefined;
            return (
              <article key={item.archiveId} className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/72 p-4 dark:bg-white/[0.04] sm:p-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(280px,36%)_minmax(0,1fr)] lg:items-start">
                  <NewsCardMedia item={item} isFa={isFa} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-black text-slate-500 dark:text-slate-400"><span>{item.sourceName} · {formatTime(item.publishedAt, locale)}</span><span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/20 bg-cyan-500/5 px-2.5 py-1 text-cyan-700 dark:text-cyan-100"><FileText className="h-3 w-3" />{coverageLabel(item, isFa)}</span><span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${item.translationPending ? "border-amber-300/25 bg-amber-400/10 text-amber-700 dark:text-amber-200" : "border-emerald-300/25 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200"}`}>{item.translationPending ? <Languages className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}{translationLabel(item, isFa)}</span></div>
                    <div dir={sourceTextDirection} className={sourceTextDirection === "ltr" ? "text-left" : undefined}>{item.newsUrl ? <Link href={item.newsUrl} className="group mt-4 block rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><h2 className="text-xl font-black leading-9 text-slate-950 transition group-hover:text-cyan-700 dark:text-white dark:group-hover:text-cyan-200 sm:text-2xl">{item.displayTitle}</h2></Link> : <h2 className="mt-4 text-xl font-black leading-9 text-slate-950 dark:text-white sm:text-2xl">{item.displayTitle}</h2>}<p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-200">{item.displayLead}</p></div>
                    {isFa && item.translationPending && <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs font-bold leading-6 text-amber-800 dark:text-amber-100">رکورد خبر حفظ شده اما هنوز وارد انتشار/رنکینگ خودکار فارسی نمی‌شود. تک‌پی فقط محتوایی را روی سطح عمومی نشان می‌دهد که سیاست بازنشر منبع اجازه داده باشد.</p>}
                    {hasDistinctBody(item.displayLead, item.displayBody) && <details className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-500/5 p-4"><summary className="cursor-pointer text-xs font-black text-cyan-700 dark:text-cyan-100">{isFa ? "متن کامل ترجمه‌شده" : "Public excerpt"}</summary><p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-8 text-slate-700 dark:text-slate-200">{item.displayBody}</p></details>}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1.5">{tagList(item).slice(0, 10).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 dark:bg-white/8 dark:text-slate-300">{newsTaxonomyTagLabel(tag, locale)}</span>)}</div><div className="flex flex-wrap items-center gap-3">{item.newsUrl && <Link href={item.newsUrl} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-700 transition hover:bg-cyan-500/15 dark:text-cyan-100">{isFa ? "زمینه و تحلیل تک‌پی" : "TecPey context"}</Link>}<a href={item.articleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-black text-cyan-700 underline underline-offset-4 dark:text-cyan-200">{isFa ? "منبع اصلی خبر" : "Original source"}<ExternalLink className="h-3.5 w-3.5" /></a></div></div>
                  </div>
                </div>
              </article>
            );
          })}
          {!loading && visible.length === 0 && <div className="rounded-[28px] border border-dashed border-cyan-300/25 p-10 text-center"><p className="text-sm font-black text-slate-700 dark:text-slate-200">{isFa ? "برای این تاریخ/فیلتر خبر ثبت‌شده‌ای وجود ندارد." : "No archived news matches this day/filter."}</p><p className="mt-2 text-xs font-bold text-slate-500">{isFa ? "سیستم خبر روز دیگری را به‌جای آن نمایش نمی‌دهد." : "TecPey does not substitute news from another day."}</p></div>}
        </div>
      </div>
    </section>
  );
}
