import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  MAX_EVIDENCE_AGE_DAYS,
  MIN_SCREENSHOT_BYTES,
  screenshotMatrixFindings,
} from "./ui-ux-screenshot-matrix-policy.mjs";

const SHA = "a".repeat(40);
const DIGEST = "b".repeat(64);
const NOW = new Date("2026-08-22T12:00:00.000Z");

const ROUTES = ["/", "/academy", "/en/academy"];
const VIEWPORTS = ["desktop-fa", "mobile-fa", "desktop-en", "mobile-en"];
const SHAPE = { routeCount: 3, viewportCount: 4, requiredSlots: 12 };

/** A distinct digest per slot — identical images are their own finding. */
function slotDigest(route, viewport) {
  const seed = `${route}@${viewport}`;
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash.toString(16).padStart(8, "0").repeat(8);
}

function bundle(overrides = {}) {
  const slots = [];
  for (const route of ROUTES) {
    for (const viewport of VIEWPORTS) {
      slots.push({
        route,
        viewport,
        requestedUrl: route,
        finalUrl: route,
        httpStatus: 200,
        sha256: slotDigest(route, viewport),
        bytes: 42_000,
        width: 1440,
        height: 3200,
      });
    }
  }
  return {
    root: {
      schemaVersion: 1,
      evidenceClass: "ui-ux-screenshot-matrix-v1",
      generatedAt: NOW.toISOString().replace(/\.\d{3}Z$/, ".000Z"),
      sourceCommitSha: SHA,
      routeCount: SHAPE.routeCount,
      requiredSlots: SHAPE.requiredSlots,
      slots,
    },
    rootDigest: DIGEST,
    triage: { reviewedSlots: 12, defects: [] },
    expectedShape: SHAPE,
    expectedRoutes: ROUTES,
    viewports: VIEWPORTS,
    digestOf: () => DIGEST,
    expectedSha: SHA,
    now: NOW,
    ...overrides,
  };
}

test("a complete matrix produces no findings", () => {
  assert.deepEqual(screenshotMatrixFindings(bundle()), []);
});

test("a slot that never rendered is refused", () => {
  // The failure a screenshot cannot report about itself: the file exists, so
  // the slot looks covered.
  const input = bundle();
  input.root.slots[0].httpStatus = 404;
  assert.ok(
    screenshotMatrixFindings(input).some((f) => f.includes("HTTP 404, not the declared 200")),
  );
});

test("a blank image is not a capture", () => {
  const input = bundle();
  input.root.slots[3].bytes = 900;
  assert.ok(
    screenshotMatrixFindings(input).some((f) => f.includes(`below ${MIN_SCREENSHOT_BYTES}`)),
  );
});

test("one image cannot be filed under several slots", () => {
  // Keeps the count right while covering a fraction of the matrix.
  const input = bundle();
  input.root.slots[1].sha256 = input.root.slots[0].sha256;
  assert.ok(
    screenshotMatrixFindings(input).some((f) => f.includes("one screenshot cannot cover two slots")),
  );
});

test("two routes that both redirect to the same page may share an image", () => {
  // Not every repeat is a lie. Two routes that both redirect to the same page
  // genuinely produce one picture, so the rule turns on whether both declared
  // that destination rather than on the bytes alone.
  const input = bundle();
  const shared = slotDigest("/shared", "desktop-fa");
  for (const index of [0, 4]) {
    input.root.slots[index].expectRedirectTo = "/signin";
    input.root.slots[index].finalUrl = "/signin";
    input.root.slots[index].sha256 = shared;
  }
  assert.deepEqual(screenshotMatrixFindings(input), []);
});

test("an undeclared redirect means the file is a picture of another page", () => {
  const input = bundle();
  input.root.slots[2].finalUrl = "/signin";
  assert.ok(
    screenshotMatrixFindings(input).some((f) => f.includes("no declared redirect")),
  );
});

test("a declared redirect that landed elsewhere is refused", () => {
  const input = bundle();
  input.root.slots[2].expectRedirectTo = "/signin";
  input.root.slots[2].finalUrl = "/somewhere-else";
  assert.ok(
    screenshotMatrixFindings(input).some((f) => f.includes("landed on /somewhere-else")),
  );
});

test("a missing route or viewport is a hole, not a rounding error", () => {
  const input = bundle();
  input.root.slots = input.root.slots.filter(
    (slot) => !(slot.route === "/en/academy" && slot.viewport === "mobile-en"),
  );
  const findings = screenshotMatrixFindings(input);
  assert.ok(findings.some((f) => f.includes("no capture for /en/academy at mobile-en")));
  assert.ok(findings.some((f) => f.includes("but the control requires 12")));
});

test("the same slot captured twice does not count as two", () => {
  const input = bundle();
  input.root.slots.push({ ...input.root.slots[0], sha256: slotDigest("/dup", "x") });
  assert.ok(
    screenshotMatrixFindings(input).some((f) => f.includes("is captured more than once")),
  );
});

test("declared shape must match the application", () => {
  const input = bundle();
  input.root.routeCount = 999;
  assert.ok(
    screenshotMatrixFindings(input).some((f) => f.includes("but the application has 3 routes")),
  );
});

test("an unresolved P0 or P1 visual defect blocks the control", () => {
  for (const severity of ["P0", "P1"]) {
    const input = bundle();
    input.triage.defects = [
      { severity, route: "/academy", status: "open", note: "header overlaps" },
    ];
    assert.ok(
      screenshotMatrixFindings(input).some((f) => f.includes("QA-050 closes on zero")),
      `${severity} open defect was accepted`,
    );
  }

  const resolved = bundle();
  resolved.triage.defects = [{ severity: "P1", route: "/academy", status: "resolved" }];
  assert.deepEqual(screenshotMatrixFindings(resolved), []);
});

test("triage that reviewed a different number of slots is refused", () => {
  const input = bundle();
  input.triage.reviewedSlots = 4;
  assert.ok(
    screenshotMatrixFindings(input).some((f) => f.includes("reviewed 4 slots")),
  );
});

test("evidence must be bound to the exact head and stay fresh", () => {
  assert.ok(
    screenshotMatrixFindings(bundle({ expectedSha: "f".repeat(40) })).some((f) =>
      f.includes("exact head"),
    ),
  );

  const stale = bundle();
  stale.root.generatedAt = new Date(NOW.getTime() - (MAX_EVIDENCE_AGE_DAYS + 1) * 86_400_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, ".000Z");
  assert.ok(screenshotMatrixFindings(stale).some((f) => f.includes("governed limit")));
});

test("a digest that does not bind to its bytes is refused", () => {
  const input = bundle({ digestOf: () => "c".repeat(64) });
  assert.ok(screenshotMatrixFindings(input).some((f) => f.includes("root digest")));
});

test("secrets cannot ride along in evidence", () => {
  const input = bundle();
  input.root.token = "x";
  assert.ok(screenshotMatrixFindings(input).length > 0);
});

test("an empty matrix fails closed rather than passing vacuously", () => {
  const input = bundle();
  input.root.slots = [];
  assert.ok(
    screenshotMatrixFindings(input).some((f) => f.includes("photographed nothing")),
  );
  assert.deepEqual(screenshotMatrixFindings({ root: null }), [
    "ui-ux-screenshot-matrix.json is missing or not an object",
  ]);
});

test("the policy age limit is the one the launch registry governs", () => {
  const registry = JSON.parse(
    readFileSync("config/enterprise-global-product-readiness.json", "utf8"),
  );
  assert.equal(
    registry.waveAExternalEvidenceTracker.maxEvidenceAgeDays,
    MAX_EVIDENCE_AGE_DAYS,
  );
});

test("a P0 or P1 defect filed as accepted is not resolved", () => {
  // "Accepted" is a decision to live with the defect, not a fix. Rejecting only
  // `open` would let a P0 be filed as accepted while the verifier announced
  // zero unresolved defects — the criterion answering a question nobody asked.
  for (const severity of ["P0", "P1"]) {
    const input = bundle();
    input.triage.defects = [{ severity, route: "/academy", status: "accepted" }];
    assert.ok(
      screenshotMatrixFindings(input).some((f) => f.includes("is accepted, not resolved")),
      `${severity} accepted was allowed to pass`,
    );
  }

  // Lower severities may be accepted; that is what the status is for.
  const accepted = bundle();
  accepted.triage.defects = [{ severity: "P2", route: "/markets", status: "accepted" }];
  assert.deepEqual(screenshotMatrixFindings(accepted), []);
});

test("a route may declare a non-200 status, but only the one it declared", () => {
  // An unknown credential id really is a 404, and that page is a public surface
  // worth photographing. Declaring it is what stops an accidental 404 elsewhere
  // from being waved through.
  const declared = bundle();
  declared.root.slots[0].expectStatus = 404;
  declared.root.slots[0].httpStatus = 404;
  assert.deepEqual(screenshotMatrixFindings(declared), []);

  const mismatched = bundle();
  mismatched.root.slots[0].expectStatus = 404;
  mismatched.root.slots[0].httpStatus = 500;
  assert.ok(
    screenshotMatrixFindings(mismatched).some((f) =>
      f.includes("HTTP 500, not the declared 404"),
    ),
  );

  // And a slot that declares nothing still has to be a 200.
  const undeclared = bundle();
  undeclared.root.slots[1].httpStatus = 404;
  assert.ok(
    screenshotMatrixFindings(undeclared).some((f) =>
      f.includes("HTTP 404, not the declared 200"),
    ),
  );
});
