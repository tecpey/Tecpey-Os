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

  test("failed requests retain unsaved guidance and allow an explicit recovery", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.metadata.mentorWorkspaceCompact, "Dedicated compact projects only.");
    const isEn = testInfo.project.metadata.locale === "en";
    const base = isEn ? "/en" : "";
    await installLocalUiSession(page.context());
    // These fixtures exercise client behavior, not server entitlement or persistence authority.
    await page.route("**/api/mentor-preferences", route => route.fulfill({ status: 503, json: { ok: false } }));
    let threadReads = 0;
    await page.route("**/api/mentor-threads", async route => {
      threadReads += 1;
      await route.fulfill({ json: { ok: true, threads: [] } });
    });
    let failure = { status: 503, error: "provider_unavailable" };
    await page.route("**/api/ai-mentor", route => route.fulfill({
      status: failure.status,
      json: failure.status === 200
        ? { answer: "Recovered educational answer", externalProviderUsed: true, memoryMode: "ephemeral" }
        : { error: failure.error },
    }));
    await page.goto(`${base}/academy/ai-guide`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => threadReads).toBe(1);
    await page.getByRole("button", { name: isEn ? "Mentor office" : "دفتر منتور", exact: true }).click();
    const office = page.locator("#mentor-office");
    await expect(office.locator('button[data-locked="true"]')).toHaveCount(2);
    for (const control of await office.locator('button[data-locked="true"]').all()) {
      await expect(control).toBeDisabled();
      await expect(control).toHaveAttribute("aria-pressed", "false");
    }
    await page.getByRole("button", { name: isEn ? "Collapse mentor office" : "جمع‌کردن دفتر منتور", exact: true }).click();
    const input = page.getByRole("textbox", { name: isEn ? "Your message to the mentor" : "پیام شما به منتور" });
    const log = page.getByRole("log");
    const dismiss = isEn ? "Got it" : "متوجه شدم";
    for (const [index, rejected] of [
      { status: 503, error: "provider_unavailable" },
      { status: 429, error: "rate_limited" },
      { status: 401, error: "academy_login_required" },
    ].entries()) {
      failure = rejected;
      await input.fill(`Explain wallet safety ${index}`);
      await input.press("Enter");
      await expect(page.getByRole("alert")).toBeVisible();
      await expect.poll(() => threadReads).toBe(index + 2);
      await expect(log.locator('[data-role="user"]')).toHaveCount(index + 1);
      await expect(log.locator('[data-role="assistant"]')).toHaveCount(index + 1);
      await expect(log.locator('[data-source="prepared"]')).toHaveCount(index + 1);
      await expect(input).toBeEnabled();
      if (rejected.status === 401) {
        await expect(page.getByRole("alert").getByRole("link")).toHaveAttribute("href", `${base}/academy`);
      }
      await page.getByRole("alert").getByRole("button", { name: dismiss, exact: true }).click();
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
    failure = { status: 200 };
    await input.fill("Explain wallet safety after recovery");
    await input.press("Enter");
    await expect.poll(() => threadReads).toBe(5);
    await expect(log.locator('[data-role="assistant"]')).toHaveCount(4);
    await expect(log.locator('[data-source="live"]')).toHaveCount(1);
    await expect(log).toContainText("Recovered educational answer");
  });

  test("a late response cannot repopulate a new conversation", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.metadata.mentorWorkspaceCompact, "Dedicated compact projects only.");
    const isEn = testInfo.project.metadata.locale === "en";
    await installLocalUiSession(page.context());
    await page.route("**/api/mentor-preferences", route => route.fulfill({ json: { capabilities: { plan: "free" } } }));
    let threadReads = 0;
    await page.route("**/api/mentor-threads", async route => {
      threadReads += 1;
      await route.fulfill({ json: { ok: true, threads: [] } });
    });
    let resolveRequest;
    const pendingRequest = new Promise(resolve => { resolveRequest = resolve; });
    await page.route("**/api/ai-mentor", route => { resolveRequest(route); });
    await page.goto(`${isEn ? "/en" : ""}/academy/ai-guide`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => threadReads).toBe(1);
    const input = page.getByRole("textbox", { name: isEn ? "Your message to the mentor" : "پیام شما به منتور" });
    await input.fill("An old educational question");
    await input.press("Enter");
    const heldRoute = await pendingRequest;
    await page.getByRole("button", { name: isEn ? "New conversation" : "گفت‌وگوی جدید", exact: true }).first().click();
    await expect(input).toBeEnabled();
    await input.fill("Keep this new draft");
    const replyReceived = page.waitForResponse(response => response.url().endsWith("/api/ai-mentor"));
    await heldRoute.fulfill({ json: { answer: "Stale reply must stay out", externalProviderUsed: true } });
    await replyReceived;
    // Flush client promise continuations before checking the abandoned request's effects.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByRole("log").locator('[data-role="user"], [data-role="assistant"]')).toHaveCount(0);
    await expect(input).toHaveValue("Keep this new draft");
    expect(threadReads).toBe(1);
  });

  test("network and history failures recover without erasing the current chat", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.metadata.mentorWorkspaceCompact, "Dedicated compact projects only.");
    const isEn = testInfo.project.metadata.locale === "en";
    await installLocalUiSession(page.context());
    await page.route("**/api/mentor-preferences", route => route.fulfill({ json: { capabilities: { plan: "free" } } }));
    let historyAvailable = false;
    await page.route("**/api/mentor-threads", route => route.fulfill(historyAvailable
      ? { json: { ok: true, threads: [] } }
      : { status: 503, json: { ok: false } }));
    await page.route("**/api/ai-mentor", route => route.abort("failed"));
    await page.goto(`${isEn ? "/en" : ""}/academy/ai-guide`, { waitUntil: "domcontentloaded" });
    const input = page.getByRole("textbox", { name: isEn ? "Your message to the mentor" : "پیام شما به منتور" });
    await input.fill("Explain safe educational practice");
    await input.press("Enter");
    await expect(page.getByRole("alert")).toContainText(isEn ? "Could not reach the server" : "ارتباط");
    const log = page.getByRole("log");
    await expect(log.locator('[data-role="assistant"]')).toHaveCount(1);
    await expect(log.locator('[data-source="prepared"]')).toHaveCount(1);
    await expect(input).toBeEnabled();
    await page.getByRole("button", { name: isEn ? "Conversation history" : "گفت‌وگوهای قبلی", exact: true }).click();
    const history = page.getByRole("dialog", { name: isEn ? "Conversation history" : "گفت‌وگوهای قبلی" });
    const retry = history.getByRole("button", { name: isEn ? "Try again" : "تلاش دوباره", exact: true });
    await expect(retry).toBeVisible();
    historyAvailable = true;
    await retry.click();
    await expect(retry).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(log.locator('[data-role="user"]')).toHaveCount(1);
    await expect(log.locator('[data-role="assistant"]')).toHaveCount(1);
  });

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
