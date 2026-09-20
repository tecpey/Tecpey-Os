import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0111_mentor_profile_evidence_event_contract.sql";

export const MENTOR_PROFILE_EVIDENCE_EVENT_SQL = `
ALTER TABLE mentor_profile_update_outbox
  DROP CONSTRAINT IF EXISTS mentor_profile_update_outbox_event_type_check,
  ADD CONSTRAINT mentor_profile_update_outbox_event_type_check
    CHECK (event_type IN (
      'academy.term_progress',
      'academy.lesson_assessment',
      'academy.flashcards_updated',
      'academy.reflection_updated',
      'mentor.challenge_attempt',
      'arena.trade_signal',
      'mentor.conversation'
    )),
  DROP CONSTRAINT IF EXISTS mentor_profile_update_outbox_reason_check,
  ADD CONSTRAINT mentor_profile_update_outbox_reason_check
    CHECK (reason IN (
      'authoritative_term_assessment',
      'authoritative_lesson_assessment',
      'authoritative_flashcards_updated',
      'authoritative_reflection_updated',
      'mentor_challenge_answered',
      'trading_trade_created',
      'mentor_conversation_saved',
      'mentor_conversation_migrated'
    )),
  DROP CONSTRAINT IF EXISTS mentor_profile_update_outbox_event_reason_check,
  ADD CONSTRAINT mentor_profile_update_outbox_event_reason_check
    CHECK (
      (event_type = 'academy.term_progress' AND reason = 'authoritative_term_assessment')
      OR (event_type = 'academy.lesson_assessment' AND reason = 'authoritative_lesson_assessment')
      OR (event_type = 'academy.flashcards_updated' AND reason = 'authoritative_flashcards_updated')
      OR (event_type = 'academy.reflection_updated' AND reason = 'authoritative_reflection_updated')
      OR (event_type = 'mentor.challenge_attempt' AND reason = 'mentor_challenge_answered')
      OR (event_type = 'arena.trade_signal' AND reason = 'trading_trade_created')
      OR (
        event_type = 'mentor.conversation'
        AND reason IN ('mentor_conversation_saved', 'mentor_conversation_migrated')
      )
    );
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runMentorProfileEvidenceEventMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(MENTOR_PROFILE_EVIDENCE_EVENT_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-mentor-profile-evidence-event] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(MENTOR_PROFILE_EVIDENCE_EVENT_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
