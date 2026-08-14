import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool } from "pg";
import { awardAcademyReward } from "../../lib/academy-authority";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { refreshAcademyProgressProjection } from "../../lib/academy-progress-projection";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 12 });
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

describe("Academy reward idempotency", () => {
  it("does not duplicate XP when the same authoritative reward is retried concurrently", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const studentId = randomUUID();
    await pool!.query(
      `INSERT INTO academy_students (id, locale, email, display_name)
       VALUES ($1::uuid, 'fa', $2, 'Reward retry test')`,
      [studentId, `${studentId}@academy-reward.test`],
    );

    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, async () => {
          const client = await pool!.connect();
          try {
            await client.query("BEGIN");
            const inserted = await awardAcademyReward(client, {
              studentId,
              locale: "fa",
              rewardKey: "lesson:t1-m1-l1:complete",
              rewardType: "lesson_complete",
              sourceType: "lesson_assessment",
              sourceId: "t1-m1-l1",
              xp: 25,
              badgeCode: "first-lesson",
              metadata: { authority: "canonical_lesson_assessment" },
            });
            await client.query("COMMIT");
            return inserted;
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        }),
      );

      assert.equal(results.filter(Boolean).length, 1);
      const ledger = await pool!.query<{ count: string; xp: string }>(
        `SELECT COUNT(*)::text AS count, COALESCE(SUM(xp), 0)::text AS xp
           FROM academy_reward_ledger
          WHERE student_id = $1::uuid
            AND locale = 'fa'
            AND reward_key = 'lesson:t1-m1-l1:complete'`,
        [studentId],
      );
      assert.deepEqual(ledger.rows[0], { count: "1", xp: "25" });

      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        const projection = await refreshAcademyProgressProjection(client, studentId, "fa");
        await client.query("COMMIT");
        assert.equal(projection.state.xp, 25);
        assert.deepEqual(projection.state.earnedBadges, ["first-lesson"]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } finally {
      await pool!.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
    }
  });
});
