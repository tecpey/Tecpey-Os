import { expect, test, type Locator, type Page } from "@playwright/test";

async function mockPublicState(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/academy-auth") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: false }) });
      return;
    }
    if (path === "/api/academy-student-profile") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: false, profile: null }) });
      return;
    }
    if (path.startsWith("/api/mentor-conversations")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, conversations: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function expectReachable(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const top = document.elementFromPoint(x, y);
    return top === element || Boolean(top && element.contains(top));
  })).toBe(true);
}

async function openKnowledgeCenter(page: Page, label: string, arenaLabel: string) {
  const mobile = (page.viewportSize()?.width ?? 1440) < 1024;
  if (mobile) {
    await page.getByRole("button", { name: /باز کردن منو|Open menu/ }).click();
    const knowledge = page.locator("button:visible").filter({ hasText: label }).last();
    await knowledge.click();
    await expect(page.getByRole("link", { name: arenaLabel, exact: true })).toBeVisible();
    return;
  }

  const knowledge = page.getByRole("button", { name: label, exact: true });
  await knowledge.click();
  const menu = page.getByRole("menu", { name: label });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: arenaLabel, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(knowledge).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await mockPublicState(page);
});

test("Persian public journey is truthful, navigable and unobscured", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "IntersectionObserver", { configurable: true, value: undefined });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "تک‌پی، نقطه امن ورود به بازار رمزارز" })).toBeVisible();
  const exchange = page.getByRole("link", { name: "ورود به صرافی", exact: true });
  const academy = page.getByRole("link", { name: "آکادمی رایگان", exact: true });
  await expect(exchange).toHaveAttribute("href", "https://my.tecpey.ir");
  await expect(academy).toHaveAttribute("href", "/academy");
  await expect(page.getByText("۲۴/۷", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/اولین معامله واقعی/)).toHaveCount(0);

  await openKnowledgeCenter(page, "مرکز دانش", "تریدینگ آرنا");

  const mentor = page.getByRole("button", { name: "از مربی آموزشی تک‌پی بپرس" });
  await expect(mentor).toBeVisible();
  await mentor.click();
  await expect(page.getByRole("heading", { name: "منتور بعد از ساخت پروفایل آکادمی فعال می‌شود" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ساخت پروفایل آکادمی" })).toHaveAttribute("href", "/academy/onboarding");

  const footer = page.locator("footer");
  await expect(footer).toBeVisible();
  await expectReachable(academy);
  await expectNoHorizontalOverflow(page);
});

test("English public journey preserves LTR navigation and locked mentor truth", async ({ page }) => {
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await openKnowledgeCenter(page, "Knowledge Center", "Trading Arena");

  const mentor = page.getByRole("button", { name: "Ask TecPey learning mentor" });
  await expect(mentor).toBeVisible();
  await mentor.click();
  await expect(page.getByRole("heading", { name: "Mentor activates after academy profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create academy profile" })).toHaveAttribute("href", "/en/academy/onboarding");
  await expect(page.locator("footer")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Theme choice changes the rendered authority and survives reload", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("theme", "light"));
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const toggle = page.locator('button[aria-label*="تغییر به حالت"]:visible').first();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("theme"))).toBe("dark");

  await page.reload({ waitUntil: "domcontentloaded" });
  const persisted = page.locator('button[aria-label*="تغییر به حالت"]:visible').first();
  await expect(persisted).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveClass(/dark/);
});
