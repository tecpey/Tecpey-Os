import { readBoundedResponseText } from "./bounded-http-body";
import { extractNewsArticleEvidence, type NewsArticleEvidence } from "./news-article-evidence";
import { canonicalPublisherUrl } from "./news-growth-authority";
import { classifyFeedSourceCoverage, type FeedSourceCoverage } from "./news-feed-evidence";
import { isApprovedNewsSourceHost, type NewsSourceRegistryEntry } from "./news-source-registry";

export type NewsPublisherEvidenceCoverage = FeedSourceCoverage | "article_full";

export type NewsPublisherEvidenceResult = Readonly<{
  body: string;
  coverage: NewsPublisherEvidenceCoverage;
  attemptedArticleFetch: boolean;
  extractionMethod: NewsArticleEvidence["extractionMethod"] | null;
  sourceBodyCharacterCount: number;
  reason:
    | "feed_full"
    | "policy_disabled"
    | "article_full"
    | "article_http_unavailable"
    | "article_redirect_or_host_rejected"
    | "article_content_type_rejected"
    | "article_evidence_unavailable"
    | "article_fetch_failed";
}>;

const NEWS_ARTICLE_TIMEOUT_MS = 6_000;
const MAX_NEWS_ARTICLE_BYTES = 2_500_000;

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function inferNewsPublisherEvidenceCoverage(input: {
  lead: string;
  body: string;
}): FeedSourceCoverage {
  const lead = compact(input.lead);
  const body = compact(input.body);
  return classifyFeedSourceCoverage({
    fullContent: body && body !== lead ? body : "",
    description: lead,
  });
}

function safePublisherUrl(rawUrl: string, source: NewsSourceRegistryEntry): string | null {
  try {
    const candidate = canonicalPublisherUrl(rawUrl);
    return isApprovedNewsSourceHost(new URL(candidate).hostname, source) ? candidate : null;
  } catch {
    return null;
  }
}

export async function fetchNewsPublisherEvidence(input: {
  source: NewsSourceRegistryEntry;
  articleUrl: string;
  lead: string;
  body: string;
  fetchImpl?: typeof fetch;
}): Promise<NewsPublisherEvidenceResult> {
  const sourceBody = compact(input.body);
  const feedCoverage = inferNewsPublisherEvidenceCoverage({
    lead: input.lead,
    body: sourceBody,
  });

  if (feedCoverage === "feed_full") {
    return {
      body: sourceBody,
      coverage: "feed_full",
      attemptedArticleFetch: false,
      extractionMethod: null,
      sourceBodyCharacterCount: sourceBody.length,
      reason: "feed_full",
    };
  }

  if (!input.source.allowFullArticleFetch) {
    return {
      body: sourceBody,
      coverage: "feed_summary",
      attemptedArticleFetch: false,
      extractionMethod: null,
      sourceBodyCharacterCount: sourceBody.length,
      reason: "policy_disabled",
    };
  }

  const articleUrl = safePublisherUrl(input.articleUrl, input.source);
  if (!articleUrl) {
    return {
      body: sourceBody,
      coverage: "feed_summary",
      attemptedArticleFetch: true,
      extractionMethod: null,
      sourceBodyCharacterCount: sourceBody.length,
      reason: "article_redirect_or_host_rejected",
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(articleUrl, {
      headers: {
        "user-agent": "TecPeyNewsEvidenceBot/1.0 (+https://tecpey.ir/crypto-news)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "error",
      signal: AbortSignal.timeout(NEWS_ARTICLE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        body: sourceBody,
        coverage: "feed_summary",
        attemptedArticleFetch: true,
        extractionMethod: null,
        sourceBodyCharacterCount: sourceBody.length,
        reason: "article_http_unavailable",
      };
    }

    const finalUrl = safePublisherUrl(response.url || articleUrl, input.source);
    if (!finalUrl) {
      return {
        body: sourceBody,
        coverage: "feed_summary",
        attemptedArticleFetch: true,
        extractionMethod: null,
        sourceBodyCharacterCount: sourceBody.length,
        reason: "article_redirect_or_host_rejected",
      };
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      contentType
      && !contentType.includes("text/html")
      && !contentType.includes("application/xhtml+xml")
    ) {
      return {
        body: sourceBody,
        coverage: "feed_summary",
        attemptedArticleFetch: true,
        extractionMethod: null,
        sourceBodyCharacterCount: sourceBody.length,
        reason: "article_content_type_rejected",
      };
    }

    const html = await readBoundedResponseText(response, {
      maxBytes: MAX_NEWS_ARTICLE_BYTES,
      errorCode: "news_article_evidence_too_large",
    });
    const evidence = extractNewsArticleEvidence(html);
    if (!evidence || evidence.characterCount <= sourceBody.length + 240) {
      return {
        body: sourceBody,
        coverage: "feed_summary",
        attemptedArticleFetch: true,
        extractionMethod: null,
        sourceBodyCharacterCount: sourceBody.length,
        reason: "article_evidence_unavailable",
      };
    }

    return {
      body: evidence.body,
      coverage: "article_full",
      attemptedArticleFetch: true,
      extractionMethod: evidence.extractionMethod,
      sourceBodyCharacterCount: evidence.characterCount,
      reason: "article_full",
    };
  } catch {
    return {
      body: sourceBody,
      coverage: "feed_summary",
      attemptedArticleFetch: true,
      extractionMethod: null,
      sourceBodyCharacterCount: sourceBody.length,
      reason: "article_fetch_failed",
    };
  }
}
