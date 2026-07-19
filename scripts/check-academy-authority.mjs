import { readFile } from "node:fs/promises";

const files = {
  stateRoute: "src/app/api/academy-state/route.ts",
  progressClient: "src/lib/academy-progress.ts",
  assessmentRoute: "src/app/api/academy-lesson-assessment/route.ts",
  lessonPlayer: "src/components/academy/v2/LessonPlayerV2.tsx",
  flashcards: "src/components/academy/v2/FlashcardDeck.tsx",
};

const contents = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

const failures = [];
function requirePattern(key, pattern, message) {
  if (!pattern.test(contents[key])) failures.push(message);
}
function forbidPattern(key, pattern, message) {
  if (pattern.test(contents[key])) failures.push(message);
}

requirePattern("stateRoute", /academy_state_is_read_only/, "academy-state POST must remain fail-closed");
requirePattern("stateRoute", /rebuildAcademyProgressProjection/, "academy-state GET must use the server projection builder");
forbidPattern("stateRoute", /parseAction|applyAcademyProgressAction|award_xp|pass_term|award_badge/, "generic client progress mutations were reintroduced");

forbidPattern("progressClient", /export function (awardXp|recordLessonComplete|recordModuleScore|passTerm|awardBadge)/, "client reward mutation helper was reintroduced");
requirePattern("assessmentRoute", /gradeLessonAssessment/, "lesson assessment must be graded on the server");
requirePattern("assessmentRoute", /idempotency_conflict/, "lesson assessment must enforce idempotency conflicts");
requirePattern("lessonPlayer", /academy-lesson-assessment/, "LessonPlayerV2 must submit canonical answers to the server");
forbidPattern("lessonPlayer", /recordLessonComplete\(/, "LessonPlayerV2 must not issue completion locally");
forbidPattern("flashcards", /awardXp\(|FLASHCARD_SESSION/, "flashcards must not display or issue unverified XP");

if (failures.length > 0) {
  console.error("Academy authority guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Academy authority guard passed.");
