export type NewsSourceCategory =
  | "general_crypto"
  | "institutional"
  | "defi"
  | "bitcoin"
  | "onchain_research"
  | "security"
  | "regulation"
  | "protocol_official"
  | "stablecoin_payments"
  | "exchange_infrastructure";

export type NewsSourceTrustTier = "tier_1" | "tier_2" | "tier_3";

export type NewsSourceRegistryEntry = {
  id: string;
  name: string;
  feedUrl: string;
  canonicalDomains: readonly string[];
  category: NewsSourceCategory;
  trustTier: NewsSourceTrustTier;
  firstParty: boolean;
  allowFullArticleFetch: boolean;
  corroborationWeight: number;
};

export const NEWS_SOURCE_REGISTRY: readonly NewsSourceRegistryEntry[] = [
  {
    id: "coindesk",
    name: "CoinDesk",
    feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    canonicalDomains: ["coindesk.com"],
    category: "general_crypto",
    trustTier: "tier_2",
    firstParty: false,
    allowFullArticleFetch: false,
    corroborationWeight: 0.85,
  },
  {
    id: "cointelegraph",
    name: "Cointelegraph",
    feedUrl: "https://cointelegraph.com/rss",
    canonicalDomains: ["cointelegraph.com"],
    category: "general_crypto",
    trustTier: "tier_2",
    firstParty: false,
    allowFullArticleFetch: true,
    corroborationWeight: 0.75,
  },
  {
    id: "decrypt",
    name: "Decrypt",
    feedUrl: "https://decrypt.co/feed",
    canonicalDomains: ["decrypt.co"],
    category: "general_crypto",
    trustTier: "tier_2",
    firstParty: false,
    allowFullArticleFetch: true,
    corroborationWeight: 0.8,
  },
  {
    id: "theblock",
    name: "The Block",
    feedUrl: "https://www.theblock.co/rss.xml",
    canonicalDomains: ["theblock.co"],
    category: "institutional",
    trustTier: "tier_2",
    firstParty: false,
    allowFullArticleFetch: false,
    corroborationWeight: 0.9,
  },
  {
    id: "blockworks",
    name: "Blockworks",
    feedUrl: "https://blockworks.com/feed",
    canonicalDomains: ["blockworks.com"],
    category: "institutional",
    trustTier: "tier_2",
    firstParty: false,
    allowFullArticleFetch: false,
    corroborationWeight: 0.9,
  },
  {
    id: "the-defiant",
    name: "The Defiant",
    feedUrl: "https://thedefiant.io/api/feed",
    canonicalDomains: ["thedefiant.io"],
    category: "defi",
    trustTier: "tier_2",
    firstParty: false,
    allowFullArticleFetch: false,
    corroborationWeight: 0.88,
  },
  {
    id: "bitcoin-optech",
    name: "Bitcoin Optech",
    feedUrl: "https://bitcoinops.org/feed.xml",
    canonicalDomains: ["bitcoinops.org"],
    category: "bitcoin",
    trustTier: "tier_2",
    firstParty: true,
    allowFullArticleFetch: true,
    corroborationWeight: 0.95,
  },
  {
    id: "chainalysis",
    name: "Chainalysis",
    feedUrl: "https://www.chainalysis.com/blog/feed/",
    canonicalDomains: ["chainalysis.com"],
    category: "security",
    trustTier: "tier_2",
    firstParty: true,
    allowFullArticleFetch: false,
    corroborationWeight: 0.92,
  },
  {
    id: "sec",
    name: "U.S. SEC",
    feedUrl: "https://www.sec.gov/news/pressreleases.rss",
    canonicalDomains: ["sec.gov"],
    category: "regulation",
    trustTier: "tier_1",
    firstParty: true,
    allowFullArticleFetch: true,
    corroborationWeight: 1,
  },
] as const;

export function isApprovedNewsSourceHost(
  hostname: string,
  source: NewsSourceRegistryEntry,
): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();

  return source.canonicalDomains.some((domain) => {
    const canonical = domain.replace(/^www\./, "").toLowerCase();
    return host === canonical || host.endsWith(`.${canonical}`);
  });
}
