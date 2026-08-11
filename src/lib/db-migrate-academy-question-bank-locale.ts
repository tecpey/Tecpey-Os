import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0062_academy_question_bank_locale.sql";

export const ACADEMY_QUESTION_BANK_LOCALE_SQL = `
ALTER TABLE academy_question_bank
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'fa' CHECK (locale IN ('fa', 'en'));

CREATE INDEX IF NOT EXISTS academy_question_bank_locale_lesson_idx
  ON academy_question_bank(locale, term_number, lesson_slug, topic, approved, difficulty);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAcademyQuestionBankLocaleMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(ACADEMY_QUESTION_BANK_LOCALE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-academy-question-bank-locale] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-academy-question-bank-locale] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_QUESTION_BANK_LOCALE_SQL);
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
