import type { ContentLocale } from "./content-growth";

export const ORGANIC_TREND_POLICY_VERSION = "tecpey-organic-trend-policy-v1";

export const TREND_WINDOWS = ["24h", "7d", "30d"] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];
export type TrendEntityType = "coin" | "tool" | "topic";
export type TrendSourceFamily = "official" | "market" | "news" | "social" | "web" | "search" | "editorial";

export type GrowthTrendSignal = {
  id: string;
  entityType: TrendEntityType;
  entityId: string;
  label: string;
  locale: ContentLocale | "global";
  sourceFamily: TrendSourceFamily;
  sourceName: string;
  sourceUrl: string;
  observedAt: string;
  window: TrendWindow;
  magnitude: number;
  velocity: number;
  confidence: number;
  authority: number;
  manipulationRisk?: number;
  evidenceLabel?: string;
};

export type TrendEvidenceSummary = {
  signalCount: number;
  sourceFamilies: TrendSourceFamily[];
  sourceCount: number;
  crossFamilyConfirmed: boolean;
  socialConfirmed: boolean;
  marketConfirmed: boolean;
  newsConfirmed: boolean;
};

export type RankedTrendEntity = {
  entityType: TrendEntityType;
  entityId: string;
  label: string;
  score: number;
  tier: "breakout" | "sustained" | "emerging" | "watch";
  evidence: TrendEvidenceSummary;
  topSources: Array<{ name: string; url: string; family: TrendSourceFamily }>;
};

export type TrendRadarWindow = {
  window: TrendWindow;
  coins: RankedTrendEntity[];
  tools: RankedTrendEntity[];
  topics: RankedTrendEntity[];
};

export type GrowthTrendRadarSnapshot = {
  schemaVersion: 1;
  policyVersion: typeof ORGANIC_TREND_POLICY_VERSION;
  generatedAt: string;
  locale: ContentLocale;
  status: "healthy" | "degraded" | "insufficient_evidence";
  windows: Record<TrendWindow, TrendRadarWindow>;
  evidence: {
    totalSignals: number;
    sourceFamilies: TrendSourceFamily[];
    socialCoverage: boolean;
    searchCoverage: boolean;
    marketCoverage: boolean;
    newsCoverage: boolean;
  };
};

const SOURCE_WEIGHT: Record<TrendSourceFamily, number> = {
  official: 1,
  search: 0.96,
  market: 0.92,
  news: 0.88,
  social: 0.82,
  web: 0.76,
  editorial: 0.68,
};

const WINDOW_MS: Record<TrendWindow, number> = {
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

const TREND_SOURCE_DOMAINS: Readonly<Record<Exclude<TrendSourceFamily, "editorial">, readonly string[]>> = {
  official: ["sec.gov", "federalreserve.gov", "cftc.gov", "treasury.gov"],
  market: ["coingecko.com", "coinmarketcap.com", "tradingview.com", "coinglass.com", "cryptoquant.com", "glassnode.com", "defillama.com", "dune.com"],
  news: ["coindesk.com", "cointelegraph.com", "decrypt.co", "theblock.co", "reuters.com", "bloomberg.com", "ft.com", "cnbc.com"],
  social: ["x.com", "twitter.com", "reddit.com", "youtube.com", "t.me"],
  search: ["trends.google.com"],
  web: [],
};

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function classifyGrowthTrendSourceUrl(value: string): TrendSourceFamily | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (hostMatches(host, "tecpey.ir")) return null;
    for (const family of ["official", "market", "news", "social", "search"] as const) {
      if (TREND_SOURCE_DOMAINS[family].some((domain) => hostMatches(host, domain))) return family;
    }
    return "web";
  } catch {
    return null;
  }
}

export function growthTrendSourceAuthority(family: TrendSourceFamily, sourceUrl: string): number {
  const host = (() => { try { return new URL(sourceUrl).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } })();
  if (family === "official") return 0.98;
  if (family === "market") return hostMatches(host, "coingecko.com") || hostMatches(host, "coinmarketcap.com") || hostMatches(host, "tradingview.com") ? 0.94 : 0.88;
  if (family === "news") return hostMatches(host, "reuters.com") || hostMatches(host, "bloomberg.com") || hostMatches(host, "ft.com") ? 0.96 : 0.9;
  if (family === "search") return 0.94;
  if (family === "social") return hostMatches(host, "reddit.com") || hostMatches(host, "x.com") || hostMatches(host, "twitter.com") ? 0.78 : 0.72;
  if (family === "editorial") return 0.68;
  return 0.74;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function freshness(signal: GrowthTrendSignal, now: number, targetWindow: TrendWindow): number {
  const observed = Date.parse(signal.observedAt);
  if (!Number.isFinite(observed) || observed > now + 10 * 60_000) return 0;
  const age = Math.max(0, now - observed);
  return clamp01(1 - age / WINDOW_MS[targetWindow]);
}

function sourceKey(signal: GrowthTrendSignal): string {
  try {
    return new URL(signal.sourceUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return signal.sourceName.trim().toLowerCase();
  }
}

function independenceBucket(signal: GrowthTrendSignal, targetWindow: TrendWindow): string {
  const source = `${signal.sourceFamily}:${sourceKey(signal)}`;
  const observed = Date.parse(signal.observedAt);
  if (!Number.isFinite(observed) || targetWindow === "24h") return `${source}:window`;
  const bucketMs = targetWindow === "7d"
    ? 24 * 60 * 60 * 1_000
    : 3 * 24 * 60 * 60 * 1_000;
  return `${source}:${Math.floor(observed / bucketMs)}`;
}

function independentSignalStrength(signal: GrowthTrendSignal, now: number, targetWindow: TrendWindow): number {
  const manipulation = clamp01(signal.manipulationRisk ?? 0);
  const base =
    clamp01(signal.magnitude) * 0.29 +
    clamp01(signal.velocity) * 0.25 +
    clamp01(signal.confidence) * 0.2 +
    clamp01(signal.authority) * 0.14 +
    freshness(signal, now, targetWindow) * 0.12;
  return clamp01(base * (1 - manipulation * 0.6));
}

/**
 * Repeated polling of one domain is not independent corroboration. Collapse it
 * before scoring so a bot, API refresh or repeated social post cannot manufacture
 * a breakout trend simply by producing more rows.
 */
export function collapseGrowthTrendSignals(
  signals: GrowthTrendSignal[],
  options: { window: TrendWindow; now?: number },
): GrowthTrendSignal[] {
  const now = options.now ?? Date.now();
  const selected = new Map<string, GrowthTrendSignal>();
  for (const signal of signals) {
    const key = independenceBucket(signal, options.window);
    const current = selected.get(key);
    if (!current) {
      selected.set(key, signal);
      continue;
    }
    const candidateScore = independentSignalStrength(signal, now, options.window);
    const currentScore = independentSignalStrength(current, now, options.window);
    if (candidateScore > currentScore || (candidateScore === currentScore && Date.parse(signal.observedAt) > Date.parse(current.observedAt))) {
      selected.set(key, signal);
    }
  }
  return Array.from(selected.values()).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
}

function uniqueSources(signals: GrowthTrendSignal[]): Array<{ name: string; url: string; family: TrendSourceFamily }> {
  const selected = new Map<string, { name: string; url: string; family: TrendSourceFamily; score: number }>();
  for (const signal of signals) {
    const key = `${signal.sourceFamily}:${sourceKey(signal)}`;
    const score = clamp01(signal.confidence) * clamp01(signal.authority) * SOURCE_WEIGHT[signal.sourceFamily];
    const current = selected.get(key);
    if (!current || current.score < score) {
      selected.set(key, { name: signal.sourceName, url: signal.sourceUrl, family: signal.sourceFamily, score });
    }
  }
  return Array.from(selected.values())
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map(({ name, url, family }) => ({ name, url, family }));
}

function evidenceSummary(signals: GrowthTrendSignal[]): TrendEvidenceSummary {
  const families = Array.from(new Set(signals.map((signal) => signal.sourceFamily))).sort();
  const sources = new Set(signals.map(sourceKey));
  return {
    signalCount: signals.length,
    sourceFamilies: families,
    sourceCount: sources.size,
    crossFamilyConfirmed: families.length >= 2,
    socialConfirmed: families.includes("social"),
    marketConfirmed: families.includes("market"),
    newsConfirmed: families.includes("news"),
  };
}

function scoreEntity(signals: GrowthTrendSignal[], now: number, targetWindow: TrendWindow): number {
  const evidence = evidenceSummary(signals);
  const ranked = signals
    .map((signal) => {
      const manipulation = clamp01(signal.manipulationRisk ?? 0);
      const base =
        clamp01(signal.magnitude) * 0.28 +
        clamp01(signal.velocity) * 0.24 +
        clamp01(signal.confidence) * 0.18 +
        clamp01(signal.authority) * 0.12 +
        freshness(signal, now, targetWindow) * 0.1 +
        SOURCE_WEIGHT[signal.sourceFamily] * 0.08;
      return clamp01(base * (1 - manipulation * 0.55));
    })
    .sort((a, b) => b - a);
  if (ranked.length === 0) return 0;
  const weightedSignal = ranked.slice(0, 8).reduce((sum, value, index) => sum + value / (1 + index * 0.32), 0);
  const normalizedSignal = clamp01(weightedSignal / 2.25);
  const diversityBoost = Math.min(0.16, evidence.sourceFamilies.length * 0.04 + Math.min(4, evidence.sourceCount) * 0.02);
  const confirmationPenalty = evidence.sourceFamilies.length === 1 && evidence.socialConfirmed ? 0.18 : 0;
  const raw = Math.round(clamp01(normalizedSignal + diversityBoost - confirmationPenalty) * 100);
  if (!evidence.crossFamilyConfirmed) {
    // Repetition from one domain/family can prove persistence but not broad
    // community consensus. Keep single-family attention below sustained/breakout.
    return Math.min(raw, evidence.socialConfirmed ? 54 : 64);
  }
  return raw;
}

function tierFor(score: number, evidence: TrendEvidenceSummary): RankedTrendEntity["tier"] {
  if (score >= 82 && evidence.crossFamilyConfirmed && evidence.sourceCount >= 3) return "breakout";
  if (score >= 68 && evidence.crossFamilyConfirmed) return "sustained";
  if (score >= 52) return "emerging";
  return "watch";
}

export function rankGrowthTrendSignals(
  signals: GrowthTrendSignal[],
  options: { window: TrendWindow; entityType: TrendEntityType; now?: number; limit?: number },
): RankedTrendEntity[] {
  const now = options.now ?? Date.now();
  const horizon = WINDOW_MS[options.window];
  const grouped = new Map<string, GrowthTrendSignal[]>();
  for (const signal of signals) {
    if (signal.entityType !== options.entityType) continue;
    const compatibleWindow = signal.window === options.window || (options.window !== "24h" && signal.window === "24h");
    if (!compatibleWindow) continue;
    const observed = Date.parse(signal.observedAt);
    if (!Number.isFinite(observed) || observed > now + 10 * 60_000 || now - observed > horizon) continue;
    const key = signal.entityId.trim().toLowerCase();
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), signal]);
  }

  return Array.from(grouped.entries())
    .map(([entityId, entitySignals]) => {
      const independentSignals = collapseGrowthTrendSignals(entitySignals, { window: options.window, now });
      const evidence = evidenceSummary(independentSignals);
      const score = scoreEntity(independentSignals, now, options.window);
      return {
        entityType: options.entityType,
        entityId,
        label: independentSignals[0]?.label ?? entitySignals[0]?.label ?? entityId,
        score,
        tier: tierFor(score, evidence),
        evidence,
        topSources: uniqueSources(independentSignals),
      } satisfies RankedTrendEntity;
    })
    .filter((item) => item.score >= 24)
    .sort((a, b) => b.score - a.score || b.evidence.sourceFamilies.length - a.evidence.sourceFamilies.length || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, options.limit ?? 6));
}

export function buildGrowthTrendRadarSnapshot(input: {
  locale: ContentLocale;
  signals: GrowthTrendSignal[];
  generatedAt?: string;
  limitPerType?: number;
}): GrowthTrendRadarSnapshot {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const now = Date.parse(generatedAt);
  if (!Number.isFinite(now)) throw new Error("growth_trend_generated_at_invalid");
  const limit = Math.max(1, Math.min(12, input.limitPerType ?? 6));
  const windows = Object.fromEntries(
    TREND_WINDOWS.map((window) => [window, {
      window,
      coins: rankGrowthTrendSignals(input.signals, { window, entityType: "coin", now, limit }),
      tools: rankGrowthTrendSignals(input.signals, { window, entityType: "tool", now, limit }),
      topics: rankGrowthTrendSignals(input.signals, { window, entityType: "topic", now, limit }),
    }]),
  ) as Record<TrendWindow, TrendRadarWindow>;
  const families = Array.from(new Set(input.signals.map((signal) => signal.sourceFamily))).sort();
  const hasCrossFamilyTrend = TREND_WINDOWS.some((window) =>
    [...windows[window].coins, ...windows[window].tools, ...windows[window].topics]
      .some((item) => item.evidence.crossFamilyConfirmed),
  );
  const marketCoverage = families.includes("market");
  const newsCoverage = families.includes("news");
  const socialCoverage = families.includes("social");
  const searchCoverage = families.includes("search");
  const discoveryCoverage = socialCoverage || searchCoverage;
  const status: GrowthTrendRadarSnapshot["status"] = input.signals.length === 0
    ? "insufficient_evidence"
    : hasCrossFamilyTrend && marketCoverage && newsCoverage && discoveryCoverage
      ? "healthy"
      : "degraded";

  return {
    schemaVersion: 1,
    policyVersion: ORGANIC_TREND_POLICY_VERSION,
    generatedAt,
    locale: input.locale,
    status,
    windows,
    evidence: {
      totalSignals: input.signals.length,
      sourceFamilies: families,
      socialCoverage,
      searchCoverage,
      marketCoverage,
      newsCoverage,
    },
  };
}

export function validateGrowthTrendSignal(signal: GrowthTrendSignal): boolean {
  if (!signal.id.trim() || !signal.entityId.trim() || !signal.label.trim()) return false;
  if (!["coin", "tool", "topic"].includes(signal.entityType)) return false;
  if (!["official", "market", "news", "social", "web", "search", "editorial"].includes(signal.sourceFamily)) return false;
  if (!TREND_WINDOWS.includes(signal.window)) return false;
  if (!Number.isFinite(Date.parse(signal.observedAt))) return false;
  if (!/^https:\/\//i.test(signal.sourceUrl)) return false;
  return [signal.magnitude, signal.velocity, signal.confidence, signal.authority, signal.manipulationRisk ?? 0]
    .every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
}
