import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const v2CssPath = path.join(root, "src/app/landing-experience-v2.css");
const navbarFocusPath = path.join(root, "src/app/navbar-focus.css");

describe("landing V2 visual safety authority", () => {
  const css = fs.readFileSync(v2CssPath, "utf8");
  const navbarFocus = fs.readFileSync(navbarFocusPath, "utf8");

  it("loads the V2 authority from the governed global shell", () => {
    assert.match(navbarFocus, /@import "\.\/landing-experience-v2\.css";/);
  });

  it("reserves the mobile fixed-navigation safe area", () => {
    assert.match(css, /--tp-landing-safe-bottom:\s*calc\(env\(safe-area-inset-bottom, 0px\) \+ 8\.5rem\)/);
    assert.match(css, /\.tecpey-living-mobile-nav[\s\S]*safe-area-inset-bottom/);
    assert.match(css, /scroll-margin-bottom:\s*var\(--tp-landing-safe-bottom\)/);
  });

  it("keeps the mountain route tied to the hero presentation contract", () => {
    assert.match(css, /section\[data-home-section="hero"\]/);
    assert.match(css, /div:nth-of-type\(2\)::after/);
    assert.match(css, /span:nth-child\(4\)/);
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
