import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const enabled = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const pool = enabled ? new Pool({ connectionString: databaseUrl, max: 6 }) : null;

const studentId = randomUUID();
const otherStudentId = randomUUID();
const cycleId = randomUUID();
const otherCycleId = randomUUID();
const attemptId = randomUUID();
const closedTradeId = randomUUID();

const reflectionValues = {
  decisionReview: "تصمیم را بر اساس برنامه مرور کردم.",
  learnedLesson: "خروج از پیش تعریف‌شده باید اجرا شود.",
  emotionalReview: "در زمان خروج طمع را تشخیص دادم.",
  mistakeTags: JSON.stringify(["late-entry"]),
  evidenceFlags: JSON.stringify(["target-hit"]),
};

async function seed() {
  if (!pool) return;
  await pool.query(
    `INSERT INTO academy_students (id, display_name) VALUES ($1::uuid, 'Arena Reflection Test'), ($2::uuid, 'Other Student')`,
    [studentId, otherStudentId],
  );
  await pool.query(
    `INSERT INTO academy_trading_arena_accounts (student_id, cycle_id)
     VALUES ($1::uuid, $2::uuid), ($3::uuid, $4::uuid)`,
    [studentId, cycleId, otherStudentId, otherCycleId],
  );
  await pool.query(
    `INSERT INTO academy_trading_arena_attempts
       (id, student_id, cycle_id, attempt_number, status, started_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 'active', NOW())`,
    [attemptId, studentId, cycleId],
  );
}

async function cleanup() {
  if (!pool) return;
  await pool.query(`DELETE FROM academy_students WHERE id IN ($1::uuid, $2::uuid)`, [studentId, otherStudentId]);
  await pool.end();
}

before(seed);
after(cleanup);

describe("Trading Arena reflection PostgreSQL authority", { skip: !enabled }, () => {
  it("commits only one row under concurrent first writes", async () => {
    if (!pool) return;
    const statement = `
      INSERT INTO academy_trading_arena_reflections
        (id, student_id, attempt_id, closed_trade_id, decision_review,
         learned_lesson, emotional_review, mistake_tags, evidence_asset,
         evidence_realized_pnl, evidence_realized_pnl_rate,
         evidence_closure_reason, evidence_closed_at, evidence_mentor_flags)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb,
              'BTC', 125.0000000000, 0.012500000000000000,
              'take-profit', NOW(), $9::jsonb)
      RETURNING id::text`;
    const values = (id: string) => [
      id,
      studentId,
      attemptId,
      closedTradeId,
      reflectionValues.decisionReview,
      reflectionValues.learnedLesson,
      reflectionValues.emotionalReview,
      reflectionValues.mistakeTags,
      reflectionValues.evidenceFlags,
    ];

    const results = await Promise.allSettled([
      pool.query(statement, values(randomUUID())),
      pool.query(statement, values(randomUUID())),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM academy_trading_arena_reflections
       WHERE student_id = $1::uuid AND attempt_id = $2::uuid AND closed_trade_id = $3`,
      [studentId, attemptId, closedTradeId],
    );
    assert.equal(count.rows[0]?.count, "1");
  });

  it("allows only one compare-and-swap update for the same revision", async () => {
    if (!pool) return;
    const statement = `
      UPDATE academy_trading_arena_reflections
      SET decision_review = $4, revision = revision + 1, updated_at = NOW()
      WHERE student_id = $1::uuid AND attempt_id = $2::uuid
        AND closed_trade_id = $3 AND revision = 1`;
    const results = await Promise.all([
      pool.query(statement, [studentId, attemptId, closedTradeId, "CAS update A"]),
      pool.query(statement, [studentId, attemptId, closedTradeId, "CAS update B"]),
    ]);
    assert.deepEqual(results.map((result) => result.rowCount).sort(), [0, 1]);
    const current = await pool.query<{ revision: string }>(
      `SELECT revision::text FROM academy_trading_arena_reflections
       WHERE student_id = $1::uuid AND attempt_id = $2::uuid AND closed_trade_id = $3`,
      [studentId, attemptId, closedTradeId],
    );
    assert.equal(current.rows[0]?.revision, "2");
  });

  it("enforces one immutable idempotency command per student attempt and key", async () => {
    if (!pool) return;
    const key = `reflection-test:${randomUUID()}`;
    const response = JSON.stringify({ attemptId, reflection: { revision: 2 } });
    const statement = `
      INSERT INTO academy_trading_arena_reflection_commands
        (id, student_id, attempt_id, closed_trade_id, idempotency_key,
         expected_revision, request_hash, result_revision, result_response)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 1,
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              2, $6::jsonb)`;
    const results = await Promise.allSettled([
      pool.query(statement, [randomUUID(), studentId, attemptId, closedTradeId, key, response]),
      pool.query(statement, [randomUUID(), studentId, attemptId, closedTradeId, key, response]),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  });

  it("rejects a reflection whose student does not own the attempt", async () => {
    if (!pool) return;
    await assert.rejects(
      pool.query(
        `INSERT INTO academy_trading_arena_reflections
           (id, student_id, attempt_id, closed_trade_id, decision_review,
            learned_lesson, emotional_review, mistake_tags, evidence_asset,
            evidence_realized_pnl, evidence_realized_pnl_rate,
            evidence_closure_reason, evidence_closed_at, evidence_mentor_flags)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'review', 'lesson', 'emotion',
                 '["none"]'::jsonb, 'ETH', 0, 0, 'manual', NOW(), '[]'::jsonb)`,
        [randomUUID(), otherStudentId, attemptId, randomUUID()],
      ),
    );
  });

  it("rejects unsupported tags and none combined with another tag", async () => {
    if (!pool) return;
    for (const invalidTags of [
      JSON.stringify(["invented-tag"]),
      JSON.stringify(["none", "late-entry"]),
    ]) {
      await assert.rejects(
        pool.query(
          `INSERT INTO academy_trading_arena_reflections
             (id, student_id, attempt_id, closed_trade_id, decision_review,
              learned_lesson, emotional_review, mistake_tags, evidence_asset,
              evidence_realized_pnl, evidence_realized_pnl_rate,
              evidence_closure_reason, evidence_closed_at, evidence_mentor_flags)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'review', 'lesson', 'emotion',
                   $5::jsonb, 'BTC', 0, 0, 'manual', NOW(), '[]'::jsonb)`,
          [randomUUID(), studentId, attemptId, randomUUID(), invalidTags],
        ),
      );
    }
  });
});
