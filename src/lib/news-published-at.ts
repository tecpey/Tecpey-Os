export const MAX_NEWS_ARCHIVE_AGE_MS = 35 * 24 * 60 * 60 * 1_000;

export function validNewsPublishedAt(raw: string, fetchedAt: string): string | null {
  const timestamp = Date.parse(raw);
  const fetched = Date.parse(fetchedAt);

  if (!Number.isFinite(timestamp) || !Number.isFinite(fetched)) return null;
  if (timestamp > fetched) return null;
  if (fetched - timestamp > MAX_NEWS_ARCHIVE_AGE_MS) return null;

  return new Date(timestamp).toISOString();
}

/** Public feed policy; archive evidence is retained independently. */
export const NEWS_FEED_PUBLICATION_POLICY = "published-at-desc-v1";
export const NEWS_RECENT_PUBLICATION_WINDOW_MS = 12 * 60 * 60 * 1_000;

type PublishedNews = {
  archiveId: string;
  articleUrl: string;
  publishedAt: string;
};

function publicationTime(publishedAt: string, now: number): number | null {
  const time = Date.parse(publishedAt);
  return Number.isFinite(now) && Number.isFinite(time) && time <= now ? time : null;
}

/**
 * Ingestion retries, enrichment and event times never advance publication.
 * Future/invalid publication has no feed authority without scheduled content.
 * Stable identity resolves ties independently of DB arrival order or locale.
 */
export function selectPublishedNewsForFeed<T extends PublishedNews>(items: readonly T[], now: number): T[] {
  return items
    .flatMap((item) => {
      const time = publicationTime(item.publishedAt, now);
      return time === null ? [] : [{ item, time }];
    })
    .sort((left, right) => right.time - left.time
      || compareIdentity(left.item.articleUrl, right.item.articleUrl)
      || compareIdentity(left.item.archiveId, right.item.archiveId))
    .map(({ item }) => item);
}

function compareIdentity(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isRecentNewsPublication(publishedAt: string, now: number): boolean {
  const time = publicationTime(publishedAt, now);
  return time !== null && now - time <= NEWS_RECENT_PUBLICATION_WINDOW_MS;
}
