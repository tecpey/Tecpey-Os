"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import { formatMarketPrice } from "@/lib/public-market-data";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Newspaper, RefreshCw, Table2, Grid2X2, Trophy } from "lucide-react";
import MarketDataProvenance from "@/components/markets/MarketDataProvenance";
import { storyMarketRows, storyHeatmapRows, storySafeLink } from "@/lib/landing-story-data";
import type { CurrencyListResponse } from "@/types/market";
import styles from "./growth-story.module.css";

type Locale = "fa" | "en";
async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}
const number = (value: number, locale: Locale, digits = 2) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: digits }).format(value);
function date(value: string, locale: Locale) {
  return Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(new Date(value)) : "—";
}
function Retry({ locale, retry, loading }: { locale: Locale; retry: () => void; loading: boolean }) {
  return <button type="button" className={styles.smallButton} onClick={retry} disabled={loading}><RefreshCw size={16} aria-hidden="true" />{locale === "fa" ? "دریافت دوباره" : "Refresh"}</button>;
}

type NewsFeed = { mode?: string; updatedAt?: string; items?: { id: string; title: string; summary: string; source: string; url: string; sourceUrl: string; publishedAt: string; category: string }[] };
export function StoryNews({ locale }: { locale: Locale }) {
  const fa = locale === "fa";
  const feed = useQuery({ queryKey: ["landing-story-news", locale], queryFn: ({ signal }) => readJson<NewsFeed>(`/api/crypto-news?locale=${locale}&limit=3`, signal), staleTime: 60_000, refetchInterval: 60_000, retry: 1 });
  const items = (Array.isArray(feed.data?.items) ? feed.data.items : []).filter(item => typeof item.title === "string" && typeof item.summary === "string" && Number.isFinite(Date.parse(item.publishedAt)) && storySafeLink(item.url)).slice(0, 3);
  return <div>
    <div className={styles.newsGrid}>
      {items.map((item, index) => <article key={item.id} className={index === 0 ? styles.leadNews : styles.newsItem}>
        <span className={styles.eyebrow}><Newspaper size={16} aria-hidden="true" />{item.category}</span>
        <h3><Link href={storySafeLink(item.url)!}>{item.title}</Link></h3>
        <p>{item.summary}</p>
        <div className={styles.newsMeta}>
          {storySafeLink(item.sourceUrl) ? <a href={storySafeLink(item.sourceUrl)!} target="_blank" rel="noreferrer">{item.source}<ArrowUpRight size={14} aria-hidden="true" /></a> : <span>{item.source}</span>}
          <time dateTime={item.publishedAt}>{date(item.publishedAt, locale)}</time>
        </div>
        <span className={styles.caption}>{fa ? "خلاصه و زمینهٔ آموزشی تک‌پی · زمان تهران" : "TecPey summary and learning context · Tehran time"}</span>
      </article>)}
    </div>
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
  return <div>
    <div className={styles.quotes}>{rows.slice(0, 4).map(row => <Link href={`${prefix}/markets?search=${encodeURIComponent(row.symbol)}`} key={row.symbol}>
      <strong>{row.symbol}</strong><bdi>{formatMarketPrice(row.price, fa ? "fa-IR" : "en-US")} {query.data?.provenance?.currency || "USD"}</bdi>
      <span className={row.change !== null && row.change > 0 ? styles.positive : row.change !== null && row.change < 0 ? styles.negative : styles.caption} dir="ltr">{row.change === null ? "—" : `${row.change > 0 ? "+" : ""}${number(row.change, locale)}%`}</span>
    </Link>)}</div>
    <div className={styles.marketControls}>
      <label>{fa ? "اندازه بر اساس" : "Size by"}<select value={metric} onChange={event => setMetric(event.target.value as "marketCap" | "volume")}><option value="marketCap">{fa ? "ارزش بازار" : "Market cap"}</option><option value="volume">{fa ? "حجم ۲۴ ساعته" : "24h volume"}</option></select></label>
      <label><input type="checkbox" checked={excludeBtc} onChange={event => setExcludeBtc(event.target.checked)} />{fa ? "بدون بیت‌کوین" : "Exclude Bitcoin"}</label>
      <button className={styles.smallButton} type="button" aria-pressed={list} onClick={() => setList(value => !value)}>{list ? <Grid2X2 size={16} aria-hidden="true" /> : <Table2 size={16} aria-hidden="true" />}{list ? (fa ? "نقشه" : "Map") : (fa ? "فهرست" : "List")}</button>
    </div>
    <p className={styles.caption}>{fa ? "رنگ: تغییر ۲۴ ساعته · اندازه: سهم در دارایی‌های نمایش‌داده‌شده" : "Color: 24h change · Size: share of the displayed assets"}</p>
    {tiles.length > 0 ? (list ? <div className={styles.marketList} aria-label={fa ? "فهرست بازار" : "Market list"}>
      {tiles.map(row => <Link key={row.symbol} href={`${prefix}/markets?search=${encodeURIComponent(row.symbol)}`} className={row.change !== null && row.change > 0 ? styles.upTile : row.change !== null && row.change < 0 ? styles.downTile : styles.neutralTile}>
        <strong>{row.symbol}</strong><bdi>{row.change === null ? "—" : `${row.change > 0 ? "+" : ""}${number(row.change, locale)}%`}</bdi><bdi>{number(row[metric]!, locale, 0)} {query.data?.provenance?.currency || "USD"}</bdi>
      </Link>)}
    </div> : <div className={styles.heatmap} role="img" aria-label={fa ? "نقشه تغییرات بازار؛ برای جزئیات قابل دسترس، فهرست را انتخاب کنید" : "Market change map; select List for accessible details"} dir="ltr">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <Treemap data={tiles.map(row => ({ name: `${row.symbol} ${row.change === null ? "—" : `${row.change > 0 ? "+" : ""}${number(row.change, locale)}%`}`, symbol: row.symbol, size: row[metric]! }))} dataKey="size" nameKey="name" isAnimationActive={false}
          colorPanel={tiles.map(row => row.change === null || row.change === 0 ? "#dfe8ef" : row.change > 0 ? "#b8ead2" : "#fac9c5")}
          onClick={node => { if (typeof node.symbol === "string" && tiles.some(row => row.symbol === node.symbol)) router.push(`${prefix}/markets?search=${encodeURIComponent(node.symbol)}`); }}>
          <Tooltip formatter={value => [number(Number(value), locale, 0), fa ? (metric === "marketCap" ? "ارزش بازار" : "حجم ۲۴ ساعته") : (metric === "marketCap" ? "Market cap" : "24h volume")]} />
        </Treemap>
      </ResponsiveContainer>
    </div>) : <p className={styles.empty} role="status">{query.isPending ? (fa ? "در حال دریافت دادهٔ بازار…" : "Loading market data…") : rows.length ? (fa ? "داده کافی برای اندازه‌گذاری این نقشه موجود نیست؛ معیار دیگر را انتخاب کنید." : "Not enough data to size this map. Select another metric.") : (fa ? "قیمت تازه و قابل اعتبارسنجی در دسترس نیست؛ عدد تخمینی نمایش نمی‌دهیم." : "Fresh, verifiable prices are unavailable. No estimated values are shown.")}</p>}
    {query.isError && <p role="status" className={styles.caption}>{fa ? "آخرین دریافت موفق نبود." : "The latest refresh did not succeed."}</p>}
    <MarketDataProvenance locale={locale} provenance={query.data?.provenance} />
    <div className={styles.inlineActions}><Link className={styles.textLink} href={`${prefix}/markets`}>{fa ? "بررسی همهٔ بازارها" : "Explore all markets"}<ArrowUpRight size={18} aria-hidden="true" /></Link><Retry locale={locale} retry={() => void query.refetch()} loading={query.isFetching} /></div>
    <details className={styles.details}><summary>{fa ? "شاخص‌های بازار؛ معنی و وضعیت داده" : "Market indicators: meaning and availability"}</summary>
      <p>{fa ? "شاخص‌ها فقط با منبع و روش مشخص قابل اتکا هستند. سرویس فعلی لندینگ هنوز دادهٔ این شاخص‌ها را ارائه نمی‌کند." : "Indicators need a defined source and method. The current landing feed does not yet supply these indicators."}</p>
      <dl className={styles.indicators}>{(fa ? [["دامیننس", "سهم هر دارایی از ارزش کل بازار"], ["RSI", "قدرت نسبی قیمت در دوره و تایم‌فریم مشخص"], ["آلت‌سیزن", "مقایسه عملکرد مجموعه تعریف‌شده آلت‌کوین‌ها با بیت‌کوین"], ["ترس و طمع", "برداشت منبع از احساسات بازار"]] : [["Dominance", "An asset’s share of total market capitalization"], ["RSI", "Relative price strength over a defined period and timeframe"], ["Altseason", "Performance of a defined altcoin universe against Bitcoin"], ["Fear & greed", "The source’s measure of market sentiment"]]).map(([label, description]) => <div key={label}><dt>{label}</dt><dd>{description}</dd><dd className={styles.caption}>{fa ? "داده در دسترس نیست" : "Data unavailable"}</dd></div>)}</dl>
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
  return <div>
    <div className={styles.marketControls}>{[["monthly", fa ? "ماهانه" : "Monthly"], ["lifetime", fa ? "کلی" : "All time"]].map(([value, label]) => <button key={value} type="button" className={styles.smallButton} aria-pressed={windowType === value} onClick={() => setWindowType(value)}>{label}</button>)}</div>
    <div className={styles.tableWrap}><table><caption>{fa ? "رتبه‌های تأییدشده لیگ آرنا" : "Verified Arena league rankings"}</caption><thead><tr><th scope="col">{fa ? "رتبه" : "Rank"}</th><th scope="col">{fa ? "یادگیرنده" : "Learner"}</th><th scope="col">{fa ? "امتیاز" : "Points"}</th></tr></thead><tbody>{entries.map(row => <tr key={row.publicProfileId}><td>{number(row.rank, locale, 0)}</td><td>{row.displayName || row.username}</td><td>{number(row.points, locale, 0)}</td></tr>)}</tbody></table></div>
    {!entries.length && <p className={styles.caption} role="status">{state.status === "loading" ? (fa ? "در حال دریافت رتبه‌ها…" : "Loading rankings…") : state.status === "login" ? (fa ? "برای دیدن رتبه‌ها وارد حساب آکادمی شوید." : "Sign in to your Academy account to see rankings.") : state.status === "error" ? (fa ? "رتبه‌بندی فعلاً در دسترس نیست." : "Rankings are temporarily unavailable.") : state.status === "ready" ? (fa ? "برای این بازه رتبهٔ قابل نمایش ثبت نشده است." : "No visible ranking has been recorded for this period.") : (fa ? "رتبه‌های واقعی با حساب آکادمی و مطابق تنظیمات نمایش اعضا دریافت می‌شوند." : "Real rankings use your Academy account and members’ visibility settings.")}</p>}
    <div className={styles.inlineActions}><button type="button" className={styles.smallButton} disabled={state.status === "loading"} onClick={() => { setState({ status: enabled ? "idle" : "loading", leagues: [] }); setEnabled(value => !value); }}><Trophy size={16} aria-hidden="true" />{enabled ? (fa ? "بستن جدول خصوصی" : "Close private table") : (fa ? "دریافت رتبه‌ها" : "Load rankings")}</button><Link href={`${fa ? "" : "/en"}/academy/trading-arena`} className={styles.textLink}>{fa ? "حساب و رتبهٔ من در آرنا" : "My Arena account and rank"}</Link></div>
  </div>;
}
