import assert from "node:assert/strict";
import test from "node:test";
import {
  mentorPublicResearchAuthorized,
  resolveMentorCapabilityAuthority,
} from "@/lib/ai/mentor-capability-authority";

test("Mentor Premium research fails closed until durable subscription authority exists", async () => {
  const snapshot = await resolveMentorCapabilityAuthority({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    studentId: "student-a",
  });
  assert.equal(snapshot.plan, "free");
  assert.equal(snapshot.premiumRuntimeEnabled, false);
  assert.equal(snapshot.publicResearchEnabled, false);
  assert.equal(mentorPublicResearchAuthorized(snapshot), false);
  assert.equal(snapshot.reason, "premium_subscription_authority_not_live");
});

test("invalid Mentor capability scope cannot accidentally authorize research", async () => {
  const snapshot = await resolveMentorCapabilityAuthority({
    tenantId: "",
    workspaceId: "workspace-a",
    studentId: "student-a",
  });
  assert.equal(snapshot.plan, "free");
  assert.equal(snapshot.reason, "scope_invalid");
  assert.equal(mentorPublicResearchAuthorized(snapshot), false);
});
