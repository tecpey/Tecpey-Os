export type NewsArticleEvidence = {
  body: string;
  extractionMethod: "json_ld_article_body" | "article_paragraphs" | "main_paragraphs";
  characterCount: number;
};

const MIN_ARTICLE_BODY_CHARS = 600;
const MAX_ARTICLE_BODY_CHARS = 20_000;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, raw: string) => {
      const code = Number.parseInt(raw, 10);
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, raw: string) => {
      const code = Number.parseInt(raw, 16);
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : " ";
    });
}

function plainText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function boundedBody(
  value: string,
  minimumChars = MIN_ARTICLE_BODY_CHARS,
): string {
  const normalized = plainText(value);
  if (normalized.length < minimumChars) return "";
  return normalized.slice(0, MAX_ARTICLE_BODY_CHARS).trim();
}

function collectArticleBodies(value: unknown, output: string[]): void {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) collectArticleBodies(item, output);
    return;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.articleBody === "string") {
    output.push(record.articleBody);
  }

  if (record["@graph"]) collectArticleBodies(record["@graph"], output);

  for (const [key, child] of Object.entries(record)) {
    if (key === "articleBody" || key === "@graph") continue;
    if (child && typeof child === "object") collectArticleBodies(child, output);
  }
}

function extractJsonLdArticleBody(html: string): string {
  const candidates: string[] = [];
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const match of scripts) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      const parsed: unknown = JSON.parse(raw);
      collectArticleBodies(parsed, candidates);
    } catch {
      continue;
    }
  }

  return candidates
    .map(boundedBody)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? "";
}

function extractContainerParagraphs(
  html: string,
  containerTag: "article" | "main",
): string {
  const escaped = containerTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blocks = Array.from(
    html.matchAll(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "gi")),
    (match) => match[1] ?? "",
  );

  const candidates = blocks.map((block) => {
    const paragraphs = Array.from(
      block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi),
      (match) => plainText(match[1] ?? ""),
    )
      .filter((paragraph) => paragraph.length >= 40)
      .join("\n\n");

    return boundedBody(
      paragraphs,
      containerTag === "article" ? 500 : MIN_ARTICLE_BODY_CHARS,
    );
  });

  return candidates
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? "";
}

function extractArticleParagraphs(html: string): string {
  return extractContainerParagraphs(html, "article");
}

function extractMainParagraphs(html: string): string {
  return extractContainerParagraphs(html, "main");
}

export function extractNewsArticleEvidence(html: string): NewsArticleEvidence | null {
  if (!html || html.length < MIN_ARTICLE_BODY_CHARS) return null;

  const jsonLdBody = extractJsonLdArticleBody(html);
  if (jsonLdBody) {
    return {
      body: jsonLdBody,
      extractionMethod: "json_ld_article_body",
      characterCount: jsonLdBody.length,
    };
  }

  const articleBody = extractArticleParagraphs(html);
  if (articleBody) {
    return {
      body: articleBody,
      extractionMethod: "article_paragraphs",
      characterCount: articleBody.length,
    };
  }

  const mainBody = extractMainParagraphs(html);
  if (mainBody) {
    return {
      body: mainBody,
      extractionMethod: "main_paragraphs",
      characterCount: mainBody.length,
    };
  }

  return null;
}
