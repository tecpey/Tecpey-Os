// Mentor event triggers — non-blocking in-process profile update dispatcher.
//
// All public functions are fire-and-forget (void return) so they never delay
// an HTTP response. Errors are caught internally and logged without exposing
// secrets or user message content.
//
// TODO(mentor-queue): replace in-process async with a durable background queue
//   (e.g. BullMQ / Redis) once student volume warrants it. The function
//   signatures intentionally match what a queue producer would look like:
//   scheduleMentorProfileUpdate(studentId, reason) → enqueue({ studentId, reason })

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
  | "authoritative_section_checkpoint"
  | "authoritative_term_assessment";

// ── Safe runner ───────────────────────────────────────────────────────────────

/**
 * Run applyMentorProfileUpdate and swallow all errors.
 * Logs only studentId, reason, and success/failure — never message content or secrets.
 */
export async function runMentorProfileUpdateSafely(
  studentId: string,
  reason: MentorUpdateReason,
): Promise<void> {
  try {
    await applyMentorProfileUpdate(studentId);
    logger.info("[mentor-profile] updated", { studentId, reason });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[mentor-profile] update failed", { studentId, reason, err: msg.slice(0, 120) });
  }
}

/**
 * Schedule a non-blocking mentor profile update.
 * Returns immediately; the update runs as a background microtask.
 *
 * TODO(mentor-queue): replace `void runMentorProfileUpdateSafely(...)` with a
 * durable queue enqueue call once the infrastructure is available.
 */
export function scheduleMentorProfileUpdate(
  studentId: string,
  reason: MentorUpdateReason,
): void {
  void runMentorProfileUpdateSafely(studentId, reason);
}
