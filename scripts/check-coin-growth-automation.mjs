import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const snapshotPath = path.join(root, "src/data/generated/coinGrowthSnapshot.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const errors = [];

function fail(code) {
  errors.push(code);
}

if (snapshot.schemaVersion !== 1) fail("coin_growth_schema_version_invalid");
if (snapshot.policyVersion !== "tecpey-coin-growth-policy-v1") fail("coin_growth_policy_version_invalid");
if (snapshot.stats?.exchangeEnabled !== 0) fail("coin_growth_exchange_auto_enable_forbidden");
if (!Array.isArray(snapshot.coins)) fail("coin_growth_coins_invalid");
if (!Array.isArray(snapshot.rejected)) fail("coin_growth_rejected_invalid");

const symbols = new Set();
const slugs = new Set();
for (const coin of snapshot.coins ?? []) {
  if (!/^[A-Z0-9]{2,12}$/.test(coin.symbol ?? "")) fail(`coin_growth_symbol_invalid:${coin.symbol}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(coin.slug ?? "")) fail(`coin_growth_slug_invalid:${coin.slug}`);
  if (symbols.has(coin.symbol)) fail(`coin_growth_duplicate_symbol:${coin.symbol}`);
  if (slugs.has(coin.slug)) fail(`coin_growth_duplicate_slug:${coin.slug}`);
  symbols.add(coin.symbol);
  slugs.add(coin.slug);

  if (coin.automation?.status !== "published_content") fail(`coin_growth_status_invalid:${coin.symbol}`);
  if (coin.automation?.exchangeCapability !== "manual_review_required") {
    fail(`coin_growth_exchange_gate_invalid:${coin.symbol}`);
  }
  if (!String(coin.automation?.officialWebsite ?? "").startsWith("https://")) {
    fail(`coin_growth_official_source_missing:${coin.symbol}`);
  }
  if (!Array.isArray(coin.useCases) || coin.useCases.length < 2) fail(`coin_growth_use_cases_missing:${coin.symbol}`);
  if (!Array.isArray(coin.risks) || coin.risks.length < 2) fail(`coin_growth_risks_missing:${coin.symbol}`);
  if (!Array.isArray(coin.faqs) || coin.faqs.length < 2) fail(`coin_growth_faqs_missing:${coin.symbol}`);
}

if ((snapshot.coins ?? []).length < 30) fail("coin_growth_published_count_too_low");
if (snapshot.stats?.publishedContent !== (snapshot.coins ?? []).length) fail("coin_growth_stats_mismatch");

if (errors.length) {
  console.error("Coin growth automation check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Coin growth automation check passed.");
