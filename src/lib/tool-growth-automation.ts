import type {
  ToolGrowthCandidate,
  ToolGrowthImportance,
  ToolGrowthIntegrationRisk,
  ToolGrowthRiskLevel,
} from "@/data/toolGrowthCandidates";
import {
  buildOrganicGrowthProfile,
  type OrganicGrowthProfile,
} from "./organic-growth-automation";

export const TOOL_GROWTH_POLICY_VERSION = "tecpey-tool-growth-policy-v1";

export type TraderToolRecord = {
  name: string;
  domain: string;
  logo: string;
  logoUrl: string;
  categoryFa: string;
  categoryEn: string;
  summaryFa: string;
  summaryEn: string;
  site: string;
  ios: string;
  android: string;
  articleFa: string;
  articleEn: string;
  prosFa: string[];
  consFa: string[];
  tutorialFa: string[];
  categoryKey: string;
  organicGrowth?: {
    fa: OrganicGrowthProfile;
    en: OrganicGrowthProfile;
  };
  automation?: ToolGrowthAutomationMeta;
};

export type ToolGrowthAutomationMeta = {
  policyVersion: typeof TOOL_GROWTH_POLICY_VERSION;
  score: number;
  status: "published_content";
  sourceMode: "curated_seed" | "provider_snapshot";
  publishCapability: "educational_directory";
  externalCapability: "manual_review_required";
  integrationRisk: ToolGrowthIntegrationRisk;
  riskLevel: ToolGrowthRiskLevel;
  importance: ToolGrowthImportance;
  narratives: string[];
};

export type AutomatedTraderToolRecord = TraderToolRecord & {
  automation: ToolGrowthAutomationMeta;
};

export type ToolGrowthRejectedCandidate = {
  name: string;
  slug: string;
  domain: string;
  reason: string;
  score: number;
};

export type ToolGrowthSnapshot = {
  schemaVersion: 1;
  policyVersion: typeof TOOL_GROWTH_POLICY_VERSION;
  generatedAt: string;
  sourceMode: "curated_seed" | "provider_snapshot";
  publishThreshold: number;
  stats: {
    evaluated: number;
    publishedContent: number;
    rejected: number;
    externalEnabled: 0;
  };
  tools: AutomatedTraderToolRecord[];
  rejected: ToolGrowthRejectedCandidate[];
};

const riskPenalty: Record<ToolGrowthRiskLevel, number> = {
  low: 0,
  medium: 0.03,
  high: 0.08,
  very_high: 0.16,
};

const integrationPenalty: Record<ToolGrowthIntegrationRisk, number> = {
  none: 0,
  account_optional: 0.03,
  wallet_connection: 0.08,
  api_key: 0.09,
  trade_execution: 0.24,
};

const importanceBoost: Record<ToolGrowthImportance, number> = {
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

export function slugifyToolName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function faviconForDomain(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

export function scoreToolGrowthCandidate(candidate: ToolGrowthCandidate): number {
  return roundScore(
    clamp01(candidate.trendSignal) * 0.16 +
      clamp01(candidate.learningRelevance) * 0.18 +
      clamp01(candidate.beginnerUsefulness) * 0.1 +
      clamp01(candidate.proUsefulness) * 0.14 +
      clamp01(candidate.sourceTrust) * 0.16 +
      clamp01(candidate.popularitySignal) * 0.08 +
      clamp01(candidate.categoryImportance) * 0.1 +
      clamp01(candidate.officialLinkCompleteness) * 0.06 +
      clamp01(candidate.editorialWeight) * 0.06 +
      importanceBoost[candidate.importance] -
      riskPenalty[candidate.riskLevel] -
      integrationPenalty[candidate.integrationRisk],
  );
}

function buildSummaryFa(candidate: ToolGrowthCandidate): string {
  return `${candidate.useCaseFa} این معرفی آموزشی است و نباید به عنوان سیگنال معامله یا تأیید مالی استفاده شود.`;
}

function buildSummaryEn(candidate: ToolGrowthCandidate): string {
  return `${candidate.useCaseEn} TecPey lists it for education only, not as a trading signal or endorsement.`;
}

function buildArticleFa(candidate: ToolGrowthCandidate): string {
  const narratives = candidate.narratives.slice(0, 3).join("، ");
  const useCaseFa = candidate.useCaseFa.replace(/[.!؟]+$/u, "").trim();
  return `${candidate.name} در دسته ${candidate.categoryFa} قرار می‌گیرد و برای کاربر تک‌پی زمانی ارزش دارد که در یک فرایند ریسک‌محور استفاده شود. کاربرد اصلی آن ${useCaseFa} است. روایت‌های مرتبط با این ابزار شامل ${narratives || "تحلیل بازار"} است، اما هیچ خروجی آن نباید به‌تنهایی تبدیل به سیگنال، تصمیم خرید، فروش، اتصال کیف‌پول یا دادن دسترسی API شود. تک‌پی این صفحه را برای آموزش، مقایسه منابع رسمی و ساخت چک‌لیست تصمیم‌گیری منتشر می‌کند.`;
}

function buildArticleEn(candidate: ToolGrowthCandidate): string {
  const narratives = candidate.narratives.slice(0, 3).join(", ");
  return `${candidate.name} belongs to ${candidate.categoryEn}. It is useful for TecPey users only when it is part of a risk-aware workflow. Its primary use is to ${candidate.useCaseEn.charAt(0).toLowerCase()}${candidate.useCaseEn.slice(1)} Related narratives include ${narratives || "market research"}. TecPey publishes this page for education, official-source comparison and decision-checklist building, not for trading signals, wallet connections or automated integrations.`;
}

function tagify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildToolOrganicGrowthProfiles(candidate: ToolGrowthCandidate): {
  fa: OrganicGrowthProfile;
  en: OrganicGrowthProfile;
} {
  const slug = slugifyToolName(candidate.name);
  const commonTags = [
    `tool:${slug}`,
    `domain:${tagify(candidate.domain)}`,
    `category:${candidate.categoryKey}`,
    `risk:${candidate.riskLevel}`,
    ...candidate.narratives.slice(0, 4).map((tag) => `narrative:${tagify(tag)}`),
  ];
  const schemaTypes = ["SoftwareApplication", "FAQPage", "BreadcrumbList"];

  return {
    fa: buildOrganicGrowthProfile({
      entityType: "tool",
      locale: "fa",
      canonicalPath: `/trading-tools/${slug}`,
      title: `${candidate.name} چیست؟ | ابزار آموزشی رمزارز تک‌پی`,
      metaDescription: `${candidate.name} را از نظر کاربرد آموزشی، لینک رسمی، مزایا، محدودیت‌ها، ریسک اتصال و چک‌لیست استفاده امن در تک‌پی بررسی کنید.`,
      schemaTypes,
      keywords: [
        candidate.name,
        candidate.domain,
        candidate.categoryFa,
        "ابزار ارز دیجیتال",
        "ابزار تحلیل رمزارز",
        ...candidate.narratives,
      ],
      entityTags: commonTags,
      internalLinks: [
        `/trading-tools/${slug}`,
        "/trading-tools",
        "/crypto-news",
        "/academy/term-5",
        "/academy/security-first",
      ],
      answerSummary: `${candidate.name} یک ابزار در دسته ${candidate.categoryFa} است که در تک‌پی فقط برای آموزش، مقایسه منبع رسمی و چک‌لیست تصمیم‌گیری معرفی می‌شود.`,
      llmSummary: `${buildArticleFa(candidate)} این محتوای خودکار باید به صفحه ابزار، خبرهای مرتبط، Academy و صفحات کوین وصل شود و نباید به سیگنال معامله یا اجازه اتصال حساب تبدیل شود.`,
      safetyDisclaimer: "این صفحه توصیه مالی، سیگنال معامله، تأیید سرمایه‌گذاری یا مجوز اتصال کیف‌پول/API نیست.",
      freshnessTag: "scheduled_refresh",
    }),
    en: buildOrganicGrowthProfile({
      entityType: "tool",
      locale: "en",
      canonicalPath: `/en/trading-tools/${slug}`,
      title: `${candidate.name} guide | TecPey crypto tool education`,
      metaDescription: `Review ${candidate.name} as an educational crypto tool with official links, benefits, limitations, safe-use steps and account-connection risk context.`,
      schemaTypes,
      keywords: [
        candidate.name,
        candidate.domain,
        candidate.categoryEn,
        "crypto tools",
        "crypto research tool",
        ...candidate.narratives,
      ],
      entityTags: commonTags,
      internalLinks: [
        `/en/trading-tools/${slug}`,
        "/en/trading-tools",
        "/en/crypto-news",
        "/en/academy/term-5",
        "/en/security",
      ],
      answerSummary: `${candidate.name} is a ${candidate.categoryEn} tool. TecPey lists it for education, official-source comparison and risk-aware workflow building.`,
      llmSummary: `${buildArticleEn(candidate)} The automated page must connect to related tools, news, Academy paths and coin context without becoming a trading signal or account-connection instruction.`,
      safetyDisclaimer: "This page is not financial advice, a trading signal, investment endorsement or permission to connect a wallet/API key.",
      freshnessTag: "scheduled_refresh",
    }),
  };
}

export function buildAutomatedTraderToolRecord(
  candidate: ToolGrowthCandidate,
  options: { sourceMode: ToolGrowthSnapshot["sourceMode"] },
): AutomatedTraderToolRecord {
  const score = scoreToolGrowthCandidate(candidate);

  return {
    name: candidate.name,
    domain: candidate.domain,
    logo: candidate.logo ?? candidate.name.slice(0, 2).toUpperCase(),
    logoUrl: faviconForDomain(candidate.domain),
    categoryFa: candidate.categoryFa,
    categoryEn: candidate.categoryEn,
    summaryFa: buildSummaryFa(candidate),
    summaryEn: buildSummaryEn(candidate),
    site: candidate.site,
    ios: candidate.ios ?? "",
    android: candidate.android ?? "",
    articleFa: buildArticleFa(candidate),
    articleEn: buildArticleEn(candidate),
    prosFa: candidate.prosFa,
    consFa: candidate.consFa,
    tutorialFa: candidate.tutorialFa,
    categoryKey: candidate.categoryKey,
    organicGrowth: buildToolOrganicGrowthProfiles(candidate),
    automation: {
      policyVersion: TOOL_GROWTH_POLICY_VERSION,
      score,
      status: "published_content",
      sourceMode: options.sourceMode,
      publishCapability: "educational_directory",
      externalCapability: "manual_review_required",
      integrationRisk: candidate.integrationRisk,
      riskLevel: candidate.riskLevel,
      importance: candidate.importance,
      narratives: candidate.narratives,
    },
  };
}

export function materializeToolGrowthSnapshot(
  candidates: ToolGrowthCandidate[],
  options: {
    generatedAt?: string;
    sourceMode?: ToolGrowthSnapshot["sourceMode"];
    publishThreshold?: number;
    existingSlugs?: string[];
    existingDomains?: string[];
  } = {},
): ToolGrowthSnapshot {
  const sourceMode = options.sourceMode ?? "curated_seed";
  const publishThreshold = options.publishThreshold ?? 0.36;
  const existingSlugs = new Set((options.existingSlugs ?? []).map((slug) => slug.trim().toLowerCase()));
  const existingDomains = new Set((options.existingDomains ?? []).map((domain) => domain.trim().toLowerCase()));
  const seenSlugs = new Set<string>();
  const seenDomains = new Set<string>();
  const tools: AutomatedTraderToolRecord[] = [];
  const rejected: ToolGrowthRejectedCandidate[] = [];

  for (const candidate of candidates) {
    const slug = slugifyToolName(candidate.name);
    const domain = candidate.domain.trim().toLowerCase();
    const score = scoreToolGrowthCandidate(candidate);
    let reason = "";

    if (!candidate.name.trim() || !slug || !domain || !candidate.site.trim()) reason = "identity_missing";
    else if (!candidate.site.startsWith("https://")) reason = "official_source_missing";
    else if (!candidate.prosFa.length || !candidate.consFa.length || !candidate.tutorialFa.length) reason = "content_missing";
    else if (candidate.integrationRisk === "trade_execution") reason = "trade_execution_tool_requires_manual_review";
    else if (existingSlugs.has(slug) || existingDomains.has(domain)) reason = "already_curated";
    else if (seenSlugs.has(slug) || seenDomains.has(domain)) reason = "duplicate_candidate";
    else if (score < publishThreshold) reason = "score_below_publish_threshold";

    seenSlugs.add(slug);
    seenDomains.add(domain);

    if (reason) {
      rejected.push({ name: candidate.name, slug, domain, reason, score });
      continue;
    }

    tools.push(buildAutomatedTraderToolRecord(candidate, { sourceMode }));
  }

  tools.sort(
    (a, b) =>
      b.automation.score - a.automation.score ||
      a.name.localeCompare(b.name) ||
      a.domain.localeCompare(b.domain),
  );

  return {
    schemaVersion: 1,
    policyVersion: TOOL_GROWTH_POLICY_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sourceMode,
    publishThreshold,
    stats: {
      evaluated: candidates.length,
      publishedContent: tools.length,
      rejected: rejected.length,
      externalEnabled: 0,
    },
    tools,
    rejected,
  };
}

export function readPublishedToolGrowthRecords(snapshot: ToolGrowthSnapshot): AutomatedTraderToolRecord[] {
  if (snapshot.schemaVersion !== 1) return [];
  if (snapshot.policyVersion !== TOOL_GROWTH_POLICY_VERSION) return [];
  if (snapshot.stats.externalEnabled !== 0) return [];
  return snapshot.tools.filter(
    (tool) =>
      tool.automation.status === "published_content" &&
      tool.automation.publishCapability === "educational_directory" &&
      tool.automation.externalCapability === "manual_review_required",
  );
}
