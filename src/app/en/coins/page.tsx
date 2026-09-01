import { ArticleSchema } from "@/components/seo/ArticleSchema";
import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";
import { StructuredData, breadcrumbSchema } from "@/components/seo/StructuredData";
import { coinPages } from "@/data/coins";
import { CoinVisual } from "@/components/tecpey/CoinVisual";
import { ArrowRight } from "lucide-react";
import { TrendRadarWidget } from "@/components/growth/TrendRadarWidget";
import { getGrowthTrendRadarFromAuthority } from "@/lib/growth-trend-authority";

export const metadata: Metadata = {
  title: "Crypto coin guides | TecPey",
  description: "English guides for Bitcoin, Tether, Ethereum, Toncoin, Solana and other crypto assets: use cases, risks and key considerations.",
  alternates: { canonical: "https://tecpey.ir/en/coins" },
};

const schema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "TecPey Coin Guides",
  url: "https://tecpey.ir/en/coins",
  inLanguage: "en",
  about: ["Bitcoin", "USDT", "Ethereum", "Altcoins", "Crypto risk", "Crypto networks"],
};

const introCards = [
  { title: "Readable guides", text: "Each coin page focuses on use cases, risks, networks and practical checks before trading.", href: "/en/academy" },
  { title: "Risk-aware decisions", text: "No coin guide should be treated as financial advice or a profit promise.", href: "/en/risk-disclosure" },
  { title: "Market connection", text: "Review live market information before making a trading or transfer decision.", href: "/en/markets" },
];

export default async function CoinsPage() {
  const trendRadar = await getGrowthTrendRadarFromAuthority("en");
  return (
    <EnglishShell>
      <ArticleSchema headline="TecPey Coin Guides" description="Readable crypto guides covering coin use cases, risks, networks and market checks." url="https://tecpey.ir/en/coins" language="en" />
      <StructuredData data={[schema, breadcrumbSchema([{ name: "Home", url: "https://tecpey.ir/en" }, { name: "Coins", url: "https://tecpey.ir/en/coins" }])]} />
      <TrendRadarWidget data={trendRadar} locale="en" />
      <EnglishHero eyebrow="Coin guides" title="Explore Bitcoin, Tether and major crypto assets" description="Read simple guides about use cases, risks, networks and important considerations before buying or transferring crypto." ctaHref="/en/markets" ctaLabel="View markets" secondaryHref="/en/start-guide" secondaryLabel="Start guide" />
      <section className="px-4 pb-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {introCards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-3">
          {coinPages.map((coin) => (
            <Link
              key={coin.slug}
              href={`/en/coins/${coin.slug}`}
              className="group overflow-hidden rounded-[30px] border border-cyan-300/15 bg-[#06111f] p-3 shadow-[0_18px_55px_rgba(34,211,238,.10)] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-[0_24px_70px_rgba(34,211,238,.16)] focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
            >
              <CoinVisual symbol={coin.symbol} slug={coin.slug} name={coin.name} faName={coin.faName} locale="en" />
              <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-black text-white">
                      {coin.name} ({coin.symbol})
                    </h2>
                    <p className="mt-1 text-xs font-black text-cyan-300">Risk-aware crypto guide</p>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-200 transition group-hover:bg-cyan-500 group-hover:text-white">
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm font-bold leading-7 text-slate-300">
                  Learn what {coin.name} is, how it is commonly used and which risks to check before trading or transferring {coin.symbol}.
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </EnglishShell>
  );
}
