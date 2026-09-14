export const NEWS_PUBLICATION_POLICY_VERSION = "v2" as const;

const POLICY_VERSION_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;

type NewsPublicationLocale = "fa" | "en";

function normalizePublicationWatermark(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("news_publication_watermark_invalid");
  return new Date(timestamp).toISOString().replace(".000Z", "Z");
}

/**
 * Publication idempotency is scoped to the publication-policy version as well
 * as locale + validated-translation watermark. Historical snapshots remain
 * immutable while an explicit policy-version bump can safely re-evaluate the
 * same validated archive set after a semantic publication-policy change.
 */
export function buildNewsPublicationIdempotencyKey(input: {
  locale: NewsPublicationLocale;
  fetchedAt: string;
  policyVersion?: string;
}): string {
  if (input.locale !== "fa" && input.locale !== "en") {
    throw new Error("news_publication_locale_invalid");
  }
  const policyVersion = (input.policyVersion ?? NEWS_PUBLICATION_POLICY_VERSION).trim().toLowerCase();
  if (!POLICY_VERSION_RE.test(policyVersion)) {
    throw new Error("news_publication_policy_version_invalid");
  }
  return `crypto-news:publish:archive:${policyVersion}:${input.locale}:${normalizePublicationWatermark(input.fetchedAt)}`;
}
