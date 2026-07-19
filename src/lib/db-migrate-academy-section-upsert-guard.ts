import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0032_academy_section_upsert_guard.sql";

export const ACADEMY_SECTION_UPSERT_GUARD_SQL = `
CREATE OR REPLACE FUNCTION tecpey_preserve_verified_section_pass_on_upsert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prior academy_lesson_progress%ROWTYPE;
BEGIN
  IF NEW.completed = TRUE AND (
    NEW.authority_status <> 'server_checkpoint_v1'
    OR NEW.last_answer_correct IS DISTINCT FROM TRUE
    OR NEW.best_score <> 100
    OR NEW.question_id IS NULL
    OR NEW.question_version IS NULL
    OR NEW.selected_option_id IS NULL
    OR NEW.passed_at IS NULL
  ) THEN
    SELECT *
      INTO prior
      FROM academy_lesson_progress
     WHERE student_id = NEW.student_id
       AND locale = NEW.locale
       AND term_slug = NEW.term_slug
       AND section_key = NEW.section_key
       AND authority_status = 'server_checkpoint_v1'
       AND completed = TRUE
       AND last_answer_correct = TRUE
       AND best_score = 100
       AND passed_at IS NOT NULL
     FOR SHARE;

    IF FOUND THEN
      NEW.question_id := prior.question_id;
      NEW.question_version := prior.question_version;
      NEW.selected_option_id := prior.selected_option_id;
      NEW.last_answer_correct := TRUE;
      NEW.best_score := 100;
      NEW.passed_at := prior.passed_at;
      NEW.completed_at := COALESCE(prior.completed_at, NEW.completed_at);
      NEW.authority_status := 'server_checkpoint_v1';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS academy_lesson_progress_preserve_verified_pass ON academy_lesson_progress;
CREATE TRIGGER academy_lesson_progress_preserve_verified_pass
  BEFORE INSERT ON academy_lesson_progress
  FOR EACH ROW EXECUTE FUNCTION tecpey_preserve_verified_section_pass_on_upsert();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runAcademySectionUpsertGuardMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_SECTION_UPSERT_GUARD_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-academy-section-upsert-guard] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-academy-section-upsert-guard] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_SECTION_UPSERT_GUARD_SQL);
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
