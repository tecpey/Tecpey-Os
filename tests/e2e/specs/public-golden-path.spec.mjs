import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const runtimeErrors = new WeakMap();
const cspViolationEvidence = new WeakMap();

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
        arenaHeading: /Trading Arena/i,
        arenaRiskFree: /no real money, real profit or real trade/i,
        primaryCtas: ["Enter Academy", "View trading tools"],
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
        arenaHeading: /تریدینگ آرنا/,
        arenaRiskFree: /هیچ پول واقعی، سود واقعی یا معاملهٔ واقعی/,
        primaryCtas: ["آکادمی رایگان", "ورود به آکادمی رایگان تک‌پی", "مشاهده ابزارهای ترید"],
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
  // The public landing's CryptoNewsCenter fetches /api/crypto-news on mount.
  // That route resolves live upstream news and can take ~60s in CI, which stalls
  // the server worker and turns the theme-persistence page.reload below into a
  // 60s navigation timeout (a recurring firefox-fa-desktop flake). Returning a
  // response with no `items` array makes the component keep its deterministic
  // built-in fallback, so the news surface still renders without the slow call.
  await context.route("**/api/crypto-news**", (route) =>
    json(route, { mode: "fallback", updatedAt: "2026-01-01T00:00:00.000Z" }),
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

function normalizeCspViolationRecord(value) {
  const record = value && typeof value === "object" ? value : {};
  const effectiveDirective =
    String(record.effectiveDirective || "unknown")
      .toLowerCase()
      .match(/^[a-z][a-z0-9-]{0,63}$/)?.[0] || "unknown";
  const disposition = record.disposition === "report" ? "report" : "enforce";
  const rawBlocked = String(record.blockedTarget || "").trim();
  const safeToken = /^(?:blob|data|eval|inline|self|wasm-eval|redacted):?$/i.test(
    rawBlocked,
  );
  let blockedTarget = safeToken
    ? rawBlocked.toLowerCase().replace(/:$/, "")
    : "redacted";
  if (!safeToken) {
    try {
      const parsed = new URL(rawBlocked);
      if (["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
        blockedTarget = parsed.origin;
      }
    } catch {
      blockedTarget = "redacted";
    }
  }
  return { effectiveDirective, disposition, blockedTarget };
}

async function installCspViolationObserver(page) {
  const evidence = [];
  cspViolationEvidence.set(page, evidence);
  await page.exposeBinding(
    "__tecpeyRecordCspViolation",
    (_source, violation) => {
      evidence.push(normalizeCspViolationRecord(violation));
    },
  );
  await page.addInitScript(() => {
    const pendingDeliveries = new Set();
    Object.defineProperty(window, "__tecpeyPendingCspViolationDeliveries", {
      configurable: false,
      value: pendingDeliveries,
      writable: false,
    });
    document.addEventListener("securitypolicyviolation", (event) => {
      const rawBlocked = String(event.blockedURI || "").trim();
      const safeToken = /^(?:blob|data|eval|inline|self|wasm-eval):?$/i.test(
        rawBlocked,
      );
      let blockedTarget = safeToken
        ? rawBlocked.toLowerCase().replace(/:$/, "")
        : "redacted";
      if (!safeToken) {
        try {
          const parsed = new URL(rawBlocked);
          if (["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
            blockedTarget = parsed.origin;
          }
        } catch {
          blockedTarget = "redacted";
        }
      }
      const delivery = Promise.resolve(
        window.__tecpeyRecordCspViolation({
          effectiveDirective:
            String(event.effectiveDirective || "unknown")
              .toLowerCase()
              .match(/^[a-z][a-z0-9-]{0,63}$/)?.[0] || "unknown",
          disposition: event.disposition === "report" ? "report" : "enforce",
          blockedTarget,
        }),
      );
      pendingDeliveries.add(delivery);
      void delivery.then(
        () => pendingDeliveries.delete(delivery),
        () => pendingDeliveries.delete(delivery),
      );
    });
  });
}

async function waitForPendingCspViolationDeliveries(page) {
  // This drain runs in afterEach on every test. The page's execution context can
  // be torn down between the last interaction and this drain — Firefox's Juggler
  // disposes the connector, the test ends, or the context is destroyed — which
  // made page.evaluate throw ("Test ended" / "is disposed" / "Target closed")
  // and flaked otherwise-passing tests. A gone page has no further CSP
  // deliveries to await, so treat those lifecycle races as already drained.
  // Genuine evaluate errors still propagate.
  if (page.isClosed()) return;
  try {
    await page.evaluate(async () => {
      const settle = () =>
        Promise.allSettled([
          ...(window.__tecpeyPendingCspViolationDeliveries ?? []),
        ]);

      // Cross two task boundaries so a CSP event queued at the end of the
      // preceding interaction can register its binding promise before draining.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await settle();
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      page.isClosed() ||
      /Test ended|is disposed|Target (?:closed|crashed)|Execution context was destroyed|windowGlobalChild|has been closed/i.test(
        message,
      )
    ) {
      return;
    }
    throw error;
  }
}

function cspViolations(page) {
  return [...(cspViolationEvidence.get(page) ?? [])];
}

function clearCspViolations(page) {
  const evidence = cspViolationEvidence.get(page);
  if (evidence) evidence.length = 0;
}

async function expectNoCspViolations(
  page,
  testInfo,
  attachmentName,
  contextLabel,
) {
  await waitForPendingCspViolationDeliveries(page);
  const violations = cspViolations(page);
  if (violations.length > 0) {
    await testInfo.attach(attachmentName, {
      body: Buffer.from(JSON.stringify(violations, null, 2), "utf8"),
      contentType: "application/json",
    });
  }
  expect(
    violations,
    `${contextLabel} emitted Content Security Policy violations`,
  ).toEqual([]);
}

function expectStrictConnectPolicy(response, path) {
  const csp = response?.headers()["content-security-policy"];
  expect(csp, `${path}: Content-Security-Policy header is missing`).toBeTruthy();
  const connectDirective = csp
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("connect-src "));
  expect(connectDirective, `${path}: connect-src directive is missing`).toBeTruthy();
  const sources = connectDirective.split(/\s+/).slice(1);
  for (const broadSource of ["http:", "https:", "ws:", "wss:", "*"]) {
    expect(
      sources,
      `${path}: connect-src includes broad source ${broadSource}`,
    ).not.toContain(broadSource);
  }
}

async function openPublicPage(page, contract) {
  const response = await page.goto(contract.path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `HTTP status for ${contract.path}`).toBeLessThan(400);
  expectStrictConnectPolicy(response, contract.path);
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

async function governedPrimaryCtas(page, contract) {
  const links = contract.primaryCtas.map((name) =>
    page.getByRole("link", { name, exact: true }),
  );
  return links.reduce((all, locator) => all.or(locator));
}

async function expectMajorSectionsVisible(page, contract) {
  const sections = page.locator("main > section:has(h1, h2)");
  const count = await sections.count();
  expect(count, `no governed major sections were found on ${contract.path}`).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const section = sections.nth(index);
    const heading = section.locator("h1, h2").first();
    const headingText = (await heading.innerText()).trim();
    const label = headingText || `section ${index + 1}`;
    await section.scrollIntoViewIfNeeded();
    await expect(section, `${contract.path}: ${label} section is hidden`).toBeVisible();
    await expect(heading, `${contract.path}: ${label} heading is hidden`).toBeVisible();
    const state = await section.evaluate((element) => {
      let current = element;
      let effectiveOpacity = 1;
      while (current) {
        const style = getComputedStyle(current);
        effectiveOpacity *= Number.parseFloat(style.opacity || "1");
        if (style.display === "none" || style.visibility === "hidden") {
          return { effectiveOpacity, hiddenByStyle: true, hiddenBySemantics: false };
        }
        current = current.parentElement;
      }
      return {
        effectiveOpacity,
        hiddenByStyle: false,
        hiddenBySemantics: Boolean(element.closest('[aria-hidden="true"]')),
      };
    });
    expect(state.hiddenByStyle, `${contract.path}: ${label} remains hidden by CSS`).toBe(false);
    expect(state.hiddenBySemantics, `${contract.path}: ${label} remains aria-hidden`).toBe(false);
    expect(state.effectiveOpacity, `${contract.path}: ${label} remains transparent`).toBeGreaterThan(0.01);
  }
}

async function visibleFixedControlSurfaces(page) {
  return page.locator("body *").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.position !== "fixed" && style.position !== "sticky") return false;
        if (!element.matches('a[href], button, input, select, textarea, [tabindex]') &&
          !element.querySelector('a[href], button, input, select, textarea, [tabindex]')) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        if (style.display === "none" || style.visibility === "hidden") return false;
        return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      })
      .filter((element, _index, candidates) =>
        !candidates.some((candidate) => candidate !== element && candidate.contains(element)),
      )
      .map((element, index) => {
        const interactive = element.matches('a[href], button, input, select, textarea, [tabindex]')
          ? [element]
          : Array.from(element.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'));
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") || element.getAttribute("role") || element.tagName.toLowerCase() + `#${index + 1}`,
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          interactive: interactive
            .filter((control) => {
              const controlStyle = getComputedStyle(control);
              const controlRect = control.getBoundingClientRect();
              return controlStyle.display !== "none" &&
                controlStyle.visibility !== "hidden" &&
                controlRect.width > 0 &&
                controlRect.height > 0;
            })
            .map((control) => ({
              name: control.getAttribute("aria-label") || control.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || control.tagName.toLowerCase(),
              disabled: control.matches(":disabled") || control.getAttribute("aria-disabled") === "true",
              tabIndex: control.tabIndex,
            })),
        };
      }),
  );
}

async function expectCtasClearOfFixedControls(page, contract) {
  const ctas = await governedPrimaryCtas(page, contract);
  const count = await ctas.count();
  expect(count, `${contract.path}: no governed primary CTA was rendered`).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const cta = ctas.nth(index);
    if (!(await cta.isVisible())) continue;
    const name = ((await cta.innerText()) || (await cta.getAttribute("aria-label")) || `CTA ${index + 1}`).trim();
    await cta.scrollIntoViewIfNeeded();
    await expect(cta, `${contract.path}: ${name} CTA is obscured`).toBeVisible();
    const box = await cta.boundingBox();
    expect(box, `${contract.path}: ${name} CTA has no rendered box`).not.toBeNull();
    if (!box) continue;
    const viewport = page.viewportSize();
    expect(box.x, `${contract.path}: ${name} CTA is left of the viewport`).toBeGreaterThanOrEqual(0);
    expect(box.y, `${contract.path}: ${name} CTA is above the viewport`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${contract.path}: ${name} CTA exceeds viewport width`).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height, `${contract.path}: ${name} CTA exceeds viewport height`).toBeLessThanOrEqual(viewport.height + 1);

    const surfaces = await visibleFixedControlSurfaces(page);
    for (const surface of surfaces) {
      const containsItsOwnCta =
        surface.box.x <= box.x &&
        surface.box.y <= box.y &&
        surface.box.x + surface.box.width >= box.x + box.width &&
        surface.box.y + surface.box.height >= box.y + box.height &&
        surface.interactive.some((control) => control.name === name);
      if (!containsItsOwnCta) {
        expect(
          rectanglesOverlap(box, surface.box),
          `${contract.path}: fixed/sticky ${surface.label} overlaps primary CTA ${name}`,
        ).toBe(false);
      }
      expect(surface.interactive.length, `${contract.path}: ${surface.label} has no keyboard control`).toBeGreaterThan(0);
      for (const control of surface.interactive) {
        expect(control.disabled, `${contract.path}: fixed control ${control.name} is disabled`).toBe(false);
        expect(control.tabIndex, `${contract.path}: fixed control ${control.name} is not keyboard reachable`).toBeGreaterThanOrEqual(0);
      }
    }
  }
}

async function collectGovernedInternalTargets(page, contract) {
  const ctas = await governedPrimaryCtas(page, contract);
  const groups = [page.locator("nav"), page.locator("footer")];
  const hrefs = [];
  if (contract.formFactor === "desktop") {
    const knowledgeTrigger = page.getByRole("button", { name: contract.knowledge });
    await knowledgeTrigger.click();
    await expect(page.getByRole("menu", { name: contract.knowledge })).toBeVisible();
  } else {
    const menuTrigger = page.getByRole("button", { name: contract.menu });
    await menuTrigger.click();
    await page.getByRole("button", { name: contract.knowledge }).click();
    await expect(page.locator("#tecpey-mobile-knowledge-center-menu")).toBeVisible();
  }
  for (const group of groups) {
    hrefs.push(...(await group.locator("a[href]").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    )));
  }
  hrefs.push(...(await ctas.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  )));
  await page.keyboard.press("Escape");

  const origin = new URL(page.url()).origin;
  const targets = new Set();
  for (const rawHref of hrefs) {
    expect(rawHref, `${contract.path}: governed link has an empty href`).toBeTruthy();
    expect(rawHref, `${contract.path}: governed link uses placeholder href ${rawHref}`).not.toMatch(/^#|^javascript:|^about:blank$/i);
    let url;
    try {
      url = new URL(rawHref, origin);
    } catch {
      throw new Error(`${contract.path}: malformed governed link ${rawHref}`);
    }
    if (url.origin !== origin) continue;
    expect(url.pathname, `${contract.path}: unsupported production-only target ${url.pathname}`).not.toMatch(/^\/(?:exchange|trade|trading)(?:\/|$)/i);
    url.hash = "";
    targets.add(`${url.pathname}${url.search}`);
  }
  return [...targets].sort();
}

async function expectGovernedTargetsHealthy(page, contract) {
  const targets = await collectGovernedInternalTargets(page, contract);
  expect(targets.length, `${contract.path}: no governed internal targets were found`).toBeGreaterThan(0);
  const origin = new URL(page.url()).origin;
  await Promise.all(targets.map(async (target) => {
    const response = await page.request.get(target, { maxRedirects: 5, timeout: 15_000 });
    const finalUrl = new URL(response.url());
    expect(response.status(), `${contract.path}: ${target} resolved with HTTP ${response.status()}`).toBeGreaterThanOrEqual(200);
    expect(response.status(), `${contract.path}: ${target} resolved with HTTP ${response.status()}`).toBeLessThan(300);
    expect(finalUrl.origin, `${contract.path}: ${target} redirected outside the governed server`).toBe(origin);
  }));
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
  await installCspViolationObserver(page);
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
  await expectNoCspViolations(
    page,
    testInfo,
    "csp-violations-sanitized",
    "public page",
  );
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

  // A dedicated Trading Arena section must be part of the public landing
  // narrative (#80 defect 3) — not merely a nav link — with the honest,
  // fully-educational positioning and a link into the Arena journey.
  const arenaSection = page.locator("#trading-arena");
  await arenaSection.scrollIntoViewIfNeeded();
  await expect(arenaSection, "public landing is missing a dedicated Trading Arena section").toBeVisible();
  await expect(arenaSection.getByRole("heading", { name: contract.arenaHeading })).toBeVisible();
  await expect(
    arenaSection,
    "Arena section must state it is fully educational with no real money",
  ).toContainText(contract.arenaRiskFree);
  await expect(
    arenaSection.getByRole("link", { name: contract.arena }).first(),
  ).toHaveAttribute("href", new RegExp(`${contract.arenaPath.replace(/[/]/g, "\\/")}$`));

  if (testInfo.project.name.startsWith("chromium")) {
    await expectSuccessfulLocalRoute(page, contract.academyPath);
    await expectSuccessfulLocalRoute(page, contract.arenaPath);
  }

  const switchToLight = page.getByRole("button", { name: contract.themeToLight });
  await expect(switchToLight).toBeVisible();
  await switchToLight.click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
  await waitForPendingCspViolationDeliveries(page);
  // A generous reload budget: the mobile-emulated projects can exceed the 30s
  // default under CI load, and the assertions below already auto-wait for the
  // rehydrated content, so a slow navigation should not fail the run.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
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

  await expectGovernedTargetsHealthy(page, contract);
  await expectCtasClearOfFixedControls(page, contract);

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

  if (testInfo.project.name.startsWith("chromium")) {
    const degradedPage = await context.newPage();
    trackRuntimeErrors(degradedPage, errors);
    await installCspViolationObserver(degradedPage);
    try {
      await degradedPage.emulateMedia({ reducedMotion: "reduce" });
      await degradedPage.addInitScript(() => {
        Object.defineProperty(window, "IntersectionObserver", {
          configurable: true,
          writable: true,
          value: undefined,
        });
      });
      await openPublicPage(degradedPage, contract);
      await expectMajorSectionsVisible(degradedPage, contract);
      await degradedPage.locator("footer").scrollIntoViewIfNeeded();
      await expect(degradedPage.locator("footer")).toBeVisible();
      await expectNoHorizontalOverflow(degradedPage);
      await expectNoCspViolations(
        degradedPage,
        testInfo,
        "degraded-page-csp-violations-sanitized",
        "degraded public page",
      );
    } finally {
      await degradedPage.close();
    }
  }
});

test("market search resets pagination before requesting the filtered result", async ({ context, page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-fa-mobile",
    "One governed Chromium interaction run is sufficient for this locale-independent state transition.",
  );

  await context.unroute("**/api/v1/user/currency/list**");
  await context.route("**/api/v1/user/currency/list**", async (route) => {
    const url = new URL(route.request().url());
    const requestedPage = Number(url.searchParams.get("page") ?? "1");
    const symbol = url.searchParams.get("symbol") ?? "";
    const data = symbol
      ? [{
          id: "eth",
          symbol: "ETH",
          name: "Ethereum",
          priceData: {
            symbol: "ETHUSDT",
            last: "3520.10",
            changePercent: "-0.42",
          },
        }]
      : requestedPage === 2
        ? [{
            id: "ton",
            symbol: "TON",
            name: "Toncoin",
            priceData: {
              symbol: "TONUSDT",
              last: "7.18",
              changePercent: "2.04",
            },
          }]
        : [{
            id: "btc",
            symbol: "BTC",
            name: "Bitcoin",
            priceData: {
              symbol: "BTCUSDT",
              last: "67420.25",
              changePercent: "1.25",
            },
          }];
    await json(route, {
      data,
      meta: {
        current_page: requestedPage,
        last_page: symbol ? 1 : 2,
      },
    });
  });

  const response = await page.goto("/markets", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.locator('div[role="button"]').filter({ hasText: "Bitcoin" })).toBeVisible();

  const nextPage = page.locator("button:has(svg.lucide-chevrons-right)");
  const pageTwoRequest = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname.endsWith("/api/v1/user/currency/list") &&
      url.searchParams.get("page") === "2" &&
      url.searchParams.get("symbol") === "";
  });
  await nextPage.click();
  await pageTwoRequest;
  await expect(page.locator('div[role="button"]').filter({ hasText: "Toncoin" })).toBeVisible();

  const firstPageSearch = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname.endsWith("/api/v1/user/currency/list") &&
      url.searchParams.get("page") === "1" &&
      url.searchParams.get("symbol") === "ETH";
  });
  await page.getByPlaceholder("جستجو بر اساس نام ارز یا نماد...").fill("ETH");
  await firstPageSearch;
  await expect(page.locator('div[role="button"]').filter({ hasText: "Ethereum" })).toBeVisible();
  await expect(page.locator('div[role="button"]').filter({ hasText: "Toncoin" })).toHaveCount(0);
});

test("CSP evidence remains available after a document reload", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-fa-mobile",
    "One governed Chromium run is sufficient for the observer lifecycle contract.",
  );

  await page.goto(
    "data:text/html,%3Ctitle%3ECSP%20observer%20lifecycle%20probe%3C%2Ftitle%3E",
    { waitUntil: "domcontentloaded" },
  );
  await page.evaluate(() => {
    const violation = new Event("securitypolicyviolation");
    Object.defineProperties(violation, {
      blockedURI: {
        value: "https://probe.invalid/private/path?secret=redacted",
      },
      disposition: { value: "enforce" },
      effectiveDirective: { value: "connect-src" },
    });
    document.dispatchEvent(violation);
  });
  await waitForPendingCspViolationDeliveries(page);
  expect(cspViolations(page)).toEqual([
    {
      effectiveDirective: "connect-src",
      disposition: "enforce",
      blockedTarget: "https://probe.invalid",
    },
  ]);

  await waitForPendingCspViolationDeliveries(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  expect(cspViolations(page)).toEqual([
    {
      effectiveDirective: "connect-src",
      disposition: "enforce",
      blockedTarget: "https://probe.invalid",
    },
  ]);
  clearCspViolations(page);
});
