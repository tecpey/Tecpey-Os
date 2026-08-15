import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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
            heading: /Learn the decision process before risking real capital/i,
            cta: /Create Academy profile|Explore the Academy/i,
          },
          {
            key: "mentor",
            path: "/en/academy/mentor-coach",
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
            heading: /آرنای معاملاتی/,
            cta: /بررسی برنامه و ارسال به سرور|سناریوها|ژورنال سروری/,
          },
          {
            key: "mentor",
            path: "/academy/mentor-coach",
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

async function assertAccessibility(page, testInfo, label) {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () =>
    window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    }),
  );

  await testInfo.attach(`${label}-axe-results`, {
    body: Buffer.from(JSON.stringify(results, null, 2), "utf8"),
    contentType: "application/json",
  });

  const blocking = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
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

  for (const surface of contract.surfaces) {
    const label = `${contract.locale}-${testInfo.project.metadata.formFactor}-${surface.key}`;
    const response = await page.goto(surface.path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    expect(response?.status(), `${surface.path}: HTTP status`).toBeLessThan(400);

    await expect(page.locator("html"), `${surface.path}: html lang`).toHaveAttribute("lang", contract.lang);
    await expect(page.locator("html"), `${surface.path}: html dir`).toHaveAttribute("dir", contract.dir);
    await expect(page.getByRole("heading", { level: 1, name: surface.heading })).toBeVisible();

    await expectNoHorizontalOverflow(page, surface.path);
    await expectPrimaryTargetSize(page, surface);
    await expectKeyboardReachable(page, surface.path);

    await page.screenshot({ fullPage: true }).then((screenshot) =>
      testInfo.attach(`${label}-screenshot`, {
        body: screenshot,
        contentType: "image/png",
      }),
    );
    await assertAccessibility(page, testInfo, label);
  }
});
