import { expect, test } from "@playwright/test";

test("news headlines preserve RTL keyboard navigation and the reading return path", async ({ page }, testInfo) => {
  const isFa = testInfo.project.metadata.locale === "fa";
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${isFa ? "" : "/en"}/crypto-news?date=2024-01-01`);
  const archive = page.locator("section").filter({ has: page.getByRole("heading", { level: 1 }) });
  const date = archive.getByRole("combobox");
  const today = await date.locator("option").first().getAttribute("value");
  const items = Array.from({ length: 3 }, (_, index) => ({
    archiveId: `headline-qa-${index}`, sourceName: `QA Source ${index + 1}`,
    articleUrl: `https://www.coindesk.com/qa-fixture-${index}`, publishedAt: `${today}T08:00:00.000Z`,
    newsUrl: null, thumbnailUrl: null, thumbnailAlt: "", thumbnailAttributionRequired: false,
    sourceCoverage: "feed_summary", translationPending: false, translationStatus: "completed",
    publicSummaryAllowed: true, persianEditorialAllowed: true,
    taxonomy: { coinSymbols: [], topicTags: [], toolSlugs: [] },
    sourceTitle: "Synthetic news fixture",
    displayTitle: isFa ? `خبر آزمایشی ${index + 1}: بررسی گزارش بازار` : `Test story ${index + 1}: checking a market report`,
    displayLead: isFa ? "این متن آزمایشی برای بررسی رابط کاربری است." : "This synthetic text tests the interface only.",
    displayBody: "",
  }));
  await page.route("**/api/crypto-news?**", route => {
    if (new URL(route.request().url()).searchParams.get("date") !== today) return route.continue();
    return route.fulfill({ json: { day: today, today, archiveItems: items, availableDays: [today, "2024-01-01"] } });
  });
  await date.selectOption(today);
  const rail = archive.getByRole("navigation", { name: isFa ? "مرور تیترهای خبر" : "News headlines" });
  await expect(rail).toBeVisible();
  const track = rail.getByRole("list");
  const cards = rail.getByRole("button", { name: isFa ? /^خواندن خبر:/ : /^Read story:/ });
  await expect(cards).toHaveCount(3);
  await expect(archive.getByRole("article")).toHaveCount(3);
  const position = rail.getByRole("status");
  const label = index => isFa ? `تیتر ${new Intl.NumberFormat("fa-IR").format(index)} از ۳` : `Headline ${index} of 3`;
  async function contained(index) {
    const viewport = await track.boundingBox();
    const card = await cards.nth(index).boundingBox();
    expect(card.x).toBeGreaterThanOrEqual(viewport.x - 2);
    expect(card.x + card.width).toBeLessThanOrEqual(viewport.x + viewport.width + 2);
  }
  const previous = rail.getByRole("button", { name: isFa ? "تیتر قبلی" : "Previous headline" });
  const next = rail.getByRole("button", { name: isFa ? "تیتر بعدی" : "Next headline" });
  await expect(previous).toHaveAttribute("aria-disabled", "true");
  await next.focus();
  await next.press("Enter");
  await expect(next).toBeFocused();
  await expect(position).toHaveText(label(2));
  await contained(1);
  expect((await next.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await cards.nth(1).focus();
  await cards.nth(1).press(isFa ? "ArrowLeft" : "ArrowRight");
  await expect(cards.nth(2)).toBeFocused();
  await expect(position).toHaveText(label(3));
  await contained(2);
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await cards.nth(2).press("Home");
  await expect(cards.nth(0)).toBeFocused();
  await expect(position).toHaveText(label(1));
  await cards.nth(0).press("Tab");
  await expect(cards.nth(1)).toBeFocused();
  await expect(position).toHaveText(label(2));
  await contained(1);
  await cards.nth(1).press("Enter");
  const story = archive.getByRole("article").nth(1);
  const heading = story.getByRole("heading", { level: 2 });
  await expect(heading).toBeFocused();
  await expect(heading).toHaveText(items[1].displayTitle);
  const headingBounds = await heading.boundingBox();
  expect(headingBounds.y).toBeGreaterThanOrEqual(65);
  expect(headingBounds.y + headingBounds.height).toBeLessThanOrEqual(650);
  await story.getByRole("button", { name: isFa ? "بازگشت به تیترها" : "Back to headlines" }).click();
  await expect(cards.nth(1)).toBeFocused();
  await expect(position).toHaveText(label(2));
  await contained(1);
  await testInfo.attach("news-headlines-320", { body: await page.screenshot(), contentType: "image/png" });
  await cards.nth(1).press("Home");
  await track.hover();
  await page.mouse.wheel(isFa ? -450 : 450, 0);
  await expect.poll(async () => await position.textContent()).not.toBe(label(1));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await rail.evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" }));
  await next.focus();
  await cards.nth(0).focus();
  await cards.nth(0).press("End");
  await expect(cards.nth(2)).toBeFocused();
  await expect(position).toHaveText(label(3));
  await contained(2);
  await testInfo.attach("news-headlines-1280", { body: await page.screenshot(), contentType: "image/png" });
  expect(errors).toEqual([]);
});
