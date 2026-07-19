import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const files = {
  package: "package.json",
  workflow: ".github/workflows/ci.yml",
  stateRoute: "src/app/api/academy-state/route.ts",
  legacyLessonRoute: "src/app/api/academy-lesson-progress/route.ts",
  lessonRoute: "src/app/api/academy-lesson-assessment/route.ts",
  termRoute: "src/app/api/academy-term-progress/route.ts",
  termClient: "src/components/academy/TermQuizClient.tsx",
  migration: "src/lib/db-migrate-user-state.ts",
  hardening: "src/lib/db-migrate-academy-progress-hardening.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  projection: "src/lib/academy-progress-projection.ts",
  progress: "src/lib/academy-progress.ts",
  pathHook: "src/hooks/useAcademyPathProgress.ts",
  dashboard: "src/components/academy/AcademyStudentDashboard.tsx",
  lessonClient: "src/components/academy/v2/LessonPlayerV2Client.tsx",
  sectionControl: "src/components/academy/AcademyLessonCompletionControl.tsx",
  articlePage: "src/app/academy/[slug]/page.tsx",
  articleCompanion: "src/components/academy/AcademyArticleLearningCompanion.tsx",
  browserGuard: "scripts/check-browser-persistence.mjs",
  clientTests: "src/tests/security/academy-progress-client-authority.test.ts",
  projectionTests: "src/tests/security/academy-progress-projection-authority.test.ts",
  postgresTests: "src/tests/security/academy-progress-authority-postgres.test.ts",
};
const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await read(file)]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

requireText("package", '"academy:progress:check"', "focused Academy authority guard needs a governed command");
requireText("package", '"test:academy-progress"', "focused Academy tests need a governed command");
requireText("package", "npm run academy:progress:check", "release gate must execute Academy authority guard");
requireText("package", "npm run test:academy-progress", "release gate must execute focused Academy tests");
requireText("workflow", "Academy progress authority tests", "CI must expose focused Academy progress evidence");
requireText("workflow", "npm run test:academy-progress", "CI must call the governed focused test command");

for (const mutation of ["award_xp", "pass_term", "award_badge", "lesson_complete", "module_score"]) {
  rejectText("stateRoute", mutation, `generic state projection still contains mutation ${mutation}`);
}
requireText("stateRoute", "academy_state_read_only", "generic state POST must fail closed");
requireText("stateRoute", 'Allow: "GET"', "generic state endpoint must advertise GET-only authority");
requireText("stateRoute", "server_projection_v2", "state endpoint must expose progress authority v2");
requireText("stateRoute", "strictRevocation: true", "state reads require a durable current session");

requireText("legacyLessonRoute", "academy_lesson_progress_read_only", "legacy self-completion endpoint must reject writes");
requireText("legacyLessonRoute", 'response.headers.set("Allow", "GET")', "legacy endpoint must remain GET-only");
rejectText("legacyLessonRoute", "awardAcademyReward", "legacy section route may not issue rewards");
rejectText("legacyLessonRoute", "refreshAcademyProgressProjection", "legacy section route may not refresh official progress");
rejectText("legacyLessonRoute", "export async function POST", "legacy section route may not expose POST mutation");

for (const contract of [
  "strictRevocation: true",
  "gradeCanonicalLesson",
  "readLearningCommand",
  "pg_advisory_xact_lock",
  "refreshAcademyProgressProjection",
]) requireText("lessonRoute", contract, `official lesson assessment missing ${contract}`);
for (const contract of [
  "strictRevocation: true",
  "term_assessment",
  "readLearningCommand",
  "pg_advisory_xact_lock",
  "awardAcademyReward",
  "refreshAcademyProgressProjection",
  "idempotency_key_required",
  "server_term_assessment_v2",
]) requireText("termRoute", contract, `official term assessment missing ${contract}`);
for (const forbidden of [
  'from "fs/promises"',
  "readLocalProgress",
  "writeLocalProgress",
  "canUseLocalProgress",
  "ACADEMY_PROGRESS_LOCAL_FILE",
  "TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE",
]) rejectText("termRoute", forbidden, `term assessment retains forbidden filesystem fallback ${forbidden}`);
requireText("termClient", "assessmentCommandId", "client retries need stable command identity");
requireText("termClient", '"Idempotency-Key": idempotencyKey', "term client must send stable idempotency header");
requireText("termClient", "assessmentCommandId.current = null", "a deliberate new attempt must rotate command identity");

for (const contract of [
  "UNIQUE (student_id, locale, reward_key)",
  "UNIQUE (student_id, command_type, request_hash)",
  "academy_progress_legacy_snapshots",
  "progress_authority",
]) requireText("migration", contract, `missing original Academy authority migration contract ${contract}`);
for (const contract of [
  "0027_academy_progress_authority_v2.sql",
  "academy_progress_legacy_reward_quarantine",
  "client_declared_section_completion",
  "academy_reward_ledger_reject_client_section",
  "academy_lesson_progress_read_only",
  "academy_term_learning_progress_read_only",
  "academy_progress_legacy_reward_quarantine_no_update",
  "academy_progress_legacy_reward_quarantine_no_delete",
  "legacy_section_quarantine",
]) requireText("hardening", contract, `missing progress v2 database contract ${contract}`);
requireText("migrationPlan", "runAcademyProgressHardeningMigrations", "canonical migration plan must include progress v2 hardening");

requireText("projection", "server_projection_v2", "official projection must persist v2 authority");
requireText("projection", "reward ledger is the sole XP", "projection must declare reward-ledger-only XP");
requireText("projection", "if (!assessment.passed_at) continue", "lesson completion must require a passed canonical assessment");
rejectText("projection", "sectionXp", "legacy section XP may not contribute to official XP");
rejectText("projection", "evidence.sections.map", "legacy section activity may not contribute to streak");
rejectText("projection", "academy_term_learning_progress", "official projection may not read client-derived term summaries");
rejectText("projection", "academy_lesson_progress", "official projection may not read self-declared section completion");

requireText("progress", "hydrateProgressStrict", "authoritative lesson surfaces need strict server hydration");
requireText("progress", "refreshProgressStrict", "authoritative retry must remain strict");
requireText("progress", 'method: "GET"', "browser progress model must be projection-only");
rejectText("progress", "localStorage", "Academy progress read model may not use browser persistence");
rejectText("progress", "sessionStorage", "Academy progress read model may not use session persistence");

requireText("pathHook", "/api/academy-state", "roadmap must load the official projection");
requireText("pathHook", "/api/academy-term-progress", "roadmap must load official term assessments");
requireText("pathHook", "Per-term XP is intentionally not reconstructed", "browser must not reconstruct reward values");
rejectText("pathHook", "/api/academy-lesson-progress", "roadmap may not consume legacy section summaries");
rejectText("pathHook", "learningTerms", "legacy term-learning summaries are forbidden");

requireText("dashboard", "Server-authoritative learning record", "dashboard must disclose its authority source");
requireText("dashboard", "totalXp", "dashboard must render XP supplied by the projection hook");
requireText("dashboard", "Only badges issued by the server reward ledger", "dashboard must disclose badge authority");
rejectText("dashboard", 'method: "POST"', "dashboard may not push derived progress into a profile endpoint");
rejectText("dashboard", "progress: termProgress", "dashboard may not submit browser-derived progress");
rejectText("dashboard", "totalXp = useMemo", "dashboard may not reconstruct total XP from term cards");

requireText("lessonClient", 'hydrateProgressStrict("fa")', "official lesson must hydrate server state before rendering");
requireText("lessonClient", 'status === "error"', "official lesson must visibly fail closed on projection outage");
requireText("lessonClient", "پیشرفت رسمی حساب بازیابی نشد", "projection outage must not look like an empty learner account");

requireText("sectionControl", "There is no self-issued", "term section control must deny self-issued completion");
rejectText("sectionControl", "fetch(", "term section control may not call a mutation API");
rejectText("sectionControl", "کامل کردم", "self-completion action must be removed");

requireText("articlePage", "AcademyArticleLearningCompanion", "public articles must use the non-authoritative study companion");
rejectText("articlePage", "AcademyLessonPlayer", "legacy browser-owned lesson player import is forbidden");
requireText("articleCompanion", "هیچ XP، قبولی، مدرک", "article study must truthfully deny reward authority");
requireText("articleCompanion", "فقط تا زمانی که صفحه باز است", "article review marks must be explicitly ephemeral");
rejectText("articleCompanion", "localStorage", "article review may not persist browser-owned progress");
rejectText("articleCompanion", "sessionStorage", "article review may not persist browser-owned progress");
rejectText("articleCompanion", "+10XP", "article UI may not advertise client-issued XP");
rejectText("browserGuard", '"src/components/academy/AcademyLessonPlayer.tsx"', "removed legacy progress debt must not remain in browser baseline");

try {
  await access(path.join(root, "src/components/academy/AcademyLessonPlayer.tsx"));
  failures.push("src/components/academy/AcademyLessonPlayer.tsx: legacy browser authority still exists");
} catch {
  // Expected.
}

for (const evidence of [
  "hydrates XP, completion and term state only from the server projection",
  "fails closed when the authoritative projection cannot be loaded",
  "normalizes forged display fields without granting client XP or badges",
  "does not expose any browser persistence API",
]) requireText("clientTests", evidence, `missing client evidence ${evidence}`);
for (const evidence of [
  "ignores forged legacy section XP, completion and term summary evidence",
  "creates completion only from a passed canonical lesson assessment",
  "unlocks later terms only from server-owned term assessment status",
]) requireText("projectionTests", evidence, `missing projection evidence ${evidence}`);
for (const evidence of [
  "rejects client-declared section progress and section reward writes",
  "builds durable progress only from canonical assessments, rewards and term status",
  "keeps historical quarantine and legacy tables immutable",
]) requireText("postgresTests", evidence, `missing PostgreSQL evidence ${evidence}`);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) output.push(absolute);
  }
  return output;
}

const forbiddenHelpers = /\b(awardXp|recordLessonComplete|recordModuleScore|passTerm|awardBadge)\b/;
for (const file of await walk(path.join(root, "src"))) {
  if (file.includes(`${path.sep}tests${path.sep}`)) continue;
  const source = await readFile(file, "utf8");
  if (forbiddenHelpers.test(source)) {
    failures.push(`${path.relative(root, file)}: client-issued Academy reward helper remains`);
  }
}

if (failures.length) {
  console.error("Academy authority boundary failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Academy authority boundary OK: browser and legacy section surfaces issue no progress, XP or unlocks; official lesson/term assessments, reward ledger and server projection v2 are the only authorities.");
