import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const component = (name: string) => readFile(
  new URL(`../../components/academy/${name}.tsx`, import.meta.url), "utf8",
);

// Source-contract checks complement profile authority unit tests. These are
// intentionally not presented as browser, accessibility or server E2E tests.
test("returning learners can review their profile without a redirect loop", async () => {
  const source = await component("AcademyOnboardingClient");
  const load = source.slice(source.indexOf("async function loadProfile"), source.indexOf("async function submit"));
  assert.doesNotMatch(load, /router\.(replace|push)\(/);
  assert.doesNotMatch(load, /method:\s*["']POST["']/);
  for (const setter of ["setDisplayName", "setUsername", "setAvatar", "setGoal"]) {
    assert.ok(load.includes(setter), `hydrate ${setter} from the existing profile`);
  }
  assert.match(source, /state\.profile\.learning_goal/);
  assert.match(source, /<form onSubmit=/);
  assert.match(source, /type="submit"/);
});

test("profile form has explicit labels, announced errors and selected avatar state", async () => {
  const source = await component("AcademyOnboardingClient");
  for (const id of ["academy-display-name", "academy-profile-username", "academy-learning-goal"]) {
    assert.ok(source.includes(`htmlFor="${id}"`));
    assert.ok(source.includes(`id="${id}"`));
  }
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-busy=\{saving\}/);
  assert.match(source, /aria-pressed=\{avatar === item\}/);
  assert.match(source, /min-h-11 min-w-11/);
});

test("dashboard destination labels match mentor, Arena and term destinations", async () => {
  const source = await component("AcademyStudentDashboardV2");
  assert.ok(source.includes('href={`${termBase}/ai-guide`}'));
  assert.ok(source.includes('href={`${termBase}/trading-arena`}'));
  assert.ok(source.includes('href={`${termBase}/term-${term.number}`}'));
  assert.ok(source.includes('href={`${termBase}/term-8`}'));
  assert.doesNotMatch(source, /href=\{unlocked \?/);
  assert.match(source, /smart: "Notifications"/);
  assert.match(source, /smart: "اعلان‌ها"/);
  assert.match(source, /<bdi dir="ltr">\{value\}<\/bdi>/);
});
