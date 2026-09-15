import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const live = readFileSync("src/components/home/StoryLiveData.tsx", "utf8");
const css = readFileSync("src/components/home/growth-story.module.css", "utf8");

test("landing news is a user-controlled centered carousel with adjacent context", () => {
  assert.match(live, /limit=7/);
  assert.match(live, /role="region" aria-roledescription=\{fa \? "نوار خبر" : "news carousel"\}/);
  assert.match(live, /scrollIntoView\(\{ behavior: "auto", block: "nearest", inline: "center" \}\)/);
  assert.match(live, /Previous story/);
  assert.match(live, /Next story/);
  assert.match(live, /event\.key === "ArrowLeft"/);
  assert.match(css, /scroll-snap-type: x mandatory/);
  assert.match(css, /scroll-snap-align: center/);
  assert.match(css, /--news-card-width: 78vw/);
});

test("news cards consume governed source media without inventing News authority", () => {
  // Source media is accepted only through the shared safe-link boundary. When
  // absent, the landing owns one neutral editorial fallback; it must not infer
  // per-story imagery or revive the legacy presentation-only thumbnail shape.
  assert.match(live, /const sourceThumbnail = storySafeLink\(item\.thumbnailUrl\)/);
  assert.match(live, /const thumbnailSrc = sourceThumbnail \|\| neutralNewsCover/);
  assert.match(live, /TecPey editorial market image/);
  assert.doesNotMatch(live, /fallbackNewsCovers/);
  assert.doesNotMatch(live, /item\.thumbnail\?\.src/);
  assert.doesNotMatch(live, /storyNewsThumbnail/);
});

test("carousel motion stays bounded and accessible", () => {
  assert.match(css, /transition: transform 260ms var\(--ease-in-out\), opacity 220ms var\(--ease-out\)/);
  assert.match(css, /\.newsRail \{[\s\S]*?scroll-behavior: smooth/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.newsRail \{ scroll-behavior: auto/);
  assert.doesNotMatch(live, /scrollIntoView\(\{ behavior: "smooth"/);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.doesNotMatch(css, /scale\(0\)/);
});
