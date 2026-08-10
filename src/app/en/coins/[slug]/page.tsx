import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnglishShell, EnglishHero } from "../../components/EnglishUI";
import { StructuredData } from "@/components/seo/StructuredData";
import { NewsImpactTimeline } from "@/components/content/NewsImpactTimeline";
import { NeonIcon } from "@/components/tecpey/NeonIcon";
import { CoinVisual } from "@/components/tecpey/CoinVisual";
import { coinPages } from "@/data/coins";
import { getCoinKnowledge } from "@/data/coinKnowledge";
import {
  buildNewsImpactItemListSchema,
  getHighPriorityNewsForCoin,
} from "@/lib/news-impact-history";
import { BookOpen } from "lucide-react";

const coins = coinPages.map((coin) => ({
  slug: coin.slug,
  symbol: coin.symbol,
  name: coin.name,
  faName: coin.faName,
  automation: coin.automation,
}));
const coinMap = new Map(coins.map((coin) => [coin.slug, coin]));

export function generateStaticParams() {
  return coins.map((coin) => ({ slug: coin.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const coin = coinMap.get(slug);
  if (!coin) return { title: "Coin guide | TecPey" };
  return {
    title: `${coin.name} (${coin.symbol}) guide | TecPey`,
    description: `Learn what ${coin.name} is, common use cases, risks and important checks before trading or transferring ${coin.symbol}.`,
    alternates: { canonical: `https://tecpey.ir/en/coins/${slug}` },
  };
}

export default async function CoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const coin = coinMap.get(slug);
  if (!coin) return notFound();
  const profile = getCoinKnowledge(coin.symbol, coin.name, coin.name);
  const impactNews = getHighPriorityNewsForCoin(coin.symbol, "en", 4);
  const pageUrl = `https://tecpey.ir/en/coins/${slug}`;
  const officialWebsite = profile.website || coin.automation?.officialWebsite || "";
  const officialWhitepaper = profile.whitepaper || coin.automation?.docs || coin.automation?.officialWebsite || "";
  const officialDocs = profile.docs || coin.automation?.docs || coin.automation?.officialWebsite || "";
  return (
    <EnglishShell>
      <StructuredData
        data={buildNewsImpactItemListSchema({
          items: impactNews,
          locale: "en",
          pageUrl,
          name: `${coin.name} (${coin.symbol}) high-priority news impact history`,
        })}
      />
      <EnglishHero eyebrow="Crypto guide" title={`${coin.name} (${coin.symbol})`} description={`Understand common use cases, key risks and practical checks before buying, selling or transferring ${coin.symbol}.`} ctaHref="/en/markets" ctaLabel="View markets" secondaryHref="/en/security" secondaryLabel="Security guide" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <article className="rounded-[34px] border border-cyan-300/15 bg-[#06111f] p-7 shadow-[0_24px_70px_rgba(34,211,238,.12)]">
            <div className="mb-6">
              <CoinVisual symbol={coin.symbol} slug={coin.slug} name={coin.name} faName={coin.faName} locale="en" priority />
            </div>
            <div className="mb-5"><NeonIcon icon={BookOpen} size="md" /></div><h2 className="text-2xl font-black text-white">Before you trade</h2>
            <div className="mt-5 space-y-4 text-base font-bold leading-9 text-slate-300">
              <p>Review live prices, market capitalization, 24-hour volume, trading fees, withdrawal fees and the network you plan to use. A good decision starts with understanding both the asset and the risk.</p>
              <p><strong>Project / entity:</strong> {profile.projectEntity}</p>
              <p><strong>Category:</strong> {profile.category}. <strong>Consensus / architecture:</strong> {profile.consensus}</p>
              <p><strong>Supply model:</strong> {profile.supplyModel}</p>
              <p><strong>Market Cap / FDV / Volume / Supply:</strong> Check the live crypto tab for price, 24h change, market cap, fully diluted valuation, 24h volume, circulating supply, total supply and max supply. These numbers change continuously and should not be treated as fixed educational text.</p>
              <p><strong>Market data:</strong> Market Cap, FDV, 24h Volume, Rank, Circulating Supply, Total Supply and Max Supply should be checked from the live TecPey market board in the market/coin tab because these numbers change continuously.</p>
              <p>{profile.deepIntro[0]}</p>
              <p>For any crypto transfer, confirm that the selected network matches the destination wallet or exchange. Wrong network choices can cause irreversible loss.</p>
              <p>TecPey’s goal is to make the first steps clearer: learn, secure your account, review markets and then decide with a risk-aware plan.</p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[["Official website", officialWebsite], ["Whitepaper / docs", officialWhitepaper], ["Technical docs", officialDocs]].map(([label, href]) => (
                <a key={label} href={href || "#"} target="_blank" rel="noreferrer" className={`rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-3 text-sm font-black ${href ? "text-cyan-300" : "pointer-events-none text-slate-500"}`}>{label}</a>
              ))}
            </div>
            <NewsImpactTimeline items={impactNews} locale="en" subject={`${coin.name} (${coin.symbol})`} />
          </article>
          <div className="space-y-3">
            {[
              [`What is ${coin.name}?`, `${coin.name} is a crypto asset. Users should understand its purpose, network, liquidity and risks before trading.`],
              [`Does buying ${coin.symbol} guarantee profit?`, "No. Crypto prices are volatile and profit is never guaranteed."],
              ["What should I check before transferring crypto?", "Check the destination address, blockchain network, amount, fees and account security settings."],
            ].map(([q, a]) => (
              <div key={q} className="rounded-3xl border border-cyan-300/15 bg-[#06111f] p-5">
                <h3 className="font-black text-white">{q}</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{a}</p>
              </div>
            ))}
            <Link href="/en/coins" className="inline-flex font-black text-cyan-600">Back to coin guides</Link>
          </div>
        </div>
      </section>
    </EnglishShell>
  );
}
