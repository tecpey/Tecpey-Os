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

requirePattern(runner, /const maxTestsPerProject = [5-9]\d*;/, "runner-project-timeout-budget");

console.log("Academy/Arena/Mentor accessibility evidence check passed.");
