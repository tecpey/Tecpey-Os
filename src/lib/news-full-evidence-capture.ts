export type NewsSourceCoverage =
  | "feed_summary"
  | "feed_full"
  | "article_full";

export type NewsHydrationOutcome =
  | "hydrated"
  | "host_rejected"
  | "redirect_rejected"
  | "redirect_limit"
  | "timeout"
  | "network_error"
  | "http_failure"
  | "content_type_rejected"
  | "too_large"
  | "extraction_empty"
  | "identity_collision";

export type NewsHydrationPlanningItem = {
  articleUrl: string;
  sourceCoverage: NewsSourceCoverage;
  allowFullArticleFetch: boolean;
};

const TRANSIENT_RETRY_DELAYS_MS = [
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
] as const;

const LONG_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;

export const MAX_NEWS_HYDRATION_CANDIDATES_PER_RUN = 24;

const LONG_COOLDOWN_OUTCOMES = new Set<NewsHydrationOutcome>([
  "host_rejected",
  "redirect_rejected",
  "redirect_limit",
  "content_type_rejected",
  "too_large",
  "extraction_empty",
  "identity_collision",
]);

export function selectNewsHydrationCandidates<
  T extends NewsHydrationPlanningItem,
>(
  articles: readonly T[],
  alreadyHydratedArticleUrls: ReadonlySet<string>,
  cooldownBlockedArticleUrls: ReadonlySet<string> = new Set(),
): T[] {
  return articles
    .filter(
      (article) =>
        article.sourceCoverage === "feed_summary"
        && article.allowFullArticleFetch
        && !alreadyHydratedArticleUrls.has(article.articleUrl)
        && !cooldownBlockedArticleUrls.has(article.articleUrl),
    )
    .slice(0, MAX_NEWS_HYDRATION_CANDIDATES_PER_RUN);
}

export function newsHydrationNextRetryAt(input: {
  outcome: NewsHydrationOutcome;
  attemptCount: number;
  attemptedAt: string;
}): string | null {
  if (input.outcome === "hydrated") return null;

  if (!Number.isSafeInteger(input.attemptCount) || input.attemptCount < 1) {
    throw new Error("news_hydration_attempt_count_invalid");
  }

  const attemptedAtMs = Date.parse(input.attemptedAt);
  if (!Number.isFinite(attemptedAtMs)) {
    throw new Error("news_hydration_attempted_at_invalid");
  }

  const delayMs = LONG_COOLDOWN_OUTCOMES.has(input.outcome)
    ? LONG_RETRY_DELAY_MS
    : TRANSIENT_RETRY_DELAYS_MS[
        Math.min(
          input.attemptCount - 1,
          TRANSIENT_RETRY_DELAYS_MS.length - 1,
        )
      ];

  return new Date(attemptedAtMs + delayMs).toISOString();
}

export async function executeNewsHydrationPlan<
  T extends NewsHydrationPlanningItem,
  R,
>(input: {
  articles: readonly T[];
  alreadyHydratedArticleUrls: ReadonlySet<string>;
  cooldownBlockedArticleUrls?: ReadonlySet<string>;
  concurrency: number;
  hydrate: (article: T) => Promise<R>;
}): Promise<R[]> {
  if (!Number.isSafeInteger(input.concurrency) || input.concurrency < 1) {
    throw new Error("news_hydration_concurrency_invalid");
  }

  const candidates = selectNewsHydrationCandidates(
    input.articles,
    input.alreadyHydratedArticleUrls,
    input.cooldownBlockedArticleUrls ?? new Set(),
  );

  if (candidates.length === 0) return [];

  const results = new Array<R>(candidates.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= candidates.length) return;

      results[index] = await input.hydrate(candidates[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(input.concurrency, candidates.length) },
      () => worker(),
    ),
  );

  return results;
}
