import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mentorRoute = readFileSync("src/app/api/ai-mentor/route.ts", "utf8");
const challengeRoute = readFileSync("src/app/api/mentor-challenge/route.ts", "utf8");
const experience = readFileSync("src/components/academy/AiMentorExperience.tsx", "utf8");
const mentorV2 = readFileSync("src/components/academy/v2/MentorV2.tsx", "utf8");

test("AI Mentor local fallback keeps English curriculum and links locale-pure", () => {
  assert.match(mentorRoute, /academyPathTermsEn/);
  assert.match(mentorRoute, /const terms = locale === "en" \? academyPathTermsEn : academyPathTerms/);
  assert.match(mentorRoute, /const hrefPrefix = locale === "en" \? "\/en" : ""/);
  assert.match(mentorRoute, /suggestedQuestions\(termNumber, locale\)/);
  assert.match(mentorRoute, /termKnowledge\(termNumber, lessonNumber, locale\)/);
  assert.match(mentorRoute, /locale === "en" \? \[\] : caseStudiesForTerm\(termNumber\)/);
});

test("Mentor challenge always returns learning explanation and localizes notification navigation", () => {
  assert.match(challengeRoute, /const localePrefix = locale === "en" \? "\/en" : ""/);
  assert.match(challengeRoute, /actionUrl: `\$\{localePrefix\}\$\{isCorrect \? "\/academy\/profile" : "\/academy\/mentor-coach"\}`/);
  assert.match(challengeRoute, /explanation: row\.explanation/);
  assert.doesNotMatch(challengeRoute, /explanation:\s*isCorrect\s*\?/);
});

test("Mentor UI distinguishes transport failures from prepared guidance", () => {
  assert.match(experience, /setRequestError\("network_error"\)/);
  assert.match(experience, /requestError === "academy_login_required"/);
  assert.match(experience, /requestError === "rate_limited"/);
  assert.match(experience, /requestError === "mentor_thread_not_found"/);
  assert.match(experience, /externalProviderUsed \? copy\.liveAnswer : copy\.preparedAnswer/);
  assert.match(experience, /memoryMode === "ephemeral"/);
});

test("Mentor composers do not submit while an IME composition is active", () => {
  assert.match(experience, /event\.nativeEvent\.isComposing/);
  assert.match(mentorV2, /event\.nativeEvent\.isComposing/);
});
