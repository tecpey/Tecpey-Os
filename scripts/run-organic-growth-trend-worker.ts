import { randomUUID } from "node:crypto";
import { withTx } from "../src/lib/db";
import { callAiProvider, type AiSourceReference } from "../src/lib/ai/provider-router";
import { coinGrowthCandidates } from "../src/data/coinGrowthCandidates";
import { getRankedTraderTools } from "../src/lib/trading-tools-growth";
import { persistGrowthTrendSignalsTx } from "../src/lib/news-growth-authority";
import {
  classifyGrowthTrendSourceUrl,
  growthTrendSourceAuthority,
  type GrowthTrendSignal,
  type TrendEntityType,
} from "../src/lib/growth-trend-intelligence";

const CORE_COINS = [
  ["BTC", "Bitcoin"], ["ETH", "Ethereum"], ["USDT", "Tether"], ["BNB", "BNB"],
  ["SOL", "Solana"], ["XRP", "XRP"], ["DOGE", "Dogecoin"], ["ADA", "Cardano"],
  ["TON", "Toncoin"], ["TRX", "TRON"],
] as const;

const COINS = new Map<string, string>([
  ...CORE_COINS.map(([symbol, name]) => [symbol.toLowerCase(), name] as const),
  ...coinGrowthCandidates.map((coin) => [coin.symbol.toLowerCase(), coin.name] as const),
]);
const TOOLS = new Map(getRankedTraderTools().map((tool) => [tool.slug.toLowerCase(), tool.name] as const));
const TOPICS = new Set([
  "bitcoin", "ethereum", "stablecoins", "etf", "regulation", "macro", "security", "exchanges", "defi",
  "layer-2", "onchain", "derivatives", "liquidity", "institutional", "rwa", "tokenization", "ai-crypto",
  "memecoins", "mining", "staking", "wallets", "payments", "privacy", "adoption", "nft-gaming",
]);

type ProviderCandidate = {
  entityType?: unknown;
  entityId?: unknown;
  label?: unknown;
  sourceUrl?: unknown;
  magnitude?: unknown;
  velocity?: unknown;
  confidence?: unknown;
  manipulationRisk?: unknown;
  evidence?: unknown;
};

function bounded01(value: unknown, fallback = 0.5) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|dclid|ref|ref_src|source|campaign)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown-source";
  }
}

function citedUrls(sources: AiSourceReference[]): Set<string> {
  const urls = new Set<string>();
  for (const source of sources) {
    const normalized = safeUrl(source.url);
    if (normalized) urls.add(normalized);
  }
  return urls;
}

function normalizeEntity(rawType: unknown, rawId: unknown, rawLabel: unknown): { type: TrendEntityType; id: string; label: string } | null {
  const type = String(rawType ?? "").trim().toLowerCase() as TrendEntityType;
  const id = String(rawId ?? "").trim().toLowerCase();
  if (type === "coin" && COINS.has(id)) return { type, id, label: COINS.get(id)! };
  if (type === "tool" && TOOLS.has(id)) return { type, id, label: TOOLS.get(id)! };
  if (type === "topic" && TOPICS.has(id)) return { type, id, label: String(rawLabel ?? id).trim().slice(0, 120) || id };
  return null;
}

function parseProviderSignals(input: {
  provider: "xai" | "perplexity";
  text: string;
  sources: AiSourceReference[];
  observedAt: string;
}): GrowthTrendSignal[] {
  let parsed: unknown;
  try {
    const cleaned = input.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { signals?: unknown })?.signals) ? (parsed as { signals: unknown[] }).signals : [];
  const citations = citedUrls(input.sources);
  const signals: GrowthTrendSignal[] = [];
  for (const row of rows.slice(0, 40)) {
    if (!row || typeof row !== "object") continue;
    const candidate = row as ProviderCandidate;
    const entity = normalizeEntity(candidate.entityType, candidate.entityId, candidate.label);
    const url = safeUrl(candidate.sourceUrl);
    if (!entity || !url || !citations.has(url)) continue;
    const family = classifyGrowthTrendSourceUrl(url);
    if (!family) continue;
    const host = normalizedHost(url);
    signals.push({
      id: `${input.provider}:${input.observedAt}:${entity.type}:${entity.id}:${signals.length}`,
      entityType: entity.type,
      entityId: entity.id,
      label: entity.label,
      locale: "global",
      sourceFamily: family,
      sourceName: host,
      sourceUrl: url,
      observedAt: input.observedAt,
      window: "24h",
      magnitude: bounded01(candidate.magnitude),
      velocity: bounded01(candidate.velocity),
      confidence: bounded01(candidate.confidence, 0.72),
      authority: growthTrendSourceAuthority(family, url),
      manipulationRisk: bounded01(candidate.manipulationRisk, entity.type === "coin" ? 0.18 : 0.1),
      evidenceLabel: String(candidate.evidence ?? "cited public trend evidence").replace(/\s+/g, " ").trim().slice(0, 420),
    });
  }
  return signals;
}

function prompt() {
  const coinIds = [...COINS.keys()].slice(0, 80).join(",");
  const toolIds = [...TOOLS.keys()].slice(0, 80).join(",");
  return `You are TecPey's governed organic-growth research agent. Research PUBLIC attention trends from the last 24 hours only. Your job is discovery, not prediction. Distinguish attention evidence from market/news corroboration and never convert attention into a buy/sell recommendation.

Prioritize independently citable, high-reach public surfaces: X, Reddit, YouTube, Google Trends when available, TradingView community/public market pages, CoinGecko, CoinMarketCap, CoinGlass, DeFiLlama, established crypto/financial news, and primary official/regulatory sources. A source counts only when you can cite the exact public URL. Do not claim a platform-specific metric (views, search volume, mentions, ranking, volume, market cap, transactions) unless the cited page actually supports it. Do not invent popularity, consensus, or community sentiment. Do not use TecPey itself as evidence.

For each candidate, ask: (1) is public attention measurably rising, (2) is there independent market/news/search/social corroboration, (3) could this be coordinated promotion or a short-lived pump, and (4) is the entity relevant to TecPey users? Prefer fewer high-quality independent citations over many repeated mentions from the same host.

Allowed coin entityId values: ${coinIds}
Allowed tool entityId values: ${toolIds}
Allowed topic entityId values: ${[...TOPICS].join(",")}

Return ONLY JSON: {"signals":[{"entityType":"coin|tool|topic","entityId":"allowed id","label":"human label","sourceUrl":"https URL that you actually cite","magnitude":0..1,"velocity":0..1,"confidence":0..1,"manipulationRisk":0..1,"evidence":"short factual reason grounded only in the cited source"}]}. Include separate rows only for genuinely independent sources. A viral social mention without independent market/news/search corroboration must have high manipulationRisk and modest confidence.`;
}

async function collect(provider: "xai" | "perplexity", observedAt: string): Promise<GrowthTrendSignal[]> {
  const apiKey = provider === "xai" ? process.env.XAI_API_KEY?.trim() : process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) return [];
  const model = provider === "xai"
    ? process.env.GROWTH_XAI_MODEL?.trim() || "grok-4"
    : process.env.GROWTH_PERPLEXITY_MODEL?.trim() || "sonar-pro";
  const result = await callAiProvider({
    providerId: provider,
    agentId: "growth_hacker",
    apiKey,
    model,
    instructions: "Use public search evidence only. Return strict JSON. Every sourceUrl in the JSON must also be present in your provider citations. Never publish or recommend a trade.",
    input: prompt(),
    timeoutMs: 25_000,
    maxOutputTokens: 4_000,
    circuitScope: "organic-growth-trend-worker",
    toolsEnabled: true,
    dataClass: "public",
    requireZeroDataRetention: true,
  });
  if (!result.ok) return [];
  return parseProviderSignals({ provider, text: result.text, sources: result.sources, observedAt });
}

async function main() {
  const observedAt = new Date().toISOString();
  const xaiConfigured = Boolean(process.env.XAI_API_KEY?.trim());
  const perplexityConfigured = Boolean(process.env.PERPLEXITY_API_KEY?.trim());
  if (!xaiConfigured && !perplexityConfigured) {
    throw new Error("growth_trend_provider_required");
  }
  const [xSignals, perplexitySignals] = await Promise.all([
    collect("xai", observedAt),
    collect("perplexity", observedAt),
  ]);
  const signals = [...xSignals, ...perplexitySignals];
  const persisted = await withTx((client) => persistGrowthTrendSignalsTx(client, signals));
  if (!persisted.enabled) throw new Error("growth_trend_database_unavailable");
  process.stdout.write(`${JSON.stringify({
    ok: true,
    runId: randomUUID(),
    observedAt,
    xSignalCount: xSignals.length,
    perplexitySignalCount: perplexitySignals.length,
    acceptedSignalCount: signals.length,
    persistedSignalCount: persisted.value,
  })}\n`);
}

void main().catch((error) => {
  console.error("[organic-growth-trend-worker] failed", { message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
