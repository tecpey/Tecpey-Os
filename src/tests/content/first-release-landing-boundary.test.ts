import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const story = readFileSync("src/components/home/TecpeyGrowthStory.tsx", "utf8");
test("landing introduces the exchange without offering execution", () => {
  assert.doesNotMatch(story, /my\.tecpey\.ir|exchangeHref|exchangeSignupHref|ورود به صرافی|Enter Exchange/);
  assert.doesNotMatch(story, /id="story-exchange"|step="09"|قدم ۹/);
  assert.match(story, /data-home-section="exchange-preview"/);
  assert.match(story, /صرافی اختصاصی و پیشرفته تک‌پی/);
  assert.match(story, /In development/);
});
test("conversion retains Academy, Mentor, virtual Arena and skill record paths", () => {
  for (const route of ["/academy", "/academy/ai-guide", "/academy/trading-arena", "/academy/profile", "/academy/term-8"]) assert.ok(story.includes(`link("${route}")`));
  assert.match(story, /virtual capital/);
  assert.match(story, /Start Free Academy/);
  assert.match(story, /شروع آکادمی رایگان/);
});
test("the learning story has exactly eight governed stages and keeps the exchange outside it", () => {
  for (let stage = 1; stage <= 8; stage += 1) {
    assert.match(story, new RegExp(`(?:<Chapter[^>]*stage=\\{${stage}\\}|data-journey-stage="${stage}")`));
  }
  assert.doesNotMatch(story, /data-journey-stage=(?:\{9\}|"9")/);
  const exchange = story.slice(story.indexOf('data-home-section="exchange-preview"'), story.indexOf('data-home-section="resume"'));
  assert.doesNotMatch(exchange, /data-journey-stage|<Link|<a\s|<button/);
});
test("proposed awards are not represented as granted entitlements", () => {
  assert.match(story, /Rewards are not active yet/);
  assert.match(story, /Activation timing and final eligibility/);
  assert.match(story, /independent of league rank/);
});
