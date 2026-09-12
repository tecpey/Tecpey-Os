import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
test("market layout retains constrained columns and an accessible list alternative", () => {
  const css = readFileSync("src/components/home/growth-story.module.css", "utf8");
  const live = readFileSync("src/components/home/StoryLiveData.tsx", "utf8");
  assert.match(css, /repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.heatmap \{[^}]*min-width: 0/);
  assert.match(live, /minWidth=\{0\}/);
  assert.match(live, /aria-pressed=\{list\}/);
  assert.match(live, /styles.marketList/);
});
