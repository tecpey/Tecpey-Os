import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";

async function installLocalUiSession(context) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3100";
  if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname)) {
    throw new Error("Synthetic UI sessions are restricted to the local test server");
  }
  const secret = process.env.TECPEY_SESSION_SECRET || "e2e-session-secret-distinct-32-characters";
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    role: "unified", v: 1, sub: "55555555-5555-4555-8555-555555555555",
    accountId: "academy:learner.e2e@tecpey.test", studentId: "55555555-5555-4555-8555-555555555555",
    email: "learner.e2e@tecpey.test", displayName: "UI Test Learner", username: "e2e-learner", iat: now, exp: now + 3600,
  })}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  await context.addCookies([{ name: "tecpey_session", value: `${unsigned}.${signature}`, url: origin, httpOnly: true, sameSite: "Lax" }]);
}

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
  // Guests must retain the private destination through the real login gate.
  await expect(page).toHaveURL(new RegExp(`${base}/academy/login\\?`));
  expect(new URL(page.url()).searchParams.get("redirect")).toBe(`${base}/academy/account`);
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
  await installLocalUiSession(page.context());
  await page.goto(`${base}/academy/account`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`${base}/academy/account$`));
  await expect(nav.locator('a[aria-current="page"]')).toHaveText(isEn ? "Account" : "حساب");
});

test("Mentor starts a clean conversation and reopens saved history", async ({ page }, testInfo) => {
  const isEn = testInfo.project.metadata.locale === "en";
  const locale = isEn ? "en" : "fa";
  await installLocalUiSession(page.context());
  const thread = { id: "saved-lesson-thread", title: "A saved lesson", locale, status: "active", lastMessageAt: "2026-09-08T07:00:00Z", createdAt: "2026-09-08T07:00:00Z", updatedAt: "2026-09-08T07:00:00Z" };
  // Deterministic UI fixture only; authenticated persistence is verified separately.
  await page.route("**/api/mentor-threads", route => route.fulfill({ json: { ok: true, threads: [thread] } }));
  await page.route("**/api/mentor-conversations?*", route => {
    expect(new URL(route.request().url()).searchParams.get("threadId")).toBe(thread.id);
    return route.fulfill({ json: { ok: true, conversations: [{ id: "saved-message", role: "assistant", content: "Saved lesson explanation", createdAt: thread.createdAt }] } });
  });
  await page.goto(`${isEn ? "/en" : ""}/academy/ai-guide`, { waitUntil: "domcontentloaded" });
  const log = page.getByRole("log");
  await expect(log).toContainText("Saved lesson explanation");
  await page.getByRole("button", { name: isEn ? "New conversation" : "گفت‌وگوی جدید", exact: true }).first().click();
  await expect(log).not.toContainText("Saved lesson explanation");
  await expect(log.getByRole("heading")).toHaveText(isEn ? "What would you like to explore?" : "امروز چه چیزی را با هم یاد بگیریم؟");
  await expect(page.getByRole("link", { name: "Pro", exact: true })).toHaveAttribute("href", `${isEn ? "/en" : ""}/academy/account#pro`);
  if (testInfo.project.metadata.formFactor === "mobile") {
    await page.getByRole("button", { name: isEn ? "Conversation history" : "گفت‌وگوهای قبلی", exact: true }).click();
  }
  await page.getByRole("button", { name: /A saved lesson/ }).click();
  await expect(log).toContainText("Saved lesson explanation");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(log).toContainText("Saved lesson explanation");
});
