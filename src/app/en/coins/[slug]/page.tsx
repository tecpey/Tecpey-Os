import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnglishShell, EnglishHero } from "../../components/EnglishUI";
import { NeonIcon } from "@/components/tecpey/NeonIcon";
import { getCoinKnowledge } from "@/data/coinKnowledge";
import { BookOpen } from "lucide-react";

const coins = [
  { slug: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { slug: "tether", symbol: "USDT", name: "Tether" },
  { slug: "ethereum", symbol: "ETH", name: "Ethereum" },
  { slug: "toncoin", symbol: "TON", name: "Toncoin" },
  { slug: "solana", symbol: "SOL", name: "Solana" },
  { slug: "xrp", symbol: "XRP", name: "XRP" },
  { slug: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  { slug: "bnb", symbol: "BNB", name: "BNB" },
  { slug: "cardano", symbol: "ADA", name: "Cardano" },
  { slug: "tron", symbol: "TRX", name: "TRON" },
  { slug: "avalanche", symbol: "AVAX", name: "Avalanche" },
  { slug: "chainlink", symbol: "LINK", name: "Chainlink" },
  { slug: "polkadot", symbol: "DOT", name: "Polkadot" },
  { slug: "litecoin", symbol: "LTC", name: "Litecoin" },
  { slug: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash" },
  { slug: "near", symbol: "NEAR", name: "NEAR Protocol" },
  { slug: "aptos", symbol: "APT", name: "Aptos" },
  { slug: "sui", symbol: "SUI", name: "Sui" },
  { slug: "arbitrum", symbol: "ARB", name: "Arbitrum" },
  { slug: "optimism", symbol: "OP", name: "Optimism" },
  { slug: "cosmos", symbol: "ATOM", name: "Cosmos" },
  { slug: "pepe", symbol: "PEPE", name: "Pepe" },
  { slug: "shiba-inu", symbol: "SHIB", name: "Shiba Inu" },
  { slug: "filecoin", symbol: "FIL", name: "Filecoin" },
  { slug: "internet-computer", symbol: "ICP", name: "Internet Computer" },
  { slug: "injective", symbol: "INJ", name: "Injective" },
  { slug: "sei", symbol: "SEI", name: "Sei" },
  { slug: "stellar", symbol: "XLM", name: "Stellar" },
  { slug: "uniswap", symbol: "UNI", name: "Uniswap" },
  { slug: "maker", symbol: "MKR", name: "Maker" }
];
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
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Crypto guide" title={`${coin.name} (${coin.symbol})`} description={`Understand common use cases, key risks and practical checks before buying, selling or transferring ${coin.symbol}.`} ctaHref="/en/markets" ctaLabel="View markets" secondaryHref="/en/security" secondaryLabel="Security guide" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <article className="rounded-[34px] border border-cyan-300/15 bg-[#06111f] p-7 shadow-[0_24px_70px_rgba(34,211,238,.12)]">
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
              {[["Official website", profile.website], ["Whitepaper / docs", profile.whitepaper], ["Technical docs", profile.docs]].map(([label, href]) => (
                <a key={label} href={href || "#"} target="_blank" rel="noreferrer" className={`rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-3 text-sm font-black ${href ? "text-cyan-300" : "pointer-events-none text-slate-500"}`}>{label}</a>
              ))}
            </div>
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
