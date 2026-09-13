import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const story = readFileSync("src/components/home/TecpeyGrowthStory.tsx", "utf8");
test("landing introduces the exchange without offering execution", () => {
  assert.doesNotMatch(story, /my\.tecpey\.ir|exchangeHref|exchangeSignupHref|ورود به صرافی|Enter Exchange/);
  assert.match(story, /صرافی تک‌پی/);
  assert.match(story, /In development/);
});
test("conversion retains Academy, Mentor, virtual Arena and skill record paths", () => {
  for (const route of ["/academy", "/academy/ai-guide", "/academy/trading-arena", "/academy/profile", "/academy/term-8"]) assert.ok(story.includes(`link("${route}")`));
  assert.match(story, /virtual capital/);
  assert.match(story, /Start Free Academy/);
});
test("proposed awards are not represented as granted entitlements", () => {
  assert.match(story, /Cash payouts and automatic reward grants are not active/);
  assert.match(story, /Automatic grants are not active yet/);
  assert.match(story, /independent of league rank/);
});
