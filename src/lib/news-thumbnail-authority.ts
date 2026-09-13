import { isIP } from "node:net";

import { readBoundedResponseText } from "./bounded-http-body";
import { withDb } from "./db";
import { canonicalPublisherUrl } from "./news-growth-authority";
import { providerReadinessSummaryForDomain } from "./news-provider-readiness";
import {
  NEWS_SOURCE_REGISTRY,
  isApprovedNewsSourceHost,
  type NewsSourceRegistryEntry,
} from "./news-source-registry";

export type NewsThumbnailDiscoveryMethod =
  | "rss_media_content"
  | "rss_media_thumbnail"
  | "rss_enclosure"
  | "rss_embedded_image"
  | "open_graph"
  | "twitter_card";

export type NewsThumbnailDiscovery = Readonly<{
  url: string;
  method: NewsThumbnailDiscoveryMethod;
}>;

const FEED_TIMEOUT_MS = 5_000;
const ARTICLE_TIMEOUT_MS = 5_000;
const MAX_FEED_BYTES = 2_000_000;
const MAX_ARTICLE_BYTES = 1_500_000;
const ARTICLE_MAX_REDIRECTS = 3;
const POSITIVE_CACHE_MS = 6 * 60 * 60 * 1_000;
const NEGATIVE_CACHE_MS = 30 * 60 * 1_000;

const thumbnailCache = new Map<string, { value: string | null; expiresAt: number }>();

function decodeMarkup(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attribute(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, "i"));
  return decodeMarkup(match?.[1] ?? "").trim();
}

function privateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a === 0;
}

function privateIpv6(hostname: string): boolean {
  const value = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return value === "::1"
    || value === "::"
    || value.startsWith("fc")
    || value.startsWith("fd")
    || value.startsWith("fe8")
    || value.startsWith("fe9")
    || value.startsWith("fea")
    || value.startsWith("feb");
}

export function safeNewsThumbnailUrl(raw: string, baseUrl?: string): string | null {
  if (!raw || raw.length > 4_096) return null;
  try {
    const url = baseUrl ? new URL(decodeMarkup(raw), baseUrl) : new URL(decodeMarkup(raw));
    if (url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname.endsWith(".local")
      || hostname.endsWith(".internal")
      || privateIpv4(hostname)
      || (isIP(hostname) === 6 && privateIpv6(hostname))
    ) return null;
    const normalized = url.toString();
    return normalized.length <= 2_048 ? normalized : null;
  } catch {
    return null;
  }
}

export function extractNewsThumbnailFromFeedBlock(
  block: string,
  articleUrl: string,
): NewsThumbnailDiscovery | null {
  const decoded = decodeMarkup(block);
  const candidates: Array<{ tag: string | undefined; method: NewsThumbnailDiscoveryMethod }> = [
    { tag: block.match(/<media:content\b[^>]*>/i)?.[0], method: "rss_media_content" },
    { tag: block.match(/<media:thumbnail\b[^>]*>/i)?.[0], method: "rss_media_thumbnail" },
  ];

  for (const candidate of candidates) {
    if (!candidate.tag) continue;
    const medium = attribute(candidate.tag, "medium").toLowerCase();
    const type = attribute(candidate.tag, "type").toLowerCase();
    if (medium && medium !== "image" && !type.startsWith("image/")) continue;
    const url = safeNewsThumbnailUrl(attribute(candidate.tag, "url"), articleUrl);
    if (url) return { url, method: candidate.method };
  }

  for (const match of block.matchAll(/<enclosure\b[^>]*>/gi)) {
    const type = attribute(match[0], "type").toLowerCase();
    if (type && !type.startsWith("image/")) continue;
    const url = safeNewsThumbnailUrl(attribute(match[0], "url"), articleUrl);
    if (url) return { url, method: "rss_enclosure" };
  }

  const embedded = decoded.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
  const embeddedUrl = safeNewsThumbnailUrl(embedded, articleUrl);
  return embeddedUrl ? { url: embeddedUrl, method: "rss_embedded_image" } : null;
}

export function extractNewsThumbnailFromHtml(
  html: string,
  articleUrl: string,
): NewsThumbnailDiscovery | null {
  const tags = Array.from(html.matchAll(/<meta\b[^>]*>/gi)).map((match) => match[0]);
  for (const wanted of [
    { keys: ["og:image", "og:image:url", "og:image:secure_url"], method: "open_graph" as const },
    { keys: ["twitter:image", "twitter:image:src"], method: "twitter_card" as const },
  ]) {
    for (const tag of tags) {
      const key = (attribute(tag, "property") || attribute(tag, "name")).toLowerCase();
      if (!wanted.keys.includes(key)) continue;
      const url = safeNewsThumbnailUrl(attribute(tag, "content"), articleUrl);
      if (url) return { url, method: wanted.method };
    }
  }
  return null;
}

function registrySource(articleUrl: string, sourceName?: string): NewsSourceRegistryEntry | null {
  try {
    const hostname = new URL(articleUrl).hostname;
    return NEWS_SOURCE_REGISTRY.find((source) =>
      (sourceName ? source.name === sourceName : true)
      && isApprovedNewsSourceHost(hostname, source)
    ) ?? NEWS_SOURCE_REGISTRY.find((source) => isApprovedNewsSourceHost(hostname, source)) ?? null;
  } catch {
    return null;
  }
}

function thumbnailAllowed(source: NewsSourceRegistryEntry): boolean {
  if (source.continuityMode === "quarantined") return false;
  const readiness = providerReadinessSummaryForDomain(source.canonicalDomains[0] ?? "");
  return readiness.thumbnailPolicy === "licensed" || readiness.thumbnailPolicy === "official_attribution";
}

function feedItemBlocks(xml: string): string[] {
  const items = Array.from(xml.matchAll(/<item[\s\S]*?<\/item>/gi)).map((match) => match[0]);
  if (items.length > 0) return items;
  return Array.from(xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)).map((match) => match[0]);
}

function feedBlockArticleUrl(block: string, source: NewsSourceRegistryEntry): string | null {
  const href = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
  const text = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? "";
  const raw = decodeMarkup(text.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").trim()) || decodeMarkup(href);
  try {
    const candidate = canonicalPublisherUrl(raw);
    return isApprovedNewsSourceHost(new URL(candidate).hostname, source) ? candidate : null;
  } catch {
    return null;
  }
}

async function feedThumbnail(
  source: NewsSourceRegistryEntry,
  articleUrl: string,
  fetchImpl: typeof fetch,
): Promise<NewsThumbnailDiscovery | null> {
  try {
    const response = await fetchImpl(source.feedUrl, {
      headers: { "user-agent": "TecPeyNewsMediaBot/1.0 (+https://tecpey.ir/crypto-news)" },
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const xml = await readBoundedResponseText(response, {
      maxBytes: MAX_FEED_BYTES,
      errorCode: "news_thumbnail_feed_too_large",
    });
    for (const block of feedItemBlocks(xml).slice(0, 400)) {
      if (feedBlockArticleUrl(block, source) !== articleUrl) continue;
      return extractNewsThumbnailFromFeedBlock(block, articleUrl);
    }
  } catch {
    return null;
  }
  return null;
}

async function articleThumbnail(
  source: NewsSourceRegistryEntry,
  articleUrl: string,
  fetchImpl: typeof fetch,
): Promise<NewsThumbnailDiscovery | null> {
  if (!source.allowFullArticleFetch) return null;
  let currentUrl = articleUrl;

  for (let redirects = 0; redirects <= ARTICLE_MAX_REDIRECTS; redirects += 1) {
    if (!isApprovedNewsSourceHost(new URL(currentUrl).hostname, source)) return null;
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        headers: {
          "user-agent": "TecPeyNewsMediaBot/1.0 (+https://tecpey.ir/crypto-news)",
          accept: "text/html,application/xhtml+xml",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(ARTICLE_TIMEOUT_MS),
      });
    } catch {
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirects >= ARTICLE_MAX_REDIRECTS) return null;
      const location = response.headers.get("location");
      if (!location) return null;
      try {
        const redirected = canonicalPublisherUrl(new URL(location, currentUrl).toString());
        if (!isApprovedNewsSourceHost(new URL(redirected).hostname, source)) return null;
        currentUrl = redirected;
        continue;
      } catch {
        return null;
      }
    }

    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;
    try {
      const html = await readBoundedResponseText(response, {
        maxBytes: MAX_ARTICLE_BYTES,
        errorCode: "news_thumbnail_article_too_large",
      });
      return extractNewsThumbnailFromHtml(html, currentUrl);
    } catch {
      return null;
    }
  }
  return null;
}

async function archivedSource(articleUrl: string): Promise<{ sourceName: string; articleUrl: string } | null> {
  const result = await withDb(async (client) => {
    const row = await client.query<{ source_name: string; article_url: string }>(
      `SELECT source_name, article_url
         FROM platform_news_archive_items
        WHERE article_url = $1
        ORDER BY fetched_at DESC, created_at DESC
        LIMIT 1`,
      [articleUrl],
    );
    return row.rows[0] ?? null;
  });
  return result.enabled ? result.value : null;
}

export async function resolveNewsThumbnailRedirectTarget(
  rawArticleUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  let articleUrl: string;
  try {
    articleUrl = canonicalPublisherUrl(rawArticleUrl);
  } catch {
    return null;
  }

  const cached = thumbnailCache.get(articleUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const archived = await archivedSource(articleUrl);
  if (!archived) return null;
  const source = registrySource(archived.articleUrl, archived.sourceName);
  if (!source || !thumbnailAllowed(source)) {
    thumbnailCache.set(articleUrl, { value: null, expiresAt: Date.now() + NEGATIVE_CACHE_MS });
    return null;
  }

  const discovered = await feedThumbnail(source, articleUrl, fetchImpl)
    ?? await articleThumbnail(source, articleUrl, fetchImpl);
  const value = discovered?.url ?? null;
  thumbnailCache.set(articleUrl, {
    value,
    expiresAt: Date.now() + (value ? POSITIVE_CACHE_MS : NEGATIVE_CACHE_MS),
  });
  return value;
}
