import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const landingPath = path.join(
  process.cwd(),
  "src/app/home/enterprise/TecpeyEnterpriseLanding.tsx",
);
const heroPath = path.join(
  process.cwd(),
  "src/components/home/CalmLandingHero.tsx",
);
const storyPath = path.join(
  process.cwd(),
  "src/components/home/HomeProductStory.tsx",
);
const closePath = path.join(
  process.cwd(),
  "src/components/home/CalmProductSections.tsx",
);

const landing = fs.readFileSync(landingPath, "utf8");
const sharedHero = fs.readFileSync(heroPath, "utf8");
const productStory = fs.readFileSync(storyPath, "utf8");
const close = fs.readFileSync(closePath, "utf8");

test("first-release landing has no exchange execution CTA", () => {
  const forbidden = [
    /\bexchangeHref\b/,
    /\bexchangeSignupHref\b/,
    /ورود به صرافی/,
    /باز کردن صرافی/,
    /تجربه اصلی تک‌پی/,
  ];

  for (const pattern of forbidden) {
    assert.doesNotMatch(landing, pattern);
    assert.doesNotMatch(sharedHero, pattern);
    assert.doesNotMatch(productStory, pattern);
  }
});

test("shared hero is Academy-first and Mentor-second in FA and EN", () => {
  const academy = sharedHero.indexOf('href={`${prefix}/academy`}');
  const mentor = sharedHero.indexOf('href={`${prefix}/academy/ai-guide`}');

  assert.ok(academy >= 0);
  assert.ok(mentor > academy);
  assert.match(sharedHero, /شروع آکادمی رایگان/);
  assert.match(sharedHero, /گفتگو با منتور هوشمند/);
  assert.match(sharedHero, /Start Free Academy/);
  assert.match(sharedHero, /Talk to AI Mentor/);
  assert.match(sharedHero, /const prefix = fa \? "" : "\/en"/);
});

test("connected product story preserves the governed learning loop", () => {
  const learn = productStory.indexOf('title: "یاد بگیر"');
  const ask = productStory.indexOf('title: "بپرس"');
  const practice = productStory.indexOf('title: "تمرین کن"');
  const context = productStory.indexOf('title: "زمینه را ببین"');

  assert.ok(learn >= 0);
  assert.ok(ask > learn);
  assert.ok(practice > ask);
  assert.ok(context > practice);

  assert.match(productStory, /href: "\/academy"/);
  assert.match(productStory, /href: "\/academy\/ai-guide"/);
  assert.match(productStory, /href: "\/academy\/trading-arena"/);
  assert.match(productStory, /href: "\/crypto-news"/);

  assert.match(productStory, /۷ ترم پایه \+ ترم رشد بی‌پایان/);
  assert.match(productStory, /7 foundation terms \+ continuous growth/);
});

test("closing conversion remains inside the learning account boundary", () => {
  assert.match(close, /href={`${prefix}\/academy\/signup`}/);
  assert.match(close, /href={`${prefix}\/academy\/login`}/);
  assert.match(close, /ساخت حساب آموزشی/);
  assert.match(close, /Create a learning account/);

  assert.doesNotMatch(close, /href=.*my\.tecpey\.ir/);
  assert.doesNotMatch(close, /ورود به صرافی/);
  assert.doesNotMatch(close, /Enter Exchange/);
});

test("launch-gated product boundary remains explicit", () => {
  assert.match(productStory, /خدمات پول واقعی تا عبور از گیت‌های راه‌اندازی فعال نمی‌شود/);
  assert.match(productStory, /Real-money services remain launch-gated/);
  assert.match(productStory, /وعدهٔ سود/);
  assert.match(productStory, /does not promise returns/);
  assert.doesNotMatch(productStory, /href=.*my\.tecpey\.ir/);
});
