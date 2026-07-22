import { expect, test, type Page } from "@playwright/test";

async function mockProfileReadyState(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/academy-auth") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: true }),
      });
      return;
    }
    if (path === "/api/academy-student-profile") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          profile: { display_name: "Browser QA learner" },
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

test("Profile-ready learner receives only the personalized Mentor launcher", async ({
  page,
}) => {
  await mockProfileReadyState(page);
  await page.goto("/", { waitUntil: "load" });

  await expect(
    page.getByRole("button", {
      name: "آشنایی با منتور هوشمند آموزشی تک‌پی",
    }),
  ).toHaveCount(0);

  const personalizedMentor = page.getByRole("button", {
    name: "از مربی آموزشی تک‌پی بپرس",
  });
  await expect(personalizedMentor).toHaveCount(1);
  await personalizedMentor.click();
  await expect(page.getByText("Browser QA learner", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "آشنایی با منتور هوشمند آموزشی تک‌پی" }),
  ).toHaveCount(0);
});
