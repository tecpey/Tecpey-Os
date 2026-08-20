import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const snapshotPath = path.join(root, "src/data/generated/toolGrowthSnapshot.json");
const coreToolsPath = path.join(root, "src/data/traderTools.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const coreTools = JSON.parse(fs.readFileSync(coreToolsPath, "utf8"));
const errors = [];

function fail(code) {
  errors.push(code);
}

function slugify(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

if (snapshot.schemaVersion !== 1) fail("tool_growth_schema_version_invalid");
if (snapshot.policyVersion !== "tecpey-tool-growth-policy-v1") fail("tool_growth_policy_version_invalid");
if (snapshot.stats?.externalEnabled !== 0) fail("tool_growth_external_auto_enable_forbidden");
if (!Array.isArray(snapshot.tools)) fail("tool_growth_tools_invalid");
if (!Array.isArray(snapshot.rejected)) fail("tool_growth_rejected_invalid");

const coreSlugs = new Set(coreTools.map((tool) => slugify(tool.name)));
const coreDomains = new Set(coreTools.map((tool) => String(tool.domain ?? "").toLowerCase()));
const slugs = new Set();
const domains = new Set();

function validOrganicGrowth(profile, expected) {
  return profile &&
    profile.policyVersion === "tecpey-organic-growth-policy-v1" &&
    profile.entityType === "tool" &&
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
    profile.entityTags.includes(`tool:${expected.slug}`) &&
    Array.isArray(profile.internalLinks) &&
    profile.internalLinks.includes(expected.canonicalPath) &&
    String(profile.answerSummary ?? "").length >= 40 &&
    String(profile.llmSummary ?? "").length >= 80 &&
    /(توصیه مالی|سیگنال|financial advice|trading signal)/i.test(String(profile.safetyDisclaimer ?? ""));
}

for (const tool of snapshot.tools ?? []) {
  const slug = slugify(tool.name);
  const domain = String(tool.domain ?? "").toLowerCase();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(`tool_growth_slug_invalid:${tool.name}`);
  if (!/^[a-z0-9.-]+$/.test(domain)) fail(`tool_growth_domain_invalid:${tool.name}`);
  if (coreSlugs.has(slug)) fail(`tool_growth_core_slug_duplicate:${tool.name}`);
  if (coreDomains.has(domain)) fail(`tool_growth_core_domain_duplicate:${tool.name}`);
  if (slugs.has(slug)) fail(`tool_growth_duplicate_slug:${tool.name}`);
  if (domains.has(domain)) fail(`tool_growth_duplicate_domain:${tool.name}`);
  slugs.add(slug);
  domains.add(domain);

  if (!String(tool.site ?? "").startsWith("https://")) fail(`tool_growth_site_invalid:${tool.name}`);
  if (!String(tool.logoUrl ?? "").startsWith("https://icons.duckduckgo.com/ip3/")) {
    fail(`tool_growth_logo_source_invalid:${tool.name}`);
  }
  if (tool.automation?.status !== "published_content") fail(`tool_growth_status_invalid:${tool.name}`);
  if (tool.automation?.publishCapability !== "educational_directory") {
    fail(`tool_growth_publish_capability_invalid:${tool.name}`);
  }
  if (tool.automation?.externalCapability !== "manual_review_required") {
    fail(`tool_growth_external_gate_invalid:${tool.name}`);
  }
  if (tool.automation?.integrationRisk === "trade_execution") {
    fail(`tool_growth_trade_execution_published:${tool.name}`);
  }
  if (!Array.isArray(tool.prosFa) || tool.prosFa.length < 2) fail(`tool_growth_pros_missing:${tool.name}`);
  if (!Array.isArray(tool.consFa) || tool.consFa.length < 2) fail(`tool_growth_cons_missing:${tool.name}`);
  if (!Array.isArray(tool.tutorialFa) || tool.tutorialFa.length < 2) fail(`tool_growth_tutorial_missing:${tool.name}`);
  if (!String(tool.articleFa ?? "").includes("توصیه مالی") && !String(tool.articleFa ?? "").includes("سیگنال")) {
    fail(`tool_growth_risk_language_missing:${tool.name}`);
  }
  if (!validOrganicGrowth(tool.organicGrowth?.fa, {
    locale: "fa",
    canonicalPath: `/trading-tools/${slug}`,
    slug,
  })) {
    fail(`tool_growth_fa_organic_profile_invalid:${tool.name}`);
  }
  if (!validOrganicGrowth(tool.organicGrowth?.en, {
    locale: "en",
    canonicalPath: `/en/trading-tools/${slug}`,
    slug,
  })) {
    fail(`tool_growth_en_organic_profile_invalid:${tool.name}`);
  }
}

if ((snapshot.tools ?? []).length < 24) fail("tool_growth_published_count_too_low");
if (snapshot.stats?.publishedContent !== (snapshot.tools ?? []).length) fail("tool_growth_stats_mismatch");

if (errors.length) {
  console.error("Tool growth automation check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Tool growth automation check passed.");
