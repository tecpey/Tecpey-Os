import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CircleGauge,
  Coins,
  Newspaper,
  ShieldCheck,
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

function coinTitle(coin: LandingGrowthCoin, locale: ContentLocale) {
  return locale === "fa" ? `${coin.faName} (${coin.symbol})` : `${coin.name} (${coin.symbol})`;
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

function toolSummary(tool: LandingGrowthTool, locale: ContentLocale) {
  return locale === "fa" ? tool.summaryFa : tool.summaryEn;
}

function FeaturedCoinRow({
  coin,
  locale,
}: {
  coin: LandingGrowthCoin;
  locale: ContentLocale;
}) {
  const isFa = locale === "fa";
  const Arrow = isFa ? ArrowLeft : ArrowRight;
  const href = isFa ? `/coins/${coin.slug}` : `/en/coins/${coin.slug}`;

  return (
    <Link
      href={href}
      className="group grid min-h-[116px] grid-cols-[48px_1fr_auto] items-center gap-4 border-b border-[color:var(--tp-border)] py-4 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--tp-focus)]"
    >
      <CoinVisual
        symbol={coin.symbol}
        slug={coin.slug}
        name={coin.name}
        faName={coin.faName}
        locale={locale}
        variant="avatar"
      />
      <span className="min-w-0">
        <span className="block text-base font-black text-[color:var(--tp-text)]">
          {coinTitle(coin, locale)}
        </span>
        <span className="mt-1 block text-xs font-bold leading-6 text-[color:var(--tp-muted)]">
          {coin.latestImpactTitle || coinCategory(coin, locale)}
        </span>
      </span>
      <Arrow
        className="h-4 w-4 text-[color:var(--tp-primary)] transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1"
        aria-hidden="true"
      />
    </Link>
  );
}

function FeaturedToolRow({
  tool,
  locale,
}: {
  tool: LandingGrowthTool;
  locale: ContentLocale;
}) {
  const isFa = locale === "fa";
  const Arrow = isFa ? ArrowLeft : ArrowRight;
  const href = isFa ? `/trading-tools/${tool.slug}` : `/en/trading-tools/${tool.slug}`;

  return (
    <Link
      href={href}
      className="group grid min-h-[116px] grid-cols-[48px_1fr_auto] items-center gap-4 border-b border-[color:var(--tp-border)] py-4 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--tp-focus)]"
    >
      <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl border border-[color:var(--tp-border)] bg-slate-950 text-sm font-black text-white">
        <span aria-hidden="true">{tool.logo || tool.name.slice(0, 1)}</span>
        <svg
          viewBox="0 0 40 40"
          className="absolute inset-1 h-9 w-9 rounded-xl bg-white p-1"
          aria-hidden="true"
        >
          <image href={tool.logoUrl} width="40" height="40" preserveAspectRatio="xMidYMid meet" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-base font-black text-[color:var(--tp-text)]">
          {tool.name}
        </span>
        <span className="mt-1 block line-clamp-2 text-xs font-bold leading-6 text-[color:var(--tp-muted)]">
          {toolSummary(tool, locale)}
        </span>
      </span>
      <Arrow
        className="h-4 w-4 text-[color:var(--tp-primary)] transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1"
        aria-hidden="true"
      />
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
  const prefix = isFa ? "" : "/en";

  return (
    <section
      id="growth-radar"
      data-home-section="growth-radar"
      data-major-section-visibility="desktop-only"
      className="hidden bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 md:block lg:px-8 lg:pb-24"
    >
      <div className="mx-auto max-w-7xl border-y border-[color:var(--tp-border)] py-10 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-12">
          <div>
            <div className="tecpey-kicker">
              <CircleGauge className="h-4 w-4" aria-hidden="true" />
              {isFa ? "زمینهٔ امروز بازار" : "Today's market context"}
            </div>
            <h2 className="mt-5 text-balance text-3xl font-black leading-tight text-[color:var(--tp-text)] sm:text-4xl">
              {isFa
                ? "قبل از دنبال‌کردن قیمت، بفهم چه چیزی ارزش بررسی دارد."
                : "Before following price, understand what is worth investigating."}
            </h2>
            <p className="mt-4 text-sm font-semibold leading-8 text-[color:var(--tp-muted)]">
              {isFa
                ? "این بخش چند مسیر آموزشی را از میان خبرها، داده‌ها و ابزارهای دارای شواهد تازه بیرون می‌کشد؛ نه برای پیشنهاد معامله، بلکه برای اینکه بدانی امروز چه چیزی را بهتر است بفهمی."
                : "This section surfaces a small set of learning routes from current evidence, news and tools—not to suggest a trade, but to make today's research starting point clearer."}
            </p>

            <div className="mt-7 space-y-4 border-s border-[color:var(--tp-border)] ps-5">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-[color:var(--tp-text)]">
                  <Newspaper className="h-4 w-4 text-[color:var(--tp-primary)]" aria-hidden="true" />
                  {isFa ? "زمینه و منبع، قبل از هیجان" : "Context and source before hype"}
                </div>
                <p className="mt-1 text-xs font-semibold leading-6 text-[color:var(--tp-muted)]">
                  {isFa
                    ? "برجسته‌شدن یک کوین یا ابزار باید دلیل قابل‌فهم و منبع قابل‌پیگیری داشته باشد."
                    : "A highlighted coin or tool should have an understandable reason and traceable source."}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-[color:var(--tp-text)]">
                  <ShieldCheck className="h-4 w-4 text-[color:var(--tp-primary)]" aria-hidden="true" />
                  {isFa ? "بدون امتیازِ شبه‌سیگنال" : "No signal-like scoring"}
                </div>
                <p className="mt-1 text-xs font-semibold leading-6 text-[color:var(--tp-muted)]">
                  {isFa
                    ? "ترتیب نمایش برای کشف محتواست و معنای خرید، فروش یا برتری سرمایه‌گذاری ندارد."
                    : "Display order helps content discovery and does not imply buy, sell or investment superiority."}
                </p>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={`${prefix}/crypto-news`} className="tecpey-action-secondary tecpey-action-compact">
                <Newspaper className="h-4 w-4" aria-hidden="true" />
                {isFa ? "خبرهای امروز" : "Today's news"}
              </Link>
              <Link href={`${prefix}/trading-tools`} className="tecpey-action-ghost tecpey-action-compact">
                <Wrench className="h-4 w-4" aria-hidden="true" />
                {isFa ? "همه ابزارها" : "All tools"}
              </Link>
            </div>
          </div>

          <div className="grid gap-8 xl:grid-cols-2">
            <div>
              <div className="flex items-center justify-between gap-3 border-b border-[color:var(--tp-border)] pb-3">
                <div className="flex items-center gap-2 text-sm font-black text-[color:var(--tp-text)]">
                  <Coins className="h-5 w-5 text-[color:var(--tp-primary)]" aria-hidden="true" />
                  {isFa ? "رمزارزهای قابل بررسی" : "Coins to investigate"}
                </div>
                <span className="text-xs font-bold text-[color:var(--tp-muted)]">
                  {new Intl.NumberFormat(isFa ? "fa-IR" : "en-US").format(radar.coins.length)}
                </span>
              </div>
              <div>
                {radar.coins.map((coin) => (
                  <FeaturedCoinRow key={coin.symbol} coin={coin} locale={locale} />
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 border-b border-[color:var(--tp-border)] pb-3">
                <div className="flex items-center gap-2 text-sm font-black text-[color:var(--tp-text)]">
                  <Wrench className="h-5 w-5 text-[color:var(--tp-primary)]" aria-hidden="true" />
                  {isFa ? "ابزارهای قابل استفاده" : "Tools to use"}
                </div>
                <span className="text-xs font-bold text-[color:var(--tp-muted)]">
                  {new Intl.NumberFormat(isFa ? "fa-IR" : "en-US").format(radar.tools.length)}
                </span>
              </div>
              <div>
                {radar.tools.map((tool) => (
                  <FeaturedToolRow key={tool.slug} tool={tool} locale={locale} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-8 border-t border-[color:var(--tp-border)] pt-4 text-xs font-bold leading-6 text-[color:var(--tp-muted)]">
          {isFa
            ? "این انتخاب‌ها آموزشی‌اند و توصیه خرید، فروش یا نگهداری دارایی نیستند."
            : "These selections are educational and are not buy, sell or hold advice."}
        </p>
      </div>
    </section>
  );
}
