import { expect, test, type Locator, type Page } from "@playwright/test";

async function mockPublicState(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/academy-auth") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false }),
      });
      return;
    }
    if (path === "/api/academy-student-profile") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false, profile: null }),
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
    await page
      .getByRole("button", { name: /باز کردن منو|Open menu/ })
      .click();
    const knowledge = page.getByRole("button", { name: label, exact: true });
    const mobileMenuId = await knowledge.getAttribute("aria-controls");
    expect(mobileMenuId).toBeTruthy();
    await knowledge.click();
    const mobileMenu = page.locator(`#${mobileMenuId!}`);
    await expect(mobileMenu).toBeVisible();
    await expect(
      mobileMenu.getByRole("link", { name: arenaLabel, exact: true }),
    ).toBeVisible();
    return;
  }

  const knowledge = page.getByRole("button", { name: label, exact: true });
  await knowledge.click();
  const menu = page.getByRole("menu", { name: label });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: arenaLabel, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(knowledge).toBeFocused();
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

  const mentor = page.getByRole("button", {
    name: "از مربی آموزشی تک‌پی بپرس",
  });
  await expect(mentor).toBeVisible();
  await mentor.click();
  await expect(
    page.getByRole("heading", {
      name: "منتور بعد از ساخت پروفایل آکادمی فعال می‌شود",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "ساخت پروفایل آکادمی" }),
  ).toHaveAttribute("href", "/academy/onboarding");

  const footer = page.locator("footer");
  await expect(footer).toBeVisible();
  await expectReachable(academy);
  await expectNoHorizontalOverflow(page);
});

test("English public journey preserves LTR navigation and locked mentor truth", async ({
  page,
}) => {
  await page.goto("/en", { waitUntil: "load" });
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page.getByText(/24\/7|۲۴\/۷|۲۴ ساعته/)).toHaveCount(0);
  await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
  await expectCanonicalAuthLinks(page);
  await openKnowledgeCenter(page, "Knowledge Center", "Trading Arena");

  const mentor = page.getByRole("button", {
    name: "Ask TecPey learning mentor",
  });
  await expect(mentor).toBeVisible();
  await mentor.click();
  await expect(
    page.getByRole("heading", {
      name: "Mentor activates after academy profile",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create academy profile" }),
  ).toHaveAttribute("href", "/en/academy/onboarding");
  await expect(page.locator("footer")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Theme choice changes the rendered authority and survives reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/", { waitUntil: "load" });
  await page.evaluate(() => window.localStorage.setItem("theme", "light"));
  await page.reload({ waitUntil: "load" });

  const toggle = page
    .getByRole("button", { name: /تغییر به حالت/ })
    .first();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("theme")))
    .toBe("dark");

  await page.reload({ waitUntil: "load" });
  const persisted = page
    .getByRole("button", { name: /تغییر به حالت/ })
    .first();
  await expect(persisted).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("theme")))
    .toBe("dark");
});
