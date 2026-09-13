import type { NewsEntityReference } from "../../lib/news-intelligence-graph";

export const TECPEY_NEWS_ENTITY_RESOLUTION_VERSION = "tecpey-news-entity-resolution-v1";

type EntityDictionaryItem = {
  type: NewsEntityReference["type"];
  id: string;
  label: string;
  aliases: readonly string[];
  confidence: number;
  officialUrl?: string;
};

const ENTITY_DICTIONARY: readonly EntityDictionaryItem[] = [
  { type: "network", id: "base", label: "Base", aliases: ["base", "base chain", "شبکه base"], confidence: 0.94, officialUrl: "https://www.base.org/" },
  { type: "network", id: "ethereum", label: "Ethereum", aliases: ["ethereum", "اتریوم"], confidence: 0.96, officialUrl: "https://ethereum.org/" },
  { type: "network", id: "solana", label: "Solana", aliases: ["solana", "سولانا"], confidence: 0.96, officialUrl: "https://solana.com/" },
  { type: "project", id: "curve", label: "Curve", aliases: ["curve", "curve dao", "crvusd", "llamalend"], confidence: 0.93, officialUrl: "https://curve.fi/" },
  { type: "project", id: "moonwell", label: "Moonwell", aliases: ["moonwell"], confidence: 0.95, officialUrl: "https://moonwell.fi/" },
  { type: "project", id: "chainlink", label: "Chainlink", aliases: ["chainlink", "proof of reserve", "اثبات ذخیره chainlink"], confidence: 0.94, officialUrl: "https://chain.link/" },
  { type: "project", id: "bitwise", label: "Bitwise", aliases: ["bitwise"], confidence: 0.92, officialUrl: "https://bitwiseinvestments.com/" },
  { type: "project", id: "resupply", label: "Resupply", aliases: ["resupply"], confidence: 0.91, officialUrl: "https://resupply.fi/" },
  { type: "project", id: "fogo", label: "Fogo", aliases: ["fogo", "fogo mainnet"], confidence: 0.91, officialUrl: "https://www.fogo.io/" },
  { type: "project", id: "revolut", label: "Revolut", aliases: ["revolut", "revolut x"], confidence: 0.97, officialUrl: "https://www.revolut.com/" },
  { type: "project", id: "bridge-building", label: "Bridge Building", aliases: ["bridge building", "bridge building s.a.", "bridge building sa", "bridge"], confidence: 0.93, officialUrl: "https://www.bridge.xyz/" },
  { type: "project", id: "eurr", label: "EURR", aliases: ["eurr", "revolut stablecoin", "revolut emt"], confidence: 0.96, officialUrl: "https://reserves.bridge.xyz/eurr" },
  { type: "exchange", id: "coinbase", label: "Coinbase", aliases: ["coinbase", "کوین بیس", "کوین‌بیس"], confidence: 0.96, officialUrl: "https://www.coinbase.com/" },
  { type: "exchange", id: "lighter", label: "Lighter", aliases: ["lighter", "lighter dex", "lighter perp"], confidence: 0.91, officialUrl: "https://lighter.xyz/" },
  { type: "regulator", id: "sec-us", label: "U.S. SEC", aliases: ["u.s. sec", "us sec", "sec", "کمیسیون بورس و اوراق بهادار آمریکا"], confidence: 0.93, officialUrl: "https://www.sec.gov/" },
  { type: "regulator", id: "ofac", label: "OFAC", aliases: ["ofac", "office of foreign assets control", "دفتر کنترل دارایی های خارجی", "دفتر کنترل دارایی‌های خارجی"], confidence: 0.97, officialUrl: "https://ofac.treasury.gov/" },
  { type: "regulator", id: "fbi", label: "FBI", aliases: ["fbi", "federal bureau of investigation"], confidence: 0.95, officialUrl: "https://www.fbi.gov/" },
  { type: "regulator", id: "us-doj", label: "U.S. Department of Justice", aliases: ["department of justice", "u.s. doj", "us doj", "وزارت دادگستری ایالات متحده"], confidence: 0.92, officialUrl: "https://www.justice.gov/" },
];

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ـ]/g, "")
    .replace(/[\u200c\u200f\u202a-\u202e]/g, " ")
    .replace(/[_/–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function latinAliasMatch(haystack: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

function aliasMatch(haystack: string, alias: string): boolean {
  const needle = normalize(alias);
  if (!needle) return false;
  return /^[a-z0-9 .+#]+$/.test(needle) ? latinAliasMatch(haystack, needle) : haystack.includes(needle);
}

function entityKey(entity: Pick<NewsEntityReference, "type" | "id">): string {
  return `${entity.type}:${entity.id.trim().toLowerCase()}`;
}

export function resolveNewsEntities(
  text: string,
  existing: NewsEntityReference[] = [],
): NewsEntityReference[] {
  const normalized = normalize(text);
  const byKey = new Map<string, NewsEntityReference>();

  for (const entity of existing) byKey.set(entityKey(entity), { ...entity });

  for (const item of ENTITY_DICTIONARY) {
    if (!item.aliases.some((alias) => aliasMatch(normalized, alias))) continue;
    const entity: NewsEntityReference = {
      type: item.type,
      id: item.id,
      label: item.label,
      confidence: item.confidence,
    };
    if (item.officialUrl) entity.officialUrl = item.officialUrl;
    const key = entityKey(entity);
    const previous = byKey.get(key);
    if (!previous || entity.confidence > previous.confidence) byKey.set(key, entity);
  }

  return [...byKey.values()].sort(
    (left, right) => left.type.localeCompare(right.type) || left.id.localeCompare(right.id),
  );
}

export function hasResolvedNewsEntity(text: string): boolean {
  return resolveNewsEntities(text).length > 0;
}
