import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const landingPath = path.join(
  process.cwd(),
  "src/app/home/enterprise/TecpeyEnterpriseLanding.tsx",
);

const landing = fs.readFileSync(landingPath, "utf8");

test("first-release landing has no exchange execution CTA", () => {
  const forbidden = [
    /my\.tecpey\.ir/,
    /\bexchangeHref\b/,
    /\bexchangeSignupHref\b/,
    /ورود به صرافی/,
    /باز کردن صرافی/,
    /تجربه اصلی تک‌پی/,
  ];

  for (const pattern of forbidden) {
    assert.doesNotMatch(landing, pattern);
  }
});

test("hero is Academy-first and Mentor-second", () => {
  const heroStart = landing.indexOf("function Hero()");
  const heroEnd = landing.indexOf("function GlobalUxMetrics()", heroStart);

  assert.ok(heroStart >= 0);
  assert.ok(heroEnd > heroStart);

  const hero = landing.slice(heroStart, heroEnd);

  const academy = hero.indexOf('href={academyHref}');
  const mentor = hero.indexOf('href={mentorHref}');

  assert.ok(academy >= 0);
  assert.ok(mentor > academy);
  assert.match(hero, /شروع آکادمی رایگان/);
  assert.match(hero, /گفتگو با منتور هوشمند/);
});

test("product focus preserves the learning loop", () => {
  const start = landing.indexOf("function SoftLaunchProductFocus()");
  const end = landing.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const section = landing.slice(start, end);

  const academy = section.indexOf('title: "آکادمی رایگان"');
  const mentor = section.indexOf('title: "منتور هوشمند"');
  const market = section.indexOf('title: "نمای آموزشی بازار"');
  const arena = section.indexOf('title: "تریدینگ آرنا"');

  assert.ok(academy >= 0);
  assert.ok(mentor > academy);
  assert.ok(market > mentor);
  assert.ok(arena > market);

  assert.match(section, /href: academyHref/);
  assert.match(section, /href: mentorHref/);
  assert.match(section, /href: "\/markets"/);
  assert.match(section, /href: tradingArenaHref/);
});

test("final and sticky CTAs remain Academy and Mentor only", () => {
  const finalStart = landing.indexOf("function FinalCta()");
  const arenaStart = landing.indexOf("function TradingArenaSection()", finalStart);

  assert.ok(finalStart >= 0);
  assert.ok(arenaStart > finalStart);

  const closingJourney = landing.slice(finalStart, arenaStart);

  assert.match(closingJourney, /href=\{academyHref\}/);
  assert.match(closingJourney, /href=\{mentorHref\}/);
  assert.match(closingJourney, /شروع آکادمی رایگان/);
  assert.match(closingJourney, /گفتگو با منتور هوشمند/);
  assert.match(closingJourney, /شروع آکادمی/);
  assert.match(closingJourney, /منتور هوشمند/);

  assert.doesNotMatch(closingJourney, /my\.tecpey\.ir/);
  assert.doesNotMatch(closingJourney, /ورود به صرافی/);
});

test("educational exchange references may remain without execution links", () => {
  assert.match(landing, /کار با صرافی/);
  assert.doesNotMatch(landing, /href=.*my\.tecpey\.ir/);
});
