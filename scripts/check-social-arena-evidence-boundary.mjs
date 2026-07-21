import { readFile } from "node:fs/promises";
import { legacyImportViolations } from "./social-arena-evidence-policy.mjs";

const paths = {
  inventory: "docs/security/social-arena-evidence-inventory.json",
  verified: "src/lib/security/verified-social-arena-evidence.ts",
  boundary: "src/lib/social-arena-evidence-boundary.ts",
  smartReview: "src/lib/smart-review.ts",
  mentor: "src/components/academy/v2/MentorV2.tsx",
  insights: "src/components/academy/v2/LearningInsightsDashboard.tsx",
  instructor: "src/components/academy/community/InstructorDashboard.tsx",
  challenge: "src/components/academy/community/ChallengeCenter.tsx",
  challengeHistoryCard: "src/components/academy/community/FinalizedChallengeHistoryCard.tsx",
  challengeCatalogue: "src/lib/community-challenges.ts",
  challengeClient: "src/lib/community-journal-challenge-client.ts",
  challengeHistoryClient: "src/lib/community-journal-challenge-history-client.ts",
  challengeAuthority: "src/lib/community-journal-challenge-authority.ts",
  challengeFinalizer: "src/lib/community-journal-challenge-finalization.ts",
  challengeMigration: "src/lib/db-migrate-community-journal-challenge.ts",
  challengeFinalizationMigration: "src/lib/db-migrate-community-journal-challenge-finalization.ts",
  challengeHistoryRoute: "src/app/api/community/challenge-history/route.ts",
  challengeFinalizationRunner: "scripts/finalize-community-journal-challenges.ts",
  peerJournals: "src/components/academy/community/PeerJournals.tsx",
  communityJournalClient: "src/lib/community-journal-client.ts",
  communityJournalAuthority: "src/lib/community-journal-authority.ts",
  mentorMemory: "src/lib/mentor-memory.ts",
  mentorSignals: "src/lib/mentor-signals.ts",
  behavioral: "src/lib/behavioral-engine.ts",
  coaching: "src/lib/coaching-engine.ts",
  communityMigration: "src/lib/db-migrate-community-profile-consent.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  communityAuthority: "src/lib/community-profile-authority.ts",
  communityRoute: "src/app/api/community/profile/route.ts",
  communityCareer: "src/lib/community-career.ts",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  browserGuard: "scripts/check-browser-persistence.mjs",
  package: "package.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);
const normalized = Object.fromEntries(
  Object.entries(source).map(([key, value]) => [key, value.replace(/\s+/g, " ")]),
);
const inventory = JSON.parse(source.inventory);
const failures = [];

function requireText(target, token, reason) {
  if (!normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${paths[target]}: ${reason}`);
  }
}
function rejectText(target, token, reason) {
  if (normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${paths[target]}: ${reason}`);
  }
}
function requireInventory(collection, path, reason) {
  if (!inventory[collection]?.some((entry) => entry.path === path)) {
    failures.push(`${paths.inventory}: ${reason}: ${path}`);
  }
}

if (inventory.schemaVersion !== 1 || inventory.issue !== 168 || inventory.followUpIssue !== 221) {
  failures.push(`${paths.inventory}: inventory identity/schema or #221 linkage is invalid`);
}
for (const moduleName of [
  "@/lib/trading-arena",
  "@/lib/trading-journal",
  "@/lib/community-profile",
  "@/lib/community-challenges",
  "@/lib/community-leaderboard",
  "@/lib/trading-dna",
  "@/lib/smart-review",
]) {
  if (!inventory.legacyModules.some((entry) => entry.module === moduleName)) {
    failures.push(`${paths.inventory}: missing classification for ${moduleName}`);
  }
}
const challengeCatalogueClassification = inventory.legacyModules.find(
  (entry) => entry.module === "@/lib/community-challenges",
)?.classification;
if (challengeCatalogueClassification !== "presentation-catalogue") {
  failures.push(`${paths.inventory}: Community challenge catalogue must be presentation-only`);
}
for (const authorityPath of [
  "src/lib/community-profile-authority.ts",
  "src/app/api/community/profile/route.ts",
  "src/lib/community-journal-authority.ts",
  "src/lib/db-migrate-community-journal-challenge.ts",
  "src/lib/db-migrate-community-journal-challenge-finalization.ts",
  "src/lib/community-journal-challenge-authority.ts",
  "src/lib/community-journal-challenge-finalization.ts",
  "src/lib/community-journal-challenge-client.ts",
  "src/lib/community-journal-challenge-history-client.ts",
  "src/app/api/community/challenge-history/route.ts",
  "scripts/finalize-community-journal-challenges.ts",
]) {
  requireInventory("canonicalAuthorities", authorityPath, "missing canonical authority");
}
for (const field of [
  "score", "pnl", "pnlPct", "id", "createdAt", "completedAt",
  "timestamp", "completed", "eligibleClosedTrades", "validReflections",
  "coverageRate", "publicProfileId", "revision", "consentedAt",
]) {
  if (!inventory.forbiddenClientOfficialFields.includes(field)) {
    failures.push(`${paths.inventory}: missing forbidden browser evidence field ${field}`);
  }
}

for (const invariant of [
  'import "server-only"',
  "const VERIFIED_SOCIAL_ARENA_EVIDENCE = Symbol",
  "createVerifiedSocialArenaEvidence",
  "tecpey-social-arena-evidence-v1",
  "Object.freeze",
]) {
  requireText("verified", invariant, `official evidence invariant missing: ${invariant}`);
}
for (const field of [
  '"score"', '"disciplineScore"', '"pnl"', '"pnlPct"', '"realizedPnl"',
  '"id"', '"createdAt"', '"completedAt"', '"timestamp"', '"completed"',
]) {
  requireText("boundary", field, `browser official evidence rejector is missing ${field}`);
}
requireText("boundary", "browser_official_evidence_forbidden", "browser evidence rejection must use a stable error code");

for (const target of [
  "mentor", "insights", "instructor", "mentorMemory", "mentorSignals", "behavioral", "coaching",
]) {
  failures.push(...legacyImportViolations(paths[target], source[target]));
}
for (const token of [
  "localStorage.", "loadProgress", "loadDeck", "getDueCards",
  "@/lib/academy-progress", "@/lib/spaced-repetition",
]) {
  rejectText("smartReview", token, `smart review cannot personalize from browser evidence: ${token}`);
}
requireText("smartReview", 'authority: "server-required"', "smart review must expose an explicit server migration boundary");

for (const token of [
  "@/lib/community-profile", "@/lib/community-leaderboard", "@/lib/trading-arena",
  "@/lib/trading-journal", "loadProgress", "localStorage.",
]) {
  rejectText("instructor", token, `instructor assessment cannot use browser evidence: ${token}`);
}
requireText("instructor", "fetchBehavioralSnapshot", "instructor self-view must use the server behavioral snapshot");
requireText("instructor", "اشتراک واقعی با مدرس", "instructor sharing must remain disabled until role/grant authority exists");

for (const token of [
  "localStorage", "sessionStorage", "Date.now()", "getCurrentWeekNumber",
  "loadParticipation", "saveParticipation", "joinChallenge", "markChallengeComplete",
  "CHALLENGE_PARTICIPATION_KEY",
]) {
  rejectText("challengeCatalogue", token, `challenge catalogue contains forbidden browser authority: ${token}`);
}
for (const invariant of [
  'OFFICIAL_PILOT_CHALLENGE_ID = "journal-reflection-week"',
  "OFFICIAL_PILOT_CHALLENGE",
  "PREVIEW_ONLY_CHALLENGES",
  "امتیاز عددی صادر نمی‌شود",
]) {
  requireText("challengeCatalogue", invariant, `challenge catalogue is missing ${invariant}`);
}

for (const forbidden of [
  "@/lib/trading-arena", "@/lib/trading-journal", "localStorage", "sessionStorage",
  "loadParticipation", "joinChallenge(", "markChallengeComplete", "getCurrentWeekNumber",
]) {
  rejectText("challenge", forbidden, `Challenge Center contains browser authority: ${forbidden}`);
}
for (const invariant of [
  'fetch("/api/community/profile?view=journal-reflection-challenge"',
  '"/api/community/profile?view=journal-reflection-challenge"',
  '"Idempotency-Key": createCommunityChallengeIdempotencyKey()',
  "parseOfficialJournalChallengePayload",
  "parseCommunityChallengeProfilePayload",
  "XP = ۰، Badge = ندارد و پاداش مالی = ندارد",
  "فعالیت قبل از این زمان محاسبه نمی‌شود",
  "سایر تمرین‌ها تا تکمیل Evidence سرور، پیش‌نمایش باقی می‌مانند",
]) {
  requireText("challenge", invariant, `official challenge UI is missing ${invariant}`);
}

for (const forbidden of [
  "localStorage", "sessionStorage", "Math.random", "clientScore",
  "clientCompletedAt", "clientStartedAt",
]) {
  rejectText("challengeAuthority", forbidden, `challenge authority contains forbidden client evidence: ${forbidden}`);
}
for (const invariant of [
  'import "server-only"',
  "AvailableTenantPrincipalContext",
  'community:challenge:read',
  'community:challenge:write',
  "SELECT NOW() AS now",
  "deriveOfficialJournalChallengeCycle",
  "calculateOfficialJournalChallengeEvidence",
  "validateOfficialJournalChallengeEnrollmentRow",
  "academy_trading_arena_attempts",
  "validateArenaExecutionStateV2",
  "academy_trading_arena_reflections",
  "mapArenaReflectionRow",
  "reflectionMatchesTrade",
  "eligibleClosedTrades >= OFFICIAL_JOURNAL_CHALLENGE_MIN_TRADES",
  "validReflections * 5 >= eligibleClosedTrades * 4",
  "api_command_receipts",
  "academy_community_challenge_events",
  "retrospectiveEvidenceAccepted: false",
  "rewardsEnabled: false",
  "finalization_source = CASE WHEN $4 = 'completed' THEN 'interactive' ELSE NULL END",
  "xp: 0",
  "badge: null",
  "financialReward: null",
]) {
  requireText("challengeAuthority", invariant, `challenge authority is missing ${invariant}`);
}

for (const invariant of [
  'FILENAME = "0048_community_journal_reflection_challenge.sql"',
  "academy_community_challenge_enrollments",
  "principal_id TEXT GENERATED ALWAYS AS (student_id::text) STORED",
  "academy_community_challenge_principal_binding_fk",
  "academy_community_challenge_identity_unique",
  "eligible_closed_trade_count >= 3",
  "valid_reflection_count * 5 >= eligible_closed_trade_count * 4",
  "completed community challenge enrollment is immutable",
  "academy_community_challenge_events",
  "community challenge events are append-only",
]) {
  requireText("challengeMigration", invariant, `challenge migration is missing ${invariant}`);
}
requireText("migrationPlan", "runCommunityJournalChallengeMigrations", "canonical migration plan must execute challenge migration");

for (const invariant of [
  'FILENAME = "0049_community_journal_challenge_finalization.sql"',
  "status IN ('active', 'completed', 'not_completed')",
  "finalized_at TIMESTAMPTZ",
  "finalization_source TEXT",
  "finalization_run_id UUID",
  "finalized community challenge enrollment is immutable",
  "valid_reflection_count * 5 < eligible_closed_trade_count * 4",
  "academy_community_challenge_one_finalization_event_idx",
  "academy_community_challenge_due_finalization_idx",
  "finalized_completed",
  "finalized_not_completed",
]) {
  requireText("challengeFinalizationMigration", invariant, `challenge finalization migration is missing ${invariant}`);
}
requireText(
  "migrationPlan",
  "runCommunityJournalChallengeFinalizationMigrations",
  "canonical migration plan must execute challenge finalization migration",
);

for (const forbidden of [
  "localStorage", "sessionStorage", "Math.random", "Date.now()",
  "validateArenaExecutionStateV2", "mapArenaReflectionRow",
  "academy_trading_arena_reflections", "execution_state",
]) {
  rejectText("challengeFinalizer", forbidden, `challenge finalizer contains duplicate/browser authority: ${forbidden}`);
}
for (const invariant of [
  'import "server-only"',
  "calculateOfficialJournalChallengeEvidence",
  "validateOfficialJournalChallengeEnrollmentRow",
  "FOR UPDATE OF enrollment SKIP LOCKED",
  "SAVEPOINT community_challenge_finalize_row",
  "ROLLBACK TO SAVEPOINT community_challenge_finalize_row",
  "cycle_ends_at <= $3::timestamptz",
  "finalization_source = 'worker'",
  "finalization_run_id = $4::uuid",
  "finalized_completed",
  "finalized_not_completed",
  "rewardsEnabled: false",
  "enrollmentFingerprint",
  "loadLatestFinalizedOfficialJournalChallenge",
]) {
  requireText("challengeFinalizer", invariant, `challenge finalizer is missing ${invariant}`);
}

for (const forbidden of ["localStorage", "sessionStorage", "Math.random"] ) {
  rejectText("challengeClient", forbidden, `challenge client contains forbidden browser authority: ${forbidden}`);
}
for (const invariant of [
  "rewards.xp !== 0",
  "rewards.badge !== null",
  "validReflections * 5 >= eligibleClosedTrades * 4",
  "createCommunityChallengeIdempotencyKey",
  "cryptoApi.randomUUID",
  "cryptoApi.getRandomValues",
]) {
  requireText("challengeClient", invariant, `challenge client contract is missing ${invariant}`);
}

for (const forbidden of ["localStorage", "sessionStorage", "Math.random", "Date.now()"] ) {
  rejectText("challengeHistoryClient", forbidden, `challenge history client contains forbidden browser authority: ${forbidden}`);
  rejectText("challengeHistoryCard", forbidden, `challenge history card contains forbidden browser authority: ${forbidden}`);
}
for (const invariant of [
  "rewards.xp !== 0",
  'raw.status === "not_completed" && expectedEligible',
  "validReflections * 5 >= eligibleClosedTrades * 4",
]) {
  requireText("challengeHistoryClient", invariant, `challenge history client contract is missing ${invariant}`);
}
for (const invariant of [
  'fetch("/api/community/challenge-history"',
  "parseOfficialJournalChallengeHistoryPayload",
  "هیچ نتیجه محلی یا نمایشی جایگزین نمی‌شود",
  "XP = ۰، Badge = ندارد و پاداش مالی = ندارد",
]) {
  requireText("challengeHistoryCard", invariant, `finalized challenge UI is missing ${invariant}`);
}

for (const invariant of [
  'getCanonicalSession(req, { strictRevocation: true })',
  'scopes: ["community:challenge:read"]',
  "resolveTenantPrincipalContext",
  "loadLatestFinalizedOfficialJournalChallenge",
  'namespace: "community-journal-challenge-history-read"',
  'response.headers.set("Cache-Control", "private, no-store")',
  'response.headers.set("Vary", "Cookie")',
]) {
  requireText("challengeHistoryRoute", invariant, `challenge history route is missing ${invariant}`);
}
for (const forbidden of [
  "PLATFORM.DEFAULT_TENANT_ID", "studentId: body", "tenantId: body",
]) {
  rejectText("challengeHistoryRoute", forbidden, `challenge history route contains forbidden authority ${forbidden}`);
}

for (const invariant of [
  "finalizeEndedOfficialJournalChallenges",
  "COMMUNITY_CHALLENGE_FINALIZATION_BATCH",
  "process.exit(1)",
  "process.exitCode = 2",
]) {
  requireText("challengeFinalizationRunner", invariant, `challenge finalization runner is missing ${invariant}`);
}
requireText("package", '"community:challenge:finalize"', "package must expose scheduler-ready finalization command");

for (const invariant of [
  'FILENAME = "0047_community_profile_consent_authority.sql"',
  "ALTER COLUMN visibility SET DEFAULT 'private'",
  "leaderboard_visible BOOLEAN NOT NULL DEFAULT FALSE",
  "journal_sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE",
  "instructor_review_consent BOOLEAN NOT NULL DEFAULT FALSE",
  "challenge_participation BOOLEAN NOT NULL DEFAULT FALSE",
  "study_group_discovery BOOLEAN NOT NULL DEFAULT FALSE",
  "academy_public_profiles_principal_binding_fk",
  "community profile identity is immutable",
  "community profile consent revision must advance by one",
]) {
  requireText("communityMigration", invariant, `Community consent migration is missing ${invariant}`);
}
requireText("migrationPlan", "runCommunityProfileConsentMigrations", "canonical migration plan must execute Community consent migration");

for (const invariant of [
  'import "server-only"', "AvailableTenantPrincipalContext", "context.scopes.includes(requiredScope)",
  "withTx", "pg_advisory_xact_lock", "FOR UPDATE OF profile", "expectedRevision",
  "writeSensitiveMutationAuditTx", 'action: "community.profile.consent.update"',
  'resourceType: "community_profile"', "principalFingerprint", "const arenaScore = 0",
]) {
  requireText("communityAuthority", invariant, `Community profile authority is missing ${invariant}`);
}
for (const forbidden of [
  "localStorage", "sessionStorage", "fs/promises", "community-career.local.json",
  "simulator_snapshot", "DEFAULT 'public'",
]) {
  rejectText("communityAuthority", forbidden, `Community authority contains forbidden legacy source ${forbidden}`);
}

for (const invariant of [
  "getCanonicalSession(req, { strictRevocation: true })",
  "resolveTenantPrincipalContext",
  'scopes: ["community:profile:read"]',
  'scopes: ["community:profile:write"]',
  'scopes: ["community:journal:read"]',
  'scopes: ["community:challenge:read"]',
  'scopes: ["community:challenge:write"]',
  'view !== "journal-reflection-challenge"',
  'namespace: "community-journal-challenge-read"',
  'namespace: "community-journal-challenge-write"',
  "loadOfficialJournalChallengeState",
  "processOfficialJournalChallengeCommand",
  "parseCommunityJournalCursor",
  "listCommunityJournalFeed",
  'req.headers.get("idempotency-key")',
  "readBoundedJsonRequest",
  "Object.keys(body).some",
  "expectedRevision",
  "updateCommunityProfileConsent",
  'apiError("community_challenge_unavailable", 503)',
  'apiError("community_profile_revision_conflict", 409)',
  'response.headers.set("Cache-Control", "private, no-store")',
  'response.headers.set("Vary", "Cookie")',
]) {
  requireText("communityRoute", invariant, `Community profile route is missing ${invariant}`);
}
for (const forbidden of [
  "setPublicVisibilityForStudent", "setCurrentPublicVisibility",
  'body.visibility === "private" ? "private" : "public"',
  "studentId: body", "tenantId: body", "workspaceId: body",
  "PLATFORM.DEFAULT_TENANT_ID, workspaceId: journalContext",
]) {
  rejectText("communityRoute", forbidden, `Community route contains forbidden authority ${forbidden}`);
}

for (const invariant of [
  'import "server-only"', "AvailableTenantPrincipalContext",
  'context.scopes.includes("community:journal:read")',
  "academy_trading_arena_reflections", "academy_public_profiles", "platform_principal_bindings",
  "profile.journal_sharing_enabled = TRUE", "profile.consented_at IS NOT NULL",
  "ORDER BY reflection.evidence_closed_at DESC, reflection.id DESC",
  "encodeCommunityJournalCursor", "parseCommunityJournalCursor",
  "minimizeCommunityJournalPublicText", "SECRET_LABEL", "EMAIL_PATTERN",
  "PHONE_PATTERN", "ETH_ADDRESS_PATTERN", "BTC_ADDRESS_PATTERN",
  "JWT_PATTERN", "API_KEY_PATTERN", "PRIVATE_KEY_PATTERN", "SECRET_PLACEHOLDER",
]) {
  requireText("communityJournalAuthority", invariant, `Community journal authority is missing ${invariant}`);
}
for (const forbidden of [
  "localStorage", "sessionStorage", "Math.random", "evidence_realized_pnl",
  "evidence_realized_pnl_rate", "decision_review", "emotional_review", "DEMO_SHARED_ENTRIES",
]) {
  rejectText("communityJournalAuthority", forbidden, `Community journal authority exposes forbidden source/field ${forbidden}`);
}

for (const target of ["peerJournals", "communityJournalClient"]) {
  for (const forbidden of [
    "@/lib/trading-journal", "@/lib/community-profile", "loadJournal",
    "loadCommunityProfile", "localStorage", "sessionStorage", "DEMO_SHARED_ENTRIES",
    "isDemoEntry", "Math.random",
  ]) {
    rejectText(target, forbidden, `Community journal client surface contains forbidden browser/demo authority ${forbidden}`);
  }
}
for (const invariant of [
  'fetch("/api/community/profile"',
  'fetch("/api/community/profile?view=journal-feed&limit=20"',
  '"Idempotency-Key": createCommunityJournalIdempotencyKey()',
  "expectedRevision: profile.revision", "parseCommunityOwnedProfilePayload",
  "parseCommunityConsentMutationPayload", "parseCommunityJournalFeedPayload",
  "Reflectionهای ذخیره‌شده در PostgreSQL",
]) {
  requireText("peerJournals", invariant, `Peer journals UI is missing ${invariant}`);
}
for (const invariant of [
  "cryptoApi.randomUUID", "cryptoApi.getRandomValues", "parseCommunityJournalFeedPayload",
  "parseCommunityOwnedProfilePayload", "parseCommunityConsentMutationPayload",
]) {
  requireText("communityJournalClient", invariant, `Community journal client contract is missing ${invariant}`);
}

for (const forbidden of [
  "CREATE TABLE IF NOT EXISTS", "fs/promises", "community-career.local.json",
  "academy-profiles.local.json", "simulator_snapshot", "setPublicVisibilityForStudent",
  "setCurrentPublicVisibility",
]) {
  rejectText("communityCareer", forbidden, `Community adapter contains forbidden legacy authority ${forbidden}`);
}
for (const invariant of [
  "loadOwnedCommunityProfile", "loadPublicCommunityProfile", "listPublicCommunityProfiles",
  "resolveTenantPrincipalContext", "publicProfileId",
]) {
  requireText("communityCareer", invariant, `Community adapter is missing ${invariant}`);
}

requireText("audit", '"community.profile.consent.update"', "mandatory audit action is missing");
requireText("audit", '"community_profile"', "mandatory audit resource is missing");
rejectText("browserGuard", '"src/lib/community-profile.ts"', "retired Community browser persistence exception remains");
rejectText("browserGuard", '"src/lib/community-challenges.ts": {', "retired Community challenge persistence exception remains");
for (const protectedPath of [
  '"src/components/academy/community/PeerJournals.tsx"',
  '"src/lib/community-journal-client.ts"',
  '"src/components/academy/community/ChallengeCenter.tsx"',
  '"src/lib/community-challenges.ts"',
  '"src/lib/community-journal-challenge-client.ts"',
  '"src/lib/community-journal-challenge-authority.ts"',
  '"src/lib/community-journal-challenge-finalization.ts"',
  '"src/lib/community-journal-challenge-history-client.ts"',
  '"src/app/api/community/challenge-history/route.ts"',
  '"src/components/academy/community/FinalizedChallengeHistoryCard.tsx"',
]) {
  requireText("browserGuard", protectedPath, `browser guard is missing protected surface ${protectedPath}`);
}
for (const testPath of [
  "community-journal-feed-postgres.integration.ts",
  "community-journal-redaction.integration.ts",
  "community-journal-challenge-client.test.ts",
  "community-journal-challenge-history-client.test.ts",
  "community-journal-challenge-source-boundary.test.ts",
  "community-journal-challenge-finalization-source-boundary.test.ts",
  "community-journal-challenge-postgres.integration.ts",
  "community-journal-challenge-finalization-postgres.integration.ts",
]) {
  requireText("package", testPath, `permanent Community gate is missing ${testPath}`);
}

if (failures.length > 0) {
  console.error("Social/Arena evidence boundary failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Social/Arena evidence boundary passed: Community consent, shared Arena reflections, current-cycle challenge evaluation and post-cycle immutable finalization are PostgreSQL-authoritative, tenant-bound and free of browser-generated official evidence; every other challenge and all rewards remain disabled.",
);
