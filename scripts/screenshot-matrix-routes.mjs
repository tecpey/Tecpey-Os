// QA-050 — the route authority for the screenshot evidence matrix.
//
// The controlled-launch ledger fixes the matrix at 175 routes by four
// viewports, 700 slots. Nothing in the repository could produce that list: the
// count lived in the ledger, the routes lived in src/app, and the two agreed
// only because someone had once counted. This module is the single place that
// answers "which routes", so the capture spec, the collector and the verifier
// cannot each answer it differently.
//
// The list is read from the filesystem rather than written down, so it cannot
// drift from the application. What is written down is the sample URL for each
// dynamic route, because `/coins/[slug]` is not a page you can photograph.

import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP_DIRECTORY = path.join(REPOSITORY_ROOT, "src/app");

/** The four viewports the ledger names, and the Playwright project covering each. */
export const REQUIRED_VIEWPORTS = {
  "desktop-fa": "firefox-fa-desktop",
  "mobile-fa": "chromium-fa-mobile",
  "desktop-en": "chromium-en-desktop",
  "mobile-en": "firefox-en-mobile",
};

/**
 * A sample that cannot be written down, because the value changes.
 *
 * News detail slugs come from the live news authority, so any literal here
 * would be stale by the time it was committed. The capture resolves one from
 * the running application's sitemap instead.
 */
function resolvedFromSitemap(prefix) {
  return { resolveFromSitemapPrefix: prefix };
}

/**
 * A representative URL for every dynamic route, and where the value comes from.
 *
 * Hard-coded values rot, so three things guard them. `screenshotMatrixTargets`
 * throws when a dynamic route has no entry here, which turns adding a route
 * into a decision someone has to make rather than a silent hole in the matrix.
 * The reverse is also checked — an entry naming a route that no longer exists
 * is a failure, not dead weight. And the capture requires a 200 from every
 * target, so a slug that stops resolving fails the run loudly instead of
 * quietly photographing a not-found page.
 */
export const DYNAMIC_ROUTE_SAMPLES = {
  // src/data/academy.ts — academyArticles[0]
  "/academy/[slug]": "/academy/what-is-bitcoin",
  "/en/academy/[slug]": "/en/academy/what-is-bitcoin",
  // src/data/academy/term1Curriculum.ts — TERM1.slug, first lesson
  "/academy/learn/[termSlug]/[lessonIndex]": "/academy/learn/term-1/1",
  // src/data/coins.ts — coinPages[0]
  "/coins/[slug]": "/coins/bitcoin",
  "/en/coins/[slug]": "/en/coins/bitcoin",
  "/price/[slug]": "/price/bitcoin",
  "/crypto/[symbol]": "/crypto/BTC",
  // src/data/academy.ts — comparePages[0]
  "/compare/[slug]": "/compare/nobitex-vs-tecpey",
  "/en/compare/[slug]": "/en/compare/nobitex-vs-tecpey",
  // src/data/glossaryTerms.json — [0]
  "/glossary/[slug]": "/glossary/bitcoin",
  "/en/glossary/[slug]": "/en/glossary/bitcoin",
  // src/data/organicSeo.ts — learningSeoPages[0]
  "/learn/[slug]": "/learn/learn-crypto",
  // slugifyToolName(traderTools[0].name) — src/lib/tool-growth-automation.ts
  "/trading-tools/[slug]": "/trading-tools/tradingview",
  "/en/trading-tools/[slug]": "/en/trading-tools/tradingview",
  // Resolved at capture time — see resolvedFromSitemap above.
  "/crypto-news/[slug]": resolvedFromSitemap("/crypto-news/"),
  "/en/crypto-news/[slug]": resolvedFromSitemap("/en/crypto-news/"),
  // Redirect-only route: it sends every slug to the mentor chat anchor. The
  // capture records where it landed rather than claiming to have photographed
  // the route itself.
  "/academy/ai-guide/[slug]": {
    url: "/academy/ai-guide/mentor-chat",
    expectRedirectTo: "/academy/ai-guide",
  },
  // Authenticated surfaces. An unauthenticated capture lands on the sign-in
  // page, which is a real thing a visitor sees and worth a screenshot — but it
  // is not a picture of the student dashboard, so it is declared, not implied.
  "/student/[studentId]": {
    url: "/student/qa-050-sample-student",
    expectRedirectTo: "/signin",
  },
  "/student/[studentId]/credential/[credentialId]": {
    url: "/student/qa-050-sample-student/credential/qa-050-sample-credential",
    expectRedirectTo: "/signin",
  },
  // Certificate verification renders a "not found" state for an unknown id
  // rather than redirecting, and that state is itself a public surface.
  "/verify/[certificateId]": "/verify/qa-050-sample-certificate",
};

/** Every route pattern the application serves, read from src/app. */
export function enumerateRoutePatterns(appDirectory = APP_DIRECTORY) {
  const patterns = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "page.tsx") {
        const relative = path.relative(appDirectory, path.dirname(full));
        patterns.push(relative === "" ? "/" : `/${relative.split(path.sep).join("/")}`);
      }
    }
  };
  walk(appDirectory);
  return patterns.sort();
}

const DYNAMIC_SEGMENT = /\[[^/]+\]/;

/**
 * The capture targets: one per route pattern, with a URL that can be requested.
 *
 * Fails closed in both directions. A dynamic route with no sample would
 * otherwise be dropped from the matrix, quietly shrinking the control; a sample
 * for a route that no longer exists would otherwise sit here looking like
 * coverage.
 */
export function screenshotMatrixTargets(appDirectory = APP_DIRECTORY) {
  const patterns = enumerateRoutePatterns(appDirectory);
  const dynamic = patterns.filter((pattern) => DYNAMIC_SEGMENT.test(pattern));

  const missing = dynamic.filter((pattern) => !(pattern in DYNAMIC_ROUTE_SAMPLES));
  if (missing.length > 0) {
    throw new Error(
      `No screenshot sample for: ${missing.join(", ")}. Add one to ` +
        "DYNAMIC_ROUTE_SAMPLES in scripts/screenshot-matrix-routes.mjs. A dynamic " +
        "route with no representative URL cannot be captured, and leaving it out " +
        "would shrink the QA-050 matrix without anyone deciding to.",
    );
  }

  const orphaned = Object.keys(DYNAMIC_ROUTE_SAMPLES).filter(
    (pattern) => !patterns.includes(pattern),
  );
  if (orphaned.length > 0) {
    throw new Error(
      `Screenshot samples name routes that no longer exist: ${orphaned.join(", ")}.`,
    );
  }

  return patterns.map((pattern) => {
    if (!DYNAMIC_SEGMENT.test(pattern)) {
      return { pattern, url: pattern, dynamic: false };
    }
    const sample = DYNAMIC_ROUTE_SAMPLES[pattern];
    if (typeof sample === "string") {
      return { pattern, url: sample, dynamic: true };
    }
    return { pattern, dynamic: true, ...sample };
  });
}

/** Route count and slot count, derived rather than declared. */
export function screenshotMatrixShape(appDirectory = APP_DIRECTORY) {
  const routeCount = screenshotMatrixTargets(appDirectory).length;
  const viewportCount = Object.keys(REQUIRED_VIEWPORTS).length;
  return { routeCount, viewportCount, requiredSlots: routeCount * viewportCount };
}
