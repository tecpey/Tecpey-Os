import { expect, test, type Locator, type Page } from "@playwright/test";

type ProfileMode = "absent" | "ready" | "unavailable";

async function mockPublicState(page: Page, profileMode: ProfileMode = "absent") {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/academy-auth") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: profileMode === "ready" }),
      });
      return;
    }
    if (path === "/api/academy-student-profile") {
      if (profileMode === "unavailable") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: "academy_profile_service_unavailable" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: profileMode === "ready",
          profile:
            profileMode === "ready"
              ? { display_name: "Browser QA learner" }
              : null,
        }),
      });
      return;
    }
    if (path.startsWith("/api/mentor-conversations")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, conversations: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

async function expectCanonicalAuthLinks(page: Page) {
  const hrefs = await page.locator("nav a").evaluateAll((links) =>
    links
      .map((link) => link.getAttribute("href"))
      .filter((href): href is string => Boolean(href)),
  );
  expect(hrefs).toContain("https://my.tecpey.ir/signin");
  expect(hrefs).toContain("https://my.tecpey.ir/signup");
  expect(hrefs.some((href) => href.includes("tecpey.irhttps://"))).toBe(false);
}

async function expectReachable(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        const x = Math.min(
          window.innerWidth - 1,
          Math.max(0, rect.left + rect.width / 2),
        );
        const y = Math.min(
          window.innerHeight - 1,
          Math.max(0, rect.top + rect.height / 2),
        );
        const top = document.elementFromPoint(x, y);
        return top === element || Boolean(top && element.contains(top));
      }),
    )
    .toBe(true);
}

async function openKnowledgeCenter(
  page: Page,
  label: string,
  arenaLabel: string,
) {
  const mobile = (page.viewportSize()?.width ?? 1440) < 1024;
  if (mobile) {
    const menuButton = page.getByRole("button", {
      name: /باز کردن منو|Open menu/,
    });
    await menuButton.focus();
    await page.keyboard.press("Enter");
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");

    const knowledge = page.getByRole("button", { name: label, exact: true });
    await knowledge.focus();
    await page.keyboard.press("Enter");
    const mobileMenuId = await knowledge.getAttribute("aria-controls");
    expect(mobileMenuId).toBeTruthy();
    const mobileMenu = page.locator(`#${mobileMenuId!}`);
    await expect(mobileMenu).toBeVisible();
    await expect(
      mobileMenu.getByRole("link", { name: arenaLabel, exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(mobileMenu).toBeHidden();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    return;
  }

  const knowledge = page.getByRole("button", { name: label, exact: true });
  await knowledge.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: label });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: arenaLabel, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(knowledge).toBeFocused();
}

async function expectProtectedArenaRedirects(page: Page) {
  const fa = await page.request.get("/academy/trading-arena", {
    maxRedirects: 0,
  });
  expect(fa.status()).toBe(307);
  expect(fa.headers().location).toContain("/academy/login");

  const en = await page.request.get("/en/academy/trading-arena", {
    maxRedirects: 0,
  });
  expect(en.status()).toBe(307);
  expect(en.headers().location).toContain("/en/academy/login");
}

test.beforeEach(async ({ page }) => {
  await mockPublicState(page);
});

test("Persian public journey is truthful, navigable and unobscured", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/", { waitUntil: "load" });

  await expect(page).toHaveTitle(/آموزش رمزارز/);
  await expect(page).not.toHaveTitle(/صرافی رمزارز امن/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", {
      name: "تک‌پی، نقطه امن ورود به بازار رمزارز",
      level: 1,
    }),
  ).toBeVisible();
  const exchange = page.getByRole("link", {
    name: "ورود به صرافی",
    exact: true,
  });
  const academy = page.getByRole("link", {
    name: "آکادمی رایگان",
    exact: true,
  });
  await expect(exchange).toHaveAttribute("href", "https://my.tecpey.ir");
  await expect(academy).toHaveAttribute("href", "/academy");
  await expect(page.getByText(/24\/7|۲۴\/۷|۲۴ ساعته/)).toHaveCount(0);
  await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/اولین معامله واقعی/)).toHaveCount(0);
  await expectCanonicalAuthLinks(page);

  await openKnowledgeCenter(page, "مرکز دانش", "تریدینگ آرنا");

  const publicMentor = page.getByRole("button", {
    name: "آشنایی با منتور هوشمند آموزشی تک‌پی",
  });
  await expect(publicMentor).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "از مربی آموزشی تک‌پی بپرس" }),
  ).toHaveCount(0);
  await publicMentor.click();
  await expect(
    page.getByRole("heading", { name: "منتور هوشمند آموزشی تک‌پی" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "ساخت پروفایل آکادمی" }),
  ).toHaveAttribute("href", "/academy/signup");
  await page.getByRole("button", { name: "بستن" }).click();

  const footerLegal = page.getByText(/نشانی رسمی: tecpey\.ir/);
  await expect(page.locator("footer")).toBeVisible();
  await expectReachable(exchange);
  await expectReachable(academy);
  await expectReachable(footerLegal);
  await expectNoHorizontalOverflow(page);
  await expectProtectedArenaRedirects(page);
});

test("English public journey preserves LTR navigation and single locked mentor truth", async ({
  page,
}) => {
  await page.goto("/en", { waitUntil: "load" });
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page.getByText(/24\/7|۲۴\/۷|۲۴ ساعته/)).toHaveCount(0);
  await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Market access activation")).toBeVisible();
  await expectCanonicalAuthLinks(page);
  await openKnowledgeCenter(page, "Knowledge Center", "Trading Arena");

  const publicMentor = page.getByRole("button", {
    name: "Discover TecPey AI learning mentor",
  });
  await expect(publicMentor).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Ask TecPey learning mentor" }),
  ).toHaveCount(0);
  await publicMentor.click();
  await expect(
    page.getByRole("heading", { name: "TecPey AI Learning Mentor" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create Academy profile" }),
  ).toHaveAttribute("href", "/en/academy/signup");
  await page.getByRole("button", { name: "Close" }).click();

  const footerLegal = page.getByText(/Official site: tecpey\.ir/);
  await expect(page.locator("footer")).toBeVisible();
  await expectReachable(footerLegal);
  await expectNoHorizontalOverflow(page);
});

test("Profile service outage fails closed without a misleading mentor launcher", async ({
  page,
}) => {
  await page.unroute("**/api/**");
  await mockPublicState(page, "unavailable");
  await page.goto("/", { waitUntil: "load" });
  await expect(
    page.getByRole("button", {
      name: "آشنایی با منتور هوشمند آموزشی تک‌پی",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "از مربی آموزشی تک‌پی بپرس" }),
  ).toHaveCount(0);
});

test("Theme choice changes the rendered authority and survives reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/", { waitUntil: "load" });
  await page.evaluate(() => window.localStorage.setItem("theme", "light"));
  await page.reload({ waitUntil: "load" });

  const toggle = page.locator('button[aria-label*="تغییر به حالت"]:visible');
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("theme")))
    .toBe("dark");

  await page.reload({ waitUntil: "load" });
  const persisted = page.locator('button[aria-label*="تغییر به حالت"]:visible');
  await expect(persisted).toHaveCount(1);
  await expect(persisted).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("theme")))
    .toBe("dark");
});
