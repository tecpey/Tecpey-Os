import { readBoundedResponseText } from "./bounded-http-body";
import {
  extractNewsArticleEvidence,
  type NewsArticleEvidence,
} from "./news-article-evidence";
import type { NewsHydrationOutcome } from "./news-full-evidence-capture";
import { classifyFeedSourceCoverage, type FeedSourceCoverage } from "./news-feed-evidence";
import { canonicalPublisherUrl } from "./news-growth-authority";
import {
  isApprovedNewsSourceHost,
  type NewsSourceRegistryEntry,
} from "./news-source-registry";

export type NewsPublisherEvidenceCoverage =
  | FeedSourceCoverage
  | "article_full";

export type NewsPublisherEvidenceResult = Readonly<{
  body: string;
  coverage: NewsPublisherEvidenceCoverage;
  attemptedArticleFetch: boolean;
  extractionMethod: NewsArticleEvidence["extractionMethod"] | null;
  sourceBodyCharacterCount: number;
  hydrationOutcome: NewsHydrationOutcome | null;
  reason:
    | "feed_full"
    | "policy_disabled"
    | "article_full"
    | "article_http_unavailable"
    | "article_redirect_or_host_rejected"
    | "article_content_type_rejected"
    | "article_evidence_unavailable"
    | "article_fetch_failed"
    | "article_too_large";
}>;

const NEWS_ARTICLE_TIMEOUT_MS = 6_000;
const MAX_NEWS_ARTICLE_BYTES = 2_500_000;
const NEWS_ARTICLE_MAX_REDIRECTS = 3;

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

function safePublisherUrl(
  rawUrl: string,
  source: NewsSourceRegistryEntry,
): string | null {
  try {
    const candidate = canonicalPublisherUrl(rawUrl);
    return isApprovedNewsSourceHost(
      new URL(candidate).hostname,
      source,
    )
      ? candidate
      : null;
  } catch {
    return null;
  }
}

function failure(
  sourceBody: string,
  hydrationOutcome: Exclude<
    NewsHydrationOutcome,
    "hydrated" | "identity_collision"
  >,
  reason: NewsPublisherEvidenceResult["reason"],
): NewsPublisherEvidenceResult {
  return {
    body: sourceBody,
    coverage: "feed_summary",
    attemptedArticleFetch: true,
    extractionMethod: null,
    sourceBodyCharacterCount: sourceBody.length,
    hydrationOutcome,
    reason,
  };
}

export async function fetchNewsPublisherEvidence(input: {
  source: NewsSourceRegistryEntry;
  articleUrl: string;
  lead: string;
  body: string;
  sourceCoverage?: FeedSourceCoverage;
  fetchImpl?: typeof fetch;
}): Promise<NewsPublisherEvidenceResult> {
  const sourceBody = compact(input.body);

  const feedCoverage =
    input.sourceCoverage
    ?? inferNewsPublisherEvidenceCoverage({
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
      hydrationOutcome: null,
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
      hydrationOutcome: null,
      reason: "policy_disabled",
    };
  }

  let currentUrl = safePublisherUrl(
    input.articleUrl,
    input.source,
  );

  if (!currentUrl) {
    return failure(
      sourceBody,
      "host_rejected",
      "article_redirect_or_host_rejected",
    );
  }

  const fetchImpl = input.fetchImpl ?? fetch;

  for (
    let redirectCount = 0;
    redirectCount <= NEWS_ARTICLE_MAX_REDIRECTS;
    redirectCount += 1
  ) {
    if (
      !isApprovedNewsSourceHost(
        new URL(currentUrl).hostname,
        input.source,
      )
    ) {
      return failure(
        sourceBody,
        "host_rejected",
        "article_redirect_or_host_rejected",
      );
    }

    let response: Response;

    try {
      response = await fetchImpl(currentUrl, {
        headers: {
          "user-agent":
            "TecPeyNewsEvidenceBot/1.0 (+https://tecpey.ir/crypto-news)",
          accept: "text/html,application/xhtml+xml",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(NEWS_ARTICLE_TIMEOUT_MS),
      });
    } catch (error) {
      if (
        error instanceof Error
        && (
          error.name === "TimeoutError"
          || error.name === "AbortError"
        )
      ) {
        return failure(
          sourceBody,
          "timeout",
          "article_fetch_failed",
        );
      }

      return failure(
        sourceBody,
        "network_error",
        "article_fetch_failed",
      );
    }

    if (
      response.status >= 300
      && response.status < 400
    ) {
      if (
        redirectCount
        === NEWS_ARTICLE_MAX_REDIRECTS
      ) {
        return failure(
          sourceBody,
          "redirect_limit",
          "article_redirect_or_host_rejected",
        );
      }

      const location =
        response.headers.get("location");

      if (!location) {
        return failure(
          sourceBody,
          "redirect_rejected",
          "article_redirect_or_host_rejected",
        );
      }

      let redirectedUrl: string;

      try {
        redirectedUrl =
          new URL(location, currentUrl).toString();
      } catch {
        return failure(
          sourceBody,
          "redirect_rejected",
          "article_redirect_or_host_rejected",
        );
      }

      const safeRedirectUrl = safePublisherUrl(
        redirectedUrl,
        input.source,
      );

      if (!safeRedirectUrl) {
        return failure(
          sourceBody,
          "host_rejected",
          "article_redirect_or_host_rejected",
        );
      }

      currentUrl = safeRedirectUrl;
      continue;
    }

    if (!response.ok) {
      return failure(
        sourceBody,
        "http_failure",
        "article_http_unavailable",
      );
    }

    const contentType =
      response.headers
        .get("content-type")
        ?.toLowerCase()
      ?? "";

    if (
      !contentType.includes("text/html")
      && !contentType.includes(
        "application/xhtml+xml",
      )
    ) {
      return failure(
        sourceBody,
        "content_type_rejected",
        "article_content_type_rejected",
      );
    }

    let html: string;

    try {
      html = await readBoundedResponseText(
        response,
        {
          maxBytes: MAX_NEWS_ARTICLE_BYTES,
          errorCode:
            "news_article_evidence_too_large",
        },
      );
    } catch (error) {
      if (
        error instanceof Error
        && error.message
          === "news_article_evidence_too_large"
      ) {
        return failure(
          sourceBody,
          "too_large",
          "article_too_large",
        );
      }

      return failure(
        sourceBody,
        "network_error",
        "article_fetch_failed",
      );
    }

    const evidence =
      extractNewsArticleEvidence(html);

    if (
      !evidence
      || evidence.characterCount
        <= sourceBody.length + 240
    ) {
      return failure(
        sourceBody,
        "extraction_empty",
        "article_evidence_unavailable",
      );
    }

    return {
      body: evidence.body,
      coverage: "article_full",
      attemptedArticleFetch: true,
      extractionMethod:
        evidence.extractionMethod,
      sourceBodyCharacterCount:
        evidence.characterCount,
      hydrationOutcome: "hydrated",
      reason: "article_full",
    };
  }

  return failure(
    sourceBody,
    "redirect_limit",
    "article_redirect_or_host_rejected",
  );
}
