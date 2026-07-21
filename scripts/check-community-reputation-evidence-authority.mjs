import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const requiredFiles = {
  authority: "src/lib/community-reputation-evidence-authority.ts",
  migration: "src/lib/db-migrate-community-reputation-evidence.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  route: "src/app/api/community/reputation-evidence/route.ts",
  client: "src/lib/community-reputation-evidence-client.ts",
  panel: "src/components/academy/community/ReputationEvidencePanel.tsx",
  hub: "src/components/academy/community/CommunityHub.tsx",
  leaderboardView: "src/components/academy/community/LeaderboardView.tsx",
  legacy: "src/lib/community-leaderboard.ts",
  package: "package.json",
  documentation: "docs/academy/COMMUNITY_REPUTATION_EVIDENCE_AUTHORITY.md",
  apiReadRoute: "docs/security/generated/api-security-manifest-reviewed-deltas.d/0230-community-reputation-read-route.json",
  apiDeltaAuthority: "scripts/api-security-manifest-reviewed-deltas.mjs",
  apiManifestCheck: "scripts/check-api-security-manifest.mjs",
  apiDeltaTests: "scripts/api-security-manifest-reviewed-deltas.test.mjs",
};

async function filesUnder(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const selected = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(selected));
    else if (entry.isFile() && /\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) files.push(selected);
  }
  return files;
}

const sourcePaths = [
  ...await filesUnder("src/app"),
  ...await filesUnder("src/components"),
  ...await filesUnder("src/lib"),
];
const source = Object.fromEntries(
  await Promise.all(
    Object.entries(requiredFiles).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);
const normalized = Object.fromEntries(
  Object.entries(source).map(([key, value]) => [key, value.replace(/\s+/g, " ")]),
);
const failures = [];

function requireText(target, token, reason) {
  if (!normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${requiredFiles[target]}: ${reason}`);
  }
}

function rejectText(target, token, reason) {
  if (normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${requiredFiles[target]}: ${reason}`);
  }
}

for (const invariant of [
  '"community-reputation-evidence-v1"',
  '"official_journal_challenge_finalization"',
  "communityReputationCoverageBasisPoints",
  "communityReputationSourceDigest",
  "row.id !== row.source_enrollment_id",
  "community_reputation_evidence_digest_invalid",
  "community:reputation:read",
  "JOIN platform_principal_bindings",
  "binding.status = 'active'",
  'policyStatus: "evidence_only"',
  "score: null",
  "rank: null",
  "rewardEligibility: false",
  "mentorDecisionEligible: false",
  "instructorDecisionEligible: false",
]) {
  requireText("authority", invariant, `authority invariant is missing: ${invariant}`);
}
for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "Math.random",
  "loadArenaState",
  "loadProgress",
  "getJournalCompletionRate",
]) {
  rejectText("authority", forbidden, `server authority contains browser or legacy input: ${forbidden}`);
}

for (const invariant of [
  "0051_community_reputation_evidence.sql",
  "CREATE TABLE IF NOT EXISTS academy_community_reputation_evidence",
  "tecpey_community_reputation_coverage_bps",
  "tecpey_community_reputation_source_digest",
  "academy_community_reputation_source_enrollment_fk",
  "UNIQUE (source_enrollment_id)",
  "community reputation evidence is append-only",
  "BEFORE UPDATE ON academy_community_reputation_evidence",
  "BEFORE DELETE ON academy_community_reputation_evidence",
  "tecpey_validate_community_reputation_evidence_insert",
  "community reputation principal binding inactive",
  "tecpey_materialize_community_reputation_evidence",
  "AFTER INSERT ON academy_community_challenge_enrollments",
  "AFTER UPDATE ON academy_community_challenge_enrollments",
  "OLD.status IS DISTINCT FROM NEW.status",
  "community reputation materialization conflict",
  "community reputation evidence backfill mismatch",
  "ON CONFLICT (source_enrollment_id) DO NOTHING",
  "JOIN platform_principal_bindings AS binding",
  "binding.status = 'active'",
]) {
  requireText("migration", invariant, `database invariant is missing: ${invariant}`);
}
for (const forbidden of [
  "DROP TABLE academy_community_reputation_evidence",
  "ON DELETE CASCADE",
  "CREATE EXTENSION",
]) {
  rejectText("migration", forbidden, `migration contains forbidden weakening: ${forbidden}`);
}

for (const invariant of [
  "runCommunityReputationEvidenceMigrations",
  "await runCommunityReputationEvidenceMigrations(client)",
]) {
  requireText("migrationPlan", invariant, `migration plan is missing ${invariant}`);
}

for (const invariant of [
  'route: "/api/community/reputation-evidence GET"',
  "getCanonicalSession(req, { strictRevocation: true })",
  "academy_profile_required",
  "community-reputation-evidence-read",
  'scopes: ["community:reputation:read"]',
  "private, no-store",
  "Vary",
  "community_reputation_unavailable",
  "[...url.searchParams.keys()].length > 0",
]) {
  requireText("route", invariant, `read route invariant is missing: ${invariant}`);
}
for (const forbidden of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "publicIdentifier",
  'searchParams.get("id")',
  "localStorage",
  "sessionStorage",
]) {
  rejectText("route", forbidden, `read route contains forbidden behavior: ${forbidden}`);
}

for (const invariant of [
  "exactKeys",
  "coverageBasisPoints",
  "completedCycles + notCompletedCycles !== finalizedCycles",
  "raw.score !== null",
  "raw.rank !== null",
  "raw.rewardEligibility !== false",
  "raw.mentorDecisionEligible !== false",
  "raw.instructorDecisionEligible !== false",
  'fetch("/api/community/reputation-evidence"',
  'cache: "no-store"',
  'credentials: "same-origin"',
]) {
  requireText("client", invariant, `client boundary is missing: ${invariant}`);
}
for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "Math.random",
  "computeMyLeaderboardScores",
  "getLeaderboard",
]) {
  rejectText("client", forbidden, `client accepts legacy/browser reputation input: ${forbidden}`);
}

for (const invariant of [
  "loadCommunityReputationEvidenceClient",
  "Fail Closed",
  "Server Evidence",
  "Evidence Only",
  "summary.finalizedCycles",
  "summary.aggregateCoverageBasisPoints",
  "امتیاز، رتبه، Badge، بورسیه، پاداش مالی",
]) {
  requireText("panel", invariant, `evidence panel is missing: ${invariant}`);
}
for (const forbidden of [
  "computeMyLeaderboardScores",
  "getLeaderboard",
  "isDemo",
  "Math.random",
  "localStorage",
  "sessionStorage",
]) {
  rejectText("panel", forbidden, `evidence panel contains legacy authority: ${forbidden}`);
}

for (const invariant of [
  'import { ReputationEvidencePanel } from "./ReputationEvidencePanel"',
  "<ReputationEvidencePanel />",
  'badge="Evidence"',
  "Rank و Reward هنوز غیرفعال‌اند",
]) {
  requireText("hub", invariant, `Community Hub is missing: ${invariant}`);
}
for (const forbidden of [
  "PreviewScoreBoundary",
  "computeMyLeaderboardScores",
  "getLeaderboard",
]) {
  rejectText("hub", forbidden, `Community Hub still consumes legacy score authority: ${forbidden}`);
}

for (const invariant of [
  'import { ReputationEvidencePanel } from "./ReputationEvidencePanel"',
  "<ReputationEvidencePanel />",
  "Evidence قبل از Ranking",
  "بدون امتیاز",
  "شرایط لازم پیش از فعال‌شدن Leaderboard",
  "هیچ وزن، امتیاز یا جایگاه کاربر محاسبه نمی‌شود",
]) {
  requireText("leaderboardView", invariant, `Leaderboard evidence-only boundary is missing: ${invariant}`);
}
for (const forbidden of [
  "loadCommunityProfile",
  "computeMyLeaderboardScores",
  "getLeaderboard",
  "LeaderboardEntry",
  "ScoreBar",
  "isDemo",
  "anonymousId",
  "Math.random",
]) {
  rejectText("leaderboardView", forbidden, `Leaderboard page contains legacy rank authority: ${forbidden}`);
}

for (const invariant of [
  "contains no score calculation",
  "Official Community reputation facts come only from the PostgreSQL-backed",
  "Ranking policy remains disabled",
  "COMMUNITY_SAFETY_RULES",
]) {
  requireText("legacy", invariant, `presentation-only leaderboard boundary is missing: ${invariant}`);
}
for (const forbidden of [
  'from "@/lib/academy-progress"',
  'from "@/lib/trading-arena"',
  'from "@/lib/trading-journal"',
  "computeMyLeaderboardScores",
  "getLeaderboard(",
  "generateDemoPeers",
  "DEMO_DISPLAY_NAMES",
  "isDemo",
  "loadProgress",
  "loadArenaState",
  "getJournalCompletionRate",
]) {
  rejectText("legacy", forbidden, `presentation module still contains legacy score authority: ${forbidden}`);
}

for (const command of [
  '"community:reputation:check"',
  '"test:community-reputation"',
  "community-reputation-evidence-client.test.ts",
  "community-reputation-evidence-postgres.integration.ts",
]) {
  requireText("package", command, `package gate is missing: ${command}`);
}

for (const invariant of [
  "Evidence-only",
  "append-only",
  "No score",
  "No rank",
  "No reward",
  "PostgreSQL",
  "tenant",
  "principal",
  "Mentor",
  "Instructor",
  "AFTER INSERT",
  "AFTER UPDATE",
]) {
  requireText("documentation", invariant, `authority documentation is missing: ${invariant}`);
}

const readRouteRegistry = JSON.parse(source.apiReadRoute);
const reviewedReadRoute = readRouteRegistry.readOnlyRoutes?.[0];
if (
  readRouteRegistry.schemaVersion !== 1 ||
  readRouteRegistry.baselineBlobSha !== "88ef6f5e31c0c93b3240406959bdae57ef5472e5" ||
  !Array.isArray(readRouteRegistry.entries) ||
  readRouteRegistry.entries.length !== 0 ||
  !Array.isArray(readRouteRegistry.readOnlyRoutes) ||
  readRouteRegistry.readOnlyRoutes.length !== 1 ||
  reviewedReadRoute?.route !== "/api/community/reputation-evidence" ||
  reviewedReadRoute?.sourcePath !== "src/app/api/community/reputation-evidence/route.ts" ||
  reviewedReadRoute?.sourceHash !== "96661a1dcea2f2c54c134571" ||
  reviewedReadRoute?.issue !== "#230" ||
  reviewedReadRoute?.owner !== "community-platform" ||
  reviewedReadRoute?.controls?.classification !== "authenticated" ||
  reviewedReadRoute?.controls?.strictRevocation !== true ||
  reviewedReadRoute?.controls?.rateLimit !== true ||
  reviewedReadRoute?.controls?.verifiedPrincipal !== true ||
  reviewedReadRoute?.controls?.tenantFromVerifiedContext !== true ||
  reviewedReadRoute?.controls?.noStore !== true ||
  reviewedReadRoute?.controls?.queryParameters !== "none"
) {
  failures.push(`${requiredFiles.apiReadRoute}: private GET route ledger is incomplete or weakened`);
}

for (const invariant of [
  "readOnlyRoutes",
  "READ_ONLY_ROUTE_FIELDS",
  "READ_ONLY_CONTROL_FIELDS",
  "api_security_read_only_route_",
  "effective.totals.routeFiles += reviewedReadOnlyRoutes.length",
  "strictRevocation !== true",
  'queryParameters !== "none"',
]) {
  requireText("apiDeltaAuthority", invariant, `API read-only ledger authority is missing: ${invariant}`);
}

for (const invariant of [
  "verifyReviewedReadOnlyRoutes",
  "createHash(\"sha256\")",
  "Reviewed read-only route hash mismatch",
  "unexpectedly exports",
  "strict canonical session evidence",
  "lacks rate limiting",
  "lacks verified tenant/principal context",
  "lacks private no-store cookie variance",
  "does not reject all query parameters",
]) {
  requireText("apiManifestCheck", invariant, `API manifest read-only verification is missing: ${invariant}`);
}

for (const invariant of [
  "applies one exact additive read-only route",
  "rejects duplicate reviewed read-only routes",
  "rejects weakened or unknown read-only route controls",
  "routeFiles authority is absent",
]) {
  requireText("apiDeltaTests", invariant, `API read-only ledger test is missing: ${invariant}`);
}

const bannedPatterns = [
  { pattern: /\bcomputeMyLeaderboardScores\b/, reason: "legacy browser leaderboard scoring" },
  { pattern: /\bgetLeaderboard\s*\(/, reason: "legacy rank generation" },
  { pattern: /\bgenerateDemoPeers\b/, reason: "simulated leaderboard peers" },
  { pattern: /\bDEMO_DISPLAY_NAMES\b/, reason: "simulated leaderboard identity catalogue" },
];
for (const file of sourcePaths) {
  const content = await readFile(file, "utf8");
  for (const banned of bannedPatterns) {
    if (banned.pattern.test(content)) {
      failures.push(`${file}: active source contains ${banned.reason}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Community reputation evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Community reputation evidence authority passed: finalized challenge evidence is PostgreSQL-materialized on terminal insert/update, append-only, tenant/principal-bound, digest-verified and evidence-only; the private GET route is hash-reviewed; browser scoring, demo peers, rank, rewards and Mentor/Instructor decisions remain disabled.",
);
