import assert from "node:assert/strict";
import test from "node:test";
import {
  projectLivingMentorRiveV2ViewModel,
  type LivingMentorRiveV2HostInput,
} from "@/lib/living-mentor-rive-v2";

function project(overrides: Partial<LivingMentorRiveV2HostInput>) {
  return projectLivingMentorRiveV2ViewModel({
    state: "idle",
    ...overrides,
  });
}

test("direction falls back from a valid locale when direction is absent", () => {
  assert.equal(project({ locale: "en-US", direction: null }).direction, "ltr");
  assert.equal(project({ locale: "fa-IR", direction: null }).direction, "rtl");
  assert.equal(project({ locale: "ar", direction: null }).direction, "rtl");
  assert.equal(project({ locale: "he-IL", direction: null }).direction, "rtl");
});

test("explicit valid direction remains authoritative for presentation", () => {
  assert.equal(project({ locale: "en-US", direction: "rtl" }).direction, "rtl");
  assert.equal(project({ locale: "fa-IR", direction: "ltr" }).direction, "ltr");
});

test("overlong or malformed locale fails closed to Persian RTL defaults", () => {
  const overlong = `en-${"a".repeat(40)}`;
  const invalid = project({ locale: overlong, direction: null });
  assert.equal(invalid.locale, "fa");
  assert.equal(invalid.direction, "rtl");

  const malformed = project({ locale: "not a locale !!!", direction: null });
  assert.equal(malformed.locale, "fa");
  assert.equal(malformed.direction, "rtl");
});
