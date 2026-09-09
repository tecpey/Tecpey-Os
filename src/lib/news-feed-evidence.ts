export type FeedSourceCoverage = "feed_full" | "feed_summary";

const MIN_FULL_FEED_BODY_CHARS = 1_200;

const FEED_TRUNCATION_MARKERS = [
  /\bread the full story\b/i,
  /\bcontinue reading\b/i,
  /\bread more\b/i,
  /\bfull story\b/i,
  /\bview full article\b/i,
  /\bthe post\b[\s\S]{0,160}\bappeared first on\b/i,
];

function normalizedFeedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function classifyFeedSourceCoverage(input: {
  fullContent: string;
  description: string;
}): FeedSourceCoverage {
  const fullContent = normalizedFeedText(input.fullContent);
  const description = normalizedFeedText(input.description);

  if (!fullContent) return "feed_summary";
  if (fullContent.length < MIN_FULL_FEED_BODY_CHARS) return "feed_summary";
  if (fullContent.length <= description.length + 120) return "feed_summary";
  if (FEED_TRUNCATION_MARKERS.some((pattern) => pattern.test(fullContent))) {
    return "feed_summary";
  }

  return "feed_full";
}
