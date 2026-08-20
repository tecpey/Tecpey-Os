// Mentor profile staleness reconciliation.
//
// scheduleMentorProfileUpdate dispatches profile recomputation as an in-process
// microtask that outlives the HTTP response but not the process. A crash,
// deployment or restart between the learning event landing and the recompute
// finishing loses that update silently: the student keeps learning, their mentor
// profile does not, and personalisation degrades with nothing failing.
//
// The fix is not a delivery guarantee. applyMentorProfileUpdate does not apply a
// delta — it recomputes the whole profile from current academy, trading and
// conversation signals and upserts it, so it is idempotent by construction. That
// means we never need exactly-once delivery of an event; we only need to notice
// that a student's signals are newer than their profile and recompute. This is a
// repair sweep, in the same shape as the session-revocation, risk and offline
// reconciliations already in the codebase.

import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { applyMentorProfileUpdate } from "@/lib/mentor-signals";

/**
 * How long a signal must have been settled before the sweep treats it as missed.
 *
 * Without this, the sweep races the in-process update it exists to back up: an
 * event written milliseconds ago is legitimately mid-recompute, and repairing it
 * would double the work for every healthy request. The grace period makes this a
 * backstop rather than a competitor to the hot path.
 */
export const MENTOR_PROFILE_REPAIR_GRACE_MS = 120_000;

export type MentorProfileStaleness = {
  /** When the stored profile was last recomputed; null when no profile exists. */
  profileUpdatedAtMs: number | null;
  /** The student's most recent learning signal; null when they have none. */
  latestSignalAtMs: number | null;
  nowMs: number;
  graceMs?: number;
};

/**
 * Whether a student's mentor profile must be recomputed.
 *
 * Pure so the repair decision is testable without a database.
 */
export function needsMentorProfileRefresh(input: MentorProfileStaleness): boolean {
  const grace = input.graceMs ?? MENTOR_PROFILE_REPAIR_GRACE_MS;

  // No signals means there is nothing to derive a profile from. Recomputing here
  // would write a default profile over nothing and mark it fresh, which would
  // then suppress the real recompute when the student's first signal arrives.
  if (input.latestSignalAtMs === null) return false;

  // A signal still inside the grace window is presumed to be in flight.
  if (input.latestSignalAtMs > input.nowMs - grace) return false;

  // Signals exist but no profile was ever written — the update was lost, or the
  // student predates the mentor engine.
  if (input.profileUpdatedAtMs === null) return true;

  return input.latestSignalAtMs > input.profileUpdatedAtMs;
}

type StaleRow = {
  student_id: string;
  profile_updated_at: Date | null;
  latest_signal_at: Date | null;
};

export type MentorProfileRepairResult = {
  enabled: boolean;
  scanned: number;
  repaired: number;
  failed: number;
};

/**
 * Recompute every mentor profile whose learning signals are newer than the stored
 * profile. Bounded by `limit` so one sweep cannot monopolise the database.
 */
export async function reconcileMentorProfiles(options: {
  limit?: number;
  graceMs?: number;
  now?: () => number;
} = {}): Promise<MentorProfileRepairResult> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1_000);
  const graceMs = options.graceMs ?? MENTOR_PROFILE_REPAIR_GRACE_MS;
  const nowMs = (options.now ?? Date.now)();

  const read = await withDb(async (client) => {
    // Candidate students: anyone whose newest signal is outside the grace window
    // and is not already reflected in their profile. The comparison is repeated
    // in needsMentorProfileRefresh so the decision stays one testable rule; SQL
    // only narrows the scan.
    //
    // The signal union must be exactly the set of tables applyMentorProfileUpdate
    // derives from — academy_term_progress, academy_trading_arena_trades,
    // mentor_challenge_attempts and mentor_conversations. Anything narrower leaves
    // lost updates unrepaired: the AI mentor and term-progress paths write to
    // their own stores, so a student whose activity is a conversation would never
    // be selected at all. Note that learning_events is deliberately absent — the
    // recompute does not read it, and detecting staleness from a source the
    // recompute ignores would mark profiles stale that a repair cannot settle.
    // If a collector gains or drops a table, this union must move with it.
    //
    // Deliberately not tenant-scoped. The repair must match what the repair does:
    // applyMentorProfileUpdate collects by student_id alone, and mentor_profiles
    // is UNIQUE(student_id) with no tenant column. Scoping per tenant would
    // surface staleness the recompute cannot express, and the sweep would repair
    // the same student forever without converging.
    const rows = await client.query<StaleRow>(
      `WITH signals AS (
         SELECT student_id, GREATEST(
                  COALESCE(updated_at, to_timestamp(0)),
                  COALESCE(passed_at, to_timestamp(0)),
                  COALESCE(completed_at, to_timestamp(0)),
                  COALESCE(started_at, to_timestamp(0))
                ) AS signal_at
           FROM academy_term_progress
         UNION ALL
         SELECT student_id, created_at AS signal_at FROM academy_trading_arena_trades
         UNION ALL
         SELECT student_id, created_at AS signal_at FROM mentor_challenge_attempts
         UNION ALL
         SELECT student_id, created_at AS signal_at FROM mentor_conversations
       )
       SELECT s.student_id,
              p.updated_at AS profile_updated_at,
              MAX(s.signal_at) AS latest_signal_at
         FROM signals s
         LEFT JOIN mentor_profiles p ON p.student_id = s.student_id
        GROUP BY s.student_id, p.updated_at
       HAVING MAX(s.signal_at) <= NOW() - ($1::bigint * INTERVAL '1 millisecond')
          AND (p.updated_at IS NULL OR MAX(s.signal_at) > p.updated_at)
        ORDER BY MAX(s.signal_at) ASC
        LIMIT $2`,
      [graceMs, limit],
    );
    return rows.rows;
  });

  if (!read.enabled) return { enabled: false, scanned: 0, repaired: 0, failed: 0 };

  const candidates = read.value.filter((row) =>
    needsMentorProfileRefresh({
      profileUpdatedAtMs: row.profile_updated_at ? row.profile_updated_at.getTime() : null,
      latestSignalAtMs: row.latest_signal_at ? row.latest_signal_at.getTime() : null,
      nowMs,
      graceMs,
    }),
  );

  let repaired = 0;
  let failed = 0;
  for (const row of candidates) {
    try {
      await applyMentorProfileUpdate(row.student_id);
      repaired += 1;
    } catch (error) {
      // One student's failure must not abandon the rest of the sweep.
      failed += 1;
      logger.error("[mentor-profile-repair] recompute failed", {
        studentId: row.student_id,
        error: error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120),
      });
    }
  }

  logger.info("[mentor-profile-repair] sweep complete", {
    scanned: read.value.length,
    repaired,
    failed,
  });

  return { enabled: true, scanned: read.value.length, repaired, failed };
}
