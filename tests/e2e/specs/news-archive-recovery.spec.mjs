import { expect, test } from "@playwright/test";

test("news archive preserves its date on failure and offers explicit recovery", async ({ page }, testInfo) => {
  const isFa = testInfo.project.metadata.locale === "fa";
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${isFa ? "" : "/en"}/crypto-news?date=2000-01-01&tag=bitcoin`);
  const archive = page.locator("section").filter({ has: page.getByRole("heading", { level: 1 }) });
  const heading = archive.getByRole("heading", { level: 1 });
  const originalHeading = await heading.textContent();
  const date = archive.getByRole("combobox");
  await expect(date).toHaveValue("2000-01-01");
  const today = await date.locator("option").first().getAttribute("value");
  const item = {
    archiveId: "news-archive-qa", sourceName: "QA News", articleUrl: "https://www.coindesk.com/qa-fixture",
    publishedAt: `${today}T08:00:00.000Z`, newsUrl: null, thumbnailUrl: null,
    thumbnailAlt: "", thumbnailAttributionRequired: false, sourceCoverage: "feed_summary",
    translationPending: false, translationStatus: "completed", publicSummaryAllowed: true,
    persianEditorialAllowed: true, taxonomy: { coinSymbols: ["BTC"], topicTags: [], toolSlugs: [] },
    sourceTitle: "Synthetic news fixture",
    displayTitle: isFa ? "چگونه خبر بازار را با منبع اصلی بررسی کنیم؟" : "How to check a market story against its original source",
    displayLead: isFa ? "این خبر آزمایشی فقط برای بررسی خوانایی و دسترسی رابط ساخته شده است." : "This synthetic story tests interface readability and access only.",
    displayBody: isFa ? "برای ارزیابی هر خبر، زمان انتشار و گزارش منبع را بررسی کنید." : "Check the publication time and the source report when evaluating a story.",
  };
  let attempt = 0;
  await page.route("**/api/crypto-news?**", async route => {
    if (new URL(route.request().url()).searchParams.get("date") !== today) return route.continue();
    attempt += 1;
    if (attempt === 1) return route.fulfill({ status: 503, json: { error: "unavailable" } });
    return route.fulfill({ json: { day: attempt === 2 ? "1999-12-31" : today, today, archiveItems: attempt === 2 ? [] : [item], availableDays: [today, "2000-01-01"] } });
  });
  const search = archive.getByRole("textbox", { name: isFa ? "جست‌وجوی اخبار این روز" : "Search this day’s news" });
  await search.fill("missing headline");
  await archive.getByRole("button", { name: isFa ? "پاک‌کردن جست‌وجو و فیلترها" : "Clear search and filters" }).click();
  await expect(search).toHaveValue("");
  expect(new URL(page.url()).searchParams.has("tag")).toBe(false);
  await date.selectOption(today);
  const alert = archive.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(date).toHaveValue("2000-01-01");
  await expect(heading).toHaveText(originalHeading);
  expect(new URL(page.url()).searchParams.get("date")).toBe("2000-01-01");
  const retry = alert.getByRole("button", { name: isFa ? "تلاش دوباره" : "Try again" });
  await retry.click();
  await expect.poll(() => attempt).toBe(2);
  await expect(date).toBeEnabled();
  await expect(date).toHaveValue("2000-01-01");
  await expect(alert).toBeVisible();
  await retry.focus();
  await expect(retry).toBeFocused();
  const bounds = await retry.boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  await testInfo.attach("news-archive-recovery-320", { body: await page.screenshot(), contentType: "image/png" });
  await retry.press("Enter");
  await expect(date).toHaveValue(today);
  await expect(alert).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("date")).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const story = archive.getByRole("article");
  await expect(story.getByRole("heading", { level: 2 })).toHaveText(item.displayTitle);
  const source = story.getByRole("link", { name: isFa ? "منبع اصلی خبر" : "Original source" });
  await expect(source).toHaveAttribute("href", item.articleUrl);
  expect((await source.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await story.locator("time").getAttribute("datetime")).toBe(item.publishedAt);
  expect(await story.locator("p").first().evaluate(node => getComputedStyle(node).fontWeight)).toBe("400");
  await testInfo.attach("news-archive-reading-320", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  expect(errors).toEqual([]);
});
