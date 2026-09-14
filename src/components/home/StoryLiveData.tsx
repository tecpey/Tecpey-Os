"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import { formatMarketPrice } from "@/lib/public-market-data";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Clock3, Newspaper, RefreshCw, Table2, Grid2X2, Trophy } from "lucide-react";
import { CryptoAssetIcon } from "@/components/crypto/CryptoAssetIcon";
import MarketDataProvenance from "@/components/markets/MarketDataProvenance";
import { storyMarketRows, storyHeatmapRows, storySafeLink } from "@/data/landing-story-data";
import type { CurrencyListResponse } from "@/types/market";
import styles from "./growth-story.module.css";

type Locale = "fa" | "en";
async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}
const number = (value: number, locale: Locale, digits = 2) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: digits }).format(value);
const compactNumber = (value: number | null, locale: Locale, currency = "USD") => value === null
  ? (locale === "fa" ? "ناموجود" : "N/A")
  : new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value) + ` ${currency}`;
function date(value: string, locale: Locale) {
  return Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(new Date(value)) : (locale === "fa" ? "ناموجود" : "N/A");
}
function Retry({ locale, retry, loading }: { locale: Locale; retry: () => void; loading: boolean }) {
  return <button type="button" className={styles.smallButton} data-loading={loading ? "true" : "false"} onClick={retry} disabled={loading}><RefreshCw size={16} aria-hidden="true" />{locale === "fa" ? "دریافت دوباره" : "Refresh"}</button>;
}

function heatmapColor(change: number | null) {
  if (change === null || change === 0) return "#40566b";
  const intensity = Math.min(Math.abs(change) / 7, 1);
  if (change > 0) {
    if (intensity >= 0.6) return "#07865b";
    if (intensity >= 0.25) return "#16a66e";
    return "#58c996";
  }
  if (intensity >= 0.6) return "#b82f44";
  if (intensity >= 0.25) return "#d64a59";
  return "#e7868b";
}

type NewsFeed = { mode?: string; updatedAt?: string; items?: { id: string; title: string; summary: string; source: string; url: string; sourceUrl: string; publishedAt: string; category: string; tone?: string; impact?: number; isBreaking?: boolean; relatedLesson?: string; thumbnailUrl?: string | null }[] };
const neutralNewsCover = "/images/tecpey/covers/live-crypto-price-guide.jpg";
export function StoryNews({ locale }: { locale: Locale }) {
  const fa = locale === "fa";
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const [active, setActive] = useState(0);
  const feed = useQuery({ queryKey: ["landing-story-news", locale], queryFn: ({ signal }) => readJson<NewsFeed>(`/api/crypto-news?locale=${locale}&limit=7`, signal), staleTime: 60_000, refetchInterval: 60_000, retry: 1 });
  const items = (Array.isArray(feed.data?.items) ? feed.data.items : []).filter(item => typeof item.title === "string" && typeof item.summary === "string" && Number.isFinite(Date.parse(item.publishedAt)) && storySafeLink(item.url)).slice(0, 7);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !items.length) return;
    setActive(current => Math.min(current, items.length - 1));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      const index = Number((visible?.target as HTMLElement | undefined)?.dataset.newsIndex);
      if (Number.isSafeInteger(index)) setActive(index);
    }, { root: rail, threshold: [.45, .65, .85] });
    cardRefs.current.slice(0, items.length).forEach(card => { if (card) observer.observe(card); });
    return () => observer.disconnect();
  }, [items.length]);
  const goTo = useCallback((index: number) => {
    const target = Math.max(0, Math.min(index, items.length - 1));
    // `auto` delegates animation to CSS `scroll-behavior`, so the normal rail
    // stays smooth while `prefers-reduced-motion` can disable scrolling motion.
    cardRefs.current[target]?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
    setActive(target);
  }, [items.length]);
  return <div>
    {items.length > 0 && <section className={styles.newsCarousel} role="region" aria-roledescription={fa ? "نوار خبر" : "news carousel"} aria-label={fa ? "آخرین خبرهای معتبر" : "Latest verified news"}>
      <div className={styles.newsRailHeader}>
        <div aria-live="polite"><strong>{fa ? "خبر منتخب" : "Selected story"}</strong><span><bdi>{number(active + 1, locale, 0)}</bdi> / <bdi>{number(items.length, locale, 0)}</bdi></span></div>
        <div className={styles.newsControls}>
          <button type="button" onClick={() => goTo(active - 1)} disabled={active === 0} aria-label={fa ? "خبر قبلی" : "Previous story"}><ChevronLeft size={20} aria-hidden="true" /></button>
          <button type="button" onClick={() => goTo(active + 1)} disabled={active === items.length - 1} aria-label={fa ? "خبر بعدی" : "Next story"}><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
      </div>
      <div ref={railRef} className={styles.newsRail} tabIndex={0} onKeyDown={event => { if (event.key === "ArrowLeft") { event.preventDefault(); goTo(active - 1); } if (event.key === "ArrowRight") { event.preventDefault(); goTo(active + 1); } }}>
        {items.map((item, index) => {
          const sourceThumbnail = storySafeLink(item.thumbnailUrl);
          const thumbnailSrc = sourceThumbnail || neutralNewsCover;
          const thumbnailAlt = sourceThumbnail ? (fa ? `تصویر خبر ${item.title}` : `News image for ${item.title}`) : (fa ? `تصویر عمومی بازار برای ${item.title}` : `General market image for ${item.title}`);
          return <article key={item.id} ref={node => { cardRefs.current[index] = node; }} data-news-index={index} data-active={active === index ? "true" : "false"} className={styles.newsCard} role="group" aria-roledescription={fa ? "کارت خبر" : "slide"} aria-label={`${number(index + 1, locale, 0)} ${fa ? "از" : "of"} ${number(items.length, locale, 0)}`} dir={fa ? "rtl" : "ltr"}>
            <div className={styles.newsMedia}>
              {sourceThumbnail ? <>
                {/* eslint-disable-next-line @next/next/no-img-element -- governed news media may be remote and needs native failure handling. */}
                <img src={thumbnailSrc} alt={thumbnailAlt} loading="lazy" decoding="async" referrerPolicy="no-referrer" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} onError={event => { event.currentTarget.style.display = "none"; }} />
              </> : <Image src={thumbnailSrc} alt={thumbnailAlt} fill sizes="(max-width: 480px) 78vw, (max-width: 820px) 72vw, 680px" />}
            </div>
            <div className={styles.newsContent}>
              <div className={styles.newsTopline}><span className={styles.kicker}><Newspaper size={16} aria-hidden="true" />{item.category}</span>{item.isBreaking ? <span className={styles.breaking}>{fa ? "تازه" : "Fresh"}</span> : null}</div>
              <h3><Link href={storySafeLink(item.url)!}>{item.title}</Link></h3><p>{item.summary}</p>
              <div className={styles.newsMeta}>
                {storySafeLink(item.sourceUrl) ? <a href={storySafeLink(item.sourceUrl)!} target="_blank" rel="noreferrer">{item.source}<ArrowUpRight size={14} aria-hidden="true" /></a> : <span>{item.source}</span>}
                <time dateTime={item.publishedAt}><Clock3 size={14} aria-hidden="true" />{date(item.publishedAt, locale)}</time>
              </div>
              <div className={styles.newsEvidence}><span>{item.relatedLesson || (fa ? "زمینه آموزشی تک‌پی" : "TecPey learning context")}</span>{Number.isFinite(item.impact) ? <span>{fa ? "اثر آموزشی" : "Learning impact"} <bdi>{number(item.impact!, locale, 0)}/{number(10, locale, 0)}</bdi></span> : null}</div>
              {!sourceThumbnail && <small className={styles.editorialMediaLabel}>{fa ? "تصویر عمومی تحریریه تک‌پی" : "TecPey editorial market image"}</small>}
            </div>
          </article>;
        })}
      </div>
      <div className={styles.newsDots} aria-label={fa ? "انتخاب خبر" : "Select story"}>{items.map((item, index) => <button key={item.id} type="button" aria-current={active === index ? "true" : undefined} aria-label={`${fa ? "رفتن به خبر" : "Go to story"} ${number(index + 1, locale, 0)}`} onClick={() => goTo(index)}><span /></button>)}</div>
    </section>}
    {!items.length && <p className={styles.empty} role="status">{feed.isPending ? (fa ? "در حال دریافت خبرها از آرشیو تک‌پی…" : "Loading the TecPey news archive…") : (fa ? "خبر تأییدشده فعلاً در دسترس نیست. آرشیو را بررسی کنید یا دوباره تلاش کنید." : "Verified headlines are temporarily unavailable. Explore the archive or try again.")}</p>}
    {feed.isError && items.length > 0 && <p role="status">{fa ? "به‌روزرسانی انجام نشد؛ زمان انتشار هر خبر را بررسی کنید." : "Refresh failed; check each article’s publication time."}</p>}
    <div className={styles.inlineActions}><Link className={styles.textLink} href={`${fa ? "" : "/en"}/crypto-news`}>{fa ? "همهٔ اخبار و ترجمه‌ها" : "Explore news and context"}<ArrowUpRight size={18} aria-hidden="true" /></Link><Retry locale={locale} retry={() => void feed.refetch()} loading={feed.isFetching} /></div>
  </div>;
}

export function StoryMarketBoard({ locale }: { locale: Locale }) {
  const fa = locale === "fa";
  const [now, setNow] = useState(0);
  const [metric, setMetric] = useState<"marketCap" | "volume">("marketCap");
  const [list, setList] = useState(false);
  const [excludeBtc, setExcludeBtc] = useState(false);
  const query = useQuery({ queryKey: ["landing-story-market"], queryFn: ({ signal }) => readJson<CurrencyListResponse>("/api/markets?source=public&limit=30", signal), staleTime: 20_000, refetchInterval: 30_000, retry: 1 });
  useEffect(() => { const tick = () => setNow(Date.now()); tick(); const timer = setInterval(tick, 15_000); return () => clearInterval(timer); }, []);
  const rows = useMemo(() => storyMarketRows(query.data, now), [query.data, now]);
  const tiles = useMemo(() => storyHeatmapRows(rows, metric, excludeBtc), [rows, metric, excludeBtc]);
  const router = useRouter();
  const prefix = fa ? "" : "/en";
  const positiveRows = rows.filter(row => row.change !== null && row.change > 0);
  const measuredRows = rows.filter(row => row.change !== null);
  const breadth = measuredRows.length ? positiveRows.length / measuredRows.length * 100 : null;
  const averageChange = measuredRows.length ? measuredRows.reduce((sum, row) => sum + (row.change || 0), 0) / measuredRows.length : null;
  const visibleCap = rows.reduce((sum, row) => sum + (row.marketCap || 0), 0);
  const visibleVolume = rows.reduce((sum, row) => sum + (row.volume || 0), 0);
  const btc = rows.find(row => row.symbol === "BTC");
  const btcShare = visibleCap > 0 && btc?.marketCap ? btc.marketCap / visibleCap * 100 : null;
  const marketState = query.isFetching ? "syncing" : query.isSuccess && !query.isError && rows.length > 0 ? "live" : "unavailable";
  const marketStateLabel = marketState === "syncing" ? (fa ? "در حال همگام‌سازی" : "Syncing") : marketState === "live" ? (fa ? "داده زنده" : "Live data") : (fa ? "داده در دسترس نیست" : "Data unavailable");
  return <div className={styles.marketBoard}>
    <div className={styles.marketTop}><span className={styles.liveState} data-state={marketState}>{marketStateLabel}</span><span className={styles.caption}>{fa ? "بدون عدد تخمینی" : "No estimated values"}</span></div>
    <div className={styles.quotes}>{rows.slice(0, 4).map(row => <Link href={`${prefix}/markets?search=${encodeURIComponent(row.symbol)}`} key={row.symbol}>
      <div className={styles.quoteHeading}><CryptoAssetIcon symbol={row.symbol} size="sm" className={styles.quoteIcon} /><strong>{row.symbol}</strong>{row.rank === null ? null : <small>#{number(row.rank, locale, 0)}</small>}<span className={row.change !== null && row.change > 0 ? styles.positive : row.change !== null && row.change < 0 ? styles.negative : styles.caption} dir="ltr">{row.change === null ? (fa ? "ناموجود" : "N/A") : `${row.change > 0 ? "+" : ""}${number(row.change, locale)}%`}</span></div>
      <bdi className={styles.quotePrice}>{formatMarketPrice(row.price, fa ? "fa-IR" : "en-US")} <small>{query.data?.provenance?.currency || "USD"}</small></bdi>
      <dl className={styles.quoteRange}><div><dt>{fa ? "کف ۲۴س" : "24h low"}</dt><dd>{row.low24h === null ? (fa ? "ناموجود" : "N/A") : formatMarketPrice(row.low24h, fa ? "fa-IR" : "en-US")}</dd></div><div><dt>{fa ? "سقف ۲۴س" : "24h high"}</dt><dd>{row.high24h === null ? (fa ? "ناموجود" : "N/A") : formatMarketPrice(row.high24h, fa ? "fa-IR" : "en-US")}</dd></div></dl>
      <time dateTime={row.updatedAt}><Clock3 size={13} aria-hidden="true" />{date(row.updatedAt, locale)}</time>
    </Link>)}</div>
    <div className={styles.marketShell}><div className={styles.marketControls}>
      <label>{fa ? "اندازه بر اساس" : "Size by"}<select value={metric} onChange={event => setMetric(event.target.value as "marketCap" | "volume")}><option value="marketCap">{fa ? "ارزش بازار" : "Market cap"}</option><option value="volume">{fa ? "حجم ۲۴ ساعته" : "24h volume"}</option></select></label>
      <label><input type="checkbox" checked={excludeBtc} onChange={event => setExcludeBtc(event.target.checked)} />{fa ? "بدون بیت‌کوین" : "Exclude Bitcoin"}</label>
      <button className={styles.smallButton} type="button" aria-pressed={list} onClick={() => setList(value => !value)}>{list ? <Grid2X2 size={16} aria-hidden="true" /> : <Table2 size={16} aria-hidden="true" />}{list ? (fa ? "نقشه" : "Map") : (fa ? "فهرست" : "List")}</button>
    </div>
    <p className={styles.caption}>{fa ? "رنگ: تغییر ۲۴ ساعته · اندازه: سهم در دارایی‌های نمایش‌داده‌شده" : "Color: 24h change · Size: share of the displayed assets"}</p>
    {tiles.length > 0 ? (list ? <div className={styles.marketList} aria-label={fa ? "فهرست بازار" : "Market list"}>
      {tiles.map(row => <Link key={row.symbol} href={`${prefix}/markets?search=${encodeURIComponent(row.symbol)}`} className={row.change !== null && row.change > 0 ? styles.upTile : row.change !== null && row.change < 0 ? styles.downTile : styles.neutralTile}>
        <strong>{row.symbol}</strong><bdi>{row.change === null ? (fa ? "ناموجود" : "N/A") : `${row.change > 0 ? "+" : ""}${number(row.change, locale)}%`}</bdi><bdi>{number(row[metric]!, locale, 0)} {query.data?.provenance?.currency || "USD"}</bdi>
      </Link>)}
    </div> : <div className={styles.heatmap} role="img" aria-label={fa ? "نقشه تغییرات بازار؛ برای جزئیات قابل دسترس، فهرست را انتخاب کنید" : "Market change map; select List for accessible details"} dir="ltr">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <Treemap data={tiles.map(row => ({ name: `${row.symbol} ${row.change === null ? "N/A" : `${row.change > 0 ? "+" : ""}${number(row.change, locale)}%`}`, symbol: row.symbol, size: row[metric]! }))} dataKey="size" nameKey="name" isAnimationActive={false}
          colorPanel={tiles.map(row => heatmapColor(row.change))}
          onClick={node => { if (typeof node.symbol === "string" && tiles.some(row => row.symbol === node.symbol)) router.push(`${prefix}/markets?search=${encodeURIComponent(node.symbol)}`); }}>
          <Tooltip formatter={value => [number(Number(value), locale, 0), fa ? (metric === "marketCap" ? "ارزش بازار" : "حجم ۲۴ ساعته") : (metric === "marketCap" ? "Market cap" : "24h volume")]} />
        </Treemap>
      </ResponsiveContainer>
    </div>) : <p className={styles.empty} role="status">{query.isPending ? (fa ? "در حال دریافت دادهٔ بازار…" : "Loading market data…") : rows.length ? (fa ? "داده کافی برای اندازه‌گذاری این نقشه موجود نیست؛ معیار دیگر را انتخاب کنید." : "Not enough data to size this map. Select another metric.") : (fa ? "قیمت تازه و قابل اعتبارسنجی در دسترس نیست؛ عدد تخمینی نمایش نمی‌دهیم." : "Fresh, verifiable prices are unavailable. No estimated values are shown.")}</p>}
    {!list && tiles.length > 0 ? <div className={styles.heatmapLegend} aria-label={fa ? "راهنمای رنگ تغییر ۲۴ ساعته" : "24-hour change color legend"}><span><i data-tone="strong-down" />{fa ? "افت زیاد" : "Strong fall"}</span><span><i data-tone="down" />{fa ? "افت" : "Fall"}</span><span><i data-tone="flat" />{fa ? "خنثی" : "Flat"}</span><span><i data-tone="up" />{fa ? "رشد" : "Rise"}</span><span><i data-tone="strong-up" />{fa ? "رشد زیاد" : "Strong rise"}</span></div> : null}
    {query.isError && <p role="status" className={styles.caption}>{fa ? "آخرین دریافت موفق نبود." : "The latest refresh did not succeed."}</p>}</div>
    <div className={styles.marketInsights}>
      <div className={styles.marketInsight}><span>{fa ? "ارزش بازار نمایان" : "Displayed market cap"}</span><strong>{compactNumber(visibleCap > 0 ? visibleCap : null, locale, query.data?.provenance?.currency || "USD")}</strong><small>{fa ? "جمع دارایی‌های تازه نمایش‌داده‌شده" : "sum across fresh displayed assets"}</small></div>
      <div className={styles.marketInsight}><span>{fa ? "حجم ۲۴ساعته نمایان" : "Displayed 24h volume"}</span><strong>{compactNumber(visibleVolume > 0 ? visibleVolume : null, locale, query.data?.provenance?.currency || "USD")}</strong><small>{fa ? "جمع حجم موجود در مجموعه داده" : "sum of available dataset volume"}</small></div>
      <div className={styles.marketInsight}><span>{fa ? "سهم بیت‌کوین" : "Bitcoin share"}</span><strong>{btcShare === null ? (fa ? "ناموجود" : "N/A") : `${number(btcShare, locale, 1)}%`}</strong><small>{fa ? "در ارزش بازار دارایی‌های نمایش‌داده‌شده" : "of displayed market capitalization"}</small></div>
      <div className={styles.marketInsight}><span>{fa ? "پهنای بازار" : "Market breadth"}</span><strong>{breadth === null ? (fa ? "ناموجود" : "N/A") : `${number(breadth, locale, 0)}%`}</strong><small>{fa ? "سهم دارایی‌های مثبت در داده تازه" : "positive assets in the fresh dataset"}</small></div>
      <div className={styles.marketInsight}><span>{fa ? "میانگین تغییر" : "Average change"}</span><strong className={averageChange !== null && averageChange > 0 ? styles.positive : averageChange !== null && averageChange < 0 ? styles.negative : undefined}>{averageChange === null ? (fa ? "ناموجود" : "N/A") : `${averageChange > 0 ? "+" : ""}${number(averageChange, locale)}%`}</strong><small>{fa ? "تغییر ۲۴ ساعته دارایی‌های قابل سنجش" : "24h change across measurable assets"}</small></div>
      <div className={styles.marketInsight}><span>{fa ? "پوشش داده" : "Data coverage"}</span><strong>{number(rows.length, locale, 0)}</strong><small>{fa ? "دارایی تازه و قابل اعتبارسنجی" : "fresh, verifiable assets"}</small></div>
    </div>
    <MarketDataProvenance locale={locale} provenance={query.data?.provenance} />
    <div className={styles.inlineActions}><Link className={styles.textLink} href={`${prefix}/markets`}>{fa ? "بررسی همهٔ بازارها" : "Explore all markets"}<ArrowUpRight size={18} aria-hidden="true" /></Link><Retry locale={locale} retry={() => void query.refetch()} loading={query.isFetching} /></div>
    <details className={styles.details}><summary><span>{fa ? "شاخص‌های بازار؛ معنی و وضعیت داده" : "Market indicators: meaning and availability"}</span><ChevronDown size={18} aria-hidden="true" /></summary>
      <p>{fa ? "سهم بیت‌کوین، پهنای بازار و میانگین تغییر بالا از همین مجموعه داده تازه محاسبه می‌شوند. RSI، آلت‌سیزن و ترس و طمع فقط پس از اتصال منبع و روش معتبر نمایش داده خواهند شد." : "Bitcoin share, breadth and average change above are calculated from this fresh dataset. RSI, altseason and fear and greed will only appear after a governed source and method are connected."}</p>
      <dl className={styles.indicators}>{(fa ? [["دامیننس کل بازار", "نیازمند پوشش کامل ارزش بازار، نه فقط دارایی‌های نمایش‌داده‌شده"], ["RSI", "قدرت نسبی قیمت در دوره و تایم‌فریم مشخص"], ["آلت‌سیزن", "مقایسه عملکرد مجموعه تعریف‌شده آلت‌کوین‌ها با بیت‌کوین"], ["ترس و طمع", "برداشت منبع از احساسات بازار"]] : [["Whole-market dominance", "Requires complete market-cap coverage, not only displayed assets"], ["RSI", "Relative price strength over a defined period and timeframe"], ["Altseason", "Performance of a defined altcoin universe against Bitcoin"], ["Fear & greed", "The source’s measure of market sentiment"]]).map(([label, description]) => <div key={label}><dt>{label}</dt><dd>{description}</dd><dd className={styles.caption}>{fa ? "تا اتصال منبع معتبر: نمایش داده نمی‌شود" : "Hidden until a governed source is connected"}</dd></div>)}</dl>
    </details>
  </div>;
}

type League = { windowType: string; sourceCutoffAt: string; entries: { publicProfileId: string; rank: number; displayName: string; username: string; points: number }[] };
export function StoryLeague({ locale }: { locale: Locale }) {
  const fa = locale === "fa";
  const [enabled, setEnabled] = useState(false);
  const [windowType, setWindowType] = useState("monthly");
  // Private authority is requested only on intent, kept out of the shared query cache.
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "login" | "error"; leagues: League[] }>({ status: "idle", leagues: [] });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const clear = () => { controller.abort(); setState({ status: "idle", leagues: [] }); setEnabled(false); };
    readJson<{ leaderboards: (League | null)[] }>("/api/arena/leaderboard", controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(data.leaderboards)) throw new Error("invalid");
      const leagues = data.leaderboards.filter((value): value is League => value !== null && Array.isArray(value.entries) && typeof value.windowType === "string");
      setState({ status: "ready", leagues });
    }).catch(error => { if (!controller.signal.aborted) setState({ status: error.message === "401" ? "login" : "error", leagues: [] }); });
    // Clear private rows when leaving or hiding the page; logout navigates away.
    const hide = () => { if (document.visibilityState === "hidden") clear(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    return () => { controller.abort(); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", clear); };
  }, [enabled]);
  const league = state.leagues.find(value => value.windowType === windowType);
  const entries = (league?.entries ?? []).filter(row => Number.isSafeInteger(row.rank) && row.rank > 0 && Number.isFinite(row.points) && row.points >= 0 && typeof row.displayName === "string").slice(0, 5);
  return <div className={styles.leagueTable}>
    <div className={styles.marketControls}>{[["monthly", fa ? "ماهانه" : "Monthly"], ["lifetime", fa ? "کلی" : "All time"]].map(([value, label]) => <button key={value} type="button" className={styles.smallButton} aria-pressed={windowType === value} onClick={() => setWindowType(value)}>{label}</button>)}</div>
    <div className={styles.tableWrap}><table><caption>{fa ? "رتبه‌های تأییدشده لیگ آرنا" : "Verified Arena league rankings"}</caption><thead><tr><th scope="col">{fa ? "رتبه" : "Rank"}</th><th scope="col">{fa ? "یادگیرنده" : "Learner"}</th><th scope="col">{fa ? "امتیاز" : "Points"}</th></tr></thead><tbody>{entries.map(row => <tr key={row.publicProfileId}><td><span className={styles.rankCell}>{number(row.rank, locale, 0)}</span></td><td>{row.displayName || row.username}</td><td>{number(row.points, locale, 0)}</td></tr>)}</tbody></table></div>
    {!entries.length && <p className={styles.caption} role="status">{state.status === "loading" ? (fa ? "در حال دریافت رتبه‌ها…" : "Loading rankings…") : state.status === "login" ? (fa ? "برای دیدن رتبه‌ها وارد حساب آکادمی شوید." : "Sign in to your Academy account to see rankings.") : state.status === "error" ? (fa ? "رتبه‌بندی فعلاً در دسترس نیست." : "Rankings are temporarily unavailable.") : state.status === "ready" ? (fa ? "برای این بازه رتبهٔ قابل نمایش ثبت نشده است." : "No visible ranking has been recorded for this period.") : (fa ? "رتبه‌های واقعی با حساب آکادمی و مطابق تنظیمات نمایش اعضا دریافت می‌شوند." : "Real rankings use your Academy account and members’ visibility settings.")}</p>}
    <div className={styles.inlineActions}><button type="button" className={styles.smallButton} disabled={state.status === "loading"} onClick={() => { setState({ status: enabled ? "idle" : "loading", leagues: [] }); setEnabled(value => !value); }}><Trophy size={16} aria-hidden="true" />{enabled ? (fa ? "بستن جدول خصوصی" : "Close private table") : (fa ? "دریافت رتبه‌ها" : "Load rankings")}</button><Link href={`${fa ? "" : "/en"}/academy/trading-arena`} className={styles.textLink}>{fa ? "حساب و رتبهٔ من در آرنا" : "My Arena account and rank"}</Link></div>
  </div>;
}
