import { expect, test } from "@playwright/test";

test("market prices expire on an open page and recover through keyboard refresh", async ({ page }, testInfo) => {
  const isFa = testInfo.project.metadata.locale === "fa";
  const now = Date.now();
  let timestamp = now;
  let unavailable = false;
  let price = 64000;
  let provider = "CoinGecko";
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: now });
  await page.route("**/api/v1/user/currency/list?**", route => route.fulfill({ status: 503, json: { error: "fixture_primary_unavailable" } }));
  await page.route("**/api/markets?**", route => {
    if (new URL(route.request().url()).searchParams.get("source") !== "public") return route.continue();
    if (unavailable) return route.fulfill({ status: 503, json: { error: "fixture_refresh_unavailable" } });
    const upstreamUpdatedAt = new Date(timestamp).toISOString();
    return route.fulfill({ json: {
      data: [{ id: "bitcoin", symbol: "BTC", name: "Bitcoin", rank: 1, marketDataSource: provider, marketDataUpdatedAt: upstreamUpdatedAt,
        priceData: { symbol: "BTC", last: price, changePercent: 2.5, volume: 123, rank: 1, timestamp: upstreamUpdatedAt } }],
      meta: { current_page: 1, last_page: 1, total: 1 },
      provenance: { provider, upstreamSource: provider, currency: provider === "CoinGecko" ? "USD" : "USDT", upstreamUpdatedAt, fetchedAt: upstreamUpdatedAt, fallback: true },
    } });
  });
  await page.goto(`${isFa ? "" : "/en"}/markets`);
  const asset = page.locator('[data-market-asset="BTC"]');
  const status = page.getByRole("region", { name: isFa ? "وضعیت قیمت‌های بازار" : "Market price status" });
  await expect(asset).toHaveCount(1);
  await expect(asset).toHaveAttribute("href", isFa ? "/crypto/btc" : "/en/coins/bitcoin");
  await expect(asset).toHaveAttribute("data-price-current", "true");
  await expect(asset).toContainText(isFa ? "64000.00" : "64,000");
  await expect(asset).toContainText(isFa ? "USD" : "$64,000");
  await expect(asset.getByText(isFa ? "قیمت" : "Price", { exact: true })).toBeVisible();
  await expect(asset.getByText(isFa ? "تغییر" : "Change", { exact: true })).toBeVisible();
  await expect(asset.getByText(isFa ? "حجم" : "Volume", { exact: true })).toBeVisible();
  await expect(asset.locator("a")).toHaveCount(0);
  expect(await asset.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await asset.focus();
  await expect(asset).toBeFocused();
  await asset.evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
  expect(await asset.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const point = document.elementFromPoint(rect.x + rect.width / 2, rect.y + Math.min(rect.height / 2, 44));
    return Boolean(point && (point === node || node.contains(point)));
  })).toBe(true);

  unavailable = true;
  await page.clock.fastForward(301000);
  await expect(asset).toHaveAttribute("data-price-current", "false");
  await expect(asset).not.toContainText(isFa ? "64000.00" : "64,000");
  await expect(asset).not.toContainText("2.50%");
  await expect(asset).toContainText("BTC");
  await expect(status.getByRole("status")).toContainText(isFa ? "دریافت قیمت‌ها انجام نشد" : "Prices could not be retrieved");
  // Native viewport containment alone ignores the fixed mobile navigation.
  // Center the evidence region, then keep the strict interior hit-test.
  await status.evaluate(panel => panel.scrollIntoView({ block: "center", behavior: "instant" }));
  await testInfo.attach("market-expired-320", { body: await page.screenshot(), contentType: "image/png" });
  const refresh = status.getByRole("button", { name: isFa ? "تازه‌سازی قیمت‌ها" : "Refresh prices", exact: true });
  expect((await refresh.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await refresh.evaluate(button => {
    const rect = button.getBoundingClientRect();
    return [[8, 8], [rect.width - 8, 8], [8, rect.height - 8], [rect.width - 8, rect.height - 8], [rect.width / 2, rect.height / 2]]
      .every(([x, y]) => button.contains(document.elementFromPoint(rect.x + x, rect.y + y)));
  })).toBe(true);
  unavailable = false;
  timestamp = await page.evaluate(() => Date.now());
  price = 65000;
  await refresh.focus();
  await refresh.press("Enter");
  await expect(asset).toHaveAttribute("data-price-current", "true");
  await expect(asset).toContainText(isFa ? "65000.00" : "65,000");
  await expect(refresh).toBeFocused();
  await expect(status).toContainText(isFa ? "قیمت‌ها در بازهٔ اعتبار منبع‌اند" : "Prices are within the source validity window");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Resume after a paused/background clock: the focus event checks age immediately.
  unavailable = true;
  await page.clock.setSystemTime(timestamp + 301000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(asset).toHaveAttribute("data-price-current", "false");
  // TanStack v5 resumes queries through visibilitychange; the clock also
  // independently responds to window focus. Exercise both contracts.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange", { bubbles: true })));
  await expect(status.getByRole("status")).toContainText(isFa ? "دریافت قیمت‌ها انجام نشد" : "Prices could not be retrieved");
  timestamp = await page.evaluate(() => Date.now());
  unavailable = false;
  provider = "Bitycle";
  await expect(refresh).toHaveAttribute("aria-disabled", "false");
  await refresh.press("Enter");
  await expect(asset).toHaveAttribute("data-price-current", "true");
  await expect(asset).toContainText("USDT");
  await expect(asset).not.toContainText("$65,000");
  await page.setViewportSize({ width: 1280, height: 900 });
  // Native viewport containment alone ignores the fixed mobile navigation.
  // Center the evidence region, then keep the strict interior hit-test.
  await status.evaluate(panel => panel.scrollIntoView({ block: "center", behavior: "instant" }));
  await refresh.focus();
  await testInfo.attach("market-restored-1280", { body: await page.screenshot(), contentType: "image/png" });
  expect(errors).toEqual([]);
});
