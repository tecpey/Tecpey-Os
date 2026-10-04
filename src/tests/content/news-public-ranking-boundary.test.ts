import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(?:tsx|ts)$/.test(entry)) out.push(path);
  }
  return out;
}

describe("Public news ranking boundary", () => {
  it("does not expose taxonomy-cardinality impact, trend or editor-pick scores from the public feed", () => {
    const route = read("src/app/api/crypto-news/route.ts");

    assert.doesNotMatch(route, /function impactFor\b/);
    assert.doesNotMatch(route, /\btrendScore\b/);
    assert.doesNotMatch(route, /\beditorPick\b/);
    assert.doesNotMatch(route, /\bimpact:\s*impact\b/);
    assert.doesNotMatch(route, /highest-impact/i);
    assert.doesNotMatch(route, /Educational impact/i);
    assert.match(route, /Latest governed news context/);
    assert.match(route, /does not generate impact scores or trading signals/);
    assert.match(route, /publicationPolicy: NEWS_FEED_PUBLICATION_POLICY/);
  });

  it("keeps the legacy score-based non-compact renderer off all app surfaces", () => {
    const offenders: string[] = [];

    for (const path of sourceFiles("src/app")) {
      const source = read(path);
      const tags = source.match(/<CryptoNewsCenter\b[^>]*>/g) ?? [];
      for (const tag of tags) {
        if (!/\bcompact\b/.test(tag)) offenders.push(`${path}: ${tag}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      "Every public CryptoNewsCenter use must stay on the governed compact publication-order surface until the legacy renderer is removed.",
    );
  });
});
