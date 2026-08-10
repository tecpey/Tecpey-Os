import type { CoinGrowthCandidate } from "@/data/coinGrowthCandidates";

export const COIN_GROWTH_POLICY_VERSION = "tecpey-coin-growth-policy-v1";

export type AutomatedCoinPage = {
  slug: string;
  symbol: string;
  name: string;
  faName: string;
  category: string;
  description: string;
  intro: string;
  useCases: string[];
  risks: string[];
  seoKeywords: string[];
  faqs: { q: string; a: string }[];
  automation: {
    policyVersion: typeof COIN_GROWTH_POLICY_VERSION;
    score: number;
    status: "published_content";
    sourceMode: "curated_seed" | "provider_snapshot";
    exchangeCapability: "manual_review_required";
    officialWebsite: string;
    docs?: string;
    narratives: string[];
    riskLevel: CoinGrowthCandidate["riskLevel"];
  };
};

export type CoinGrowthRejectedCandidate = {
  symbol: string;
  slug: string;
  reason: string;
  score: number;
};

export type CoinGrowthSnapshot = {
  schemaVersion: 1;
  policyVersion: typeof COIN_GROWTH_POLICY_VERSION;
  generatedAt: string;
  sourceMode: "curated_seed" | "provider_snapshot";
  publishThreshold: number;
  stats: {
    evaluated: number;
    publishedContent: number;
    rejected: number;
    exchangeEnabled: 0;
  };
  coins: AutomatedCoinPage[];
  rejected: CoinGrowthRejectedCandidate[];
};

const riskPenalty: Record<CoinGrowthCandidate["riskLevel"], number> = {
  low: 0,
  medium: 0.04,
  high: 0.1,
  very_high: 0.16,
};

const importanceBoost: Record<CoinGrowthCandidate["importance"], number> = {
  core: 0.12,
  major: 0.08,
  trend_watch: 0.04,
  education_watch: 0,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function roundScore(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function scoreCoinGrowthCandidate(candidate: CoinGrowthCandidate): number {
  return roundScore(
    clamp01(candidate.marketImportance) * 0.28 +
      clamp01(candidate.trendSignal) * 0.22 +
      clamp01(candidate.learningRelevance) * 0.2 +
      clamp01(candidate.sourceTrust) * 0.18 +
      importanceBoost[candidate.importance] -
      riskPenalty[candidate.riskLevel],
  );
}

function seoKeywords(candidate: CoinGrowthCandidate): string[] {
  return [
    `قیمت ${candidate.faName}`,
    `خرید ${candidate.symbol}`,
    `${candidate.name} چیست`,
    candidate.symbol,
    ...candidate.narrative.slice(0, 3),
  ];
}

function buildIntro(candidate: CoinGrowthCandidate): string {
  const narrative = candidate.narrative.slice(0, 2).join("، ");
  return `${candidate.faName} (${candidate.symbol}) در دسته ${candidate.category} قرار می‌گیرد و برای کاربر تک‌پی باید از زاویه کاربرد واقعی، نقدشوندگی، ریسک شبکه، وضعیت روایت ${narrative || "بازار"} و امنیت انتقال بررسی شود.`;
}

export function buildAutomatedCoinPage(
  candidate: CoinGrowthCandidate,
  options: { sourceMode: CoinGrowthSnapshot["sourceMode"] },
): AutomatedCoinPage {
  const score = scoreCoinGrowthCandidate(candidate);

  return {
    slug: candidate.slug,
    symbol: candidate.symbol,
    name: candidate.name,
    faName: candidate.faName,
    category: candidate.category,
    description: `${candidate.faName} چیست؟ صفحه خودکار تک‌پی برای معرفی ${candidate.symbol}، کاربردها، ریسک‌ها، منابع رسمی و نکات مهم قبل از خرید یا انتقال.`,
    intro: buildIntro(candidate),
    useCases: candidate.useCases,
    risks: candidate.risks,
    seoKeywords: seoKeywords(candidate),
    faqs: [
      {
        q: `${candidate.faName} چیست؟`,
        a: `${candidate.faName} دارایی مرتبط با ${candidate.category} است و قبل از خرید باید کاربرد، نقدشوندگی، ریسک‌ها و منابع رسمی آن بررسی شود.`,
      },
      {
        q: `آیا خرید ${candidate.symbol} سود را تضمین می‌کند؟`,
        a: "خیر. هیچ رمزارزی سود تضمین‌شده ندارد و تصمیم‌گیری باید با مدیریت ریسک، بررسی قیمت لحظه‌ای، حجم معاملات و سناریوی خروج انجام شود.",
      },
      {
        q: `قبل از انتقال ${candidate.symbol} چه چیزی مهم است؟`,
        a: "شبکه انتقال، آدرس مقصد، کارمزد، محدودیت‌های برداشت، نقدشوندگی و امنیت حساب باید با دقت کنترل شود.",
      },
    ],
    automation: {
      policyVersion: COIN_GROWTH_POLICY_VERSION,
      score,
      status: "published_content",
      sourceMode: options.sourceMode,
      exchangeCapability: "manual_review_required",
      officialWebsite: candidate.officialWebsite,
      docs: candidate.docs,
      narratives: candidate.narrative,
      riskLevel: candidate.riskLevel,
    },
  };
}

export function materializeCoinGrowthSnapshot(
  candidates: CoinGrowthCandidate[],
  options: {
    generatedAt?: string;
    sourceMode?: CoinGrowthSnapshot["sourceMode"];
    publishThreshold?: number;
    existingSymbols?: string[];
    existingSlugs?: string[];
  } = {},
): CoinGrowthSnapshot {
  const sourceMode = options.sourceMode ?? "curated_seed";
  const publishThreshold = options.publishThreshold ?? 0.32;
  const existingSymbols = new Set((options.existingSymbols ?? []).map((symbol) => symbol.trim().toUpperCase()));
  const existingSlugs = new Set((options.existingSlugs ?? []).map((slug) => slug.trim().toLowerCase()));
  const seenSymbols = new Set<string>();
  const seenSlugs = new Set<string>();
  const coins: AutomatedCoinPage[] = [];
  const rejected: CoinGrowthRejectedCandidate[] = [];

  for (const candidate of candidates) {
    const symbol = candidate.symbol.trim().toUpperCase();
    const slug = candidate.slug.trim().toLowerCase();
    const score = scoreCoinGrowthCandidate(candidate);
    let reason = "";

    if (!symbol || !slug || !candidate.name.trim() || !candidate.faName.trim()) reason = "identity_missing";
    else if (!candidate.officialWebsite.startsWith("https://")) reason = "official_source_missing";
    else if (existingSymbols.has(symbol) || existingSlugs.has(slug)) reason = "already_curated";
    else if (seenSymbols.has(symbol) || seenSlugs.has(slug)) reason = "duplicate_candidate";
    else if (score < publishThreshold) reason = "score_below_publish_threshold";

    seenSymbols.add(symbol);
    seenSlugs.add(slug);

    if (reason) {
      rejected.push({ symbol, slug, reason, score });
      continue;
    }

    coins.push(buildAutomatedCoinPage(candidate, { sourceMode }));
  }

  coins.sort(
    (a, b) =>
      b.automation.score - a.automation.score ||
      a.symbol.localeCompare(b.symbol) ||
      a.slug.localeCompare(b.slug),
  );

  return {
    schemaVersion: 1,
    policyVersion: COIN_GROWTH_POLICY_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sourceMode,
    publishThreshold,
    stats: {
      evaluated: candidates.length,
      publishedContent: coins.length,
      rejected: rejected.length,
      exchangeEnabled: 0,
    },
    coins,
    rejected,
  };
}

export function readPublishedCoinGrowthPages(snapshot: CoinGrowthSnapshot): AutomatedCoinPage[] {
  if (snapshot.schemaVersion !== 1) return [];
  if (snapshot.policyVersion !== COIN_GROWTH_POLICY_VERSION) return [];
  if (snapshot.stats.exchangeEnabled !== 0) return [];
  return snapshot.coins.filter(
    (coin) =>
      coin.automation.status === "published_content" &&
      coin.automation.exchangeCapability === "manual_review_required",
  );
}
