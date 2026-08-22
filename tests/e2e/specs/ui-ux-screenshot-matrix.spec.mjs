// QA-050 — capture the screenshot evidence matrix.
//
// Every route the application serves, photographed at this project's viewport,
// with what the browser actually did recorded alongside each image. The image
// itself proves very little: a PNG exists whether the page rendered, errored,
// redirected elsewhere or came out blank. The record is what carries the status,
// the URL the browser ended on and the digest of the bytes, and
// scripts/ui-ux-screenshot-matrix-policy.mjs refuses a bundle that cannot show
// those things.
//
// Runs as its own spec rather than inside the Golden Path, because 175 captures
// per project is a different order of cost from a smoke test.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  REQUIRED_VIEWPORTS,
  screenshotMatrixTargets,
} from "../../../scripts/screenshot-matrix-routes.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const EVIDENCE_ROOT = path.join(REPOSITORY_ROOT, "artifacts/ui-ux-screenshot-matrix");

// Binds every project of one invocation together. Without it the collector
// could merge a shard left behind by an earlier, partial run into a later
// bundle — a complete-looking matrix for a run that never finished.
const RUN_ID =
  process.env.TECPEY_A11Y_RUN_ID ?? `unbound-${process.pid}-${Date.now().toString(36)}`;
const SOURCE_COMMIT_SHA =
  process.env.TECPEY_EVIDENCE_SHA ?? process.env.NEXT_PUBLIC_GIT_COMMIT ?? null;

/** Playwright project name to the viewport name the ledger uses. */
const VIEWPORT_FOR_PROJECT = Object.fromEntries(
  Object.entries(REQUIRED_VIEWPORTS).map(([viewport, project]) => [project, viewport]),
);

/**
 * Resolve the targets whose sample URL cannot be written down.
 *
 * News detail slugs come from the live news authority, so a literal would be
 * stale by the time it was committed. The sitemap is generated from the same
 * data the pages read, so a slug taken from it cannot point at a page that does
 * not exist.
 */
async function resolveFromSitemap(request, baseURL, prefix) {
  const response = await request.get(`${baseURL}/sitemap.xml`);
  expect(response.ok(), "sitemap.xml must be available to resolve dynamic samples").toBe(true);
  const body = await response.text();
  const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
  const match = urls
    .map((url) => new URL(url).pathname)
    .find((pathname) => pathname.startsWith(prefix) && pathname.length > prefix.length);
  expect(match, `sitemap.xml carries no URL under ${prefix}`).toBeTruthy();
  return match;
}

// Opt-in, and deliberately so.
//
// 175 navigations per project is minutes of work, four times over, against a
// Golden Path job budgeted for a smoke test. Running it on every pull request
// would buy nothing — QA-050 evidence is only meaningful when captured on the
// protected staging host at an exact candidate commit — and would slow every
// unrelated change. The capture run sets this explicitly.
const CAPTURE_ENABLED = process.env.TECPEY_CAPTURE_SCREENSHOT_MATRIX === "1";

test.skip(
  !CAPTURE_ENABLED,
  "QA-050 capture is opt-in: set TECPEY_CAPTURE_SCREENSHOT_MATRIX=1 to run it",
);

test("every route is captured at this viewport with its render recorded", async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  // 175 full-page captures do not fit the 90s budget the smoke specs use.
  test.setTimeout(30 * 60_000);
  const viewport = VIEWPORT_FOR_PROJECT[testInfo.project.name];
  expect(viewport, `${testInfo.project.name} is not one of the QA-050 viewports`).toBeTruthy();

  const targets = screenshotMatrixTargets();
  const slots = [];
  const imageDirectory = path.join(EVIDENCE_ROOT, "images", viewport);
  mkdirSync(imageDirectory, { recursive: true });

  for (const target of targets) {
    const requestedUrl = target.resolveFromSitemapPrefix
      ? await resolveFromSitemap(request, baseURL, target.resolveFromSitemapPrefix)
      : target.url;

    const response = await page.goto(requestedUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    // Settle the layout before photographing it, or the capture records a
    // half-painted page and the triage inherits defects the user never sees.
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const image = await page.screenshot({ fullPage: true });
    const digest = createHash("sha256").update(image).digest("hex");
    const fileName = `${target.pattern.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "root"}.png`;
    writeFileSync(path.join(imageDirectory, fileName), image);

    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));

    slots.push({
      route: target.pattern,
      viewport,
      requestedUrl,
      finalUrl: new URL(page.url()).pathname,
      httpStatus: response?.status() ?? 0,
      sha256: digest,
      bytes: image.byteLength,
      width: dimensions.width,
      height: dimensions.height,
      image: `images/${viewport}/${fileName}`,
      ...(target.expectRedirectTo ? { expectRedirectTo: target.expectRedirectTo } : {}),
    });
  }

  mkdirSync(path.join(EVIDENCE_ROOT, "shards"), { recursive: true });
  writeFileSync(
    path.join(EVIDENCE_ROOT, "shards", `${viewport}.json`),
    `${JSON.stringify(
      { viewport, runId: RUN_ID, sourceCommitSha: SOURCE_COMMIT_SHA, slots },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // Asserted here as well as in the policy so a capture that silently skipped
  // routes fails where it happened, not three steps downstream.
  expect(slots.length, "every route must produce a slot").toBe(targets.length);
});
