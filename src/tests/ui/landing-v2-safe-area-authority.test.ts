import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const v2CssPath = path.join(root, "src/app/landing-experience-v2.css");
const navbarFocusPath = path.join(root, "src/app/navbar-focus.css");
const growthStoryPath = path.join(root, "src/components/home/TecpeyGrowthStory.tsx");

describe("landing V2 visual safety authority", () => {
  const css = fs.readFileSync(v2CssPath, "utf8");
  const navbarFocus = fs.readFileSync(navbarFocusPath, "utf8");
  const growthStory = fs.readFileSync(growthStoryPath, "utf8");

  it("loads the V2 authority from the governed global shell", () => {
    assert.match(navbarFocus, /@import "\.\/landing-experience-v2\.css";/);
  });

  it("reserves the mobile fixed-navigation safe area", () => {
    assert.match(css, /--tp-landing-safe-bottom:\s*calc\(env\(safe-area-inset-bottom, 0px\) \+ 8\.5rem\)/);
    assert.match(css, /\.tecpey-living-mobile-nav[\s\S]*safe-area-inset-bottom/);
    assert.match(css, /scroll-margin-bottom:\s*var\(--tp-landing-safe-bottom\)/);
  });

  it("uses semantic hero hooks instead of incidental child order", () => {
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
    assert.doesNotMatch(css, /nth-(?:child|of-type)/);
  });

  it("keeps static hero assurances out of inaccessible horizontal scrolling", () => {
    assert.match(growthStory, /data-hero-signals[\s\S]*role="list"/);
    assert.match(css, /\[data-hero-signals\][\s\S]*display:\s*grid !important/);
    assert.match(css, /\[data-hero-signals\][\s\S]*overflow:\s*clip !important/);
    assert.match(css, /\[data-hero-signals\][\s\S]*white-space:\s*normal !important/);
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
