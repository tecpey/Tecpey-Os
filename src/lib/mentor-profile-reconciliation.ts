// Mentor profile staleness reconciliation.
//
// The durable mentor_profile_update_outbox is the normal delivery authority.
// This sweep is defense-in-depth for legacy rows, operator recovery and any
// source signal that predates durable producer wiring. Profile computation is a
// full current-state projection rather than an event delta, so repair remains
// idempotent and converges onto PostgreSQL source-of-truth state.

import { createHash, randomUUID } from "node:crypto";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveMentorProfileDeadLettersAfterRepair } from "@/lib/mentor-profile-dead-letter-resolution";
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
export const MENTOR_PROFILE_DEAD_LETTER_SNAPSHOT_LIMIT = 1_000;

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

export function needsMentorProfileRepair(
  input: MentorProfileStaleness & { unresolvedDeadLetters: number },
): boolean {
  if (
    !Number.isSafeInteger(input.unresolvedDeadLetters) ||
    input.unresolvedDeadLetters < 0
  ) {
    throw new Error("mentor_profile_unresolved_dead_letters_invalid");
  }
  return (
    input.unresolvedDeadLetters > 0 ||
    needsMentorProfileRefresh(input)
  );
}

type StaleRow = {
  student_id: string;
  profile_updated_at: Date | null;
  latest_signal_at: Date | null;
  unresolved_dead_letters: string;
};

export type MentorProfileRepairResult = {
  enabled: boolean;
  scanned: number;
  repaired: number;
  resolvedDeadLetters: number;
  failed: number;
};

type MentorProfileRepairBoundary = {
  repairStartedAt: string;
  deadLetterIds: string[];
};

async function mentorProfileRepairBoundary(
  studentId: string,
): Promise<MentorProfileRepairBoundary> {
  const boundary = await withDb(async (client) => {
    const result = await client.query<{
      repair_started_at: Date;
      dead_letter_ids: string[];
    }>(
      `WITH unresolved AS (
         SELECT dl.id, dl.created_at
           FROM mentor_profile_update_dead_letters dl
           JOIN mentor_profile_update_outbox o
             ON o.id = dl.outbox_id
            AND o.tenant_id = dl.tenant_id
            AND o.workspace_id = dl.workspace_id
           LEFT JOIN mentor_profile_dead_letter_resolutions resolution
             ON resolution.dead_letter_id = dl.id
          WHERE o.student_id = $1::uuid
            AND resolution.dead_letter_id IS NULL
          ORDER BY dl.created_at, dl.id
          LIMIT $2
       )
       SELECT clock_timestamp() AS repair_started_at,
              COALESCE(
                array_agg(id::text ORDER BY created_at, id)
                  FILTER (WHERE id IS NOT NULL),
                ARRAY[]::text[]
              ) AS dead_letter_ids
         FROM unresolved`,
      [studentId, MENTOR_PROFILE_DEAD_LETTER_SNAPSHOT_LIMIT],
    );
    const row = result.rows[0];
    if (!row?.repair_started_at) {
      throw new Error("mentor_profile_repair_clock_unavailable");
    }
    return {
      repairStartedAt: row.repair_started_at.toISOString(),
      deadLetterIds: row.dead_letter_ids ?? [],
    };
  });
  if (!boundary.enabled) {
    throw new Error("mentor_profile_repair_database_unavailable");
  }
  return boundary.value;
}

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
    // derives from — academy_term_progress, academy_lesson_assessments, academy_state_documents, academy_trading_arena_trades,
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
         SELECT student_id, updated_at AS signal_at FROM academy_lesson_assessments
         UNION ALL
         SELECT student_id, updated_at AS signal_at FROM academy_state_documents
         UNION ALL
         SELECT student_id, created_at AS signal_at FROM academy_trading_arena_trades
         UNION ALL
         SELECT student_id, created_at AS signal_at FROM mentor_challenge_attempts
         UNION ALL
         SELECT student_id, created_at AS signal_at FROM mentor_conversations
       ),
       unresolved AS (
         SELECT o.student_id, COUNT(*)::text AS unresolved_dead_letters
           FROM mentor_profile_update_dead_letters dl
           JOIN mentor_profile_update_outbox o
             ON o.id = dl.outbox_id
            AND o.tenant_id = dl.tenant_id
            AND o.workspace_id = dl.workspace_id
           LEFT JOIN mentor_profile_dead_letter_resolutions resolution
             ON resolution.dead_letter_id = dl.id
          WHERE resolution.dead_letter_id IS NULL
          GROUP BY o.student_id
       ),
       signal_summary AS (
         SELECT student_id, MAX(signal_at) AS latest_signal_at
           FROM signals
          GROUP BY student_id
       ),
       candidate_students AS (
         SELECT student_id FROM signal_summary
         UNION
         SELECT student_id FROM unresolved
       )
       SELECT candidate.student_id,
              profile.updated_at AS profile_updated_at,
              summary.latest_signal_at,
              COALESCE(unresolved.unresolved_dead_letters, '0') AS unresolved_dead_letters
         FROM candidate_students candidate
         LEFT JOIN signal_summary summary
           ON summary.student_id = candidate.student_id
         LEFT JOIN mentor_profiles profile
           ON profile.student_id = candidate.student_id
         LEFT JOIN unresolved
           ON unresolved.student_id = candidate.student_id
        WHERE (
          summary.latest_signal_at IS NOT NULL
          AND summary.latest_signal_at <=
            NOW() - ($1::bigint * INTERVAL '1 millisecond')
          AND (
            profile.updated_at IS NULL
            OR summary.latest_signal_at > profile.updated_at
          )
        )
        OR COALESCE(unresolved.unresolved_dead_letters::integer, 0) > 0
        ORDER BY
          CASE WHEN COALESCE(unresolved.unresolved_dead_letters::integer, 0) > 0
               THEN 0 ELSE 1 END,
          summary.latest_signal_at ASC NULLS LAST,
          candidate.student_id
        LIMIT $2`,
      [graceMs, limit],
    );
    return rows.rows;
  });

  if (!read.enabled) {
    return {
      enabled: false,
      scanned: 0,
      repaired: 0,
      resolvedDeadLetters: 0,
      failed: 0,
    };
  }

  const candidates = read.value.filter((row) =>
    needsMentorProfileRepair({
      unresolvedDeadLetters: Number.parseInt(row.unresolved_dead_letters, 10),
      profileUpdatedAtMs: row.profile_updated_at ? row.profile_updated_at.getTime() : null,
      latestSignalAtMs: row.latest_signal_at ? row.latest_signal_at.getTime() : null,
      nowMs,
      graceMs,
    }),
  );

  const repairRunId = randomUUID();
  let repaired = 0;
  let resolvedDeadLetters = 0;
  let failed = 0;
  for (const row of candidates) {
    const studentFingerprint = createHash("sha256")
      .update("mentor-profile-repair-v1\0")
      .update(row.student_id)
      .digest("hex");
    try {
      const boundary = await mentorProfileRepairBoundary(row.student_id);
      const update = await applyMentorProfileUpdate(row.student_id);
      if (!update) throw new Error("mentor_profile_signal_authority_unavailable");
      const resolution = await resolveMentorProfileDeadLettersAfterRepair({
        studentId: row.student_id,
        repairRunId,
        repairStartedAt: boundary.repairStartedAt,
        deadLetterIds: boundary.deadLetterIds,
      });
      if (!resolution.enabled) {
        throw new Error("mentor_profile_resolution_authority_unavailable");
      }
      repaired += 1;
      resolvedDeadLetters += resolution.value.resolved;
    } catch (error) {
      // One student's failure must not abandon the rest of the sweep.
      failed += 1;
      const code =
        error instanceof Error && /^[A-Za-z0-9._:-]{1,100}$/.test(error.message)
          ? error.message
          : "mentor_profile_repair_failed";
      logger.error("[mentor-profile-repair] recompute failed", {
        studentFingerprint,
        code,
      });
    }
  }

  logger.info("[mentor-profile-repair] sweep complete", {
    scanned: read.value.length,
    repaired,
    resolvedDeadLetters,
    failed,
  });

  return {
    enabled: true,
    scanned: read.value.length,
    repaired,
    resolvedDeadLetters,
    failed,
  };
}
