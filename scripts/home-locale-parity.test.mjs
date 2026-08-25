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

test("FA and EN homes share the governed core section order", async () => {
  const [fa, en] = await Promise.all([source(faPath), source(enPath)]);
  const sharedOrder = [
    "<HomeDiscoveryStrip",
    "<CryptoNewsCenter",
    "<HomeAiMentorSpotlight",
    "<HomeLearningJourney",
    "<LandingGrowthRadar",
  ];

  assert.match(fa, /data-home-section="hero"/);
  assert.match(en, /data-home-section="hero"/);
  assertInOrder(fa, ["<Hero />", "<HomeDiscoveryStrip"], "FA home top");
  assertInOrder(en, ['data-home-section="hero"', "<HomeDiscoveryStrip"], "EN home top");
  assertInOrder(fa, sharedOrder, "FA home");
  assertInOrder(en, sharedOrder, "EN home");
  assert.match(fa, /<HomeDiscoveryStrip locale="fa" radar=\{growthRadar\} \/>/);
  assert.match(en, /<HomeDiscoveryStrip locale="en" radar=\{growthRadar\} \/>/);
  assert.doesNotMatch(fa, /TopDiscoveryGateway/);
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

test("interface language does not force an Iran-only market unit", async () => {
  const [fa, en] = await Promise.all([source(faPath), source(enPath)]);

  assert.doesNotMatch(fa, /USDT_IRT|\/ IRT/);
  assert.match(fa, /USD\/USDT/);
  assert.match(en, /USD\/USDT/);
});
