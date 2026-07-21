import { readFile } from "node:fs/promises";

const files = {
  policy: "src/lib/community-journal-discipline-score-policy.ts",
  authority: "src/lib/community-journal-discipline-score-authority.ts",
  consentAuthority: "src/lib/community-reputation-scoring-consent-authority.ts",
  route: "src/app/api/community/journal-discipline-score/route.ts",
  client: "src/lib/community-journal-discipline-score-client.ts",
  panel: "src/components/academy/community/JournalDisciplineScorePanel.tsx",
  leaderboard: "src/components/academy/community/LeaderboardView.tsx",
  documentation: "docs/academy/COMMUNITY_JOURNAL_DISCIPLINE_SCORE_POLICY.md",
  consentDocumentation:
    "docs/academy/COMMUNITY_REPUTATION_SCORING_CONSENT_AUTHORITY.md",
  apiRoute:
    "docs/security/generated/api-security-manifest-reviewed-deltas.d/0233-community-journal-discipline-score-read-route.json",
  package: "package.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);
const normalized = Object.fromEntries(
  Object.entries(source).map(([key, value]) => [key, value.replace(/\s+/g, " ")]),
);
const failures = [];

function requireText(target, token, reason) {
  if (!normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

function rejectText(target, token, reason) {
  if (normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

for (const invariant of [
  '"journal-discipline-score-v1"',
  '"journal_discipline_only"',
  "JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES = 12",
  "JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES = 4",
  "JOURNAL_DISCIPLINE_COMPLETION_WEIGHT_BPS = 6_000",
  "JOURNAL_DISCIPLINE_COVERAGE_WEIGHT_BPS = 4_000",
  "journalDisciplineRoundHalfUp",
  "completedCycles * MAX_BASIS_POINTS",
  "coverageTotal",
  "completionConsistencyBasisPoints *",
  "JOURNAL_DISCIPLINE_COMPLETION_WEIGHT_BPS",
  "meanCoverageBasisPoints *",
  "JOURNAL_DISCIPLINE_COVERAGE_WEIGHT_BPS",
  "JournalDisciplineScoreStatus",
  '"available"',
  '"insufficient_evidence"',
  "scoreBasisPoints: number | null",
  "rank: null",
  "percentile: null",
  "publicLeaderboardEligible: false",
  "rewardEligibility: false",
  "mentorDecisionEligible: false",
  "instructorDecisionEligible: false",
  "scholarshipEligibility: false",
  "journal_discipline_duplicate_cycle",
  "journal_discipline_cycle_order_invalid",
  "digestCanonicalInput",
]) {
  requireText("policy", invariant, `policy invariant is missing: ${invariant}`);
}
for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "Math.random",
  "loadArenaState",
  "loadProgress",
  "getJournalCompletionRate",
  "eligibleClosedTrades",
  "validReflections",
]) {
  rejectText("policy", forbidden, `pure policy contains forbidden input: ${forbidden}`);
}

for (const invariant of [
  'import "server-only"',
  "communityReputationSourceDigest",
  "communityReputationCoverageBasisPoints",
  "COMMUNITY_REPUTATION_EVIDENCE_VERSION",
  "COMMUNITY_REPUTATION_SOURCE_TYPE",
  "OFFICIAL_JOURNAL_CHALLENGE_ID",
  "OFFICIAL_JOURNAL_CHALLENGE_VERSION",
  "isCommunityReputationScoringConsentEnabledTx",
  "row.tenant_id !== context.tenantId",
  "row.workspace_id !== context.workspaceId",
  "row.principal_id !== context.principalId",
  "row.student_id !== context.principalId",
  "journal_discipline_evidence_digest_invalid",
  "requireActiveBinding",
  "await requireActiveBinding(client, context)",
  "binding.status = 'active'",
  "SET TRANSACTION READ ONLY",
  "SET LOCAL statement_timeout = '5000ms'",
  "SET LOCAL lock_timeout = '1000ms'",
  "consentRequired: true as const",
  "ORDER BY evidence.cycle_ends_at DESC",
  "evidence.source_enrollment_id DESC",
  "JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES",
  "evaluateJournalDisciplineScore",
  'createHash("sha256")',
  "evaluatedEvidenceDigest",
]) {
  requireText("authority", invariant, `server authority invariant is missing: ${invariant}`);
}
for (const forbidden of [
  "INSERT INTO",
  "UPDATE academy_community_reputation_evidence",
  "DELETE FROM academy_community_reputation_evidence",
  "localStorage",
  "sessionStorage",
  "Math.random",
  "awardAcademyReward",
  "scheduleMentorProfileUpdate",
  "academy_reward_ledger",
]) {
  rejectText("authority", forbidden, `score authority contains forbidden mutation/input: ${forbidden}`);
}

for (const invariant of [
  'import "server-only"',
  '"community-reputation-scoring-consent-v1"',
  '"community-reputation-scoring-consent-authority-v1"',
  "isCommunityReputationScoringConsentEnabledTx",
  "row.enabled === true",
  "row.consented_at !== null",
  "writeSensitiveMutationAuditTx",
  'action: "community.profile.consent.update"',
]) {
  requireText(
    "consentAuthority",
    invariant,
    `scoring consent authority invariant is missing: ${invariant}`,
  );
}
for (const forbidden of [
  "scoreBasisPoints",
  "rank:",
  "rewardEligibility",
  "leaderboard_visible",
  "community_journal_discipline_score",
]) {
  rejectText(
    "consentAuthority",
    forbidden,
    `scoring consent authority contains forbidden score/public coupling: ${forbidden}`,
  );
}

for (const invariant of [
  'route: "/api/community/journal-discipline-score GET"',
  "getCanonicalSession(req, { strictRevocation: true })",
  "academy_profile_required",
  "community-journal-discipline-score-read",
  'scopes: ["community:reputation:read"]',
  "private, no-store",
  'response.headers.set("Vary", "Cookie")',
  "journal_discipline_score_unavailable",
  "journal_discipline_score_consent_required",
  "loaded.consentRequired",
  "[...url.searchParams.keys()].length > 0",
]) {
  requireText("route", invariant, `private GET route invariant is missing: ${invariant}`);
}
for (const forbidden of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  'searchParams.get("id")',
  "policyVersion:",
  "studentId:",
  "localStorage",
  "sessionStorage",
]) {
  rejectText("route", forbidden, `private GET route contains forbidden behavior: ${forbidden}`);
}

for (const invariant of [
  "exactKeys",
  "journalDisciplineRoundHalfUp",
  "completedCycles + notCompletedCycles !== evaluatedCycles",
  "completionConsistencyBasisPoints !== expectedCompletion",
  "raw.scoreBasisPoints !== expectedScore",
  "raw.rank !== null",
  "raw.percentile !== null",
  "raw.publicLeaderboardEligible !== false",
  "raw.rewardEligibility !== false",
  "raw.mentorDecisionEligible !== false",
  "raw.instructorDecisionEligible !== false",
  "raw.scholarshipEligibility !== false",
  'fetch("/api/community/journal-discipline-score"',
  "response.status === 409",
  "consentRequired: true",
  'credentials: "same-origin"',
  'cache: "no-store"',
]) {
  requireText("client", invariant, `client invariant is missing: ${invariant}`);
}
for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "Math.random",
  "computeMyLeaderboardScores",
  "getLeaderboard",
  "academy-progress",
  "trading-arena",
  "trading-journal",
]) {
  rejectText("client", forbidden, `client contains browser or legacy score input: ${forbidden}`);
}

for (const invariant of [
  "loadJournalDisciplineScoreClient",
  "result?.consentRequired",
  "محاسبه امتیاز خصوصی به رضایت صریح شما نیاز دارد",
  "Default Off",
  "امتیاز خصوصی انضباط ژورنال",
  "Policy v1",
  "Private Only",
  "Fail Closed",
  "score.minimumCycles",
  "score.completionConsistencyBasisPoints",
  "score.meanCoverageBasisPoints",
  "هیچ Rank، Percentile، Reward، XP، Badge",
]) {
  requireText("panel", invariant, `private score panel invariant is missing: ${invariant}`);
}
for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "Math.random",
  "getLeaderboard",
  "isDemo",
  "anonymousId",
]) {
  rejectText("panel", forbidden, `private score panel contains legacy/public authority: ${forbidden}`);
}

for (const invariant of [
  'import { JournalDisciplineScorePanel } from "./JournalDisciplineScorePanel"',
  "<JournalDisciplineScorePanel />",
  "Evidence قبل از Ranking",
  "رتبه‌بندی عمومی هنوز سیاست مصوب ندارد",
  "بدون رتبه",
  "Cohort eligibility",
]) {
  requireText("leaderboard", invariant, `Leaderboard private/public boundary is missing: ${invariant}`);
}
for (const forbidden of [
  "getLeaderboard(",
  "computeMyLeaderboardScores",
  "LeaderboardEntry",
  "ScoreBar",
  "isDemo",
  "anonymousId",
  "Math.random",
]) {
  rejectText("leaderboard", forbidden, `Leaderboard contains public rank authority: ${forbidden}`);
}

for (const invariant of [
  "Journal Discipline Score Policy v1",
  "not a global reputation score",
  "Explicit scoring consent",
  "default off",
  "journal_discipline_score_consent_required",
  "latest 12 finalized official cycles",
  "Every selected cycle has equal influence",
  "at least 4 finalized cycles",
  "Completion consistency — 60%",
  "Equal-weight mean Reflection coverage — 40%",
  "Floating-point values are not decision authority",
  "evaluatedEvidenceDigest",
  "read-only PostgreSQL transaction",
  "rank: null",
  "publicLeaderboardEligible: false",
  "The public Leaderboard remains locked and empty",
]) {
  requireText("documentation", invariant, `policy documentation is missing: ${invariant}`);
}

for (const invariant of [
  "Community Reputation Scoring Consent Authority",
  "default off",
  "academy_community_reputation_scoring_consents",
  "community-reputation-scoring-consent-v1",
  "community-reputation-scoring-consent-authority-v1",
  "Journal Discipline Score gate",
  "409 journal_discipline_score_consent_required",
  "scoring off + public visible -> no private score, no public rank",
  "preview-only",
]) {
  requireText(
    "consentDocumentation",
    invariant,
    `consent documentation is missing: ${invariant}`,
  );
}

const apiRoute = JSON.parse(source.apiRoute);
const reviewed = apiRoute.readOnlyRoutes?.[0];
if (
  apiRoute.schemaVersion !== 1 ||
  apiRoute.baselineBlobSha !== "88ef6f5e31c0c93b3240406959bdae57ef5472e5" ||
  !Array.isArray(apiRoute.entries) ||
  apiRoute.entries.length !== 0 ||
  !Array.isArray(apiRoute.readOnlyRoutes) ||
  apiRoute.readOnlyRoutes.length !== 1 ||
  reviewed?.route !== "/api/community/journal-discipline-score" ||
  reviewed?.sourcePath !== "src/app/api/community/journal-discipline-score/route.ts" ||
  reviewed?.sourceHash !== "ae6e95ddc27005296ea870e2" ||
  reviewed?.issue !== "#235" ||
  reviewed?.owner !== "community-platform" ||
  reviewed?.controls?.classification !== "authenticated" ||
  reviewed?.controls?.strictRevocation !== true ||
  reviewed?.controls?.rateLimit !== true ||
  reviewed?.controls?.verifiedPrincipal !== true ||
  reviewed?.controls?.tenantFromVerifiedContext !== true ||
  reviewed?.controls?.noStore !== true ||
  reviewed?.controls?.queryParameters !== "none"
) {
  failures.push(`${files.apiRoute}: private GET route ledger is incomplete or weakened`);
}

for (const command of [
  '"community:journal-discipline:check"',
  '"test:community-journal-discipline"',
  "community-journal-discipline-score-policy.test.ts",
  "community-journal-discipline-score-client.test.ts",
  "community-journal-discipline-score-postgres.integration.ts",
  "community-reputation-scoring-consent.test.ts",
  "community-reputation-scoring-consent-postgres.integration.ts",
]) {
  requireText("package", command, `package gate is missing: ${command}`);
}

if (failures.length > 0) {
  console.error("Community Journal Discipline Score authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Community Journal Discipline Score v1 authority passed: explicit default-off scoring consent, immutable evidence-only inputs, read-only private projection, minimum sample, equal-cycle weighting, integer arithmetic and disabled public/downstream decisions remain enforced.",
);
