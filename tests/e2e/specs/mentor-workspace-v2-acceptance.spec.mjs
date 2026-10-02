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
    role: "unified",
    v: 1,
    sub: "55555555-5555-4555-8555-555555555555",
    accountId: "academy:mentor.acceptance@tecpey.test",
    studentId: "55555555-5555-4555-8555-555555555555",
    email: "mentor.acceptance@tecpey.test",
    displayName: "Mentor Acceptance Learner",
    username: "mentor-acceptance",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  await context.addCookies([{
    name: "tecpey_session",
    value: `${unsigned}.${signature}`,
    url: origin,
    httpOnly: true,
    sameSite: "Lax",
  }]);
}

test.describe("Mentor Workspace v2 compact acceptance", () => {
  test.use({ serviceWorkers: "block" });

  test("320px keeps conversation usable, modal focus safe and starters draft-only", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.metadata.mentorWorkspaceCompact, "Dedicated 320px acceptance projects only.");

    const isEn = testInfo.project.metadata.locale === "en";
    const base = isEn ? "/en" : "";
    const labels = isEn
      ? {
          history: "Conversation history",
          office: "Mentor office",
          hideOffice: "Collapse mentor office",
          newConversation: "New conversation",
          starter: "Make it make sense",
          textarea: "Your message to the mentor",
          privacy: "Privacy",
          support: "Support",
        }
      : {
          history: "گفت‌وگوهای قبلی",
          office: "دفتر منتور",
          hideOffice: "جمع‌کردن دفتر منتور",
          newConversation: "گفت‌وگوی جدید",
          starter: "ساده‌تر یاد بگیر",
          textarea: "پیام شما به منتور",
          privacy: "حریم خصوصی",
          support: "پشتیبانی",
        };

    await installLocalUiSession(page.context());
    await page.route("**/api/mentor-threads", route => route.fulfill({ json: { ok: true, threads: [] } }));
    await page.goto(`${base}/academy/ai-guide`, { waitUntil: "domcontentloaded" });

    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      root: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.viewport).toBe(320);
    expect(dimensions.root).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);

    const officeToggle = page.getByRole("button", { name: labels.office, exact: true });
    await expect(officeToggle).toBeVisible();
    await expect(officeToggle).toHaveAttribute("aria-expanded", "false");
    await officeToggle.click();
    await expect(page.locator("#mentor-office")).toBeVisible();
    await expect(page.getByRole("button", { name: labels.hideOffice, exact: true })).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: labels.hideOffice, exact: true }).click();
    await expect(officeToggle).toHaveAttribute("aria-expanded", "false");

    const historyTrigger = page.getByRole("button", { name: labels.history, exact: true });
    await historyTrigger.click();
    const dialog = page.getByRole("dialog", { name: labels.history });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(historyTrigger).toBeFocused();

    const log = page.getByRole("log");
    const beforeDraft = await log.innerText();
    await page.getByRole("button", { name: new RegExp(labels.starter) }).click();
    const textarea = page.getByRole("textbox", { name: labels.textarea });
    await expect(textarea).toBeFocused();
    await expect(textarea).not.toHaveValue("");
    await expect(log).toHaveText(beforeDraft);

    await expect(page.getByRole("link", { name: labels.privacy, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: labels.support, exact: true })).toBeVisible();

    const newConversation = page.getByRole("button", { name: labels.newConversation, exact: true });
    await expect(newConversation.first()).toBeVisible();
  });
});
