import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../components/academy/AiMentorExperience.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../components/academy/AiMentorExperience.module.css", import.meta.url), "utf8");

// Source contracts are regression guards, not browser or WCAG conformance evidence.
test("starting points prepare a learning draft without making a provider request", () => {
  const handler = source.slice(source.indexOf("const prepareDraft ="), source.indexOf("const startingPoints ="));
  assert.match(handler, /if \(loading \|\| historyLoading\) return/);
  assert.match(handler, /setSelectedSurface\("academy"\)/);
  assert.match(handler, /setQuestion\(prompt\)/);
  assert.match(handler, /textareaRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(handler, /\bfetch\(|\bask\(/);
  assert.match(source, /پیشنهادها فقط متن سؤال را آماده می‌کنند/);
  assert.match(source, /Starting points prepare a draft/);
});

test("history uses native modal semantics, explicit close, Escape and focus restoration", () => {
  assert.match(source, /<dialog\s+ref=\{historySheetRef\}/);
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /dialog\.close\(\)/);
  assert.match(source, /onCancel=\{.*closeHistory\(\)/);
  assert.match(source, /aria-labelledby="mentor-history-title"/);
  assert.match(source, /historyTriggerRef\.current\?\.focus\(\)/);
  assert.match(source, /aria-controls="mentor-history-dialog"/);
  assert.match(css, /\.historyDialog::backdrop/);
  assert.doesNotMatch(source, /className=\{styles\.historyRail\}/);
});

test("mobile office is disclosed explicitly without removing chat or privacy controls", () => {
  assert.match(source, /\[officeExpanded, setOfficeExpanded\] = useState\(false\)/);
  assert.match(source, /aria-expanded=\{officeExpanded\} aria-controls="mentor-office"/);
  assert.match(css, /\.workspaceGrid\[data-office-expanded="true"\] \.officeCell \{ display: block/);
  assert.match(source, /\/academy\/account#mentor-privacy/);
  assert.match(source, /\/en\/academy\/account#mentor-privacy/);
  assert.match(source, /\/en\/support/);
  assert.match(source, /publicResearch \? <p className=\{styles\.researchNotice\}/);
});

test("surface changes preserve server-owned capabilities and isolated history titles", () => {
  assert.match(source, /capabilityReady \? serverPlan : "free"/);
  assert.match(source, /response\.ok && data\?\.capabilities\?\.plan === "premium"/);
  assert.match(source, /<bdi>\{thread\.title\}<\/bdi>/);
  assert.match(source, /Number\.isFinite\(Date\.parse\(thread\.lastMessageAt\)\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.startingPoints button \{ transition: none/);
  assert.match(css, /@media \(forced-colors: active\)/);
});
