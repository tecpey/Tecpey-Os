import { withDb } from "./db";
import {
  fetchNewsPublisherEvidence,
  inferNewsPublisherEvidenceCoverage,
} from "./news-publisher-evidence";
import type { NewsSourceRegistryEntry } from "./news-source-registry";

export type CapturedNewsEvidenceInput = {
  source: NewsSourceRegistryEntry;
  articleUrl: string;
  lead: string;
  body: string;
};

export type CaptureEvidencePromotionResult<T> = Readonly<{
  items: T[];
  attempted: number;
  promoted: number;
}>;

const FETCH_CONCURRENCY = 4;

export function selectUnseenPublisherEvidenceCandidates<T extends CapturedNewsEvidenceInput>(input: {
  items: readonly T[];
  existingArticleUrls: ReadonlySet<string>;
  limit: number;
}): T[] {
  const limit = Math.max(0, Math.min(24, Math.trunc(input.limit)));
  if (limit === 0) return [];

  return input.items
    .filter((item) => !input.existingArticleUrls.has(item.articleUrl))
    .filter((item) => item.source.allowFullArticleFetch)
    .filter((item) => inferNewsPublisherEvidenceCoverage({
      lead: item.lead,
      body: item.body,
    }) === "feed_summary")
    .slice(0, limit);
}

async function readExistingArticleUrls(articleUrls: readonly string[]): Promise<Set<string>> {
  if (articleUrls.length === 0) return new Set();
  const result = await withDb(async (client) => {
    const selected = await client.query<{ article_url: string }>(
      `SELECT DISTINCT article_url
         FROM platform_news_archive_items
        WHERE article_url = ANY($1::text[])`,
      [[...articleUrls]],
    );
    return selected.rows.map((row) => row.article_url);
  });
  if (!result.enabled) throw new Error("news_capture_archive_authority_disabled");
  return new Set(result.value);
}

async function mapInBatches<T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const output: R[] = [];
  for (let offset = 0; offset < items.length; offset += FETCH_CONCURRENCY) {
    output.push(...await Promise.all(
      items.slice(offset, offset + FETCH_CONCURRENCY).map(worker),
    ));
  }
  return output;
}

/**
 * Promotes only previously unseen feed-summary items and caps article requests.
 *
 * The active capture timer can observe hundreds of replayed RSS items every
 * cycle. Re-fetching their article pages would create unnecessary publisher
 * load. This authority therefore uses durable archive state as the dedupe
 * boundary and only spends bounded HTTP requests on new eligible URLs.
 */
export async function promoteUnseenCapturedNewsEvidence<T extends CapturedNewsEvidenceInput>(input: {
  items: readonly T[];
  limit: number;
}): Promise<CaptureEvidencePromotionResult<T>> {
  const existingArticleUrls = await readExistingArticleUrls(
    input.items.map((item) => item.articleUrl),
  );
  const candidates = selectUnseenPublisherEvidenceCandidates({
    items: input.items,
    existingArticleUrls,
    limit: input.limit,
  });

  const resolved = await mapInBatches(candidates, async (item) => ({
    item,
    evidence: await fetchNewsPublisherEvidence({
      source: item.source,
      articleUrl: item.articleUrl,
      lead: item.lead,
      body: item.body,
    }),
  }));

  const promotedBodies = new Map(
    resolved
      .filter(({ evidence }) => evidence.coverage === "article_full")
      .map(({ item, evidence }) => [item.articleUrl, evidence.body] as const),
  );

  return {
    items: input.items.map((item) => {
      const promotedBody = promotedBodies.get(item.articleUrl);
      return promotedBody ? { ...item, body: promotedBody } : { ...item };
    }),
    attempted: candidates.length,
    promoted: promotedBodies.size,
  };
}
