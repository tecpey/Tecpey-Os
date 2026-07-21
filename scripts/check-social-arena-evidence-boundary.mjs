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

if (inventory.schemaVersion !== 1 || inventory.issue !== 168 || inventory.followUpIssue !== 212) {
  failures.push(`${paths.inventory}: inventory identity/schema or #212 linkage is invalid`);
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

failures.push(...previewChallengeViolations(source.challenge));
for (const token of ["@/lib/trading-arena", "@/lib/trading-journal", "localStorage."]) {
  rejectText("challenge", token, `challenge preview cannot read browser authority: ${token}`);
}
requireText("challenge", "فقط پیش‌نمایش تمرین‌هاست", "challenge UI must disclose preview-only status");
requireText("challenge", "تکمیل، امتیاز، XP و پاداش رسمی", "challenge UI must disclose disabled official outcomes");

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
  'req.headers.get("idempotency-key")',
  "readBoundedJsonRequest",
  "Object.keys(body).some",
  "expectedRevision",
  "updateCommunityProfileConsent",
  'apiError("community_profile_revision_conflict", 409)',
  'apiError("community_profile_unavailable", 503)',
  'response.headers.set("Cache-Control", "private, no-store")',
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
]) {
  rejectText("communityRoute", forbidden, `Community route contains forbidden authority ${forbidden}`);
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

requireText("audit", '"community.profile.consent.update"', "mandatory audit action is missing");
requireText("audit", '"community_profile"', "mandatory audit resource is missing");
rejectText("browserGuard", '"src/lib/community-profile.ts"', "retired Community browser persistence exception remains");

if (failures.length > 0) {
  console.error("Social/Arena evidence boundary failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Social/Arena evidence boundary passed: browser-owned outcomes stay quarantined and Community profile consent is default-private, tenant/principal-bound, revisioned and transactionally evidenced.",
);
