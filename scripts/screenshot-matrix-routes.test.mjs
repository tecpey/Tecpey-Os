import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DYNAMIC_ROUTE_SAMPLES,
  REQUIRED_VIEWPORTS,
  enumerateRoutePatterns,
  screenshotMatrixShape,
  screenshotMatrixTargets,
} from "./screenshot-matrix-routes.mjs";

/** A throwaway src/app tree, so the fail-closed paths can be exercised. */
function fakeApp(routes) {
  const root = mkdtempSync(path.join(tmpdir(), "qa050-"));
  for (const route of routes) {
    const directory = path.join(root, route === "/" ? "." : route.slice(1));
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "page.tsx"), "export default function P() {}\n");
  }
  return root;
}

test("the matrix shape is derived from the application, not declared", () => {
  const shape = screenshotMatrixShape();
  assert.equal(shape.viewportCount, 4);
  assert.equal(shape.requiredSlots, shape.routeCount * shape.viewportCount);
});

test("the derived shape is the shape the launch registry governs", () => {
  // The ledger's 175 routes and 700 slots were a number someone had counted
  // once. This is what stops them from being a number again.
  const registry = JSON.parse(
    readFileSync("config/enterprise-global-product-readiness.json", "utf8"),
  );
  const governed = registry.screenshotEvidenceMatrix;
  const shape = screenshotMatrixShape();

  assert.equal(
    shape.routeCount,
    governed.routeCount,
    `src/app has ${shape.routeCount} routes but the registry governs ${governed.routeCount}`,
  );
  assert.equal(shape.requiredSlots, governed.requiredSlots);
  assert.deepEqual(Object.keys(REQUIRED_VIEWPORTS).sort(), [...governed.viewports].sort());
});

test("a new dynamic route with no sample fails closed", () => {
  // The failure this guard exists for: without it the route is simply absent
  // from the matrix, and the control shrinks without anyone deciding it should.
  const root = fakeApp(["/", "/coins/[slug]", "/something-new/[id]"]);
  try {
    assert.throws(
      () => screenshotMatrixTargets(root),
      /No screenshot sample for: \/something-new\/\[id\]/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a sample for a route that no longer exists fails closed", () => {
  // The reverse drift: an entry that looks like coverage but photographs
  // nothing, because the route it names is gone.
  const root = fakeApp(["/", "/coins/[slug]"]);
  try {
    assert.throws(() => screenshotMatrixTargets(root), /no longer exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every dynamic route resolves to something requestable", () => {
  for (const target of screenshotMatrixTargets().filter((t) => t.dynamic)) {
    const requestable =
      typeof target.url === "string" || typeof target.resolveFromSitemapPrefix === "string";
    assert.ok(requestable, `${target.pattern} has no requestable URL`);
    if (typeof target.url === "string") {
      assert.ok(
        !target.url.includes("["),
        `${target.pattern} sample still contains a dynamic segment: ${target.url}`,
      );
    }
  }
});

test("a redirecting sample declares where it lands", () => {
  // Capturing /student/[studentId] unauthenticated photographs the sign-in
  // page. That is a real surface, but filing it as the student dashboard would
  // be a screenshot labelled as something it is not.
  for (const pattern of [
    "/student/[studentId]",
    "/student/[studentId]/credential/[credentialId]",
    "/academy/ai-guide/[slug]",
  ]) {
    const sample = DYNAMIC_ROUTE_SAMPLES[pattern];
    assert.equal(
      typeof sample?.expectRedirectTo,
      "string",
      `${pattern} redirects but does not declare where`,
    );
  }
});

test("static routes are their own capture target", () => {
  const targets = screenshotMatrixTargets();
  const home = targets.find((target) => target.pattern === "/");
  assert.deepEqual(home, { pattern: "/", url: "/", dynamic: false });
  assert.equal(targets.length, enumerateRoutePatterns().length);
});
