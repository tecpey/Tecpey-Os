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

  test("320px keeps conversation, history and Mini Arena interactions recoverable with reduced motion", async ({ page }, testInfo) => {
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
          arenaOpen: "Open a Trading Arena practice challenge",
          arenaTitle: "Trading Arena",
          minimize: "Minimize Arena",
          restore: "Restore Arena",
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
          arenaOpen: "بازکردن چالش تمرینی Arena",
          arenaTitle: "آرنای معاملاتی",
          minimize: "کوچک‌کردن Arena",
          restore: "بازگرداندن Arena",
        };

    await installLocalUiSession(page.context());
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
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
    const historyDialog = page.getByRole("dialog", { name: labels.history });
    await expect(historyDialog).toBeVisible();
    expect(await historyDialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(historyDialog).toBeHidden();
    await expect(historyTrigger).toBeFocused();

    const arenaTrigger = page.getByRole("button", { name: labels.arenaOpen, exact: true });
    await expect(arenaTrigger).toHaveAttribute("aria-expanded", "false");
    await arenaTrigger.click();
    await expect(arenaTrigger).toHaveAttribute("aria-expanded", "true");
    const arenaDialog = page.getByRole("dialog", { name: labels.arenaTitle });
    await expect(arenaDialog).toBeVisible();
    await expect(arenaDialog).toHaveAttribute("aria-modal", "true");
    expect(await arenaDialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    expect(await arenaDialog.evaluate(element => element.matches(":modal"))).toBe(true);
    const arenaLayout = await arenaDialog.evaluate(element => {
      const panel = element.querySelector("section");
      const style = getComputedStyle(panel);
      return {
        viewport: window.innerWidth,
        width: panel.scrollWidth,
        animation: style.animationName,
      };
    });
    expect(arenaLayout.width).toBeLessThanOrEqual(arenaLayout.viewport);
    expect(arenaLayout.animation).toBe("none");
    // Attempting to focus a background control must not escape native modality.
    await historyTrigger.evaluate(element => element.focus());
    expect(await arenaDialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    const arenaControls = arenaDialog.getByRole("button");
    await arenaControls.last().focus();
    await page.keyboard.press("Tab");
    expect(await arenaDialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await expect(arenaControls.first()).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(arenaControls.last()).toBeFocused();
    await arenaDialog.getByRole("button", { name: labels.minimize, exact: true }).click();
    await expect(arenaDialog).toBeHidden();
    const restoreArena = page.getByRole("button", { name: labels.restore, exact: true });
    await expect(restoreArena).toBeFocused();
    expect(await restoreArena.evaluate(element => element.parentElement.parentElement === document.body)).toBe(true);
    const restoreBox = await restoreArena.boundingBox();
    const mobileNavBox = await page.locator(".tecpey-living-mobile-nav").boundingBox();
    expect(restoreBox).not.toBeNull();
    expect(mobileNavBox).not.toBeNull();
    expect(restoreBox.y + restoreBox.height).toBeLessThanOrEqual(mobileNavBox.y);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    await restoreArena.click();
    await expect(arenaDialog).toBeVisible();
    expect(await arenaDialog.evaluate(element => element.matches(":modal"))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(arenaDialog).toBeHidden();
    await expect(arenaTrigger).toBeFocused();
    await expect(arenaTrigger).toHaveAttribute("aria-expanded", "false");

    const log = page.getByRole("log");
    const messageNodes = log.locator('[data-role="user"], [data-role="assistant"]');
    const beforeMessageCount = await messageNodes.count();
    const starter = page.getByRole("button", { name: new RegExp(labels.starter) });
    await expect(starter).toBeVisible();
    const starterMotion = await starter.evaluate(element => {
      const style = getComputedStyle(element);
      return { duration: style.transitionDuration, property: style.transitionProperty };
    });
    const reducedTransitionMs = starterMotion.duration.split(",").map(value => {
      const duration = value.trim();
      if (duration.endsWith("ms")) return Number.parseFloat(duration);
      if (duration.endsWith("s")) return Number.parseFloat(duration) * 1000;
      return Number.NaN;
    });
    expect(reducedTransitionMs.every(Number.isFinite)).toBe(true);
    expect(Math.max(...reducedTransitionMs)).toBeLessThanOrEqual(0.01);
    expect(starterMotion.property).toBe("none");
    await starter.click();
    const textarea = page.getByRole("textbox", { name: labels.textarea });
    await expect(textarea).toBeFocused();
    await expect(textarea).not.toHaveValue("");
    await expect(messageNodes).toHaveCount(beforeMessageCount);

    await expect(page.getByRole("link", { name: labels.privacy, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: labels.support, exact: true })).toBeVisible();

    const newConversation = page.getByRole("button", { name: labels.newConversation, exact: true });
    await expect(newConversation.first()).toBeVisible();
  });
});
