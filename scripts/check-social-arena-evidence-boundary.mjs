import { readFile } from "node:fs/promises";
import {
  legacyImportViolations,
  previewChallengeViolations,
} from "./social-arena-evidence-policy.mjs";

const paths = {
  inventory: "docs/security/social-arena-evidence-inventory.json",
  verified: "src/lib/security/verified-social-arena-evidence.ts",
  boundary: "src/lib/social-arena-evidence-boundary.ts",
  smartReview: "src/lib/smart-review.ts",
  mentor: "src/components/academy/v2/MentorV2.tsx",
  insights: "src/components/academy/v2/LearningInsightsDashboard.tsx",
  instructor: "src/components/academy/community/InstructorDashboard.tsx",
  challenge: "src/components/academy/community/ChallengeCenter.tsx",
  challengeCatalogue: "src/lib/community-challenges.ts",
  challengeAuthority: "src/lib/community-journal-challenge-authority.ts",
  challengeClient: "src/lib/community-challenge-client.ts",
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

if (inventory.schemaVersion !== 1 || inventory.issue !== 168 || inventory.followUpIssue !== 216) {
  failures.push(`${paths.inventory}: inventory identity/schema or #216 linkage is invalid`);
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
for (const authorityPath of [
  "src/lib/community-profile-authority.ts",
  "src/app/api/community/profile/route.ts",
  "src/lib/community-journal-authority.ts",
  "src/lib/community-journal-challenge-authority.ts",
  "src/lib/community-challenge-client.ts",
]) {
  if (!inventory.canonicalAuthorities.some((entry) => entry.path === authorityPath)) {
    failures.push(`${paths.inventory}: missing canonical authority ${authorityPath}`);
  }
}
for (const field of [
  "score",
  "pnl",
  "pnlPct",
  "id",
  "createdAt",
  "completedAt",
  "timestamp",
  "completed",
  "publicProfileId",
  "revision",
  "consentedAt",
  "closedTradeCount",
  "reflectedTradeCount",
  "reflectionRate",
  "xp",
  "badge",
  "rewardedAt",
]) {
  if (!inventory.forbiddenClientOfficialFields.includes(field)) {
    failures.push(`${paths.inventory}: missing forbidden browser evidence field ${field}`);
  }
}

requireText("verified", 'import "server-only"', "official evidence type must be server-only");
requireText("verified", "const VERIFIED_SOCIAL_ARENA_EVIDENCE = Symbol", "official evidence requires an unexported symbol brand");
requireText("verified", "createVerifiedSocialArenaEvidence", "server factory is missing");
requireText("verified", "tecpey-social-arena-evidence-v1", "evidence hash must be domain separated");
requireText("verified", "Object.freeze", "verified evidence must be immutable");

for (const field of [
  '"score"',
  '"disciplineScore"',
  '"pnl"',
  '"pnlPct"',
  '"realizedPnl"',
  '"id"',
  '"createdAt"',
  '"completedAt"',
  '"timestamp"',
  '"completed"',
]) {
  requireText("boundary", field, `browser official evidence rejector is missing ${field}`);
}
requireText("boundary", "browser_official_evidence_forbidden", "browser evidence rejection must use a stable error code");

for (const target of ["mentor", "insights", "instructor", "mentorMemory", "mentorSignals", "behavioral", "coaching"]) {
  failures.push(...legacyImportViolations(paths[target], source[target]));
}

for (const token of [
  "localStorage.",
  "loadProgress",
  "loadDeck",
  "getDueCards",
  "@/lib/academy-progress",
  "@/lib/spaced-repetition",
]) {
  rejectText("smartReview", token, `smart review cannot personalize from browser evidence: ${token}`);
}
requireText("smartReview", 'authority: "server-required"', "smart review must expose an explicit server migration boundary");

for (const token of [
  "@/lib/community-profile",
  "@/lib/community-leaderboard",
  "@/lib/trading-arena",
  "@/lib/trading-journal",
  "loadProgress",
  "localStorage.",
]) {
  rejectText("instructor", token, `instructor assessment cannot use browser evidence: ${token}`);
}
requireText("instructor", "fetchBehavioralSnapshot", "instructor self-view must use the server behavioral snapshot");
requireText("instructor", "اشتراک واقعی با مدرس", "instructor sharing must remain disabled until role/grant authority exists");

for (const invariant of [
  'FILENAME = "0047_community_profile_consent_authority.sql"',
  "ALTER COLUMN visibility SET DEFAULT 'private'",
  "leaderboard_visible BOOLEAN NOT NULL DEFAULT FALSE",
  "journal_sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE",
  "instructor_review_consent BOOLEAN NOT NULL DEFAULT FALSE",
  "challenge_participation BOOLEAN NOT NULL DEFAULT FALSE",
  "study_group_discovery BOOLEAN NOT NULL DEFAULT FALSE",
  "academy_public_profiles_principal_binding_fk",
  "platform_principal_bindings",
  "community profile identity is immutable",
  "community profile consent revision must advance by one",
]) {
  requireText("communityMigration", invariant, `Community consent migration is missing ${invariant}`);
}
requireText("migrationPlan", "runCommunityProfileConsentMigrations", "canonical migration plan must execute Community consent migration");

for (const invariant of [
  'import "server-only"',
  "AvailableTenantPrincipalContext",
  "context.scopes.includes(requiredScope)",
  "withTx",
  "pg_advisory_xact_lock",
  "FOR UPDATE OF profile",
  "expectedRevision",
  "writeSensitiveMutationAuditTx",
  'action: "community.profile.consent.update"',
  'resourceType: "community_profile"',
  "principalFingerprint",
  "profile.visibility = 'public'",
  "profile.leaderboard_visible = TRUE",
  "const arenaScore = 0",
]) {
  requireText("communityAuthority", invariant, `Community profile authority is missing ${invariant}`);
}
for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "fs/promises",
  "community-career.local.json",
  "simulator_snapshot",
  "DEFAULT 'public'",
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
  'view !== "profile" && view !== "journal-feed" && view !== "challenge-center"',
  'view !== "profile" && view !== "journal-challenge"',
  'namespace: "community-journal-feed"',
  'namespace: "community-journal-challenge-claim"',
  "parseCommunityJournalCursor",
  "listCommunityJournalFeed",
  "loadJournalChallengeStatus",
  "parseChallengeClaim",
  "CHALLENGE_CLAIM_FIELDS",
  "claimJournalChallenge",
  'apiError("invalid_community_challenge_claim", 400)',
  'apiError("community_challenge_not_eligible", 409',
  'apiError("idempotency_conflict", 409)',
  'apiError("community_challenge_unavailable", 503)',
  'req.headers.get("idempotency-key")',
  "readBoundedJsonRequest",
  "Object.keys(body).some",
  "expectedRevision",
  "updateCommunityProfileConsent",
  'apiError("community_profile_revision_conflict", 409)',
  'apiError("community_profile_unavailable", 503)',
  'response.headers.set("Cache-Control", "private, no-store")',
  'response.headers.set("Vary", "Cookie")',
]) {
  requireText("communityRoute", invariant, `Community profile route is missing ${invariant}`);
}
for (const forbidden of [
  "setPublicVisibilityForStudent",
  "setCurrentPublicVisibility",
  'body.visibility === "private" ? "private" : "public"',
  "studentId: body",
  "tenantId: body",
  "workspaceId: body",
  "body.score",
  "body.xp",
  "body.badge",
  "body.closedTradeCount",
  "body.reflectedTradeCount",
  "body.completed",
  "body.rewardedAt",
]) {
  rejectText("communityRoute", forbidden, `Community route contains forbidden authority ${forbidden}`);
}

for (const invariant of [
  'import "server-only"',
  "AvailableTenantPrincipalContext",
  'context.scopes.includes("community:journal:read")',
  "academy_trading_arena_reflections",
  "academy_public_profiles",
  "platform_principal_bindings",
  "profile.journal_sharing_enabled = TRUE",
  "profile.consented_at IS NOT NULL",
  "profile.consent_version = 'community-profile-consent-v1'",
  "ORDER BY reflection.evidence_closed_at DESC, reflection.id DESC",
  "encodeCommunityJournalCursor",
  "parseCommunityJournalCursor",
  "tecpey-community-journal-entry-v1",
  "tecpey-community-journal-author-v1",
  "minimizeCommunityJournalPublicText",
  "SECRET_LABEL",
  "EMAIL_PATTERN",
  "PHONE_PATTERN",
  "ETH_ADDRESS_PATTERN",
  "BTC_ADDRESS_PATTERN",
  "JWT_PATTERN",
  "API_KEY_PATTERN",
  "PRIVATE_KEY_PATTERN",
  "SECRET_PLACEHOLDER",
]) {
  requireText("communityJournalAuthority", invariant, `Community journal authority is missing ${invariant}`);
}
for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "Math.random",
  "evidence_realized_pnl",
  "evidence_realized_pnl_rate",
  "decision_review",
  "emotional_review",
  "DEMO_SHARED_ENTRIES",
]) {
  rejectText("communityJournalAuthority", forbidden, `Community journal authority exposes forbidden source/field ${forbidden}`);
}

for (const target of ["peerJournals", "communityJournalClient"]) {
  for (const forbidden of [
    "@/lib/trading-journal",
    "@/lib/community-profile",
    "loadJournal",
    "loadCommunityProfile",
    "localStorage",
    "sessionStorage",
    "DEMO_SHARED_ENTRIES",
    "isDemoEntry",
    "Math.random",
  ]) {
    rejectText(target, forbidden, `Community journal client surface contains forbidden browser/demo authority ${forbidden}`);
  }
}
for (const invariant of [
  'fetch("/api/community/profile"',
  'fetch("/api/community/profile?view=journal-feed&limit=20"',
  'fetch("/api/community/profile", { method: "PATCH"',
  '"Idempotency-Key": createCommunityJournalIdempotencyKey()',
  "expectedRevision: profile.revision",
  "parseCommunityOwnedProfilePayload",
  "parseCommunityConsentMutationPayload",
  "parseCommunityJournalFeedPayload",
  "Reflectionهای ذخیره‌شده در PostgreSQL",
]) {
  requireText("peerJournals", invariant, `Peer journals UI is missing ${invariant}`);
}
for (const invariant of [
  "cryptoApi.randomUUID",
  "cryptoApi.getRandomValues",
  "parseCommunityJournalFeedPayload",
  "parseCommunityOwnedProfilePayload",
  "parseCommunityConsentMutationPayload",
]) {
  requireText("communityJournalClient", invariant, `Community journal client contract is missing ${invariant}`);
}

failures.push(...previewChallengeViolations(source.challenge));
for (const target of ["challenge", "challengeCatalogue", "challengeClient"]) {
  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "loadParticipation",
    "saveParticipation",
    "joinChallenge",
    "markChallengeComplete",
    "loadArenaState",
    "computeArenaStats",
    "getJournalCompletionRate",
  ]) {
    rejectText(target, forbidden, `Community challenge surface contains forbidden browser authority ${forbidden}`);
  }
}
for (const invariant of [
  "getChallengeCycle(now = new Date())",
  "getUTCFullYear",
  "CHALLENGE_CYCLE_MS",
  'id: "journal-reflection-week"',
  'type: "journal-rate", minRate: 0.8, minTrades: 3',
  "هیچ سرمایه واقعی درگیر نیست",
]) {
  requireText("challengeCatalogue", invariant, `Challenge catalogue is missing ${invariant}`);
}
for (const invariant of [
  'import "server-only"',
  "AvailableTenantPrincipalContext",
  '"community:challenge:read"',
  '"community:challenge:write"',
  "academy_trading_arena_execution_events",
  "arena.position_closed",
  "closedTradeIds",
  "autoClosedTradeIds",
  "academy_trading_arena_reflections",
  "profile.challenge_participation",
  "JOURNAL_REFLECTION_MIN_TRADES = 3",
  "JOURNAL_REFLECTION_MIN_RATE = 0.8",
  "awardAcademyReward",
  "academy_learning_commands",
  "readLearningCommand",
  "storeLearningCommand",
  "existing.idempotencyConflict",
  "pg_advisory_xact_lock",
  "academy_student_events",
  "refreshAcademyProgressProjection",
  "writeSensitiveMutationAuditTx",
  'action: "community.challenge.reward.claim"',
  'resourceType: "community_challenge"',
  "server_arena_reflection_challenge_v1",
]) {
  requireText("challengeAuthority", invariant, `Official journal challenge authority is missing ${invariant}`);
}
for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "body.score",
  "body.xp",
  "body.badge",
  "body.closedTradeCount",
  "body.reflectedTradeCount",
  "Math.random",
]) {
  rejectText("challengeAuthority", forbidden, `Official journal challenge authority contains forbidden client/browser source ${forbidden}`);
}
for (const invariant of [
  "parseJournalChallengeStatusPayload",
  "parseJournalChallengeClaimPayload",
  "expectedRate",
  "raw.score !== Math.round(expectedRate * 100)",
  "reward.xp !== 200",
  'reward.badge !== "journal-master"',
  "cryptoApi.randomUUID",
  "cryptoApi.getRandomValues",
]) {
  requireText("challengeClient", invariant, `Challenge client contract is missing ${invariant}`);
}
for (const invariant of [
  'fetch("/api/community/profile?view=challenge-center"',
  'fetch("/api/community/profile?view=journal-challenge"',
  '"Idempotency-Key": createCommunityChallengeIdempotencyKey()',
  "expectedRevision: profile.revision",
  "parseJournalChallengeStatusPayload",
  "parseJournalChallengeClaimPayload",
  "فقط چالش بازتاب ژورنال دارای Authority رسمی است",
  "پیش‌نمایش کاتالوگ",
  "هیچ Count، Completion یا Reward مرورگری جایگزین نمی‌شود",
  "حداقل ۳ معامله",
  "پوشش ۸۰٪",
]) {
  requireText("challenge", invariant, `Challenge UI is missing ${invariant}`);
}

for (const forbidden of [
  "CREATE TABLE IF NOT EXISTS",
  "fs/promises",
  "community-career.local.json",
  "academy-profiles.local.json",
  "simulator_snapshot",
  "setPublicVisibilityForStudent",
  "setCurrentPublicVisibility",
]) {
  rejectText("communityCareer", forbidden, `Community adapter contains forbidden legacy authority ${forbidden}`);
}
for (const invariant of [
  "loadOwnedCommunityProfile",
  "loadPublicCommunityProfile",
  "listPublicCommunityProfiles",
  "resolveTenantPrincipalContext",
  "publicProfileId",
]) {
  requireText("communityCareer", invariant, `Community adapter is missing ${invariant}`);
}

requireText("audit", '"community.profile.consent.update"', "mandatory Community consent audit action is missing");
requireText("audit", '"community_profile"', "mandatory Community profile audit resource is missing");
requireText("audit", '"community.challenge.reward.claim"', "mandatory Community challenge reward audit action is missing");
requireText("audit", '"community_challenge"', "mandatory Community challenge audit resource is missing");
rejectText("browserGuard", '"src/lib/community-profile.ts"', "retired Community browser persistence exception remains");
rejectText("browserGuard", '"src/lib/community-challenges.ts": {', "retired Community challenge persistence exception remains");
for (const protectedPath of [
  '"src/components/academy/community/PeerJournals.tsx"',
  '"src/lib/community-journal-client.ts"',
  '"src/components/academy/community/ChallengeCenter.tsx"',
  '"src/lib/community-challenges.ts"',
  '"src/lib/community-challenge-client.ts"',
]) {
  requireText("browserGuard", protectedPath, `browser guard is missing protected surface ${protectedPath}`);
}
for (const testPath of [
  "community-journal-feed-postgres.integration.ts",
  "community-journal-redaction.integration.ts",
  "community-journal-challenge-postgres.integration.ts",
  "community-challenge-client.test.ts",
  "community-journal-challenge-source-boundary.test.ts",
]) {
  requireText("package", testPath, `permanent Community evidence gate is missing ${testPath}`);
}

if (failures.length > 0) {
  console.error("Social/Arena evidence boundary failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Social/Arena evidence boundary passed: Community consent, shared Arena reflections and the official journal-reflection challenge are server-authoritative, tenant-bound, exactly-once rewarded and free of browser/demo outcome authority; unsupported challenges remain preview-only.",
);
