import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

// Every indexable page that ships in both Farsi and English must declare hreflang
// alternates, or Google cannot associate the two editions and may serve the wrong
// locale or treat them as duplicates. The sitemap is the source of truth for
// "indexable public page", so this suite derives the fa/en pairs from it and
// asserts each side provides hreflang — through any of the approved metadata
// helpers (which all emit alternates.languages) or a literal languages block, in
// the page or its layout.

const SITEMAP = readFileSync(path.join(process.cwd(), "src/app/sitemap.ts"), "utf8");

function sitemapPaths(varName: string): string[] {
  const block = new RegExp(`${varName}\\s*=\\s*\\[(.*?)\\]`, "s").exec(SITEMAP);
  if (!block) return [];
  return [...block[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

// A page "declares hreflang" when its source uses any helper that emits
// alternates.languages, or contains a literal languages block.
const HREFLANG_MARKERS = [
  "languages:",
  "getAlternateLocales(",
  "getMetadata(",
  "pageMetadata(",
  "getNewsHubMetadata(",
  "getNewsDetailMetadata(",
];

function providesHreflang(route: string): boolean {
  const base = route === "/" || route === "" ? "src/app" : `src/app${route}`;
  for (const file of [`${base}/page.tsx`, `${base}/layout.tsx`]) {
    const abs = path.join(process.cwd(), file);
    if (!existsSync(abs)) continue;
    const src = readFileSync(abs, "utf8");
    if (HREFLANG_MARKERS.some((marker) => src.includes(marker))) return true;
  }
  return false;
}

describe("indexable bilingual pages declare hreflang", () => {
  const staticPaths = sitemapPaths("staticPaths");
  const english = new Set(sitemapPaths("englishPaths"));
  const pairs = staticPaths
    .map((fa) => ({ fa, en: fa === "" || fa === "/" ? "/en" : `/en${fa}` }))
    .filter((pair) => english.has(pair.en));

  it("derives a non-trivial set of bilingual pairs from the sitemap", () => {
    assert.ok(pairs.length >= 10, `expected many bilingual pairs, found ${pairs.length}`);
  });

  it("every sitemap fa/en pair declares hreflang on both sides", () => {
    const missing: string[] = [];
    for (const { fa, en } of pairs) {
      if (!providesHreflang(fa)) missing.push(`${fa || "/"} (fa)`);
      if (!providesHreflang(en)) missing.push(`${en} (en)`);
    }
    assert.deepEqual(
      missing,
      [],
      `these indexable bilingual pages are missing hreflang:\n${missing.join("\n")}`,
    );
  });
});
