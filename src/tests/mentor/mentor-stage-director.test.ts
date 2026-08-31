import assert from "node:assert/strict";
import test from "node:test";
import {
  directMentorStage,
  mentorStageEventForWorkspaceActivity,
} from "@/lib/mentor-stage-director";

test("Arena never opens before an explicit acceptance event", () => {
  const invitation = directMentorStage({ event: { type: "arena_invited" } });
  const accepted = directMentorStage({ event: { type: "arena_accepted" } });

  assert.equal(invitation.arenaPanel, "closed");
  assert.equal(invitation.act, "invite_next_step");
  assert.equal(accepted.arenaPanel, "docked");
  assert.equal(accepted.gaze, "arena");
});

test("risk caution overrides a closed panel without celebrating PnL", () => {
  const direction = directMentorStage({
    event: { type: "risk_rule_breached" },
    currentArenaPanel: "closed",
  });

  assert.equal(direction.arenaPanel, "docked");
  assert.equal(direction.act, "risk_caution");
  assert.equal(direction.intensity, "critical");
});

test("an educational risk review does not masquerade as a rule breach", () => {
  const direction = directMentorStage({
    event: { type: "risk_review_requested" },
    currentArenaPanel: "closed",
  });

  assert.equal(direction.arenaPanel, "closed");
  assert.equal(direction.act, "risk_caution");
  assert.equal(direction.intensity, "important");
});

test("unverified high-impact news cannot trigger critical drama", () => {
  const direction = directMentorStage({
    event: {
      type: "news_classified",
      evidence: "unverified",
      impact: "high",
    },
  });

  assert.equal(direction.act, "pause_reflect");
  assert.equal(direction.intensity, "important");
  assert.notEqual(direction.intensity, "critical");
});

test("verified high-impact news can use the firm briefing state", () => {
  const direction = directMentorStage({
    event: {
      type: "news_classified",
      evidence: "verified",
      impact: "high",
    },
  });

  assert.equal(direction.act, "explain");
  assert.equal(direction.intensity, "critical");
  assert.equal(direction.gaze, "news");
});

test("reduced motion changes motion delivery without changing meaning", () => {
  const full = directMentorStage({ event: { type: "research_started" } });
  const reduced = directMentorStage({
    event: { type: "research_started" },
    reducedMotion: true,
  });

  assert.equal(full.motion, "full");
  assert.equal(reduced.motion, "reduced");
  assert.equal(reduced.act, full.act);
  assert.equal(reduced.intensity, full.intensity);
});

test("conversation activity overrides an open Arena preview", () => {
  const event = mentorStageEventForWorkspaceActivity({
    arenaPanel: "docked",
    composing: true,
    engaged: true,
    newsBriefRequested: false,
    researching: false,
    riskReviewRequested: false,
    speaking: false,
    thinking: false,
  });

  assert.equal(event.type, "question_composing");
});

test("active research overrides composing and preserves evidence context", () => {
  const event = mentorStageEventForWorkspaceActivity({
    arenaPanel: "focus",
    composing: true,
    engaged: true,
    newsBriefRequested: true,
    researching: true,
    riskReviewRequested: false,
    speaking: false,
    thinking: true,
  });

  assert.equal(event.type, "research_started");
});

test("an established conversation keeps the mentor present between turns", () => {
  const event = mentorStageEventForWorkspaceActivity({
    arenaPanel: "closed",
    composing: false,
    engaged: true,
    newsBriefRequested: false,
    researching: false,
    riskReviewRequested: false,
    speaking: false,
    thinking: false,
  });
  const direction = directMentorStage({ event });

  assert.equal(event.type, "conversation_engaged");
  assert.equal(direction.pose, "standing_user");
  assert.equal(direction.act, "idle_attentive");
});
