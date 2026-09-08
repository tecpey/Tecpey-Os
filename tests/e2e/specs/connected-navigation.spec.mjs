import { expect, test } from "@playwright/test";

test("shared mobile navigation keeps Home centered and follows the selected route", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.formFactor !== "mobile", "Mobile navigation is intentionally hidden on desktop.");
  const isEn = testInfo.project.metadata.locale === "en";
  const base = isEn ? "/en" : "";
  const nav = page.getByRole("navigation", { name: isEn ? "TecPey primary navigation" : "ناوبری اصلی تک‌پی", exact: true });

  await page.goto(`${base}/academy`, { waitUntil: "domcontentloaded" });
  await expect(nav).toBeVisible();
  await expect(nav.locator("a")).toHaveCount(5);
  await expect(nav.locator("a").nth(2)).toHaveAttribute("href", base || "/");
  await expect(nav.locator('a[aria-current="page"]')).toHaveText(isEn ? "Academy" : "آکادمی");

  await nav.getByRole("link", { name: isEn ? "Account" : "حساب", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/academy/account$`));
  await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(nav.locator('a[aria-current="page"]')).toHaveText(isEn ? "Account" : "حساب");

  await nav.getByRole("link", { name: isEn ? "Home" : "خانه", exact: true }).click();
  await expect(nav.locator('a[aria-current="page"]')).toHaveText(isEn ? "Home" : "خانه");
  const [bar, home] = await Promise.all([nav.boundingBox(), nav.locator("a").nth(2).boundingBox()]);
  expect(Math.abs((home.x + home.width / 2) - (bar.x + bar.width / 2))).toBeLessThan(2);

  if (isEn) {
    const cta = page.locator(".sticky-cta-bar");
    await expect(cta).toBeVisible();
    const bounds = await cta.boundingBox();
    expect(bounds.y + bounds.height, "Landing actions must sit above the shared navigation").toBeLessThanOrEqual(bar.y);
    for (const link of await cta.getByRole("link").all()) {
      const target = await link.boundingBox();
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
  }
});
