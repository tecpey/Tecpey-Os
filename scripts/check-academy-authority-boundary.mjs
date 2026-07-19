import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const stateRoute = await readFile(path.join(root, "src/app/api/academy-state/route.ts"), "utf8");
const lessonAssessmentRoute = await readFile(path.join(root, "src/app/api/academy-lesson-assessment/route.ts"), "utf8");
const sectionRoute = await readFile(path.join(root, "src/app/api/academy-lesson-progress/route.ts"), "utf8");
const sectionAuthority = await readFile(path.join(root, "src/lib/academy-section-authority.ts"), "utf8");
const userStateMigration = await readFile(path.join(root, "src/lib/db-migrate-user-state.ts"), "utf8");
const sectionMigration = await readFile(path.join(root, "src/lib/db-migrate-academy-section-authority.ts"), "utf8");

const failures = [];
const genericMutations = ["award_xp", "pass_term", "award_badge", "lesson_complete", "module_score"];
for (const mutation of genericMutations) {
  if (stateRoute.includes(mutation)) failures.push(`/api/academy-state still contains generic mutation: ${mutation}`);
}

for (const contract of [
  "legacySnapshot",
  "authorityApplied: false",
  'reconciliationStatus: "quarantined"',
  "academy_progress_legacy_snapshots",
  "refreshAcademyProgressProjection",
]) {
  if (!stateRoute.includes(contract)) {
    failures.push(`/api/academy-state missing bounded quarantine contract: ${contract}`);
  }
}
for (const forbidden of ["body.progress", "body.xp", "body.completed", "body.termStatus"]) {
  if (stateRoute.includes(forbidden)) {
    failures.push(`/api/academy-state may not apply client progression field: ${forbidden}`);
  }
}

if (!lessonAssessmentRoute.includes("gradeCanonicalLesson") || !lessonAssessmentRoute.includes("readLearningCommand")) {
  failures.push("official lesson assessment must be server-graded and command-idempotent");
}
for (const contract of [
  "submitAcademySectionCheckpoint",
  "strictRevocation: true",
  "academy_lesson_progress_put_only",
]) {
  if (!sectionRoute.includes(contract)) failures.push(`section route missing authority boundary: ${contract}`);
}
for (const contract of [
  "gradeAcademySectionCheckpoint",
  "readLearningCommand",
  "academy_section_attempts",
  "awardAcademyReward",
  "previousOfficialTermPassed",
]) {
  if (!sectionAuthority.includes(contract)) failures.push(`section authority missing contract: ${contract}`);
}

for (const contract of [
  "UNIQUE (student_id, locale, reward_key)",
  "UNIQUE (student_id, command_type, request_hash)",
  "academy_progress_legacy_snapshots",
  "progress_authority",
]) {
  if (!userStateMigration.includes(contract)) failures.push(`missing Academy authority migration contract: ${contract}`);
}
for (const contract of [
  "academy_section_legacy_snapshots",
  "academy_section_attempts",
  "academy_section_attempts_no_update",
  "academy_lesson_progress_checkpoint_completion_check",
]) {
  if (!sectionMigration.includes(contract)) failures.push(`missing Academy section authority migration contract: ${contract}`);
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
console.log("Academy authority boundary OK: progression is server-issued; generic state accepts only non-authoritative legacy quarantine.");
