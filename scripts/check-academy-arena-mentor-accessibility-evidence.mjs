import { readFileSync } from "node:fs";

const specPath = "tests/e2e/specs/academy-arena-mentor-accessibility.spec.mjs";
const configPath = "tests/e2e/playwright.config.mjs";
const runnerPath = "tests/e2e/run-public-e2e.mjs";

function read(path) {
  return readFileSync(path, "utf8");
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`academy_arena_mentor_a11y_evidence_missing:${label}`);
  }
}

function requirePattern(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`academy_arena_mentor_a11y_evidence_missing:${label}`);
  }
}

const spec = read(specPath);
const config = read(configPath);
const runner = read(runnerPath);

for (const project of [
  "chromium-fa-mobile",
  "chromium-en-desktop",
  "firefox-fa-desktop",
  "firefox-en-mobile",
]) {
  requireText(config, `name: "${project}"`, `project:${project}`);
}

for (const path of [
  "/academy",
  "/en/academy",
  "/academy/trading-arena",
  "/en/academy/trading-arena",
  "/academy/mentor-coach",
  "/en/academy/mentor-coach",
]) {
  requireText(spec, `path: "${path}"`, `surface:${path}`);
}

for (const evidence of [
  "axe-core/axe.min.js",
  "wcag22aa",
  "page.screenshot",
  "expectNoHorizontalOverflow",
  "expectKeyboardReachable",
  "expectPrimaryTargetSize",
  "html dir",
  "html lang",
  "api/trading-arena/execution",
]) {
  requireText(spec, evidence, `evidence:${evidence}`);
}

// QA-051 asks for five checks and for evidence that survives the run. The spec
// used to emit Playwright attachments only, which live inside a report rather
// than as an artifact anyone can verify afterwards. These entries keep the
// recording attached to the checks: losing either half turns the control back
// into a claim.
for (const evidence of [
  "await assertReducedMotion(page, viewport, surface.path)",
  "await captureFocusOrder(page, viewport, surface.path)",
  "prefers-reduced-motion",
  "color-contrast",
  "focusVisible",
  "followsDomOrder",
  "recordCheck(\"axe\"",
  "recordCheck(\"keyboard\"",
  "recordCheck(\"focus\"",
  "recordCheck(\"contrast\"",
  "recordCheck(\"reducedMotion\"",
  "AXE_RULE_TAGS",
]) {
  requireText(spec, evidence, `qa051:${evidence}`);
}

// Deliberately a pattern and not a substring. "writeEvidenceShard(viewport)" is
// also a substring of the function's own definition line, so requiring the text
// would stay satisfied after the only call site was deleted — the guard would
// report coverage it no longer had. An indented call statement ending in a
// semicolon is something the declaration cannot be.
requirePattern(spec, /^[ \t]+writeEvidenceShard\(viewport\);$/m, "qa051:shard-write-call");

requirePattern(runner, /const maxTestsPerProject = [5-9]\d*;/, "runner-project-timeout-budget");

console.log("Academy/Arena/Mentor accessibility evidence check passed.");
