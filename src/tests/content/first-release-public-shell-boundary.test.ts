import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path: string) => fs.readFileSync(path, "utf8");

const navbar = read("src/components/navbar/Navbar.tsx");
const footer = read("src/components/footer/Footer.tsx");
const faLanding = read(
  "src/app/home/enterprise/TecpeyEnterpriseLanding.tsx",
);
const enLanding = read("src/app/en/EnglishLandingClient.tsx");
const story = read("src/components/home/TecpeyGrowthStory.tsx");

test("public navbar is Academy-first and exposes Mentor before market discovery", () => {
  for (const [academy, mentor, market] of [
    ['{ label: "آکادمی"', '{ label: "منتور هوشمند"', '{ label: "بازارها"'],
    ['{ label: "Academy"', '{ label: "AI Learning Mentor"', '{ label: "Markets"'],
  ]) {
    const academyIndex = navbar.indexOf(academy);
    const mentorIndex = navbar.indexOf(mentor);
    const marketIndex = navbar.indexOf(market);

    assert.ok(academyIndex >= 0);
    assert.ok(mentorIndex > academyIndex);
    assert.ok(marketIndex > mentorIndex);
  }
});

test("public navbar never routes anonymous auth directly to exchange execution", () => {
  assert.doesNotMatch(navbar, /https:\/\/my\.tecpey\.ir\/signin/);
  assert.doesNotMatch(navbar, /https:\/\/my\.tecpey\.ir\/signup/);

  assert.match(navbar, /\/academy\/login/);
  assert.match(navbar, /\/academy\/signup/);
  assert.match(navbar, /\/en\/academy\/login/);
  assert.match(navbar, /\/en\/academy\/signup/);
});

test("footer puts learning and practice before market discovery in both locales", () => {
  const faLearning = footer.indexOf('title: "آموزش و تمرین"');
  const faMarket = footer.indexOf('title: "بازار و معامله"');
  const enLearning = footer.indexOf('title: "Academy & Practice"');
  const enMarket = footer.indexOf('title: "Markets & Trading"');

  assert.ok(faLearning >= 0);
  assert.ok(faMarket > faLearning);
  assert.ok(enLearning >= 0);
  assert.ok(enMarket > enLearning);

  assert.match(footer, /منتور هوشمند/);
  assert.match(footer, /AI Learning Mentor/);
  assert.doesNotMatch(footer, /my\.tecpey\.ir/);
});

test("footer learning journey orders Academy then Mentor then Trading Arena in both locales", () => {
  for (const [academy, mentor, arena] of [
    ['["آکادمی تک‌پی", "/academy"]', '["منتور هوشمند", "/academy/ai-guide"]', '["تریدینگ آرنا", "/academy/trading-arena"]'],
    ['["Academy", "/en/academy"]', '["AI Learning Mentor", "/en/academy/ai-guide"]', '["Trading Arena", "/en/academy/trading-arena"]'],
  ]) {
    const academyIndex = footer.indexOf(academy);
    const mentorIndex = footer.indexOf(mentor);
    const arenaIndex = footer.indexOf(arena);

    assert.ok(academyIndex >= 0);
    assert.ok(mentorIndex > academyIndex);
    assert.ok(arenaIndex > mentorIndex);
  }
});

test("both public landings remain free of exchange execution CTAs", () => {
  const forbidden = [
    /https:\/\/my\.tecpey\.ir/,
    /Enter Exchange/,
    /ورود به صرافی/,
    /باز کردن صرافی/,
  ];

  for (const pattern of forbidden) {
    assert.doesNotMatch(faLanding, pattern);
    assert.doesNotMatch(enLanding, pattern);
    assert.doesNotMatch(story, pattern);
  }
});

test("English landing shares Academy conversion and mentor access", () => {
  assert.match(enLanding, /<TecpeyGrowthStory locale="en"/);
  assert.ok(story.indexOf('link("/academy")') < story.indexOf('link("/academy/ai-guide")'));
});
