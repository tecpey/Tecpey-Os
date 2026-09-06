import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoContentAutomationAutoPublishPath,
  canContentAutomationPublishWithoutHumanReview,
  contentAutomationDestinationPolicies,
  contentAutomationModes,
  getContentAutomationDestinationPolicy,
} from "@/lib/content-automation-os";

test("content automation exposes only approved v1 modes", () => {
  assert.deepEqual(contentAutomationModes, [
    "disabled",
    "draft_only",
    "scheduled_review",
    "manual_review_required",
  ]);
  assert.ok(!contentAutomationModes.includes("auto_publish_low_risk" as never));
});

test("content automation keeps every destination behind human review", () => {
  assertNoContentAutomationAutoPublishPath();

  for (const policy of contentAutomationDestinationPolicies) {
    assert.equal(policy.humanReviewRequired, true, policy.destination);
    assert.equal(
      canContentAutomationPublishWithoutHumanReview(policy.destination),
      false,
      policy.destination,
    );
  }
});

test("content automation keeps social destinations draft-only and non-public", () => {
  const socialDestinations = [
    "telegram_post_draft",
    "x_post_draft",
    "linkedin_post_draft",
    "instagram_carousel_reel_script_draft",
    "shorts_reels_script_draft",
  ] as const;

  for (const destination of socialDestinations) {
    const policy = getContentAutomationDestinationPolicy(destination);
    assert.equal(policy.mode, "draft_only", destination);
    assert.equal(policy.publicPublishing, false, destination);
    assert.ok(policy.allowedFormats.length > 0, destination);
  }
});

test("content automation preserves mentor academy and term 8 hooks as drafts", () => {
  for (const destination of [
    "mentor_context",
    "academy_quiz_ideas",
    "term_8_insight_queue",
  ] as const) {
    const policy = getContentAutomationDestinationPolicy(destination);
    assert.equal(policy.mode, "draft_only", destination);
    assert.equal(policy.publicPublishing, false, destination);
    assert.equal(policy.humanReviewRequired, true, destination);
  }
});
