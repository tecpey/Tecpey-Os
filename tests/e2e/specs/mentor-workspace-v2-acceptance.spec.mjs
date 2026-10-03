import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

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

  test("obsolete Academy responses cannot restore rejected completion evidence", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.metadata.mentorWorkspaceCompact, "Dedicated compact projects only.");
    const isEn = testInfo.project.metadata.locale === "en";
    await installLocalUiSession(page.context());
    await page.route("**/api/mentor-preferences", route => route.fulfill({ json: { capabilities: { plan: "free" } } }));
    await page.route("**/api/mentor-threads", route => route.fulfill({ json: { ok: true, threads: [] } }));
    await page.route("**/api/mentor-insights", route => route.fulfill({ json: { ok: true, profile: null, insights: [] } }));
    let completed = 3;
    let failure = false;
    let malformed = false;
    // These fixtures exercise client ordering and presentation, not server reward authority.
    for (const path of ["academy-term-progress", "academy-state"]) {
      await page.route(`**/api/${path}?**`, route => route.fulfill(failure
        ? { status: 401, json: { ok: false, error: "complete_account_required" } }
        : { json: malformed ? {} : path === "academy-term-progress"
          ? { ok: true, terms: Array.from({ length: completed }, (_, i) => ({ term_number: i + 1, status: "passed", percent: 100 })) }
          : { ok: true, state: { xp: 100, termStatus: Object.fromEntries(Array.from({ length: completed }, (_, i) => [i + 1, "passed"])) } } }));
    }
    await page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      window.__holdAcademyResponses = false;
      window.__releaseAcademyResponses = [];
      window.fetch = async (input, options) => {
        const url = typeof input === "string" ? input : input.url;
        if (window.__holdAcademyResponses && /\/api\/academy-(term-progress|state)\?/.test(url)) {
          // Deliberately ignore cancellation to prove the response guard too.
          const response = await nativeFetch(input, { ...options, signal: undefined });
          await new Promise(resolve => window.__releaseAcademyResponses.push(resolve));
          return response;
        }
        return nativeFetch(input, options);
      };
    });
    await page.goto(`${isEn ? "/en" : ""}/academy/ai-guide`, { waitUntil: "domcontentloaded" });
    const progress = page.locator("header").getByRole("status").filter({ hasText: isEn ? /terms|progress/ : /ترم|پیشرفت/ });
    await expect(progress).toHaveText(isEn ? "3/7 completed terms" : "3/7 ترم تکمیل‌شده");
    await expect(page.locator('#mentor-office [data-earned="true"]')).toHaveCount(2);
    completed = 7;
    await page.evaluate(() => {
      window.__holdAcademyResponses = true;
      window.dispatchEvent(new Event("tecpey-academy-progress-updated"));
    });
    await expect.poll(() => page.evaluate(() => window.__releaseAcademyResponses.length)).toBe(2);
    await expect(progress).toHaveText(isEn ? "Checking progress…" : "در حال بررسی پیشرفت…");
    await expect(page.locator('#mentor-office [data-earned="true"]')).toHaveCount(0);
    failure = true;
    await page.evaluate(() => {
      window.__holdAcademyResponses = false;
      window.dispatchEvent(new Event("tecpey-academy-progress-updated"));
    });
    await expect(progress).toHaveText(isEn ? "Progress unavailable" : "پیشرفت در دسترس نیست");
    await page.evaluate(async () => {
      window.__releaseAcademyResponses.forEach(release => release());
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await expect(progress).toHaveText(isEn ? "Progress unavailable" : "پیشرفت در دسترس نیست");
    await expect(page.locator('#mentor-office [data-earned="true"]')).toHaveCount(0);
    await progress.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await testInfo.attach("mentor-progress-unavailable", { body: await progress.screenshot(), contentType: "image/png" });
    failure = false;
    malformed = true;
    await page.evaluate(() => window.dispatchEvent(new Event("tecpey-academy-progress-updated")));
    await expect(progress).toHaveText(isEn ? "Progress unavailable" : "پیشرفت در دسترس نیست");
    malformed = false;
    completed = 0;
    await page.evaluate(() => window.dispatchEvent(new Event("tecpey-academy-progress-updated")));
    await expect(progress).toHaveText(isEn ? "0/7 completed terms" : "0/7 ترم تکمیل‌شده");
    await expect(page.locator('#mentor-office [data-earned="true"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("profile evidence distinguishes outages, sparse evidence and observed scores", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.metadata.mentorWorkspaceCompact, "Dedicated compact projects only.");
    const isEn = testInfo.project.metadata.locale === "en";
    await installLocalUiSession(page.context());
    // Synthetic snapshots test presentation/recovery, not backend evidence thresholds.
    await page.route("**/api/mentor-preferences", route => route.fulfill({ json: { capabilities: { plan: "free" } } }));
    await page.route("**/api/mentor-threads", route => route.fulfill({ json: { ok: true, threads: [] } }));
    let response = { status: 503, json: { ok: false } };
    let reads = 0;
    let hold = false;
    let resolveHeld;
    const held = new Promise(resolve => { resolveHeld = resolve; });
    await page.route("**/api/mentor-insights", route => {
      reads += 1;
      if (hold) { resolveHeld(route); return; }
      return route.fulfill(response);
    });
    await page.goto(`${isEn ? "/en" : ""}/academy/ai-guide`, { waitUntil: "domcontentloaded" });
    const evidence = page.locator("[data-profile-state]");
    const status = evidence.getByRole("status");
    const refresh = evidence.getByRole("button", { name: isEn ? "Refresh profile evidence" : "بررسی دوبارهٔ پروفایل", exact: true });
    const metric = page.getByText(isEn ? "Learning confidence: —" : "اعتماد آموزشی: —", { exact: true });
    await expect(evidence).toHaveAttribute("data-profile-state", "unavailable");
    await expect(status).toHaveText(isEn ? "Profile unavailable; the learning score is not shown." : "پروفایل در دسترس نیست؛ امتیاز آموزشی نمایش داده نمی‌شود.");
    await expect(metric).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: isEn ? "Your message to the mentor" : "پیام شما به منتور" })).toBeEnabled();
    await evidence.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await testInfo.attach("mentor-profile-unavailable", { body: await evidence.screenshot(), contentType: "image/png" });
    expect(await status.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    expect((await refresh.boundingBox()).height).toBeGreaterThanOrEqual(44);
    hold = true;
    await refresh.focus();
    await page.keyboard.press("Enter");
    const pending = await held;
    await expect(evidence).toHaveAttribute("data-profile-state", "loading");
    await expect(status).toHaveText(isEn ? "Checking profile evidence…" : "در حال بررسی شواهد پروفایل…");
    await expect(refresh).toBeDisabled();
    await expect(refresh).toBeFocused();
    await page.keyboard.press("Enter");
    hold = false;
    await pending.fulfill({ json: { ok: true, profile: { confidenceScore: 87, confidenceEvidenceState: "provisional" }, insights: [] } });
    await expect(evidence).toHaveAttribute("data-profile-state", "insufficient");
    await expect(status).toHaveText(isEn ? "There is not enough recorded evidence to show a learning score yet." : "هنوز شواهد کافی برای نمایش امتیاز آموزشی ثبت نشده است.");
    await expect(refresh).toBeEnabled();
    await expect(refresh).toBeFocused();
    expect(reads).toBe(2);
    await expect(metric).toHaveCount(1);
    await testInfo.attach("mentor-profile-insufficient", { body: await evidence.screenshot(), contentType: "image/png" });
    for (const profile of [
      { confidenceScore: 87, confidenceEvidenceState: "unknown" },
      { confidenceScore: 101, confidenceEvidenceState: "observed" },
      { confidenceScore: -1, confidenceEvidenceState: "observed" },
      { confidenceScore: "87", confidenceEvidenceState: "observed" },
      { confidenceScore: 0, confidenceEvidenceState: "observed" },
      { confidenceScore: 87, confidenceEvidenceState: "observed" },
    ]) {
      response = { json: { ok: true, profile, insights: [] } };
      await refresh.click();
      const observed = profile.confidenceEvidenceState === "observed" && typeof profile.confidenceScore === "number" && profile.confidenceScore >= 0 && profile.confidenceScore <= 100;
      await expect(evidence).toHaveAttribute("data-profile-state", observed ? "observed" : "insufficient");
      await expect(page.getByText(`${isEn ? "Learning confidence" : "اعتماد آموزشی"}: ${observed ? `${profile.confidenceScore}%` : "—"}`, { exact: true })).toHaveCount(1);
    }
    await testInfo.attach("mentor-profile-observed", { body: await evidence.screenshot(), contentType: "image/png" });
    response = { json: { ok: true, profile: { confidenceScore: 87, confidenceEvidenceState: "observed" }, storage: "unavailable" } };
    await refresh.click();
    await expect(evidence).toHaveAttribute("data-profile-state", "unavailable");
    await expect(metric).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("private mentor snapshots are reauthorized after client navigation", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.metadata.mentorWorkspaceCompact, "Dedicated compact projects only.");
    const isEn = testInfo.project.metadata.locale === "en";
    const base = isEn ? "/en" : "";
    await installLocalUiSession(page.context());
    // Client regression only: these fixtures do not prove server authorization.
    await page.route("**/api/mentor-preferences", route => route.fulfill({ json: { capabilities: { plan: "free" } } }));
    await page.route("**/api/mentor-threads", route => route.fulfill({ json: { ok: true, threads: [] } }));
    let reads = 0;
    let denied = false;
    await page.route("**/api/mentor-insights", route => {
      reads += 1;
      return route.fulfill(denied
        ? { status: 401, json: { ok: false, error: "academy_profile_required" } }
        : { json: { ok: true, insights: [], profile: { confidenceScore: 87, confidenceEvidenceState: "observed" } } });
    });
    await page.goto(`${base}/academy/ai-guide`, { waitUntil: "domcontentloaded" });
    // Scope by the label text instead of relying on generated CSS module names.
    const metric = page.getByText(isEn ? "Learning confidence: 87%" : "اعتماد آموزشی: 87%", { exact: true });
    // The evidence row is intentionally hidden in the compact layout. Verify
    // the exact snapshot value independently of that presentation decision.
    await expect(metric).toHaveCount(1);
    const initialReads = reads;
    await page.evaluate(() => { window.__mentorDocumentMarker = "same-document"; });
    denied = true;
    await page.locator('nav').getByRole("link", { name: isEn ? "Support" : "پشتیبانی", exact: true }).last().click();
    await expect(page).toHaveURL(new RegExp(`${base}/support`));
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`${base}/academy/ai-guide`));
    await expect.poll(() => reads).toBeGreaterThan(initialReads);
    await expect(page.getByText(isEn ? "Learning confidence: —" : "اعتماد آموزشی: —", { exact: true })).toHaveCount(1);
    await expect(metric).toHaveCount(0);
    expect(await page.evaluate(() => window.__mentorDocumentMarker)).toBe("same-document");
  });

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
    let conversationReads = 0;
    await page.route("**/api/mentor-conversations?**", async route => {
      conversationReads += 1;
      await route.fulfill({ status: 503, json: { ok: false } });
    });
    await page.route("**/api/ai-mentor", route => route.fulfill({
      status: failure.status,
      json: failure.status === 200
        ? { answer: "Recovered educational answer", threadId: "accepted-current-thread", externalProviderUsed: true, memoryMode: "ephemeral", sources: [{ url: "https://www.w3.org/WAI/WCAG22/", title: "WCAG reference" }, { url: "javascript:alert(1)", title: "Unsafe reference" }] }
        : { error: failure.error },
    }));
    await page.goto(`${base}/academy/ai-guide`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => threadReads).toBe(1);
    await page.getByRole("button", { name: isEn ? "Mentor office" : "دفتر منتور", exact: true }).click();
    const office = page.locator("#mentor-office");
    const cellBounds = await office.boundingBox();
    const sceneBounds = await office.locator(":scope > section").boundingBox();
    expect(cellBounds).not.toBeNull();
    expect(sceneBounds).not.toBeNull();
    expect(sceneBounds.y + sceneBounds.height).toBeLessThanOrEqual(cellBounds.y + cellBounds.height);
    const planBounds = await office.locator("header > [data-plan]").boundingBox();
    expect(planBounds).not.toBeNull();
    expect(planBounds.x).toBeGreaterThanOrEqual(sceneBounds.x);
    expect(planBounds.x + planBounds.width).toBeLessThanOrEqual(sceneBounds.x + sceneBounds.width);
    await expect(office.locator('button[data-locked="true"]')).toHaveCount(2);
    for (const control of await office.locator('button[data-locked="true"]').all()) {
      await expect(control).toBeDisabled();
      await expect(control).toHaveAttribute("aria-pressed", "false");
      await expect(control.locator("small")).toHaveText(isEn ? "Premium only" : "ویژه پرمیوم");
      const typography = await control.evaluate(element => ({
        label: Number.parseFloat(getComputedStyle(element).fontSize),
        reason: Number.parseFloat(getComputedStyle(element.querySelector("small")).fontSize),
      }));
      expect(typography.label).toBeGreaterThanOrEqual(12);
      expect(typography.reason).toBeGreaterThanOrEqual(12);
    }
    await page.getByRole("button", { name: isEn ? "Collapse mentor office" : "جمع‌کردن دفتر منتور", exact: true }).click();
    const input = page.getByRole("textbox", { name: isEn ? "Your message to the mentor" : "پیام شما به منتور" });
    const log = page.getByRole("log");
    const requestAlert = page.locator('[aria-labelledby="mentor-workspace-title"]').getByRole("alert");
    const dismiss = isEn ? "Got it" : "متوجه شدم";
    for (const [index, rejected] of [
      { status: 503, error: "provider_unavailable" },
      { status: 429, error: "rate_limited" },
      { status: 401, error: "academy_login_required" },
    ].entries()) {
      failure = rejected;
      await input.fill(`Explain wallet safety ${index}`);
      await input.press("Enter");
      await expect(requestAlert).toBeVisible();
      await expect.poll(() => threadReads).toBe(index + 2);
      await expect(log.locator('[data-role="user"]')).toHaveCount(index + 1);
      await expect(log.locator('[data-role="assistant"]')).toHaveCount(index + 1);
      await expect(log.locator('[data-source="prepared"]')).toHaveCount(index + 1);
      await expect(input).toBeEnabled();
      if (rejected.status === 401) {
        await expect(requestAlert.getByRole("link")).toHaveAttribute("href", `${base}/academy`);
      }
      await requestAlert.getByRole("button", { name: dismiss, exact: true }).click();
      await expect(requestAlert).toHaveCount(0);
    }
    failure = { status: 200 };
    await input.fill("Explain wallet safety after recovery");
    await input.press("Enter");
    await expect.poll(() => threadReads).toBe(5);
    await expect(log.locator('[data-role="assistant"]')).toHaveCount(4);
    await expect(log.locator('[data-source="live"]')).toHaveCount(1);
    await expect(log.locator('[data-source="live"]')).toContainText(isEn ? "AI-generated answer" : "پاسخ تولیدشده با هوش مصنوعی");
    await expect(log.locator('[data-source="live"]')).toContainText(isEn ? "This reply was not saved" : "این گفت‌وگو ذخیره نشد");
    const publicSource = log.getByRole("link", { name: /WCAG reference/ });
    await expect(publicSource).toHaveAttribute("href", "https://www.w3.org/WAI/WCAG22/");
    await expect(publicSource).toHaveAttribute("target", "_blank");
    await expect(publicSource).toHaveAttribute("rel", "noopener noreferrer");
    await expect(publicSource).toContainText("www.w3.org");
    await expect(publicSource).toContainText(isEn ? "New tab" : "زبانهٔ جدید");
    await expect(log.getByRole("link", { name: /Unsafe reference/ })).toHaveCount(0);
    expect((await publicSource.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await publicSource.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);
    await publicSource.focus();
    await expect(publicSource).toBeFocused();
    const focusedSourceBox = await publicSource.boundingBox();
    const sourceNavBox = await page.locator(".tecpey-living-mobile-nav").boundingBox();
    expect(focusedSourceBox.y).toBeGreaterThanOrEqual(0);
    expect(focusedSourceBox.x).toBeGreaterThanOrEqual(0);
    expect(focusedSourceBox.x + focusedSourceBox.width).toBeLessThanOrEqual(page.viewportSize().width);
    expect(focusedSourceBox.y + focusedSourceBox.height).toBeLessThanOrEqual(sourceNavBox.y);
    await testInfo.attach("mentor-public-source", { body: await publicSource.screenshot(), contentType: "image/png" });
    expect(await log.locator('[data-source="live"]').evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);
    await testInfo.attach("mentor-recovered-answer", { body: await log.locator('[data-role="assistant"]').last().screenshot(), contentType: "image/png" });
    await expect(log).toContainText("Recovered educational answer");
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(conversationReads).toBe(0);
    failure = { status: 404, error: "mentor_thread_not_found" };
    await input.fill("Continue an unavailable conversation");
    await input.press("Enter");
    await expect.poll(() => threadReads).toBe(6);
    await expect(log.locator('[data-role="assistant"]')).toHaveCount(5);
    await requestAlert.getByRole("button", { name: isEn ? "New conversation" : "گفت‌وگوی جدید", exact: true }).click();
    await expect(requestAlert).toHaveCount(0);
    await expect(log.locator('[data-role="user"], [data-role="assistant"]')).toHaveCount(0);
    await expect(input).toBeFocused();
    await expect(input).toBeEnabled();
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
    await expect(input).toBeFocused();
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
    let conversationsAvailable = false;
    let conversationReads = 0;
    let resolveConversation;
    const firstConversationRead = new Promise(resolve => { resolveConversation = resolve; });
    await page.route("**/api/mentor-threads", route => route.fulfill(historyAvailable
      ? { json: { ok: true, threads: [{ id: "saved-recovery", title: "Saved recovery thread", status: "active", locale: isEn ? "en" : "fa", lastMessageAt: "2026-10-03T00:00:00Z" }] } }
      : { status: 503, json: { ok: false } }));
    await page.route("**/api/mentor-conversations?**", async route => {
      conversationReads += 1;
      if (conversationReads === 1) {
        resolveConversation(route);
        return;
      }
      await route.fulfill(conversationsAvailable
        ? { json: { ok: true, conversations: [{ id: "restored", role: "assistant", content: "Recovered saved guidance", createdAt: "2026-10-03T00:00:00Z" }] } }
        : { status: 503, json: { ok: false } });
    });
    await page.route("**/api/ai-mentor", route => route.abort("failed"));
    await page.goto(`${isEn ? "/en" : ""}/academy/ai-guide`, { waitUntil: "domcontentloaded" });
    const input = page.getByRole("textbox", { name: isEn ? "Your message to the mentor" : "پیام شما به منتور" });
    await input.fill("Explain safe educational practice");
    await input.press("Enter");
    const requestAlert = page.locator('[aria-labelledby="mentor-workspace-title"]').getByRole("alert");
    await expect(requestAlert).toContainText(isEn ? "Could not reach the server" : "ارتباط");
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
    await page.getByRole("button", { name: isEn ? "New conversation" : "گفت‌وگوی جدید", exact: true }).first().click();
    await page.getByRole("button", { name: isEn ? "Conversation history" : "گفت‌وگوهای قبلی", exact: true }).click();
    await history.getByRole("button", { name: /Saved recovery thread/ }).click();
    const heldConversation = await firstConversationRead;
    await expect(page.getByRole("status").filter({ hasText: isEn ? "Loading saved messages" : "در حال دریافت پیام‌های ذخیره‌شده" })).toBeVisible();
    await expect(input).toBeDisabled();
    await heldConversation.fulfill({ status: 503, json: { ok: false } });
    await expect.poll(() => conversationReads).toBe(1);
    await expect(input).toBeEnabled();
    await page.getByRole("button", { name: isEn ? "Conversation history" : "گفت‌وگوهای قبلی", exact: true }).click();
    await retry.click();
    await expect.poll(() => conversationReads).toBe(2);
    await expect(retry).toBeEnabled();
    // A successful thread index must not hide a failed conversation read.
    await expect(retry).toBeVisible();
    conversationsAvailable = true;
    await retry.click();
    await expect.poll(() => conversationReads).toBe(3);
    await expect(retry).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(log).toContainText("Recovered saved guidance");
    await expect(log.locator('[data-role="assistant"]')).toHaveCount(1);
  });

  test("workspace and history retain accessible contrast in persisted themes", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.metadata.mentorWorkspaceCompact, "Dedicated compact projects only.");
    const isEn = testInfo.project.metadata.locale === "en";
    await installLocalUiSession(page.context());
    await page.route("**/api/mentor-preferences", route => route.fulfill({ json: { capabilities: { plan: "free" } } }));
    await page.route("**/api/mentor-threads", route => route.fulfill({ json: { ok: true, threads: [] } }));
    const path = `${isEn ? "/en" : ""}/academy/ai-guide`;
    await page.goto(path, { waitUntil: "domcontentloaded" });
    for (const theme of ["dark", "light"]) {
      await page.evaluate(value => localStorage.setItem("theme", value), theme);
      await page.reload({ waitUntil: "domcontentloaded" });
      if (theme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
      await page.getByRole("button", { name: isEn ? "Mentor office" : "دفتر منتور", exact: true }).click();
      await page.locator("#mentor-office").evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
      await testInfo.attach(`mentor-office-${theme}`, {
        body: await page.locator("#mentor-office").screenshot(), contentType: "image/png",
      });
      await page.addScriptTag({ content: axeSource });
      for (const surface of ["workspace", "history"]) {
        if (surface === "history") {
          await page.getByRole("button", { name: isEn ? "Conversation history" : "گفت‌وگوهای قبلی", exact: true }).click();
        }
        const result = await page.evaluate(async selector => {
          const results = await window.axe.run(document.querySelector(selector), {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
          });
          return results.violations.map(({ id, impact, help, nodes }) => ({
            id, impact, help, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
          }));
        }, surface === "workspace" ? "main.tecpey-enterprise" : "#mentor-history-dialog");
        await testInfo.attach(`mentor-${theme}-${surface}-axe`, {
          body: Buffer.from(JSON.stringify(result, null, 2)), contentType: "application/json",
        });
        expect(result, `${theme} ${surface} WCAG violations`).toEqual([]);
      }
      await page.keyboard.press("Escape");
    }
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
    const input = page.getByRole("textbox", { name: isEn ? "Your message to the mentor" : "پیام شما به منتور" });
    await input.focus();
    await input.fill("A readable high contrast draft");
    await expect(input).toBeFocused();
    await expect(page.getByRole("button", { name: isEn ? "Send question" : "ارسال سؤال", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 768, height: 1024 });
    const scene = page.locator("#mentor-office > section");
    const standing = scene.locator('[data-mentor-pose="standing_user"]');
    await expect(standing).toBeVisible();
    const sceneBox = await scene.boundingBox();
    const tabletCellBox = await page.locator("#mentor-office").boundingBox();
    const standingBox = await standing.boundingBox();
    expect(sceneBox).not.toBeNull();
    expect(tabletCellBox).not.toBeNull();
    expect(sceneBox.y + sceneBox.height).toBeLessThanOrEqual(tabletCellBox.y + tabletCellBox.height);
    expect(standingBox).not.toBeNull();
    expect(standingBox.y).toBeGreaterThanOrEqual(sceneBox.y);
    expect(standingBox.y + standingBox.height).toBeLessThanOrEqual(sceneBox.y + sceneBox.height);
    expect(standingBox.x).toBeGreaterThanOrEqual(sceneBox.x);
    expect(standingBox.x + standingBox.width).toBeLessThanOrEqual(sceneBox.x + sceneBox.width);
    await testInfo.attach("mentor-office-tablet-composing", {
      body: await page.locator("#mentor-office").screenshot(), contentType: "image/png",
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
