import assert from "node:assert/strict";
import test from "node:test";
import {
  createMentorProfileEventId,
  mentorProfileRetryDelaySeconds,
} from "@/lib/mentor-profile-update-outbox";
import {
  isTerminalMentorProfileWorkerError,
  mentorProfileWorkerErrorCode,
} from "@/lib/mentor-profile-worker";

test("Mentor profile event ids are deterministic and scope-sensitive", () => {
  const base = {
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    studentId: "00000000-0000-4000-8000-000000000001",
    eventType: "academy.term_progress" as const,
    sourceReference: "assessment-12345678",
  };
  const first = createMentorProfileEventId(base);
  const replay = createMentorProfileEventId({ ...base });
  const otherTenant = createMentorProfileEventId({
    ...base,
    tenantId: "tenant-b",
  });

  assert.equal(first, replay);
  assert.notEqual(first, otherTenant);
  assert.match(first, /^mentor-profile:[a-f0-9]{64}$/);
  assert.equal(first.includes(base.studentId), false);
});

test("Mentor profile worker emits bounded secret-free error codes", () => {
  assert.equal(
    mentorProfileWorkerErrorCode(new Error("mentor_profile_event_identity_conflict")),
    "mentor_profile_event_identity_conflict",
  );
  assert.equal(
    mentorProfileWorkerErrorCode({ code: "23503" }),
    "postgres_23503",
  );
  assert.equal(
    isTerminalMentorProfileWorkerError("mentor_profile_event_identity_conflict"),
    true,
  );
  assert.equal(
    isTerminalMentorProfileWorkerError("mentor_profile_database_unavailable"),
    false,
  );
});


test("Mentor profile retry jitter is deterministic, bounded and event-spread", () => {
  const firstId = "11111111-1111-4111-8111-111111111111";
  const secondId = "22222222-2222-4222-8222-222222222222";

  const first = mentorProfileRetryDelaySeconds(3, firstId);
  assert.equal(first, mentorProfileRetryDelaySeconds(3, firstId));
  assert.equal(first >= 48 && first <= 72, true);
  assert.notEqual(first, mentorProfileRetryDelaySeconds(3, secondId));

  assert.equal(mentorProfileRetryDelaySeconds(1, firstId) >= 15, true);
  assert.equal(mentorProfileRetryDelaySeconds(10, firstId) <= 3_600, true);
  assert.throws(
    () => mentorProfileRetryDelaySeconds(0, firstId),
    /mentor_profile_retry_attempt_invalid/,
  );
});
