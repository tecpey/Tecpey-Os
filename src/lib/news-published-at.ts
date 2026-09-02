export const MAX_NEWS_ARCHIVE_AGE_MS = 35 * 24 * 60 * 60 * 1_000;

export function validNewsPublishedAt(raw: string, fetchedAt: string): string | null {
  const timestamp = Date.parse(raw);
  const fetched = Date.parse(fetchedAt);

  if (!Number.isFinite(timestamp) || !Number.isFinite(fetched)) return null;
  if (timestamp > fetched) return null;
  if (fetched - timestamp > MAX_NEWS_ARCHIVE_AGE_MS) return null;

  return new Date(timestamp).toISOString();
}
