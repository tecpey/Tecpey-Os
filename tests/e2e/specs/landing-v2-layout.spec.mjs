import { expect, test } from "@playwright/test";

const COMPACT_WIDTHS = [320, 360, 375, 390, 393, 430];
const WIDE_WIDTHS = [768, 1024, 1280, 1440];
const EVIDENCE_WIDTHS = new Set([320, 390, 430, 768, 1024, 1440]);
const VIEWPORT_HEIGHT = 844;

const LOCALES = [
  { key: "fa", path: "/", dir: "rtl", lang: "fa-IR" },
  { key: "en", path: "/en", dir: "ltr", lang: "en-US" },
];

function overlaps(a, b) {
  if (!a || !b) return false;
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function durationToMs(value) {
  const token = String(value || "0s").split(",")[0].trim();
  if (token.endsWith("ms")) return Number.parseFloat(token) || 0;
  if (token.endsWith("s")) return (Number.parseFloat(token) || 0) * 1000;
  return Number.parseFloat(token) || 0;
}

async function expectNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.document,
    `${label}: document width ${dimensions.document}px exceeds viewport ${dimensions.viewport}px`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectTargetFloor(locator, label) {
  const box = await locator.boundingBox();
  expect(box, `${label}: target has no layout box`).not.toBeNull();
  expect(box.width, `${label}: target width must be at least 44px`).toBeGreaterThanOrEqual(44);
  expect(box.height, `${label}: target height must be at least 44px`).toBeGreaterThanOrEqual(44);
}

async function expectRouteClearOfCopy(page, label) {
  const hero = page.locator('[data-home-section="hero"]');
  const heading = await hero.locator("#growth-hero-title").boundingBox();
  const description = await hero.locator("#growth-hero-title + p").boundingBox();
  const actionLinks = hero.locator("[data-mobile-learning-cta] > a");
  await expect(actionLinks, `${label}: hero must render both governed actions`).toHaveCount(2);
  const actionBoxes = [];
  for (let index = 0; index < 2; index += 1) {
    const actionBox = await actionLinks.nth(index).boundingBox();
    expect(actionBox, `${label}: hero action ${index + 1} has no rendered box`).not.toBeNull();
    actionBoxes.push(actionBox);
  }
  const heroBox = await hero.boundingBox();
  expect(heroBox, `${label}: hero has no layout box`).not.toBeNull();

  const orderedNames = ["future", "skill", "practice", "start"];
  const boxes = [];
  for (const name of orderedNames) {
    const node = hero.locator(`[data-route-node="${name}"]`);
    await expect(node, `${label}: ${name} route node must be visible`).toBeVisible();
    const box = await node.boundingBox();
    expect(box, `${label}: ${name} route node has no layout box`).not.toBeNull();
    expect(box.x, `${label}: ${name} escapes hero inline start`).toBeGreaterThanOrEqual(heroBox.x - 1);
    expect(box.x + box.width, `${label}: ${name} escapes hero inline end`).toBeLessThanOrEqual(heroBox.x + heroBox.width + 1);
    expect(box.y, `${label}: ${name} escapes hero top`).toBeGreaterThanOrEqual(heroBox.y - 1);
    expect(box.y + box.height, `${label}: ${name} escapes hero bottom`).toBeLessThanOrEqual(heroBox.y + heroBox.height + 1);
    expect(overlaps(box, heading), `${label}: ${name} overlaps the hero heading`).toBe(false);
    expect(overlaps(box, description), `${label}: ${name} overlaps the hero description`).toBe(false);
    for (let actionIndex = 0; actionIndex < actionBoxes.length; actionIndex += 1) {
      expect(
        overlaps(box, actionBoxes[actionIndex]),
        `${label}: ${name} overlaps hero action ${actionIndex + 1}`,
      ).toBe(false);
    }
    boxes.push(box);
  }

  for (let index = 1; index < boxes.length; index += 1) {
    expect(
      boxes[index].y,
      `${label}: route nodes must progress visually from future to start without reversing`,
    ).toBeGreaterThan(boxes[index - 1].y - 1);
  }
}

async function expectMobileNavClearance(page, label) {
  const nav = page.locator(".tecpey-living-mobile-nav");
  await expect(nav, `${label}: mobile navigation must be visible below lg`).toBeVisible();
  const navBox = await nav.boundingBox();
  expect(navBox, `${label}: mobile navigation has no layout box`).not.toBeNull();

  const heroActions = page.locator('[data-mobile-learning-cta] > a');
  await expect(heroActions, `${label}: hero must expose two primary journey actions`).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const action = heroActions.nth(index);
    await expectTargetFloor(action, `${label}: hero action ${index + 1}`);
    const actionBox = await action.boundingBox();
    expect(
      actionBox.y + actionBox.height,
      `${label}: hero action ${index + 1} is obscured by the fixed mobile navigation`,
    ).toBeLessThanOrEqual(navBox.y - 4);
  }

  const navItems = nav.locator(".tecpey-living-mobile-nav__item");
  const itemCount = await navItems.count();
  expect(itemCount, `${label}: mobile navigation must expose its governed destinations`).toBeGreaterThanOrEqual(4);
  for (let index = 0; index < itemCount; index += 1) {
    await expectTargetFloor(navItems.nth(index), `${label}: mobile navigation item ${index + 1}`);
  }
}

async function openLanding(page, locale, width) {
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
  const response = await page.goto(locale.path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${locale.key}/${width}: landing HTTP status`).toBeLessThan(400);
  await expect(page.locator('main[data-runtime-contract="landing-growth-v1"]')).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", locale.dir);
  await expect(page.locator("html")).toHaveAttribute("lang", locale.lang);
}

async function attachHeroEvidence(page, testInfo, locale, width) {
  if (!EVIDENCE_WIDTHS.has(width)) return;
  await testInfo.attach(`landing-v2-${locale.key}-${width}px`, {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
}

test("Landing V2 compact viewport matrix keeps the journey clear, tappable and unobscured", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-fa-mobile", "single touch-capable authority project owns the compact matrix");

  for (const locale of LOCALES) {
    for (const width of COMPACT_WIDTHS) {
      const label = `${locale.key}/${width}px`;
      await openLanding(page, locale, width);
      await expectNoHorizontalOverflow(page, label);
      await expectRouteClearOfCopy(page, label);
      await expectMobileNavClearance(page, label);
      await attachHeroEvidence(page, testInfo, locale, width);
    }
  }
});

test("Landing V2 tablet and desktop matrix preserves route separation and overflow safety", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-en-desktop", "single Chromium desktop authority project owns the wide matrix");

  for (const locale of LOCALES) {
    for (const width of WIDE_WIDTHS) {
      const label = `${locale.key}/${width}px`;
      await openLanding(page, locale, width);
      await expectNoHorizontalOverflow(page, label);
      await expectRouteClearOfCopy(page, label);
      if (width < 1024) await expectMobileNavClearance(page, label);
      else await expect(page.locator(".tecpey-living-mobile-nav")).toBeHidden();
      await attachHeroEvidence(page, testInfo, locale, width);
    }
  }
});

test("Landing V2 reduced-motion contract removes meaningful hero animation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-en-desktop", "single Chromium authority project owns reduced-motion evidence");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openLanding(page, LOCALES[1], 390);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const motion = await page.locator("[data-hero-image]").evaluate((node) => {
    const style = getComputedStyle(node);
    return { name: style.animationName, duration: style.animationDuration, transition: style.transitionDuration };
  });
  expect(
    motion.name === "none" || durationToMs(motion.duration) <= 0.02,
    `reduced-motion hero animation remains meaningful: ${JSON.stringify(motion)}`,
  ).toBe(true);
  expect(
    durationToMs(motion.transition) <= 0.02,
    `reduced-motion hero transition remains meaningful: ${JSON.stringify(motion)}`,
  ).toBe(true);
  await testInfo.attach("landing-v2-en-390px-reduced-motion", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});
