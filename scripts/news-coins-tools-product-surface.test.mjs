import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { evaluateNewsCoinsToolsProductSurface } from "./check-news-coins-tools-product-surface.mjs";

const ROOT = process.cwd();
let tempRoot;

const TEXT_PATHS = [
  "package.json",
  ".github/workflows/ci.yml",
  "src/lib/trading-tools-growth.ts",
  "src/components/tools/TradingToolsClient.tsx",
  "src/app/trading-tools/[slug]/page.tsx",
  "src/app/en/trading-tools/[slug]/page.tsx",
  "src/lib/news-detail-pages.ts",
  "src/app/crypto-news/[slug]/page.tsx",
  "src/app/en/crypto-news/[slug]/page.tsx",
  "src/app/coins/[slug]/page.tsx",
  "src/data/generated/coinGrowthSnapshot.json",
  "src/data/generated/toolGrowthSnapshot.json",
];

function copyFixtureRoot() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "tecpey-issue83-surface-"));
  for (const relativePath of TEXT_PATHS) {
    const sourcePath = path.join(ROOT, relativePath);
    const targetPath = path.join(target, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
  return target;
}

function replaceInFixture(relativePath, from, to = "") {
  const fullPath = path.join(tempRoot, relativePath);
  const original = fs.readFileSync(fullPath, "utf8");
  assert.match(original, typeof from === "string" ? new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : from);
  fs.writeFileSync(fullPath, original.replace(from, to));
}

beforeEach(() => {
  tempRoot = copyFixtureRoot();
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("current repository satisfies the issue #83 product surface guard", () => {
  assert.deepEqual(evaluateNewsCoinsToolsProductSurface(ROOT), []);
});

test("guard rejects removing the tool safe-use contract from detail pages", () => {
  replaceInFixture("src/app/trading-tools/[slug]/page.tsx", "قرارداد استفاده امن");
  const errors = evaluateNewsCoinsToolsProductSurface(tempRoot);
  assert.ok(errors.some((error) => error.includes("fa tool detail")));
});

test("guard rejects collapsing the news editorial boundary", () => {
  replaceInFixture("src/lib/news-detail-pages.ts", "AI-assisted summary boundary");
  const errors = evaluateNewsCoinsToolsProductSurface(tempRoot);
  assert.ok(errors.some((error) => error.includes("news AI summary boundary")));
});

test("guard rejects disconnecting issue #83 from release and CI", () => {
  replaceInFixture("package.json", "npm run content:issue83:surface:check && ");
  replaceInFixture(".github/workflows/ci.yml", "News coins tools product surface guard");
  const errors = evaluateNewsCoinsToolsProductSurface(tempRoot);
  assert.ok(errors.some((error) => error.includes("release:check issue83 guard")));
  assert.ok(errors.some((error) => error.includes("CI issue83 guard")));
});
