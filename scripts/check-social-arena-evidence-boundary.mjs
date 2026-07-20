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
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);
const inventory = JSON.parse(source.inventory);
const failures = [];

function requireText(target, token, reason) {
  if (!source[target].includes(token)) failures.push(`${paths[target]}: ${reason}`);
}
function rejectText(target, token, reason) {
  if (source[target].includes(token)) failures.push(`${paths[target]}: ${reason}`);
}

if (inventory.schemaVersion !== 1 || inventory.issue !== 168) {
  failures.push(`${paths.inventory}: inventory identity/schema is invalid`);
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
  "localStorage",
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
  "localStorage",
]) {
  rejectText("instructor", token, `instructor assessment cannot use browser evidence: ${token}`);
}
requireText("instructor", "fetchBehavioralSnapshot", "instructor self-view must use the server behavioral snapshot");
requireText("instructor", "اشتراک واقعی با مدرس", "instructor sharing must disclose the server-consent migration boundary");

failures.push(...previewChallengeViolations(source.challenge));
for (const token of ["@/lib/trading-arena", "@/lib/trading-journal", "localStorage"] ) {
  rejectText("challenge", token, `challenge preview cannot read browser authority: ${token}`);
}
requireText("challenge", "فقط پیش‌نمایش تمرین‌هاست", "challenge UI must disclose preview-only status");
requireText("challenge", "تکمیل، امتیاز، XP و پاداش رسمی", "challenge UI must disclose disabled official outcomes");

if (failures.length > 0) {
  console.error("Social/Arena evidence boundary failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Social/Arena evidence boundary passed: browser-owned scores, PnL, completion, IDs and timestamps are quarantined from Mentor, instructor assessment and official challenge outcomes.",
);
