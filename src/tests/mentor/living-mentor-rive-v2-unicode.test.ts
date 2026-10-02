import assert from "node:assert/strict";
import test from "node:test";
import { projectLivingMentorRiveV2ViewModel } from "@/lib/living-mentor-rive-v2";

function projectName(userName: string) {
  return projectLivingMentorRiveV2ViewModel({
    state: "idle",
    allowsUserName: true,
    userName,
  }).userName;
}

test("display-name truncation counts Unicode code points without splitting surrogate pairs", () => {
  const name = `${"😀".repeat(47)}🌍suffix`;
  const projected = projectName(name);
  assert.equal([...projected].length, 48);
  assert.equal(projected.endsWith("🌍"), true);
  assert.equal(projected.includes("�"), false);
});

test("renderer projection strips hidden bidi controls but preserves Persian ZWNJ", () => {
  const projected = projectName("من\u202Eان\u2066‌تک‌پی\u2069");
  assert.equal(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(projected), false);
  assert.equal(projected.includes("‌"), true);
  assert.equal(projected, "منان‌تک‌پی");
});

test("basic control characters cannot cross the renderer boundary", () => {
  assert.equal(projectName("M\u0000a\nnsan\u007F"), "Mansan");
});
