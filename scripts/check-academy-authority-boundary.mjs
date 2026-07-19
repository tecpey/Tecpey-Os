import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const stateRoute = await readFile(path.join(root, "src/app/api/academy-state/route.ts"), "utf8");
const lessonRoute = await readFile(path.join(root, "src/app/api/academy-lesson-assessment/route.ts"), "utf8");
const migration = await readFile(path.join(root, "src/lib/db-migrate-user-state.ts"), "utf8");

const failures = [];
const genericMutations = ["award_xp", "pass_term", "award_badge", "lesson_complete", "module_score"];
for (const mutation of genericMutations) {
  if (stateRoute.includes(mutation)) failures.push(`/api/academy-state still contains generic mutation: ${mutation}`);
}
if (!stateRoute.includes("academy_state_read_only") || !stateRoute.includes('Allow: "GET"')) {
  failures.push("/api/academy-state POST must fail closed as a GET-only projection");
}
if (!lessonRoute.includes("gradeCanonicalLesson") || !lessonRoute.includes("readLearningCommand")) {
  failures.push("official lesson assessment must be server-graded and command-idempotent");
}
for (const contract of [
  "UNIQUE (student_id, locale, reward_key)",
  "UNIQUE (student_id, command_type, request_hash)",
  "academy_progress_legacy_snapshots",
  "progress_authority",
]) {
  if (!migration.includes(contract)) failures.push(`missing Academy authority migration contract: ${contract}`);
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
console.log("Academy authority boundary OK: progression is server-issued and generic state is read-only.");
