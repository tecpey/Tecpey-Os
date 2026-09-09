import { expect, test } from "@playwright/test";

// Uses the existing isolated CI runtime and report uploader, not staging data.
// Each attached image is evidence for one route/theme/viewport, not approval.
for (const screen of ["landing", "login", "signup"]) {
  test(`entry review captures ${screen} in both themes`, async ({ context, page }, testInfo) => {
    const en = testInfo.project.metadata.locale === "en";
    const prefix = en ? "/en" : "";
    const path = screen === "landing" ? prefix || "/" : `${prefix}/academy/${screen}`;
    await context.route("**/api/academy-auth", route => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ authenticated: false }),
    }));
    await context.route("**/api/academy-student-profile", route => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ authenticated: false, profile: null }),
    }));
    await context.route("**/api/crypto-news**", route => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ mode: "fallback", items: [] }),
    }));
    await context.route("**/api/v1/user/currency/list**", route => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ data: [], meta: { current_page: 1, last_page: 1 } }),
    }));
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("main h1")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
    for (const theme of ["light", "dark"]) {
      const dark = await page.locator("html").evaluate(el => el.classList.contains("dark"));
      if (dark !== (theme === "dark")) {
        const name = en
          ? (theme === "dark" ? "Switch to dark mode" : "Switch to light mode")
          : (theme === "dark" ? "تغییر به حالت تیره" : "تغییر به حالت روشن");
        await page.getByRole("button", { name, exact: true }).click();
      }
      await expect.poll(() => page.locator("html").evaluate(el => el.classList.contains("dark"))).toBe(theme === "dark");
      const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(widths[0]).toBeLessThanOrEqual(widths[1] + 1);
      await page.evaluate(() => document.fonts.ready);
      await testInfo.attach(`${screen}-${theme}-${testInfo.project.name}`, {
        body: await page.screenshot({ fullPage: screen !== "landing", animations: "disabled" }),
        contentType: "image/png",
      });
    }
  });
}
