import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const rootLayout = () => readFile(new URL("../../app/layout.tsx", import.meta.url), "utf8");
const dashboard = () => readFile(new URL("../../components/academy/AcademyStudentDashboardV2.tsx", import.meta.url), "utf8");
const mentorPage = () => readFile(new URL("../../app/academy/ai-guide/page.tsx", import.meta.url), "utf8");
const publicEntry = () => readFile(new URL("../../components/academy/PublicMentorEntry.tsx", import.meta.url), "utf8");

test("root shell does not mount the redundant global mentor drawer", async () => {
  const source = await rootLayout();
  assert.doesNotMatch(source, /GlobalAiMentorWidget/);
  assert.match(source, /<PublicMentorEntry \/>/);
});

test("intentional mentor entry points remain available", async () => {
  const [dashboardSource, pageSource, publicEntrySource] = await Promise.all([
    dashboard(),
    mentorPage(),
    publicEntry(),
  ]);

  assert.ok(dashboardSource.includes('href={`${termBase}/ai-guide`}'));
  assert.match(pageSource, /<AiMentorExperience locale="fa-IR" plan="free" \/>/);
  assert.match(publicEntrySource, /\/academy\/signup/);
  assert.match(publicEntrySource, /\/academy\/login/);
});
