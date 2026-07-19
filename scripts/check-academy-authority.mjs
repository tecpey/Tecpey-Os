import { readFile } from "node:fs/promises";

const stateRoute = await readFile("src/app/api/academy-state/route.ts", "utf8");
const assessmentRoute = await readFile("src/app/api/academy-lesson-assessment/route.ts", "utf8");
const violations = [];

if (!stateRoute.includes("academy_state_is_read_only") || !stateRoute.includes("405")) {
  violations.push("academy-state POST must remain fail-closed with 405");
}
for (const token of ["applyAcademyProgressAction", "academy_state_mutated", "award_xp", "pass_term", "award_badge"]) {
  if (stateRoute.includes(token)) violations.push(`academy-state route contains forbidden mutation token: ${token}`);
}
if (!assessmentRoute.includes("gradeQuizSubmission")) violations.push("lesson assessment must use canonical server grading");
if (/body\.score|body\[\s*["']score["']\s*\]/.test(assessmentRoute)) violations.push("lesson assessment must not trust a client score");
if (!assessmentRoute.includes("pg_advisory_xact_lock")) violations.push("lesson assessment must serialize concurrent submissions");

if (violations.length > 0) {
  console.error("Academy authority guard failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log("Academy authority boundary OK");
