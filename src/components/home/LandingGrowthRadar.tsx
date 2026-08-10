import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  LineChart,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  getLandingGrowthRadar,
  type LandingGrowthCoin,
  type LandingGrowthRadarModel,
  type LandingGrowthTool,
} from "@/lib/landing-growth";
import type { ContentLocale } from "@/lib/content-growth";
import { CoinVisual } from "@/components/tecpey/CoinVisual";

function percent(value: number, locale: ContentLocale) {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(value * 100));
}

function coinTitle(coin: LandingGrowthCoin, locale: ContentLocale) {
  return locale === "fa" ? `${coin.faName} (${coin.symbol})` : `${coin.name} (${coin.symbol})`;
}

function toolSummary(tool: LandingGrowthTool, locale: ContentLocale) {
  return locale === "fa" ? tool.summaryFa : tool.summaryEn;
}

function coinCategory(coin: LandingGrowthCoin, locale: ContentLocale) {
  if (locale === "fa") return coin.category;
  const categories: Record<string, string> = {
    BTC: "Core crypto asset",
    USDT: "Stablecoin learning route",
    ETH: "Smart-contract network",
    TON: "Telegram-linked blockchain ecosystem",
    SOL: "High-speed smart-contract network",
  };
  return categories[coin.symbol] ?? "Crypto learning route";
}

function FeaturedCoinCard({
  coin,
  index,
  locale,
}: {
  coin: LandingGrowthCoin;
  index: number;
  locale: ContentLocale;
}) {
  const isFa = locale === "fa";
  const href = isFa ? `/coins/${coin.slug}` : `/en/coins/${coin.slug}`;
  const Arrow = isFa ? ArrowLeft : ArrowRight;
  return (
    <Link
      href={href}
      className="group min-h-[176px] overflow-hidden rounded-[26px] border border-cyan-300/15 bg-white/85 p-3 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-[0_24px_70px_rgba(34,211,238,.16)] focus:outline-none focus:ring-2 focus:ring-cyan-300/60 dark:bg-white/[0.055]"
    >
      <CoinVisual symbol={coin.symbol} slug={coin.slug} name={coin.name} faName={coin.faName} locale={locale} variant="cover" />
      <div className="mt-4 flex items-start justify-between gap-3 px-2">
        <div className="min-w-0">
          <p className="text-xs font-black text-cyan-700 dark:text-cyan-200">
            {isFa ? `ارز منتخب ${index + 1}` : `Coin ${index + 1}`}
          </p>
          <h3 className="mt-2 line-clamp-1 text-lg font-black text-[color:var(--tp-text)]">
            {coinTitle(coin, locale)}
          </h3>
        </div>
        <span className="shrink-0 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-700 dark:text-cyan-100">
          {percent(coin.impactRankScore, locale)}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 px-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
        {coinCategory(coin, locale)}
      </p>
      {coin.latestImpactTitle ? (
        <p className="mt-3 line-clamp-2 px-2 text-xs font-bold leading-6 text-slate-600 dark:text-slate-300">
          {coin.latestImpactTitle}
        </p>
      ) : null}
      <span className="mx-2 mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-black text-cyan-700 transition group-hover:text-cyan-500 dark:text-cyan-200">
        {isFa ? "پرونده آموزشی" : "Open coin guide"}
        <Arrow className="h-4 w-4 transition group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
      </span>
    </Link>
  );
}

function FeaturedToolCard({
  tool,
  index,
  locale,
}: {
  tool: LandingGrowthTool;
  index: number;
  locale: ContentLocale;
}) {
  const isFa = locale === "fa";
  const href = isFa ? `/trading-tools/${tool.slug}` : `/en/trading-tools/${tool.slug}`;
  const Arrow = isFa ? ArrowLeft : ArrowRight;
  return (
    <Link
      href={href}
      className="group min-h-[176px] rounded-[26px] border border-slate-200 bg-white/85 p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-[0_24px_70px_rgba(34,211,238,.16)] focus:outline-none focus:ring-2 focus:ring-cyan-300/60 dark:border-white/10 dark:bg-white/[0.055]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-cyan-700 dark:text-cyan-200">
            {isFa ? `ابزار منتخب ${index + 1}` : `Tool ${index + 1}`}
          </p>
          <h3 className="mt-2 line-clamp-1 text-lg font-black text-[color:var(--tp-text)]">
            {tool.name}
          </h3>
        </div>
        <span className="shrink-0 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-700 dark:text-emerald-200">
          {percent(tool.growthRank.rankScore, locale)}
        </span>
      </div>
      <p className="mt-3 line-clamp-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
        {toolSummary(tool, locale)}
      </p>
      <span className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-black text-cyan-700 transition group-hover:text-cyan-500 dark:text-cyan-200">
        {isFa ? "راهنمای ابزار" : "Open tool guide"}
        <Arrow className="h-4 w-4 transition group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
      </span>
    </Link>
  );
}

export function LandingGrowthRadar({
  locale,
  radar: providedRadar,
}: {
  locale: ContentLocale;
  radar?: LandingGrowthRadarModel;
}) {
  const isFa = locale === "fa";
  const radar = providedRadar ?? getLandingGrowthRadar(locale);
  return (
    <section id="growth-radar" className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/15 bg-white/[0.08] p-5 shadow-[0_24px_80px_rgba(0,0,0,.14)] backdrop-blur-xl dark:bg-white/[0.045] sm:p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-700 dark:text-cyan-100">
              <Sparkles className="h-4 w-4" />
              {isFa ? "رادار زنده رشد تک‌پی" : "TecPey growth radar"}
            </div>
            <h2 className="mt-5 text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl">
              {isFa
                ? "۵ ارز خبرمحور و ۵ ابزار برتر برای شروع آگاهانه همین امروز"
                : "Five news-led coins and five tools to start learning with better context"}
            </h2>
            <p className="mt-4 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">
              {isFa
                ? "ارزهای این بخش همان ۵ ارزی هستند که به‌خاطر خبرهای مهم و قابل audit بالای لیست قرار می‌گیرند؛ کاربر به جای لیست خام، دلیل برجسته شدن هر مسیر را می‌بیند."
                : "The coin cards mirror the five coins lifted by high-priority auditable news, so users see why each learning route is currently highlighted."}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-3xl border border-cyan-300/15 bg-cyan-500/10 p-4">
                <Coins className="h-6 w-6 text-cyan-600 dark:text-cyan-200" />
                <p className="mt-3 text-sm font-black text-[color:var(--tp-text)]">
                  {isFa ? "ارزها مستقیماً از خبرهای اثرگذار و ردیف اولویت coin/news تغذیه می‌شوند." : "Coins come directly from high-impact news and the coin/news priority row."}
                </p>
              </div>
              <div className="rounded-3xl border border-emerald-300/15 bg-emerald-500/10 p-4">
                <Wrench className="h-6 w-6 text-emerald-600 dark:text-emerald-200" />
                <p className="mt-3 text-sm font-black text-[color:var(--tp-text)]">
                  {isFa ? "ابزارها با وزن ایمنی، کاربرد و کامل بودن لینک رسمی انتخاب می‌شوند." : "Tools prioritize safety, usefulness and official-link completeness."}
                </p>
              </div>
            </div>
            <p className="mt-5 rounded-3xl border border-amber-300/25 bg-amber-300/10 p-4 text-xs font-black leading-7 text-amber-800 dark:text-amber-100">
              {isFa
                ? "این رتبه‌بندی آموزشی است و توصیه خرید، فروش یا نگهداری هیچ دارایی نیست."
                : "This ranking is educational and is not buy, sell or hold advice."}
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-[color:var(--tp-text)]">
                <LineChart className="h-5 w-5 text-cyan-600 dark:text-cyan-200" />
                {isFa ? "۵ ارز خبرمحور بالای لیست" : "Top 5 news-led coins"}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {radar.coins.map((coin, index) => (
                  <FeaturedCoinCard key={coin.symbol} coin={coin} index={index} locale={locale} />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-[color:var(--tp-text)]">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-200" />
                {isFa ? "۵ ابزار برتر لیست" : "Top 5 tools"}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {radar.tools.map((tool, index) => (
                  <FeaturedToolCard key={tool.slug} tool={tool} index={index} locale={locale} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
