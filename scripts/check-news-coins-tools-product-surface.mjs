import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_ROOT = process.cwd();

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(root, relativePath) {
  return JSON.parse(readText(root, relativePath));
}

function requireText(text, needle, label, errors) {
  if (!text.includes(needle)) errors.push(`${label}: missing ${needle}`);
}

function requireRegex(text, pattern, label, errors) {
  if (!pattern.test(text)) errors.push(`${label}: missing ${pattern}`);
}

function requireArray(value, min, label, errors) {
  if (!Array.isArray(value) || value.length < min) errors.push(`${label}: expected at least ${min} entries`);
}

export function evaluateNewsCoinsToolsProductSurface(root = DEFAULT_ROOT) {
  const errors = [];
  const packageJson = readJson(root, "package.json");
  const ci = readText(root, ".github/workflows/ci.yml");
  const releaseCheck = String(packageJson.scripts?.["release:check"] ?? "");
  const toolGrowth = readText(root, "src/lib/trading-tools-growth.ts");
  const toolClient = readText(root, "src/components/tools/TradingToolsClient.tsx");
  const toolFa = readText(root, "src/app/trading-tools/[slug]/page.tsx");
  const toolEn = readText(root, "src/app/en/trading-tools/[slug]/page.tsx");
  const newsModel = readText(root, "src/lib/news-detail-pages.ts");
  const newsFa = readText(root, "src/app/crypto-news/[slug]/page.tsx");
  const newsEn = readText(root, "src/app/en/crypto-news/[slug]/page.tsx");
  const coinsFa = readText(root, "src/app/coins/[slug]/page.tsx");
  const coinSnapshot = readJson(root, "src/data/generated/coinGrowthSnapshot.json");
  const toolSnapshot = readJson(root, "src/data/generated/toolGrowthSnapshot.json");

  requireText(toolGrowth, "export type TraderToolSurfaceContract", "tool surface contract type", errors);
  requireText(toolGrowth, "getTraderToolSurfaceContract", "tool surface contract builder", errors);
  requireText(toolGrowth, "suitableFor", "tool suitable-for contract", errors);
  requireText(toolGrowth, "notSuitableFor", "tool not-suitable-for contract", errors);
  requireText(toolGrowth, "riskNotes", "tool risk-note contract", errors);
  requireText(toolGrowth, "privacyAndPermissions", "tool privacy contract", errors);
  requireText(toolGrowth, "Do not grant withdrawal, trade-execution or admin permissions", "tool external-permission warning", errors);
  requireText(toolGrowth, "بدون approval جداگانه، مجوز برداشت", "tool fa external-permission warning", errors);

  for (const [label, source] of [
    ["fa tool detail", toolFa],
    ["en tool detail", toolEn],
  ]) {
    requireText(source, "getTraderToolSurfaceContract", label, errors);
    requireRegex(source, /Safe-use contract|قرارداد استفاده امن/, label, errors);
    requireRegex(source, /Risk notes|یادداشت‌های ریسک/, label, errors);
    requireRegex(source, /Privacy and permission risk|ریسک حریم خصوصی و مجوزها/, label, errors);
    requireRegex(source, /Official links|لینک رسمی و پلتفرم‌ها/, label, errors);
  }

  requireText(toolClient, "getTraderToolSurfaceContract", "tool modal contract", errors);
  requireText(toolClient, "safeContract", "tool modal safe contract label", errors);
  requireText(toolClient, "riskNotes", "tool modal risk-note contract", errors);
  requireText(toolClient, "privacyAndPermissions", "tool modal privacy contract", errors);

  requireText(newsModel, "export type NewsEditorialBoundaryCard", "news boundary card type", errors);
  requireText(newsModel, "getNewsEditorialBoundaryCards", "news boundary card builder", errors);
  requireText(newsModel, "Source fact", "news source fact boundary", errors);
  requireText(newsModel, "TecPey interpretation", "news TecPey interpretation boundary", errors);
  requireText(newsModel, "AI-assisted summary boundary", "news AI summary boundary", errors);
  requireText(newsModel, "واقعیت منبع", "news fa source fact boundary", errors);

  for (const [label, source] of [
    ["fa news detail", newsFa],
    ["en news detail", newsEn],
  ]) {
    requireText(source, "getNewsEditorialBoundaryCards", label, errors);
    requireRegex(source, /مرز خبر، تحلیل و خلاصه AI|News, interpretation and AI-summary boundary/, label, errors);
  }

  requireText(coinsFa, "پرونده کامل", "coin detail complete dossier", errors);
  requireText(coinsFa, "داده‌های عددی مهم برای تصمیم‌گیری", "coin market-data context", errors);
  requireText(coinsFa, "وب‌سایت رسمی", "coin official website", errors);
  requireText(coinsFa, "ریسک‌هایی که باید جدی بگیرید", "coin risk section", errors);
  requireText(coinsFa, "توصیه مالی", "coin no-financial-advice boundary", errors);

  requireArray(coinSnapshot.coins, 30, "coin growth published pages", errors);
  requireArray(toolSnapshot.tools, 24, "tool growth published pages", errors);
  if (coinSnapshot.stats?.exchangeEnabled !== 0) errors.push("coin growth must not auto-enable exchange listing");
  if (toolSnapshot.stats?.externalEnabled !== 0) errors.push("tool growth must not auto-enable external integrations");

  const scriptName = "content:issue83:surface:check";
  const testName = "test:content-issue83-surface";
  if (!packageJson.scripts?.[scriptName]) errors.push(`package.json missing ${scriptName}`);
  if (!packageJson.scripts?.[testName]) errors.push(`package.json missing ${testName}`);
  requireText(releaseCheck, `npm run ${scriptName}`, "release:check issue83 guard", errors);
  requireText(releaseCheck, `npm run ${testName}`, "release:check issue83 tests", errors);
  requireText(ci, "News coins tools product surface guard", "CI issue83 guard", errors);
  requireText(ci, `npm run ${scriptName}`, "CI issue83 guard script", errors);
  requireText(ci, "News coins tools product surface tests", "CI issue83 tests", errors);
  requireText(ci, `npm run ${testName}`, "CI issue83 test script", errors);

  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = evaluateNewsCoinsToolsProductSurface(DEFAULT_ROOT);
  if (errors.length) {
    console.error("News/Coins/Tools product surface check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("News/Coins/Tools product surface check passed.");
}
