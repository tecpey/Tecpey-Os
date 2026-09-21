import { expect, test } from "@playwright/test";

async function waitForStablePaint(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function keepBelowStickyNav(page, section) {
  await section.scrollIntoViewIfNeeded();
  await section.evaluate((element) => {
    const nav = document.querySelector("nav");
    const navHeight = nav?.getBoundingClientRect().height ?? 0;
    const targetTop =
      element.getBoundingClientRect().top + window.scrollY - navHeight - 24;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" });
  });
  await waitForStablePaint(page);

  const [sectionBox, navBox] = await Promise.all([
    section.boundingBox(),
    page.locator("nav.sticky.top-0").first().boundingBox(),
  ]);
  expect(sectionBox, "review section must have a rendered box").not.toBeNull();
  expect(navBox, "sticky navigation must have a rendered box").not.toBeNull();
  if (sectionBox && navBox) {
    expect(
      sectionBox.y,
      "review section must remain visibly clear of the sticky navigation",
    ).toBeGreaterThanOrEqual(navBox.y + navBox.height + 8);
  }
}

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
    await context.route("**/api/crypto-news**", route => {
      const locale = new URL(route.request().url()).searchParams.get("locale") === "fa" ? "fa" : "en";
      const isFa = locale === "fa";
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          mode: "live",
          updatedAt: "2026-09-20T12:05:00.000Z",
          items: [
            {
              id: "preview-older",
              title: isFa ? "خبر دوم برای پیش‌نمایش" : "Second preview story",
              summary: isFa ? "خبر قدیمی‌تر برای نمایش ادامهٔ افقی carousel." : "An older story that proves the carousel continues horizontally.",
              source: "TecPey Fixture",
              url: isFa ? "/crypto-news" : "/en/crypto-news",
              publishedAt: "2026-09-20T10:00:00.000Z",
              category: isFa ? "ریسک" : "Risk",
              tone: "neutral",
              impact: 5,
              relatedLesson: isFa ? "مدیریت ریسک" : "Risk management",
              thumbnailUrl: "/images/tecpey/covers/risk-management-in-crypto.jpg",
              thumbnailAlt: isFa ? "تصویر خبر دوم" : "Second story thumbnail",
            },
            {
              id: "preview-latest",
              title: isFa ? "تازه‌ترین خبر برای پیش‌نمایش" : "Latest preview story",
              summary: isFa ? "کارت اول با تصویر اختصاصی و زمینهٔ آموزشی." : "The first card carries governed media and learning context.",
              source: "TecPey Fixture",
              url: isFa ? "/crypto-news" : "/en/crypto-news",
              publishedAt: "2026-09-20T12:00:00.000Z",
              category: isFa ? "بیت‌کوین" : "Bitcoin",
              tone: "neutral",
              impact: 7,
              relatedLesson: isFa ? "فاندامنتال و خبر" : "Fundamentals and news",
              thumbnailUrl: "/images/tecpey/covers/what-is-bitcoin.jpg",
              thumbnailAlt: isFa ? "تصویر تازه‌ترین خبر" : "Latest story thumbnail",
            },
          ],
        }),
      });
    });
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
      await waitForStablePaint(page);
      if (screen === "landing") {
        const hero = page.locator('main [data-home-section="hero"]');
        await expect(hero).toBeVisible();
        await expect(hero.locator("figure")).toBeVisible();
        await expect(hero.locator('img[src*="academy-auth-crystal"]')).toHaveCount(0);
        await expect(
          hero.getByRole("link", {
            name: en ? "Start Free Academy" : "شروع آکادمی رایگان",
            exact: false,
          }),
        ).toBeVisible();
        await expect(
          hero.getByRole("link", {
            name: en ? "Talk to AI Mentor" : "گفتگو با منتور هوشمند",
            exact: true,
          }),
        ).toBeVisible();
        await expect(hero).toContainText(en ? "Your learning path today" : "مسیر امروز تو");
        await expect(hero).toContainText(en ? "Academy" : "آکادمی");
        await waitForStablePaint(page);
      } else {
        const artwork = page.locator('main img[src*="academy-auth-crystal"]');
        await artwork.scrollIntoViewIfNeeded();
        await expect.poll(() => artwork.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
        const resolution = await artwork.evaluate(img => ({
          selectedWidth: Number(new URL(img.currentSrc).searchParams.get("w")) || img.naturalWidth,
          renderedWidth: img.getBoundingClientRect().width,
        }));
        expect(resolution.selectedWidth, "Artwork must not upscale a tiny mobile source").toBeGreaterThanOrEqual(resolution.renderedWidth);
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
      await waitForStablePaint(page);
      if (screen === "landing") {
        const hero = page.locator('main [data-home-section="hero"]');
        const preview = hero.locator("figure");
        await expect(hero).toBeVisible();
        await expect(
          hero.getByRole("link", {
            name: en ? "Talk to AI Mentor" : "گفتگو با منتور هوشمند",
            exact: true,
          }),
        ).toBeVisible();
        for (const label of en
          ? ["Academy", "AI Mentor", "Trading Arena", "Market intelligence"]
          : ["آکادمی", "منتور هوشمند", "تریدینگ آرنا", "هوش بازار"]) {
          await expect(preview).toContainText(label);
        }
        const heroBox = await hero.boundingBox();
        expect(heroBox, "landing hero must have a rendered viewport box").not.toBeNull();
        if (heroBox) {
          expect(heroBox.y, "landing hero must be positioned in the captured viewport").toBeGreaterThanOrEqual(0);
          expect(heroBox.y, "landing hero must start near the top of the captured viewport").toBeLessThan(160);
        }
        await waitForStablePaint(page);
      }
      await testInfo.attach(`${screen}-${theme}-${testInfo.project.name}`, {
        body: screen === "landing"
          ? await page.screenshot()
          : await page.screenshot({ fullPage: true, animations: "disabled" }),
        contentType: "image/png",
      });
      if (screen === "landing") {
        const news = page.locator('[data-home-section="news-carousel"]');
        await keepBelowStickyNav(page, news);
        await expect(news).toBeVisible();
        await expect(news.locator('[aria-roledescription="slide"]').first().locator("img")).toBeVisible();
        await testInfo.attach(`landing-news-${theme}-${testInfo.project.name}`, {
          body: await page.screenshot(),
          contentType: "image/png",
        });
      }
      if (screen !== "landing") {
        const field = page.locator('main form input:not([type="hidden"])').first();
        await field.scrollIntoViewIfNeeded();
        await field.click({ trial: true });
        await testInfo.attach(`${screen}-${theme}-form-viewport-${testInfo.project.name}`, {
          body: await page.screenshot({ animations: "disabled" }),
          contentType: "image/png",
        });
      }
    }
  });
}
