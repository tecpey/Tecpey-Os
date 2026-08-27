import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { refreshAcademyProgressProjection } from "../../lib/academy-progress-projection";
import {
  findStudentCartaxProfile,
  upsertStudentCartax,
} from "../../lib/student-cartax";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
  } finally {
    client.release();
  }
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Academy PostgreSQL progress authority v2", () => {
  it("rejects client-declared section progress and section reward writes", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const studentId = randomUUID();
    await pool!.query(
      `INSERT INTO academy_students (id, locale, email, display_name)
       VALUES ($1::uuid, 'fa', $2, 'Academy authority test')`,
      [studentId, `${studentId}@academy-authority.test`],
    );

    try {
      await assert.rejects(() =>
        pool!.query(
          `INSERT INTO academy_lesson_progress
            (student_id, locale, term_number, term_slug, section_key,
             section_heading, completed)
           VALUES ($1::uuid, 'fa', 1, 'term-1', 'client-section',
                   'Client section', TRUE)`,
          [studentId],
        ),
      );

      await assert.rejects(() =>
        pool!.query(
          `INSERT INTO academy_term_learning_progress
            (student_id, locale, term_number, term_slug, total_sections,
             completed_sections, answered_sections, percent, xp)
           VALUES ($1::uuid, 'fa', 1, 'term-1', 1, 1, 1, 100, 999999)`,
          [studentId],
        ),
      );

      await assert.rejects(() =>
        pool!.query(
          `INSERT INTO academy_reward_ledger
            (student_id, locale, reward_key, reward_type, source_type,
             source_id, xp, badge_code, metadata)
           VALUES ($1::uuid, 'fa', 'legacy:section:forged', 'badge',
                   'official_section', 'term-1/client-section', 999999,
                   'first-lesson', '{}'::jsonb)`,
          [studentId],
        ),
      );
    } finally {
      await pool!.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
    }
  });

  it("builds durable progress only from canonical assessments, rewards and term status", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const studentId = randomUUID();
    await pool!.query(
      `INSERT INTO academy_students (id, locale, email, display_name)
       VALUES ($1::uuid, 'fa', $2, 'Academy projection test')`,
      [studentId, `${studentId}@academy-projection.test`],
    );

    try {
      await pool!.query(
        `INSERT INTO academy_lesson_assessments
          (student_id, locale, lesson_id, term_number, module_id,
           best_score, attempt_count, last_score, passed_at)
         VALUES ($1::uuid, 'fa', 't1-m1-l1', 1, 't1-m1',
                 90, 1, 90, NOW())`,
        [studentId],
      );
      await pool!.query(
        `INSERT INTO academy_reward_ledger
          (student_id, locale, reward_key, reward_type, source_type,
           source_id, xp, badge_code, metadata)
         VALUES ($1::uuid, 'fa', 'lesson:t1-m1-l1:complete',
                 'lesson_complete', 'lesson_assessment', 't1-m1-l1',
                 25, 'first-lesson', '{}'::jsonb)`,
        [studentId],
      );
      await pool!.query(
        `INSERT INTO academy_term_progress
          (student_id, locale, term_number, status, score, percent, passed_at)
         VALUES ($1::uuid, 'fa', 1, 'passed', 9, 90, NOW())
         ON CONFLICT (tenant_id, workspace_id, student_id, term_number, locale) DO UPDATE SET
           status = EXCLUDED.status,
           score = EXCLUDED.score,
           percent = EXCLUDED.percent,
           passed_at = EXCLUDED.passed_at,
           updated_at = NOW()`,
        [studentId],
      );

      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        const projection = await refreshAcademyProgressProjection(client, studentId, "fa");
        await client.query("COMMIT");
        assert.equal(projection.state.xp, 25);
        assert.equal(projection.state.completedLessons["t1-m1-l1"]?.score, 90);
        assert.equal(projection.state.completedLessons["t1-m1-l1"]?.xpEarned, 25);
        assert.equal(projection.state.termStatus[1], "passed");
        assert.equal(projection.state.termStatus[2], "unlocked");
        assert.deepEqual(projection.state.earnedBadges, ["first-lesson"]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      const stored = await pool!.query<{
        progress_authority: string;
        total_xp: number;
      }>(
        `SELECT state.progress_authority, cartax.total_xp
           FROM academy_state_documents state
           JOIN academy_student_cartax cartax ON cartax.student_id = state.student_id
          WHERE state.student_id = $1::uuid AND state.locale = 'fa'`,
        [studentId],
      );
      assert.deepEqual(stored.rows[0], {
        progress_authority: "server_projection_v2",
        total_xp: 25,
      });
    } finally {
      await pool!.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
    }
  });

  it("keeps historical quarantine and legacy tables immutable", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const triggers = await pool!.query<{ tgname: string }>(
      `SELECT tgname
         FROM pg_trigger
        WHERE NOT tgisinternal
          AND tgname = ANY($1::text[])`,
      [[
        "academy_lesson_progress_read_only",
        "academy_term_learning_progress_read_only",
        "academy_reward_ledger_reject_client_section",
        "academy_progress_legacy_reward_quarantine_no_update",
        "academy_progress_legacy_reward_quarantine_no_delete",
      ]],
    );
    assert.deepEqual(
      new Set(triggers.rows.map((row) => row.tgname)),
      new Set([
        "academy_lesson_progress_read_only",
        "academy_term_learning_progress_read_only",
        "academy_reward_ledger_reject_client_section",
        "academy_progress_legacy_reward_quarantine_no_update",
        "academy_progress_legacy_reward_quarantine_no_delete",
      ]),
    );
  });

  it("keeps profile identity and streak fields on the canonical cartax owner", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      const identity = randomUUID();
      const email = `${identity}@academy-profile.test`;

      assert.equal(
        await findStudentCartaxProfile(client, { email }),
        null,
        "an authenticated pre-student account must reach onboarding without a schema error",
      );

      const created = await upsertStudentCartax(client, {
        email,
        displayName: "Academy Profile Contract",
        locale: "fa",
        source: "academy-profile-contract-test",
      });
      assert.match(created.publicStudentId, /^TP-STD-[0-9A-F]{8}$/);
      assert.equal(created.streakDays, 1);

      const profile = await findStudentCartaxProfile(client, {
        studentId: created.studentId,
      });
      assert.equal(profile?.id, created.studentId);
      assert.equal(profile?.public_student_id, created.publicStudentId);
      assert.equal(profile?.streak_days, 1);

      await client.query(
        `UPDATE academy_student_cartax
            SET progress = progress || '{"clientForgedXp": 999999}'::jsonb
          WHERE student_id = $1::uuid`,
        [created.studentId],
      );
      const projection = await refreshAcademyProgressProjection(
        client,
        created.studentId,
        "fa",
      );
      assert.equal(
        projection.state.streak,
        0,
        "a new learner has no canonical learning-event streak yet",
      );
      const projectedCartax = await client.query<{
        public_student_id: string;
        streak_days: number;
        progress: Record<string, unknown>;
      }>(
        `SELECT public_student_id, streak_days, progress
           FROM academy_student_cartax
          WHERE student_id = $1::uuid`,
        [created.studentId],
      );
      assert.equal(
        projectedCartax.rows[0]?.public_student_id,
        created.publicStudentId,
      );
      assert.equal(
        projectedCartax.rows[0]?.streak_days,
        1,
        "learning projection must not overwrite the cartax-owned activity streak",
      );
      assert.equal(
        projectedCartax.rows[0]?.progress.publicStudentId,
        created.publicStudentId,
      );
      assert.equal(projectedCartax.rows[0]?.progress.streakDays, 1);
      assert.equal(projectedCartax.rows[0]?.progress.version, 2);
      assert.equal(
        projectedCartax.rows[0]?.progress.clientForgedXp,
        undefined,
        "projection refresh must not preserve arbitrary legacy/client keys",
      );

      const sameDayRetry = await upsertStudentCartax(client, {
        email,
        displayName: "Academy Profile Contract",
        locale: "fa",
        source: "academy-profile-contract-test",
      });
      assert.equal(
        sameDayRetry.streakDays,
        1,
        "a same-day retry must not inflate the learning streak",
      );

      await client.query(
        `UPDATE academy_students
            SET last_active_day = CURRENT_DATE - 1
          WHERE id = $1::uuid`,
        [created.studentId],
      );
      const nextDay = await upsertStudentCartax(client, {
        email,
        displayName: "Academy Profile Contract",
        locale: "fa",
        source: "academy-profile-contract-test",
      });
      assert.equal(nextDay.streakDays, 2);

      const ownership = await client.query<{
        table_name: string;
        column_name: string;
      }>(
        `SELECT table_name, column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name IN ('public_student_id', 'streak_days')
            AND table_name IN ('academy_students', 'academy_student_cartax')
          ORDER BY table_name, column_name`,
      );
      assert.deepEqual(ownership.rows, [
        { table_name: "academy_student_cartax", column_name: "public_student_id" },
        { table_name: "academy_student_cartax", column_name: "streak_days" },
      ]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
