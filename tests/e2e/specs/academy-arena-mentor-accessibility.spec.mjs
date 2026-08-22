import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const NOW = "2026-08-15T12:00:00.000Z";
const E2E_ACADEMY_PROFILE = {
  id: "55555555-5555-4555-8555-555555555555",
  student_id: "55555555-5555-4555-8555-555555555555",
  display_name: "TecPey E2E Learner",
  preferred_language: "fa",
  current_term: 7,
  completed_terms: 7,
  xp: 1260,
  streak: 14,
  ranking_consent: true,
  public_profile_consent: true,
  profile_visibility: "public",
};

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signE2eUnifiedSession() {
  const secret = process.env.TECPEY_SESSION_SECRET || "e2e-session-secret-distinct-32-characters";
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url({ alg: "HS256", typ: "JWT" });
  const payload = base64Url({
    role: "unified",
    v: 1,
    sub: E2E_ACADEMY_PROFILE.student_id,
    accountId: "academy:learner.e2e@tecpey.test",
    studentId: E2E_ACADEMY_PROFILE.student_id,
    email: "learner.e2e@tecpey.test",
    displayName: E2E_ACADEMY_PROFILE.display_name,
    username: "e2e-learner",
    iat: now,
    exp: now + 60 * 60,
  });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function contractFor(testInfo) {
  const locale = testInfo.project.metadata.locale === "en" ? "en" : "fa";
  return locale === "en"
    ? {
        locale,
        lang: "en-US",
        dir: "ltr",
        surfaces: [
          {
            key: "academy",
            path: "/en/academy",
            heading: /Free crypto education for every TecPey user/i,
            cta: /Start free education|Explore infinite learning|Open personal coach/i,
          },
          {
            key: "arena",
            path: "/en/academy/trading-arena",
            requiresSession: true,
            heading: /Learn the decision process before risking real capital/i,
            cta: /Create Academy profile|Explore the Academy/i,
          },
          {
            key: "mentor",
            path: "/en/academy/mentor-coach",
            requiresSession: true,
            heading: /TecPey personalized AI coach/i,
            cta: /Open mentor|Practice decisions/i,
          },
        ],
      }
    : {
        locale,
        lang: "fa-IR",
        dir: "rtl",
        surfaces: [
          {
            key: "academy",
            path: "/academy",
            heading: /تک‌پی، نقطه امن ورود به بازار رمزارز/,
            cta: /ساخت پروفایل آکادمی و شروع ترم اول|ورود به مربی شخصی/,
          },
          {
            key: "arena",
            path: "/academy/trading-arena",
            requiresSession: true,
            heading: /آرنای معاملاتی/,
            cta: /بررسی برنامه و ارسال به سرور|سناریوها|ژورنال سروری/,
          },
          {
            key: "mentor",
            path: "/academy/mentor-coach",
            requiresSession: true,
            heading: /مربی هوشمند شخصی‌سازی‌شده تک‌پی/,
            cta: /رفتن به مربی آموزشی|تمرین تصمیم‌گیری/,
          },
        ],
      };
}

function arenaSnapshot() {
  const state = {
    version: 2,
    initialBalance: "100000.0000000000",
    cashBalance: "100000.0000000000",
    reservedBalance: "0.0000000000",
    equity: "100000.0000000000",
    holdings: {
      BTC: "0.000000000000000000",
      ETH: "0.000000000000000000",
    },
    openPositions: [],
    pendingOrders: [],
    closedTrades: [],
    totalRealizedPnl: "0.0000000000",
    totalFeesPaid: "0.0000000000",
    lastTradeAt: null,
    lastLossAt: null,
    lastMarket: {
      prices: {
        BTC: "67420.2500000000",
        ETH: "3520.1000000000",
      },
      source: "e2e-deterministic-price-authority",
      observedAt: NOW,
    },
    createdAt: NOW,
    updatedAt: NOW,
  };

  return {
    ok: true,
    account: {
      cycleId: "11111111-1111-4111-8111-111111111111",
      status: "active",
      initialBalance: "100000.0000000000",
      availableBalance: "100000.0000000000",
      attemptsTotal: 3,
      attemptsUsed: 0,
      attemptsRemaining: 3,
      currentAttempt: 1,
      revision: 1,
      cycleStartedAt: "2026-08-01T00:00:00.000Z",
      cycleEndsAt: "2026-09-01T00:00:00.000Z",
    },
    attempts: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        cycleId: "11111111-1111-4111-8111-111111111111",
        attemptNumber: 1,
        status: "active",
        startingBalance: "100000.0000000000",
        cashBalance: "100000.0000000000",
        equity: "100000.0000000000",
        startedAt: "2026-08-01T00:00:00.000Z",
        endedAt: null,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        cycleId: "11111111-1111-4111-8111-111111111111",
        attemptNumber: 2,
        status: "available",
        startingBalance: "100000.0000000000",
        cashBalance: "100000.0000000000",
        equity: "100000.0000000000",
        startedAt: null,
        endedAt: null,
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        cycleId: "11111111-1111-4111-8111-111111111111",
        attemptNumber: 3,
        status: "available",
        startingBalance: "100000.0000000000",
        cashBalance: "100000.0000000000",
        equity: "100000.0000000000",
        startedAt: null,
        endedAt: null,
      },
    ],
    activeAttempt: {
      id: "22222222-2222-4222-8222-222222222222",
      cycleId: "11111111-1111-4111-8111-111111111111",
      attemptNumber: 1,
      status: "active",
      startingBalance: "100000.0000000000",
      cashBalance: "100000.0000000000",
      equity: "100000.0000000000",
      startedAt: "2026-08-01T00:00:00.000Z",
      endedAt: null,
    },
    state,
    revision: 1,
    market: state.lastMarket,
    projectedEquity: "100000.0000000000",
    marketStatus: "available",
    eventType: null,
    idempotentReplay: false,
  };
}

async function json(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    headers: { "cache-control": "no-store" },
    body: JSON.stringify(body),
  });
}

async function installAcademySessionCookie(context) {
  await context.addCookies([
    {
      name: "tecpey_session",
      value: signE2eUnifiedSession(),
      url: process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3100",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function installDeterministicProductApis(context) {
  await context.route("**/api/academy-auth", (route) =>
    json(route, {
      authenticated: true,
      account: {
        id: "66666666-6666-4666-8666-666666666666",
        email: "learner.e2e@tecpey.test",
        studentId: E2E_ACADEMY_PROFILE.student_id,
      },
    }),
  );
  await context.route("**/api/academy-student-profile", (route) =>
    json(route, { authenticated: true, profile: E2E_ACADEMY_PROFILE }),
  );
  await context.route("**/api/academy/mentor-memory", (route) =>
    json(route, {
      ok: true,
      memory: {
        weakAreas: ["risk-management", "trading-psychology"],
        confidence: 64,
      },
    }),
  );
  await context.route("**/api/trading-arena/execution", (route) =>
    json(route, arenaSnapshot()),
  );
  await context.route("**/api/crypto-news**", (route) =>
    json(route, { mode: "fallback", updatedAt: NOW }),
  );
}

async function expectNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(
    dimensions.documentWidth,
    `${label}: document width ${dimensions.documentWidth}px exceeds viewport ${dimensions.viewportWidth}px`,
  ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

async function expectKeyboardReachable(page, label) {
  await page.keyboard.press("Tab");
  const active = await page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      label: element.getAttribute("aria-label") || element.textContent?.trim().replace(/\s+/g, " ").slice(0, 120),
      visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden",
      inViewport: rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth,
    };
  });
  expect(active, `${label}: Tab did not reach an interactive element`).not.toBeNull();
  expect(active?.visible, `${label}: focused element is not visible`).toBe(true);
  expect(active?.inViewport, `${label}: focused element is outside the viewport`).toBe(true);
  // Returned so the QA-051 record can carry what was observed. A record that
  // hard-codes its own result proves only that the line was reached.
  return active;
}

async function expectPrimaryTargetSize(page, surface) {
  const target = page.getByRole("link", { name: surface.cta }).or(
    page.getByRole("button", { name: surface.cta }),
  ).first();
  await expect(target, `${surface.path}: primary target missing`).toBeVisible();
  const box = await target.boundingBox();
  expect(box, `${surface.path}: primary target has no rendered box`).not.toBeNull();
  expect(box?.width ?? 0, `${surface.path}: primary target is too narrow`).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0, `${surface.path}: primary target is too short`).toBeGreaterThanOrEqual(32);
}

// ── QA-051 evidence recording ────────────────────────────────────────────────
// The checks below already ran; until now they only produced Playwright
// attachments, which live inside a report rather than as something anyone can
// verify afterwards. Each project writes one shard, and
// scripts/collect-accessibility-runtime-evidence.mjs assembles them.
const evidenceRecords = { axe: [], keyboard: [], focus: [], contrast: [], reducedMotion: [] };

function recordCheck(check, viewport, surface, passed, extra = {}) {
  evidenceRecords[check].push({ viewport, surface, passed, ...extra });
}

function writeEvidenceShard(viewport) {
  // Resolved from this file, not from process.cwd(): the collector reads a fixed
  // path under the repository root, and which directory Playwright happened to
  // be launched from is not something the evidence location should depend on.
  const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = path.join(repositoryRoot, "artifacts/accessibility-runtime/shards");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, `${viewport}.json`),
    `${JSON.stringify({ viewport, records: evidenceRecords }, null, 2)}\n`,
    "utf8",
  );
}

/** How far to walk the tab ring. Long enough to leave the header behind. */
const FOCUS_ORDER_DEPTH = 15;

/**
 * Walk the tab ring and record what focus actually visited, in order.
 *
 * Reachability and order are different properties: a page can hand focus to
 * every control and still hand them over in an order that has nothing to do
 * with the reading order, which is what a positive tabindex does. The DOM index
 * of each stop is recorded so the artifact carries the order a reviewer would
 * have to re-derive otherwise, and monotonicity is asserted because nothing in
 * this codebase sets a positive tabindex.
 */
async function captureFocusOrder(page, viewport, surface) {
  await page.evaluate(() => document.activeElement?.blur?.());
  const stops = [];
  for (let step = 0; step < FOCUS_ORDER_DEPTH; step += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        label:
          element.getAttribute("aria-label") ||
          element.textContent?.trim().replace(/\s+/g, " ").slice(0, 60) ||
          null,
        domIndex: [...document.querySelectorAll("*")].indexOf(element),
        // The focus ring itself: a control you can reach but cannot see you
        // have reached is not keyboard accessible.
        focusVisible:
          style.outlineStyle !== "none" ||
          style.boxShadow !== "none" ||
          element.matches(":focus-visible"),
      };
    });
    if (stop === null) break;
    stops.push(stop);
  }

  const distinct = new Set(stops.map((stop) => stop.domIndex));
  const ordered = stops.every(
    (stop, index) => index === 0 || stop.domIndex >= stops[index - 1].domIndex,
  );
  const allVisible = stops.every((stop) => stop.focusVisible);

  recordCheck("focus", viewport, surface, distinct.size >= 3 && ordered && allVisible, {
    stops,
    distinctStops: distinct.size,
    followsDomOrder: ordered,
  });

  expect(distinct.size, `${surface}: tab focus is trapped on too few controls`).toBeGreaterThanOrEqual(3);
  expect(ordered, `${surface}: tab order does not follow document order`).toBe(true);
  expect(allVisible, `${surface}: a focused control renders no focus indicator`).toBe(true);
}

/**
 * Reduced motion is a runtime behaviour, not a stylesheet claim: emulate the
 * preference and confirm nothing still moves. A page that ignores the setting is
 * unusable for someone who set it because motion makes them ill.
 *
 * The threshold is the global reduced-motion reset in src/app/globals.css,
 * which collapses every animation and transition to 0.01ms. Anything still
 * running longer than a frame has escaped that reset — an inline style, or a
 * rule with its own !important — and is a finding, because the reset is what
 * makes the preference apply to the whole page rather than to a list of class
 * names someone has to remember to extend.
 *
 * No reload: emulateMedia re-evaluates the media query live, which is what a
 * real user toggling the OS setting experiences, and reloading every surface
 * doubled this spec's navigations for no additional evidence.
 */
async function assertReducedMotion(page, viewport, surface) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const moving = await page.evaluate(() => {
    const longEnough = (value) =>
      String(value).split(",").some((part) => parseFloat(part) > 0.05);
    const offenders = [];
    for (const element of document.querySelectorAll("*")) {
      const style = getComputedStyle(element);
      if (style.animationName !== "none" && longEnough(style.animationDuration)) {
        offenders.push({
          selector: element.tagName.toLowerCase(),
          reason: `animation ${style.animationName} ${style.animationDuration}`,
        });
        continue;
      }
      if (longEnough(style.transitionDuration)) {
        offenders.push({
          selector: element.tagName.toLowerCase(),
          reason: `transition ${style.transitionProperty} ${style.transitionDuration}`,
        });
      }
    }
    // The count is the whole population; the sample is only there so a failure
    // says which elements without carrying a thousand records into evidence.
    return { count: offenders.length, sample: offenders.slice(0, 10) };
  });

  recordCheck("reducedMotion", viewport, surface, moving.count === 0, {
    animatedElements: moving.count,
    offenders: moving.sample,
  });
  expect(
    moving.sample,
    `${surface}: ${moving.count} elements still move under prefers-reduced-motion: reduce`,
  ).toEqual([]);
  await page.emulateMedia({ reducedMotion: null });
}

const AXE_RULE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function assertAccessibility(page, testInfo, label, viewport, surface) {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(
    async (tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags } }),
    AXE_RULE_TAGS,
  );

  await testInfo.attach(`${label}-axe-results`, {
    body: Buffer.from(JSON.stringify(results, null, 2), "utf8"),
    contentType: "application/json",
  });

  const blocking = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  // Recorded before the assertion so a failing run still leaves evidence of what
  // it found, rather than only of the fact that it stopped.
  recordCheck("axe", viewport, surface, blocking.length === 0, {
    ruleTags: AXE_RULE_TAGS,
    criticalOrSeriousCount: blocking.length,
    violationIds: results.violations.map((violation) => violation.id),
  });

  // Contrast is one axe rule, but QA-051 asks for it as its own report, so it is
  // extracted rather than re-measured — one engine, two views of the same run.
  const contrast = results.violations.filter((violation) => violation.id === "color-contrast");
  recordCheck("contrast", viewport, surface, contrast.length === 0, {
    contrastViolations: contrast.length,
  });

  expect(
    blocking.map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      targets: nodes.map((node) => node.target),
    })),
    `${label}: critical or serious WCAG violations were found`,
  ).toEqual([]);
}

test.beforeEach(async ({ context }) => {
  await installDeterministicProductApis(context);
});

test("Academy, Arena and Mentor surfaces pass mobile/desktop RTL-LTR accessibility evidence", async ({ page }, testInfo) => {
  const contract = contractFor(testInfo);
  const viewport = testInfo.project.name;

  for (const surface of contract.surfaces) {
    const label = `${contract.locale}-${testInfo.project.metadata.formFactor}-${surface.key}`;
    await page.context().clearCookies();
    if (surface.requiresSession) {
      await installAcademySessionCookie(page.context());
    }

    const response = await page.goto(surface.path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    expect(response?.status(), `${surface.path}: HTTP status`).toBeLessThan(400);

    await expect(page.locator("html"), `${surface.path}: html lang`).toHaveAttribute("lang", contract.lang);
    await expect(page.locator("html"), `${surface.path}: html dir`).toHaveAttribute("dir", contract.dir);
    await expect(page.getByRole("heading", { level: 1, name: surface.heading })).toBeVisible();

    await expectNoHorizontalOverflow(page, surface.path);
    await expectPrimaryTargetSize(page, surface);

    // QA-051 names keyboard and focus separately, and they are separate
    // properties: reaching every control says nothing about the order focus
    // reaches them in, or whether you can see where it went.
    const reached = await expectKeyboardReachable(page, surface.path);
    recordCheck("keyboard", viewport, surface.path, reached !== null, {
      firstStop: reached?.label ?? null,
      firstStopTag: reached?.tag ?? null,
      visible: reached?.visible ?? false,
      inViewport: reached?.inViewport ?? false,
    });
    await captureFocusOrder(page, viewport, surface.path);

    await page.screenshot({ fullPage: true }).then((screenshot) =>
      testInfo.attach(`${label}-screenshot`, {
        body: screenshot,
        contentType: "image/png",
      }),
    );
    await assertAccessibility(page, testInfo, label, viewport, surface.path);
    await assertReducedMotion(page, viewport, surface.path);
  }

  writeEvidenceShard(viewport);
});
