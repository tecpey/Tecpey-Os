import assert from "node:assert/strict";
import test from "node:test";
import {
  MENTOR_PUBLIC_RESEARCH_EGRESS,
  canUseMentorWorkspaceSurface,
  mentorResearchModeForSurface,
  mentorWorkspaceDirection,
  mentorWorkspaceEntitlements,
  mentorWorkspaceScreenMode,
} from "@/lib/mentor-workspace";

test("free and premium keep the same safety contract", () => {
  const free = mentorWorkspaceEntitlements("free");
  const premium = mentorWorkspaceEntitlements("premium");

  assert.equal(free.safetyParity, true);
  assert.equal(premium.safetyParity, true);
  assert.equal(free.monitorCount, 1);
  assert.equal(premium.monitorCount, 3);
  assert.equal(free.ads, "eligible");
  assert.equal(premium.ads, "none");
});

test("premium research surfaces fail closed for the free plan", () => {
  assert.equal(canUseMentorWorkspaceSurface("free", "academy"), true);
  assert.equal(canUseMentorWorkspaceSurface("free", "web_research"), false);
  assert.equal(canUseMentorWorkspaceSurface("free", "social_research"), false);
  assert.equal(mentorResearchModeForSurface("free", "social_research"), "off");
  assert.equal(mentorResearchModeForSurface("premium", "social_research"), "public");
});

test("compact layouts use one switchable monitor for every plan", () => {
  assert.equal(
    mentorWorkspaceScreenMode({ compact: true, plan: "free" }),
    "single_switcher",
  );
  assert.equal(
    mentorWorkspaceScreenMode({ compact: true, plan: "premium" }),
    "single_switcher",
  );
  assert.equal(
    mentorWorkspaceScreenMode({ compact: false, plan: "premium" }),
    "multi_monitor",
  );
});

test("BCP-47 direction resolution covers global RTL and LTR locales", () => {
  assert.equal(mentorWorkspaceDirection("fa-IR"), "rtl");
  assert.equal(mentorWorkspaceDirection("ar-SA"), "rtl");
  assert.equal(mentorWorkspaceDirection("ur-PK"), "rtl");
  assert.equal(mentorWorkspaceDirection("en-US"), "ltr");
  assert.equal(mentorWorkspaceDirection("de-DE"), "ltr");
});

test("public research receives only the current public query", () => {
  assert.deepEqual(MENTOR_PUBLIC_RESEARCH_EGRESS, {
    queryOnly: true,
    sendsConversationHistory: false,
    sendsLearningProfile: false,
    sendsWeakAreas: false,
    sendsFinancialAccountData: false,
    sendsIdentityDocuments: false,
  });
});
