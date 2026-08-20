import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const snapshotPath = path.join(root, "src/data/generated/coinGrowthSnapshot.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const errors = [];
const ORGANIC_GROWTH_POLICY_EFFECTIVE_AT = Date.parse("2026-08-16T00:00:00.000Z");
const requiresStoredOrganicGrowth =
  Number.isFinite(Date.parse(snapshot.generatedAt ?? "")) &&
  Date.parse(snapshot.generatedAt) >= ORGANIC_GROWTH_POLICY_EFFECTIVE_AT;

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

function validOrganicGrowth(profile, expected) {
  return profile &&
    profile.policyVersion === "tecpey-organic-growth-policy-v1" &&
    profile.entityType === expected.entityType &&
    profile.locale === expected.locale &&
    profile.canonicalPath === expected.canonicalPath &&
    profile.canonicalUrl === `https://tecpey.ir${expected.canonicalPath}` &&
    profile.twitterCard === "summary_large_image" &&
    Array.isArray(profile.schemaTypes) &&
    profile.schemaTypes.includes("FAQPage") &&
    profile.schemaTypes.includes("BreadcrumbList") &&
    Array.isArray(profile.keywords) &&
    profile.keywords.length >= 3 &&
    Array.isArray(profile.entityTags) &&
    profile.entityTags.includes(`coin:${expected.symbol.toLowerCase()}`) &&
    Array.isArray(profile.internalLinks) &&
    profile.internalLinks.includes(expected.canonicalPath) &&
    String(profile.answerSummary ?? "").length >= 40 &&
    String(profile.llmSummary ?? "").length >= 80 &&
    /(توصیه مالی|سیگنال|financial advice|trading signal)/i.test(String(profile.safetyDisclaimer ?? ""));
}

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
  if (coin.organicGrowth && !validOrganicGrowth(coin.organicGrowth, {
    entityType: "coin",
    locale: "fa",
    canonicalPath: `/coins/${coin.slug}`,
    symbol: coin.symbol,
  })) {
    fail(`coin_growth_organic_profile_invalid:${coin.symbol}`);
  }
  if (requiresStoredOrganicGrowth && !coin.organicGrowth) {
    fail(`coin_growth_organic_profile_missing:${coin.symbol}`);
  }
}

if ((snapshot.coins ?? []).length < 30) fail("coin_growth_published_count_too_low");
if (snapshot.stats?.publishedContent !== (snapshot.coins ?? []).length) fail("coin_growth_stats_mismatch");

if (errors.length) {
  console.error("Coin growth automation check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Coin growth automation check passed.");
