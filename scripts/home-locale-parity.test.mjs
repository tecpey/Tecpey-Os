import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const faPath = "src/app/home/enterprise/TecpeyEnterpriseLanding.tsx";
const enPath = "src/app/en/EnglishLandingClient.tsx";
const stripPath = "src/components/home/HomeDiscoveryStrip.tsx";
const radarPath = "src/components/home/LandingGrowthRadar.tsx";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertInOrder(value, needles, label) {
  let cursor = -1;
  for (const needle of needles) {
    const next = value.indexOf(needle, cursor + 1);
    assert.notEqual(next, -1, `${label} is missing ${needle}`);
    assert.ok(next > cursor, `${label} renders ${needle} out of the governed order`);
    cursor = next;
  }
}

test("FA and EN homes use one localized story with news and markets before the growth journey", async () => {
  const [fa, en, story] = await Promise.all([source(faPath), source(enPath), source("src/components/home/TecpeyGrowthStory.tsx")]);
  assert.match(fa, /<TecpeyGrowthStory locale="fa"/);
  assert.match(en, /<TecpeyGrowthStory locale="en"/);
  assertInOrder(story, ['data-home-section="hero"', 'id="story-news"', 'id="story-market"', 'id="story-academy"', 'id="story-practice"', 'id="story-league"', 'data-home-section="pro-gift"', 'id="story-mastery"', 'id="story-exchange"', 'data-home-section="resume"'], "shared story");
  assert.match(story, /<HomeDiscoveryStrip locale=\{locale\} radar=\{radar\}/);
  assert.match(story, /<Suspense/);
  assert.match(story, /<Discovery promise=\{growthRadarPromise\} locale=\{locale\}/);
});

test("shared conversion preserves localized Academy and mentor access", async () => {
  const story = await source("src/components/home/TecpeyGrowthStory.tsx");
  assert.ok(story.includes('link("/academy")'));
  assert.ok(story.includes('link("/academy/ai-guide")'));
  assert.match(story, /شروع آکادمی رایگان/);
  assert.match(story, /Start Free Academy/);
  assert.match(story, /const prefix = fa \? "" : "\/en"/);
  assert.doesNotMatch(story, /my\.tecpey\.ir|ورود به صرافی|Enter Exchange/);
});

test("mobile discovery prioritizes readable controls without horizontal scrolling", async () => {
  const strip = await source(stripPath);

  assert.match(strip, /grid grid-cols-3/);
  assert.match(strip, /sm:grid-cols-5/);
  assert.match(strip, /text-xs/);
  assert.doesNotMatch(strip, /overflow-x-auto/);
  assert.match(strip, /min-h-11/);
  assert.match(strip, /aria-pressed=\{selected\}/);
  assert.match(strip, /sr-only/);
  assert.match(strip, /href=\{tool\.logoUrl\}/);
  assert.match(strip, /onError=\{\(event\)/);
});

test("partial authority data preserves the mobile discovery surface", async () => {
  const strip = await source(stripPath);

  assert.match(strip, /const hasAnyItems = coins\.length > 0 \|\| tools\.length > 0/);
  assert.match(strip, /if \(!hasAnyItems\) return null/);
  assert.doesNotMatch(strip, /coins\.length === 5 && tools\.length === 5/);
  assert.match(strip, /const activeMode: DiscoveryMode/);
  assert.match(strip, /disabled=\{!available\}/);
  assert.match(strip, /isPartial \? strings\.partialDescription : strings\.description/);
});

test("shared discovery owns localized routes and equivalent copy", async () => {
  const strip = await source(stripPath);

  for (const route of [
    '"/coins"',
    '"/en/coins"',
    '"/trading-tools"',
    '"/en/trading-tools"',
    '"/crypto-news"',
    '"/en/crypto-news"',
  ]) {
    assert.ok(strip.includes(route), `localized discovery route missing: ${route}`);
  }

  for (const key of [
    "badge",
    "title",
    "partialTitle",
    "description",
    "partialDescription",
    "groupLabel",
    "coins",
    "tools",
    "news",
    "rank",
    "score",
    "updated",
    "ready",
    "degraded",
    "available",
    "viewCoins",
    "viewTools",
    "viewNews",
    "educational",
  ]) {
    const occurrences = strip.match(new RegExp(`^    ${key}:`, "gm"))?.length ?? 0;
    assert.equal(occurrences, 2, `copy key ${key} must exist once for FA and once for EN`);
  }
});

test("the detailed growth radar yields mobile space to discovery", async () => {
  const radar = await source(radarPath);
  assert.match(radar, /data-major-section-visibility="desktop-only"/);
  assert.match(radar, /className="hidden[^\"]*md:block/);
});

test("interface language uses source quote currency and preserves small-price precision", async () => {
  const live = await source("src/components/home/StoryLiveData.tsx");
  assert.doesNotMatch(live, /USDT_IRT|\/ IRT/);
  assert.match(live, /provenance\?\.currency/);
  assert.match(live, /formatMarketPrice\(row.price/);
});
