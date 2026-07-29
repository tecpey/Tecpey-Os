import { ArticleSchema } from "@/components/seo/ArticleSchema";
import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";
import { StructuredData, breadcrumbSchema } from "@/components/seo/StructuredData";

export const metadata: Metadata = {
  title: "Crypto coin guides | TecPey",
  description: "English guides for Bitcoin, Tether, Ethereum, Toncoin, Solana and other crypto assets: use cases, risks and key considerations.",
  alternates: { canonical: "https://tecpey.ir/en/coins" },
};

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

export default function CoinsPage() {
  return (
    <EnglishShell>
      <ArticleSchema headline="TecPey Coin Guides" description="Readable crypto guides covering coin use cases, risks, networks and market checks." url="https://tecpey.ir/en/coins" language="en" />
      <StructuredData data={[schema, breadcrumbSchema([{ name: "Home", url: "https://tecpey.ir/en" }, { name: "Coins", url: "https://tecpey.ir/en/coins" }])]} />
      <EnglishHero eyebrow="Coin guides" title="Explore Bitcoin, Tether and major crypto assets" description="Read simple guides about use cases, risks, networks and important considerations before buying or transferring crypto." ctaHref="/en/markets" ctaLabel="View markets" secondaryHref="/en/start-guide" secondaryLabel="Start guide" />
      <section className="px-4 pb-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {introCards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-3">
          {coins.map((coin) => <EnglishCard key={coin.slug} title={`${coin.name} (${coin.symbol})`} text={`Learn what ${coin.name} is, how it is commonly used and which risks to check before trading or transferring ${coin.symbol}.`} href={`/en/coins/${coin.slug}`} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
