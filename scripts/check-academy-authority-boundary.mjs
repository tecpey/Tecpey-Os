import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const stateRoute = await read("src/app/api/academy-state/route.ts");
const lessonRoute = await read("src/app/api/academy-lesson-assessment/route.ts");
const migration = await read("src/lib/db-migrate-user-state.ts");
const progress = await read("src/lib/academy-progress.ts");
const lessonClient = await read("src/components/academy/v2/LessonPlayerV2Client.tsx");
const articlePage = await read("src/app/academy/[slug]/page.tsx");
const articleCompanion = await read("src/components/academy/AcademyArticleLearningCompanion.tsx");
const browserGuard = await read("scripts/check-browser-persistence.mjs");
const clientTests = await read("src/tests/security/academy-progress-client-authority.test.ts");

const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

const genericMutations = ["award_xp", "pass_term", "award_badge", "lesson_complete", "module_score"];
for (const mutation of genericMutations) {
  if (stateRoute.includes(mutation)) failures.push(`/api/academy-state still contains generic mutation: ${mutation}`);
}
if (!stateRoute.includes("academy_state_read_only") || !stateRoute.includes('Allow: "GET"')) {
  failures.push("/api/academy-state POST must fail closed as a GET-only projection");
}
for (const contract of [
  "strictRevocation: true",
  "gradeCanonicalLesson",
  "readLearningCommand",
  "pg_advisory_xact_lock",
  "refreshAcademyProgressProjection",
]) {
  requireText(lessonRoute, contract, `official lesson assessment missing authority contract: ${contract}`);
}
for (const contract of [
  "UNIQUE (student_id, locale, reward_key)",
  "UNIQUE (student_id, command_type, request_hash)",
  "academy_progress_legacy_snapshots",
  "progress_authority",
]) {
  requireText(migration, contract, `missing Academy authority migration contract: ${contract}`);
}

requireText(progress, "hydrateProgressStrict", "authoritative lesson surfaces need strict server hydration");
requireText(progress, "refreshProgressStrict", "authoritative retry must remain strict");
requireText(progress, 'method: "GET"', "browser progress model must be projection-only");
rejectText(progress, "localStorage", "Academy progress read model may not use browser persistence");
rejectText(progress, "sessionStorage", "Academy progress read model may not use session persistence");

requireText(lessonClient, 'hydrateProgressStrict("fa")', "official lesson must hydrate server state before rendering");
requireText(lessonClient, 'status === "error"', "official lesson must visibly fail closed on projection outage");
requireText(lessonClient, "پیشرفت رسمی حساب بازیابی نشد", "projection outage must not look like an empty learner account");

requireText(articlePage, "AcademyArticleLearningCompanion", "public articles must use the non-authoritative study companion");
rejectText(articlePage, "AcademyLessonPlayer", "legacy browser-owned lesson player import is forbidden");
requireText(articleCompanion, "هیچ XP، قبولی، مدرک", "article study must truthfully deny reward authority");
requireText(articleCompanion, "فقط تا زمانی که صفحه باز است", "article review marks must be explicitly ephemeral");
rejectText(articleCompanion, "localStorage", "article review may not persist browser-owned progress");
rejectText(articleCompanion, "sessionStorage", "article review may not persist browser-owned progress");
rejectText(articleCompanion, "+10XP", "article UI may not advertise client-issued XP");
rejectText(browserGuard, '"src/components/academy/AcademyLessonPlayer.tsx"', "removed legacy progress debt must not remain in browser baseline");

try {
  await access(path.join(root, "src/components/academy/AcademyLessonPlayer.tsx"));
  failures.push("legacy AcademyLessonPlayer.tsx still exists");
} catch {
  // Expected: the browser-authoritative component is deleted.
}

for (const evidence of [
  "hydrates XP, completion and term state only from the server projection",
  "fails closed when the authoritative projection cannot be loaded",
  "normalizes forged display fields without granting client XP or badges",
  "does not expose any browser persistence API",
]) {
  requireText(clientTests, evidence, `missing Academy client authority evidence: ${evidence}`);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(absolute);
  }
  return files;
}

const forbiddenHelpers = /\b(awardXp|recordLessonComplete|recordModuleScore|passTerm|awardBadge)\b/;
for (const file of await walk(path.join(root, "src"))) {
  if (file.includes(`${path.sep}tests${path.sep}`)) continue;
  const content = await readFile(file, "utf8");
  if (forbiddenHelpers.test(content)) failures.push(`client-issued Academy reward helper remains: ${path.relative(root, file)}`);
}

if (failures.length > 0) {
  console.error("Academy authority boundary failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Academy authority boundary OK: public articles issue no progress, official lessons hydrate strict server projections, assessments are server-graded and generic state remains read-only.");
