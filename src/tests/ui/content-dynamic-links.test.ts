import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { coinPages } from "../../data/coins";
import { getTraderToolSlugs } from "../../lib/trading-tools-growth";

// Content pages link to dynamic routes — /coins/<slug>, /trading-tools/<slug>,
// /academy/term-<n> — through data arrays rendered as href={variable}. The wired
// route-integrity guard (scripts/qa-route-check.mjs) only sees literal href="…"
// attributes and only checks the dynamic-route *shape*, so it cannot tell that
// "/coins/dogecoin" points at a coin that does not exist. This suite closes that
// gap for the shipped free-course pillar pages by validating each concrete slug
// against the SAME published data the app renders from (coinPages,
// getTraderToolSlugs), so a removed coin/tool can never silently 404 a link.

const CONTENT_PAGES = [
  "src/app/academy/free/page.tsx",
  "src/app/en/academy/free/page.tsx",
];

// String-literal internal paths in the dynamic families, with an optional /en prefix.
const DYNAMIC_LINK_RE =
  /["'](\/(?:en\/)?(?:coins|trading-tools)\/[a-z0-9-]+|\/(?:en\/)?academy\/term-[0-9]+)["']/g;

const coinSlugs = new Set(coinPages.map((coin) => coin.slug));
const toolSlugs = new Set(getTraderToolSlugs());

function dynamicLinksIn(file: string): string[] {
  const text = readFileSync(path.join(process.cwd(), file), "utf8");
  return [...new Set([...text.matchAll(DYNAMIC_LINK_RE)].map((match) => match[1]))];
}

/** Returns a reason string when the link is dead, or null when it resolves. */
function deadReason(href: string): string | null {
  const segments = href.replace(/^\/(?:en\/)?/, "").split("/");
  const [family, slug] = segments;
  if (family === "coins") return coinSlugs.has(slug) ? null : `unknown coin slug "${slug}"`;
  if (family === "trading-tools") return toolSlugs.has(slug) ? null : `unknown tool slug "${slug}"`;
  if (family === "academy" && /^term-[0-9]+$/.test(slug)) {
    const term = Number(slug.slice("term-".length));
    return term >= 1 && term <= 7 ? null : `term ${term} is out of the 1..7 range`;
  }
  return `unrecognized dynamic family "${family}"`;
}

describe("content pages' dynamic-slug links resolve against real data", () => {
  it("the published data sets are non-empty (guarding against a broken import)", () => {
    assert.ok(coinSlugs.size >= 10, `expected the real coin set, got ${coinSlugs.size}`);
    assert.ok(toolSlugs.size >= 10, `expected the real tool set, got ${toolSlugs.size}`);
  });

  for (const file of CONTENT_PAGES) {
    it(`every /coins, /trading-tools and /academy/term link in ${file} points at real data`, () => {
      const links = dynamicLinksIn(file);
      // The page must actually carry such links, or the regex/paths drifted and the
      // test would pass vacuously.
      assert.ok(links.length > 0, `no dynamic-family links found in ${file}`);
      const dead = links
        .map((href) => ({ href, reason: deadReason(href) }))
        .filter((entry) => entry.reason !== null)
        .map((entry) => `${entry.href} — ${entry.reason}`);
      assert.deepEqual(dead, [], `dead dynamic links in ${file}:\n${dead.join("\n")}`);
    });
  }
});
