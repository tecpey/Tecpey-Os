// Mentor profile latency accelerator.
//
// Durable profile recomputation authority lives in mentor_profile_update_outbox.
// This in-process dispatcher is intentionally best-effort: it may make a fresh
// projection visible before the worker consumes the committed outbox event, but
// correctness and recovery never depend on this microtask surviving a process
// exit.

import { createHash } from "node:crypto";
import { applyMentorProfileUpdate } from "@/lib/mentor-signals";
import { logger } from "@/lib/logger";

// ── Event reasons ─────────────────────────────────────────────────────────────

export type MentorUpdateReason =
  | "quiz_submitted"
  | "trading_trade_created"
  | "mentor_conversation_saved"
  | "academy_progress_updated"
  | "flashcards_updated"
  | "reflection_updated"
  | "lesson_progress_updated"
  | "authoritative_lesson_assessment"
  | "authoritative_term_assessment";

// ── Safe runner ───────────────────────────────────────────────────────────────

function studentFingerprint(studentId: string): string {
  return createHash("sha256")
    .update("mentor-profile-hot-path-v1\0")
    .update(studentId)
    .digest("hex");
}

/**
 * Best-effort projection accelerator. A null result is an unavailable signal
 * authority, not a successful update.
 */
export async function runMentorProfileUpdateSafely(
  studentId: string,
  reason: MentorUpdateReason,
): Promise<void> {
  const fingerprint = studentFingerprint(studentId);
  try {
    const update = await applyMentorProfileUpdate(studentId);
    if (!update) throw new Error("mentor_profile_signal_authority_unavailable");
    logger.info("[mentor-profile] hot projection updated", {
      studentFingerprint: fingerprint,
      reason,
    });
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Za-z0-9._:-]{1,100}$/.test(error.message)
        ? error.message
        : "mentor_profile_hot_projection_failed";
    logger.error("[mentor-profile] hot projection failed", {
      studentFingerprint: fingerprint,
      reason,
      code,
    });
  }
}

/**
 * Schedule a non-blocking hot projection update.
 * Returns immediately. The durable transactional outbox remains authoritative.
 */
export function scheduleMentorProfileUpdate(
  studentId: string,
  reason: MentorUpdateReason,
): void {
  void runMentorProfileUpdateSafely(studentId, reason);
}
