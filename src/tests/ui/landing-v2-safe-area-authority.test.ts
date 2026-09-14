import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const v2CssPath = path.join(root, "src/app/landing-experience-v2.css");
const navbarFocusPath = path.join(root, "src/app/navbar-focus.css");
const growthStoryPath = path.join(root, "src/components/home/TecpeyGrowthStory.tsx");

function balancedBlock(source: string, marker: string) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing governed CSS block: ${marker}`);
  const open = source.indexOf("{", start);
  assert.notEqual(open, -1, `missing opening brace for: ${marker}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated governed CSS block: ${marker}`);
}

describe("landing V2 visual safety authority", () => {
  const css = fs.readFileSync(v2CssPath, "utf8");
  const navbarFocus = fs.readFileSync(navbarFocusPath, "utf8");
  const growthStory = fs.readFileSync(growthStoryPath, "utf8");
  const compactComposition = balancedBlock(css, "@media (max-width: 820px)");
  const phoneDecisionPoint = balancedBlock(css, "@media (max-width: 480px)");
  const smallestPhoneComposition = balancedBlock(css, "@media (max-width: 360px)");

  it("loads the V2 authority from the governed global shell", () => {
    assert.match(navbarFocus, /@import "\.\/landing-experience-v2\.css";/);
  });

  it("reserves the fixed-navigation corridor and hardware safe area", () => {
    assert.match(compactComposition, /--tp-landing-safe-bottom:\s*calc\(env\(safe-area-inset-bottom, 0px\) \+ 8\.5rem\)/);
    assert.match(css, /\.tecpey-living-mobile-nav[\s\S]*bottom:\s*calc\(env\(safe-area-inset-bottom, 0px\) \+ \.75rem\) !important/);
    assert.match(compactComposition, /scroll-margin-bottom:\s*var\(--tp-landing-safe-bottom\)/);
  });

  it("keeps compact-phone decisions tappable while proof metadata stays out of the overlay corridor", () => {
    assert.match(growthStory, /data-mobile-learning-cta/);
    assert.match(phoneDecisionPoint, /\[data-hero-content\][\s\S]*padding-bottom:\s*1\.25rem !important/);
    assert.match(phoneDecisionPoint, /\[data-mobile-learning-cta\][\s\S]*display:\s*grid !important/);
    assert.match(phoneDecisionPoint, /grid-template-columns:\s*minmax\(0,\s*1\.2fr\)\s*minmax\(0,\s*\.8fr\)/);
    assert.match(phoneDecisionPoint, /\[data-mobile-learning-cta\] > \*[\s\S]*min-height:\s*52px/);
    assert.match(compactComposition, /\[data-hero-signals\][\s\S]*position:\s*relative !important/);
    assert.match(compactComposition, /\[data-hero-signals\][\s\S]*inset:\s*auto !important/);
    assert.match(compactComposition, /\[data-hero-signals\][\s\S]*overflow:\s*clip !important/);
  });

  it("compacts the 320–360px decision point instead of pushing it under fixed navigation", () => {
    assert.match(smallestPhoneComposition, /\[data-hero-content\][\s\S]*padding-top:\s*4rem !important/);
    assert.match(smallestPhoneComposition, /\[data-mobile-learning-cta\][\s\S]*margin-top:\s*\.75rem !important/);
    assert.doesNotMatch(smallestPhoneComposition, /display:\s*none|visibility:\s*hidden/);
  });

  it("uses semantic hero hooks instead of incidental child order across every visual authority", () => {
    for (const hook of [
      "data-hero-image",
      "data-hero-shade",
      "data-hero-route",
      "data-hero-content",
      "data-hero-signals",
      'data-route-node="start"',
      'data-route-node="practice"',
      'data-route-node="skill"',
      'data-route-node="future"',
    ]) {
      assert.match(growthStory, new RegExp(hook));
    }
    assert.match(css, /\[data-hero-route\]::after/);
    assert.match(css, /\[data-route-node="future"\]/);
    assert.match(navbarFocus, /\[data-hero-image\]/);
    assert.doesNotMatch(css, /nth-(?:child|of-type)/);
    assert.doesNotMatch(navbarFocus, /nth-(?:child|of-type)/);
    assert.doesNotMatch(navbarFocus, />\s*img\[src\*=/);
  });

  it("keeps the full mobile and tablet journey route above hero copy through 820px", () => {
    assert.match(compactComposition, /\[data-hero-route\]::before[\s\S]*top:\s*7%/);
    const expectedTop = { start: "30", practice: "23", skill: "16", future: "9" } as const;
    for (const [node, top] of Object.entries(expectedTop)) {
      const rule = balancedBlock(compactComposition, `[data-route-node="${node}"]`);
      assert.match(rule, new RegExp(`top:\\s*${top}% !important`));
      assert.match(rule, /bottom:\s*auto !important/);
    }
  });

  it("keeps static hero assurances in a readable non-scroll grid", () => {
    assert.match(growthStory, /data-hero-signals[\s\S]*role="list"/);
    const signals = balancedBlock(compactComposition, "[data-hero-signals]");
    assert.match(signals, /display:\s*grid !important/);
    assert.match(signals, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(signals, /overflow:\s*clip !important/);
    assert.doesNotMatch(signals, /overflow-x:\s*auto/);
    assert.match(compactComposition, /\[data-hero-signals\] > \[role="listitem"\][\s\S]*white-space:\s*normal !important/);
  });

  it("enforces the 44px TecPey interaction floor independently of WCAG exceptions", () => {
    assert.match(css, /button,[\s\S]*select,[\s\S]*summary[\s\S]*min-width:\s*44px;[\s\S]*min-height:\s*44px/);
    assert.match(css, /> nav\[aria-label\] > a[\s\S]*min-height:\s*44px/);
    assert.match(css, /#story-academy aside a[\s\S]*min-width:\s*44px;[\s\S]*min-height:\s*44px/);
  });

  it("pins the future-product kicker to an explicit contrast-safe surface", () => {
    assert.match(growthStory, /data-exchange-kicker/);
    assert.match(css, /\[data-exchange-kicker\][\s\S]*color:\s*#064c55 !important/);
    assert.match(css, /\[data-exchange-kicker\][\s\S]*background:\s*#d8fbfa/);
  });

  it("keeps reduced-motion and reduced-transparency fallbacks", () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
    assert.match(css, /backdrop-filter:\s*none !important/);
  });

  it("does not define news, enrichment, materialization or publication behavior", () => {
    assert.doesNotMatch(css, /Full-Evidence|hydration|materialization|IndexNow|Enrichment|newsUrl/i);
  });
});
