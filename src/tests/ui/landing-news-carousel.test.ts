import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const live = readFileSync("src/components/home/StoryLiveData.tsx", "utf8");
const css = readFileSync("src/components/home/growth-story.module.css", "utf8");
const route = readFileSync("src/app/api/crypto-news/route.ts", "utf8");

test("landing news is a user-controlled centered carousel with adjacent context", () => {
  assert.match(live, /limit=7/);
  assert.match(live, /role="region" aria-roledescription=\{fa \? "نوار خبر" : "news carousel"\}/);
  assert.match(live, /scrollIntoView\(\{ behavior: "smooth", block: "nearest", inline: "center" \}\)/);
  assert.match(live, /Previous story/);
  assert.match(live, /Next story/);
  assert.match(live, /event\.key === "ArrowLeft"/);
  assert.match(css, /scroll-snap-type: x mandatory/);
  assert.match(css, /scroll-snap-align: center/);
  assert.match(css, /--news-card-width: 78vw/);
});

test("news cards use governed TecPey editorial thumbnails and disclose their origin", () => {
  assert.match(route, /storyNewsThumbnail/);
  assert.match(route, /kind: "tecpey_editorial"/);
  assert.match(live, /TecPey editorial topic image/);
  assert.match(live, /item\.thumbnail\?\.src/);
});

test("carousel motion stays bounded and accessible", () => {
  assert.match(css, /transition: transform 260ms var\(--ease-in-out\), opacity 220ms var\(--ease-out\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.newsRail \{ scroll-behavior: auto/);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.doesNotMatch(css, /scale\(0\)/);
});
