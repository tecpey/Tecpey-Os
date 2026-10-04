import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("news discovery shows governed media, honest fallback and publication age", async ({ page }, testInfo) => {
  const isFa = testInfo.project.metadata.locale === "fa";
  const now = Date.now();
  await page.clock.install({ time: now });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  const blockedRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://unapproved.example/**", route => {
    blockedRequests.push(route.request().url());
    return route.abort();
  });
  const image = await readFile(new URL("../../../public/images/tecpey-logo.png", import.meta.url));
  await page.route("**/crypto-news/media?**", route => {
    const article = new URL(route.request().url()).searchParams.get("article");
    return article?.endsWith("/rich-qa-0")
      ? route.fulfill({ contentType: "image/png", body: image })
      : route.fulfill({ status: 503, body: "Controlled unavailable media fixture" });
  });
  await page.goto(`${isFa ? "" : "/en"}/crypto-news?date=2024-01-01`);
  const archive = page.locator("section").filter({ has: page.getByRole("heading", { level: 1 }) });
  const date = archive.getByRole("combobox");
  const today = await date.locator("option").first().getAttribute("value");
  const items = [now - 60_000, now - 13 * 3_600_000, now + 300_000].map((published, index) => ({
    archiveId: `rich-qa-${index}`, sourceName: `QA Source ${index + 1}`,
    articleUrl: `https://www.coindesk.com/rich-qa-${index}`, publishedAt: new Date(published).toISOString(),
    fetchedAt: new Date(now + 24 * 3_600_000).toISOString(),
    newsUrl: null,
    thumbnailUrl: index === 2 ? "https://unapproved.example/blocked.png" : `/crypto-news/media?article=${encodeURIComponent(`https://www.coindesk.com/rich-qa-${index}`)}`,
    thumbnailAlt: "Controlled QA brand image, not news photography",
    thumbnailPolicy: index === 2 ? "blocked" : "official_attribution",
    thumbnailAttributionRequired: true,
    sourceCoverage: "feed_summary", translationPending: false, translationStatus: "completed",
    publicSummaryAllowed: true, persianEditorialAllowed: true,
    taxonomy: { coinSymbols: [], topicTags: [], toolSlugs: [] },
    sourceTitle: "Synthetic discovery fixture",
    displayTitle: isFa ? `خبر آزمایشی ${index + 1}: تحلیل گزارش بازار` : `Test story ${index + 1}: understanding a market report`,
    displayLead: isFa ? "خلاصهٔ مجاز خبر برای بررسی تصویر، منبع و زمان انتشار در کارت." : "Authorized summary for checking the image, source and publication time in the card.",
    displayBody: "",
  }));
  await page.route("**/api/crypto-news?**", route => {
    if (new URL(route.request().url()).searchParams.get("date") !== today) return route.continue();
    return route.fulfill({ json: { day: today, today, archiveItems: items, availableDays: [today, "2024-01-01"] } });
  });
  await date.selectOption(today);
  const rail = archive.getByRole("navigation", { name: isFa ? "مرور تیترهای خبر" : "News headlines" });
  const cards = rail.getByRole("button", { name: isFa ? /^خواندن خبر:/ : /^Read story:/ });
  await expect(cards).toHaveCount(3);
  const recent = isFa ? "انتشار در ۱۲ ساعت گذشته" : "Published within 12 hours";
  const earlier = isFa ? "انتشار قدیمی‌تر" : "Earlier publication";
  const future = isFa ? "زمان انتشار در آینده است" : "Future publication timestamp";
  const fallback = isFa ? "نمای امن تک‌پی" : "TecPey safe fallback";
  await cards.nth(0).focus();
  await cards.nth(0).evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect(cards.nth(0)).toContainText(items[0].displayLead);
  await expect(cards.nth(0)).toContainText(recent);
  await expect(cards.nth(0).locator("time")).toHaveAttribute("datetime", items[0].publishedAt);
  await expect.poll(() => cards.nth(0).locator("img").evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
  await expect(cards.nth(0)).toContainText(isFa ? "اعتبار تصویر: QA Source 1" : "Media: QA Source 1");
  await cards.nth(1).focus();
  await cards.nth(1).evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect(cards.nth(1)).toContainText(earlier);
  await expect(cards.nth(1).locator('[data-news-media="fallback"]')).toHaveCount(1);
  await expect(cards.nth(1)).toContainText(fallback);
  await expect(cards.nth(1)).toHaveAccessibleDescription(new RegExp(fallback));
  await expect(cards.nth(1).locator("img")).toHaveCount(0);
  await expect(cards.nth(1)).not.toContainText(isFa ? "اعتبار تصویر:" : "Media: QA Source");
  await expect(cards.nth(2)).toContainText(future);
  await expect(cards.nth(2).locator("img")).toHaveCount(0);
  await testInfo.attach("news-rich-fallback-320", { body: await page.screenshot(), contentType: "image/png" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await cards.nth(0).focus();
  await cards.nth(1).focus();
  await cards.nth(1).evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
  const track = rail.getByRole("list");
  await expect.poll(async () => {
    const viewport = await track.boundingBox();
    const focal = await cards.nth(1).boundingBox();
    return Math.abs(focal.x + focal.width / 2 - viewport.x - viewport.width / 2);
  }).toBeLessThanOrEqual(2);
  const viewport = await track.boundingBox();
  for (const index of [0, 2]) {
    const neighbor = await cards.nth(index).boundingBox();
    const visible = Math.max(0, Math.min(neighbor.x + neighbor.width, viewport.x + viewport.width) - Math.max(neighbor.x, viewport.x));
    expect(Math.abs(visible / neighbor.width - 0.5)).toBeLessThanOrEqual(0.02);
  }
  await testInfo.attach("news-rich-half-peeks-1280", { body: await page.screenshot(), contentType: "image/png" });
  // Exercise both CSS themes; this is a style check, not a theme-toggle workflow claim.
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await testInfo.attach("news-rich-light-1280", { body: await page.screenshot(), contentType: "image/png" });
  await page.clock.setSystemTime(now + 12 * 3_600_000 + 60_001);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(cards.nth(0)).toContainText(earlier);
  await expect(cards.nth(0)).not.toContainText(recent);
  expect(blockedRequests).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
