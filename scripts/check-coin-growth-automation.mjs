import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const snapshotPath = path.join(root, "src/data/generated/coinGrowthSnapshot.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const errors = [];
const LEGACY_HOST_PIN_GENERATED_AT = "2026-08-10T12:29:21.460Z";

function fail(code) {
  errors.push(code);
}

function normalizeHost(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\.$/, "");
}

function officialHostForUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const hostname = normalizeHost(url.hostname);
    return hostname || null;
  } catch {
    return null;
  }
}

function officialWebsiteMatchesPinnedHost(website, pinnedHost) {
  const hostname = officialHostForUrl(website);
  const canonicalHost = normalizeHost(pinnedHost);
  if (!hostname || !canonicalHost) return false;
  return hostname === canonicalHost || hostname.endsWith(`.${canonicalHost}`);
}

if (snapshot.schemaVersion !== 1) fail("coin_growth_schema_version_invalid");
if (snapshot.policyVersion !== "tecpey-coin-growth-policy-v1") fail("coin_growth_policy_version_invalid");
if (snapshot.hostPinVersion !== undefined && snapshot.hostPinVersion !== 1) {
  fail("coin_growth_host_pin_version_invalid");
}
if (snapshot.hostPinVersion === undefined && snapshot.generatedAt !== LEGACY_HOST_PIN_GENERATED_AT) {
  fail("coin_growth_legacy_host_pin_snapshot_unrecognized");
}
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

  const officialHost = officialHostForUrl(coin.automation?.officialWebsite);
  if (!officialHost) fail(`coin_growth_official_source_invalid:${coin.symbol}`);

  if (snapshot.hostPinVersion === 1) {
    if (!normalizeHost(coin.automation?.officialHost)) {
      fail(`coin_growth_official_host_missing:${coin.symbol}`);
    } else if (!officialWebsiteMatchesPinnedHost(coin.automation?.officialWebsite, coin.automation?.officialHost)) {
      fail(`coin_growth_official_host_mismatch:${coin.symbol}`);
    }
  }

  if (!Array.isArray(coin.useCases) || coin.useCases.length < 2) fail(`coin_growth_use_cases_missing:${coin.symbol}`);
  if (!Array.isArray(coin.risks) || coin.risks.length < 2) fail(`coin_growth_risks_missing:${coin.symbol}`);
  if (!Array.isArray(coin.faqs) || coin.faqs.length < 2) fail(`coin_growth_faqs_missing:${coin.symbol}`);
  if (!validOrganicGrowth(coin.organicGrowth, {
    entityType: "coin",
    locale: "fa",
    canonicalPath: `/coins/${coin.slug}`,
    symbol: coin.symbol,
  })) {
    fail(`coin_growth_organic_profile_invalid:${coin.symbol}`);
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
