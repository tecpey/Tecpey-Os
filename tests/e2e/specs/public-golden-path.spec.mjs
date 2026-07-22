import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const runtimeErrors = new WeakMap();

const MARKET_RESPONSE = {
  data: [
    {
      symbol: "BTC",
      name: "Bitcoin",
      faName: "بیت‌کوین",
      priceData: { symbol: "BTCUSDT", last: "67420.25", changePercent: "1.25" },
    },
    {
      symbol: "ETH",
      name: "Ethereum",
      faName: "اتریوم",
      priceData: { symbol: "ETHUSDT", last: "3520.10", changePercent: "-0.42" },
    },
    {
      symbol: "USDT",
      name: "Tether",
      faName: "تتر",
      priceData: { symbol: "USDTUSDT", last: "1", changePercent: "0" },
    },
    {
      symbol: "TON",
      name: "Toncoin",
      faName: "تون‌کوین",
      priceData: { symbol: "TONUSDT", last: "7.18", changePercent: "2.04" },
    },
  ],
  meta: { current_page: 1, last_page: 1 },
};

function projectContract(testInfo) {
  const locale = testInfo.project.metadata.locale === "en" ? "en" : "fa";
  const formFactor = testInfo.project.metadata.formFactor === "mobile" ? "mobile" : "desktop";

  return locale === "en"
    ? {
        locale,
        formFactor,
        path: "/en",
        lang: "en-US",
        dir: "ltr",
        heading: /TecPey.*Safe Entry Point/i,
        knowledge: "Knowledge Center",
        arena: "Trading Arena",
        menu: "Open menu",
        mentor: "Discover TecPey AI learning mentor",
        mentorTitle: "TecPey AI Learning Mentor",
        themeToLight: "Switch to light mode",
        themeToDark: "Switch to dark mode",
        academyPath: "/en/academy",
        arenaPath: "/en/academy/trading-arena",
        forbiddenCopy: [
          /Online Market Board/i,
          /Live market prices/i,
          /brings buying, selling and digital asset management together/i,
          /Buy, sell and review live markets/i,
        ],
      }
    : {
        locale,
        formFactor,
        path: "/",
        lang: "fa-IR",
        dir: "rtl",
        heading: /تک‌پی، نقطه امن ورود به بازار رمزارز/,
        knowledge: "مرکز دانش",
        arena: "تریدینگ آرنا",
        menu: "باز کردن منو",
        mentor: "آشنایی با منتور هوشمند آموزشی تک‌پی",
        mentorTitle: "منتور هوشمند آموزشی تک‌پی",
        themeToLight: "تغییر به حالت روشن",
        themeToDark: "تغییر به حالت تیره",
        academyPath: "/academy",
        arenaPath: "/academy/trading-arena",
        forbiddenCopy: [
          /پشتیبانی\s*۲۴\/۷/,
          /اولین معامله واقعی/,
          /بازارها\s+زنده/,
          /\bOnline\b/,
        ],
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

async function installDeterministicApi(context) {
  await context.route("**/api/academy-auth", (route) =>
    json(route, { authenticated: false }),
  );
  await context.route("**/api/academy-student-profile", (route) =>
    json(route, { authenticated: false, profile: null }),
  );
  await context.route("**/api/v1/user/currency/list**", (route) =>
    json(route, MARKET_RESPONSE),
  );
}

function trackRuntimeErrors(page, errors) {
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/socket\.io|WebSocket connection/i.test(text)) return;
    if (
      /(Unhandled|Hydration failed|TypeError|ReferenceError|SyntaxError|Content Security Policy|Refused to execute)/i.test(
        text,
      )
    ) {
      errors.push(`console: ${text}`);
    }
  });
}

async function openPublicPage(page, contract) {
  const response = await page.goto(contract.path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `HTTP status for ${contract.path}`).toBeLessThan(400);
  await expect(page.getByRole("heading", { level: 1, name: contract.heading })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", contract.lang);
  await expect(page.locator("html")).toHaveAttribute("dir", contract.dir);
}

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(
    dimensions.documentWidth,
    `document width ${dimensions.documentWidth}px exceeds viewport ${dimensions.viewportWidth}px`,
  ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

function rectanglesOverlap(a, b) {
  if (!a || !b) return false;
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

async function expectSuccessfulLocalRoute(page, path) {
  const response = await page.request.get(path, { maxRedirects: 5, timeout: 30_000 });
  expect(response.status(), `local route ${path}`).toBeLessThan(400);
}

async function assertAccessibility(page, testInfo) {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () =>
    window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    }),
  );

  await testInfo.attach("axe-results", {
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
    "critical or serious WCAG violations were found",
  ).toEqual([]);
}

test.beforeEach(async ({ context, page }) => {
  await installDeterministicApi(context);
  const errors = [];
  runtimeErrors.set(page, errors);
  trackRuntimeErrors(page, errors);
});

test.afterEach(async ({ page }, testInfo) => {
  const errors = runtimeErrors.get(page) ?? [];
  if (errors.length > 0) {
    await testInfo.attach("runtime-errors", {
      body: Buffer.from(errors.join("\n"), "utf8"),
      contentType: "text/plain",
    });
  }
  expect(errors, "public page emitted fatal browser runtime errors").toEqual([]);
});

test("public Soft Launch Golden Path is localized, interactive, truthful and accessible", async ({ context, page }, testInfo) => {
  const contract = projectContract(testInfo);
  const errors = runtimeErrors.get(page) ?? [];
  await openPublicPage(page, contract);

  await expect(page.locator("footer")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const bodyText = await page.locator("body").innerText();
  for (const forbidden of contract.forbiddenCopy) {
    expect(bodyText, `unsupported public claim matched ${forbidden}`).not.toMatch(forbidden);
  }

  if (testInfo.project.name.startsWith("chromium")) {
    await expectSuccessfulLocalRoute(page, contract.academyPath);
    await expectSuccessfulLocalRoute(page, contract.arenaPath);
  }

  const switchToLight = page.getByRole("button", { name: contract.themeToLight });
  await expect(switchToLight).toBeVisible();
  await switchToLight.click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: contract.themeToDark })).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

  if (contract.formFactor === "desktop") {
    const trigger = page.getByRole("button", { name: contract.knowledge });
    await trigger.focus();
    await trigger.press("ArrowDown");
    const menu = page.getByRole("menu", { name: contract.knowledge });
    await expect(menu).toBeVisible();
    const arenaLink = menu.getByRole("menuitem", { name: contract.arena });
    await expect(arenaLink).toBeVisible();
    await expect(arenaLink).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  } else {
    const menuTrigger = page.getByRole("button", { name: contract.menu });
    await menuTrigger.click();
    const knowledgeTrigger = page.getByRole("button", { name: contract.knowledge });
    await knowledgeTrigger.click();
    await expect(
      page
        .locator("#tecpey-mobile-knowledge-center-menu")
        .getByRole("link", { name: contract.arena }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menuTrigger).toHaveAttribute("aria-expanded", "false");
  }

  const mentorTrigger = page.getByRole("button", { name: contract.mentor });
  await expect(mentorTrigger).toBeVisible();
  await mentorTrigger.click();
  const dialog = page.getByRole("dialog", { name: contract.mentorTitle });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    contract.locale === "en" ? "does not provide guaranteed-profit" : "وعده سود تضمینی",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(mentorTrigger).toBeFocused();

  await page.locator("footer").scrollIntoViewIfNeeded();
  const finalFooterLink = page.locator("footer a").last();
  await expect(finalFooterLink).toBeVisible();
  const [mentorBox, footerLinkBox] = await Promise.all([
    mentorTrigger.boundingBox(),
    finalFooterLink.boundingBox(),
  ]);
  expect(
    rectanglesOverlap(mentorBox, footerLinkBox),
    "fixed Mentor entry covers the final Footer link",
  ).toBe(false);
  await expectNoHorizontalOverflow(page);

  await assertAccessibility(page, testInfo);

  if (testInfo.project.name === "chromium-fa-mobile") {
    const degradedPage = await context.newPage();
    trackRuntimeErrors(degradedPage, errors);
    await degradedPage.emulateMedia({ reducedMotion: "reduce" });
    await degradedPage.addInitScript(() => {
      Object.defineProperty(window, "IntersectionObserver", {
        configurable: true,
        writable: true,
        value: undefined,
      });
    });
    await openPublicPage(degradedPage, contract);
    await degradedPage.locator("footer").scrollIntoViewIfNeeded();
    await expect(degradedPage.locator("footer")).toBeVisible();
    await expectNoHorizontalOverflow(degradedPage);
    await degradedPage.close();
  }
});
