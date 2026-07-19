import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  readAcademyTermSectionProjection,
  submitAcademySectionCheckpoint,
} from "../../lib/academy-section-authority";
import { resolveAcademySectionCheckpoint } from "../../lib/academy-section-checkpoint";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const value = await callback(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function createStudent(locale: "fa" | "en" = "fa"): Promise<string> {
  const id = randomUUID();
  await withClient((client) =>
    client.query(
      `INSERT INTO academy_students (id, locale, email, display_name)
       VALUES ($1::uuid, $2, $3, $4)`,
      [id, locale, `${id}@academy-progress.test`, `Progress ${id.slice(0, 8)}`],
    ).then(() => undefined),
  );
  return id;
}

function checkpoint(locale: "fa" | "en" = "fa", termSlug = "term-1", sectionKey = "lesson-1") {
  const resolved = resolveAcademySectionCheckpoint(locale, termSlug, sectionKey);
  assert.ok(resolved);
  const wrong = resolved.checkpoint.options.find(
    (option) => option.id !== resolved.correctOptionId,
  );
  assert.ok(wrong);
  return { resolved, wrong };
}

async function submit(input: {
  studentId: string;
  locale?: "fa" | "en";
  termSlug?: string;
  sectionKey?: string;
  selectedOptionId: string;
  questionVersion: string;
  idempotencyKey?: string;
}) {
  return transaction((client) =>
    submitAcademySectionCheckpoint(client, {
      studentId: input.studentId,
      locale: input.locale ?? "fa",
      termSlug: input.termSlug ?? "term-1",
      sectionKey: input.sectionKey ?? "lesson-1",
      questionVersion: input.questionVersion,
      selectedOptionId: input.selectedOptionId,
      idempotencyKey: input.idempotencyKey ?? `academy-test-${randomUUID()}`,
      networkIp: "198.51.100.20",
    }),
  );
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 16,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Academy section progress PostgreSQL authority", () => {
  it("records a wrong answer without completion, XP, or unlock authority", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const studentId = await createStudent();
    const { resolved, wrong } = checkpoint();
    const result = await submit({
      studentId,
      selectedOptionId: wrong.id,
      questionVersion: resolved.checkpoint.questionVersion,
    });
    assert.equal(result.status, "committed");
    if (result.status !== "committed") return;
    assert.equal(result.response.correct, false);
    assert.equal(result.response.completed, false);
    assert.equal(result.response.rewarded, false);
    assert.equal(result.response.summary.xp, 0);
    assert.equal(result.response.state.xp, 0);
    assert.equal(result.response.record.attemptCount, 1);

    const evidence = await withClient((client) =>
      client.query<{ attempts: string; rewards: string; completed: boolean }>(
        `SELECT
           (SELECT COUNT(*)::text FROM academy_section_attempts WHERE student_id = $1::uuid) AS attempts,
           (SELECT COUNT(*)::text FROM academy_reward_ledger WHERE student_id = $1::uuid AND xp > 0 AND revoked_at IS NULL) AS rewards,
           (SELECT completed FROM academy_lesson_progress WHERE student_id = $1::uuid AND locale = 'fa' AND term_slug = 'term-1' AND section_key = 'lesson-1') AS completed`,
        [studentId],
      ),
    );
    assert.deepEqual(evidence.rows[0], {
      attempts: "1",
      rewards: "0",
      completed: false,
    });
  });

  it("replays exact idempotent delivery and rejects changed payload reuse", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const studentId = await createStudent();
    const { resolved, wrong } = checkpoint();
    const idempotencyKey = `academy-idempotency-${randomUUID()}`;
    const first = await submit({
      studentId,
      selectedOptionId: wrong.id,
      questionVersion: resolved.checkpoint.questionVersion,
      idempotencyKey,
    });
    const replay = await submit({
      studentId,
      selectedOptionId: wrong.id,
      questionVersion: resolved.checkpoint.questionVersion,
      idempotencyKey,
    });
    const changed = await submit({
      studentId,
      selectedOptionId: resolved.correctOptionId,
      questionVersion: resolved.checkpoint.questionVersion,
      idempotencyKey,
    });
    assert.equal(first.status, "committed");
    assert.equal(replay.status, "committed");
    if (replay.status === "committed") assert.equal(replay.response.replayed, true);
    assert.deepEqual(changed, { status: "idempotency_conflict" });

    const counts = await withClient((client) =>
      client.query<{ attempts: string; commands: string }>(
        `SELECT
           (SELECT COUNT(*)::text FROM academy_section_attempts WHERE student_id = $1::uuid) AS attempts,
           (SELECT COUNT(*)::text FROM academy_learning_commands WHERE student_id = $1::uuid AND idempotency_key = $2) AS commands`,
        [studentId, idempotencyKey],
      ),
    );
    assert.deepEqual(counts.rows[0], { attempts: "1", commands: "1" });
  });

  it("grants one immutable reward for the correct answer and preserves pass evidence after later wrong attempts", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const studentId = await createStudent();
    const { resolved, wrong } = checkpoint();
    const passed = await submit({
      studentId,
      selectedOptionId: resolved.correctOptionId,
      questionVersion: resolved.checkpoint.questionVersion,
    });
    assert.equal(passed.status, "committed");
    if (passed.status !== "committed") return;
    assert.equal(passed.response.completed, true);
    assert.equal(passed.response.rewarded, true);
    assert.equal(passed.response.summary.xp, 15);
    assert.equal(passed.response.state.xp, 15);

    const laterWrong = await submit({
      studentId,
      selectedOptionId: wrong.id,
      questionVersion: resolved.checkpoint.questionVersion,
    });
    assert.equal(laterWrong.status, "committed");
    if (laterWrong.status !== "committed") return;
    assert.equal(laterWrong.response.correct, false);
    assert.equal(laterWrong.response.completed, true);
    assert.equal(laterWrong.response.record.lastAnswerCorrect, true);
    assert.equal(laterWrong.response.record.bestScore, 100);
    assert.equal(laterWrong.response.record.selectedOptionId, resolved.correctOptionId);
    assert.equal(laterWrong.response.summary.xp, 15);
    assert.equal(laterWrong.response.state.xp, 15);

    const evidence = await withClient((client) =>
      client.query<{ attempts: string; rewards: string; xp: string; completed: boolean }>(
        `SELECT
           (SELECT COUNT(*)::text FROM academy_section_attempts WHERE student_id = $1::uuid) AS attempts,
           (SELECT COUNT(*)::text FROM academy_reward_ledger WHERE student_id = $1::uuid AND reward_key = 'section:term-1/lesson-1:complete' AND revoked_at IS NULL) AS rewards,
           (SELECT COALESCE(SUM(xp), 0)::text FROM academy_reward_ledger WHERE student_id = $1::uuid AND revoked_at IS NULL) AS xp,
           (SELECT completed FROM academy_lesson_progress WHERE student_id = $1::uuid AND locale = 'fa' AND term_slug = 'term-1' AND section_key = 'lesson-1') AS completed`,
        [studentId],
      ),
    );
    assert.deepEqual(evidence.rows[0], {
      attempts: "2",
      rewards: "1",
      xp: "15",
      completed: true,
    });
  });

  it("serializes concurrent devices into monotonic attempts and one completion reward", {
    skip: !databaseConfigured,
    timeout: 60_000,
  }, async () => {
    const studentId = await createStudent();
    const { resolved } = checkpoint();
    const submissions = resolved.checkpoint.options.map((option) =>
      submit({
        studentId,
        selectedOptionId: option.id,
        questionVersion: resolved.checkpoint.questionVersion,
      }),
    );
    const results = await Promise.all(submissions);
    assert.equal(results.every((result) => result.status === "committed"), true);

    const evidence = await withClient((client) =>
      client.query<{
        attempts: string;
        rewards: string;
        completed: boolean;
        best_score: number;
        attempt_count: number;
        last_answer_correct: boolean;
      }>(
        `SELECT
           (SELECT COUNT(*)::text FROM academy_section_attempts WHERE student_id = $1::uuid) AS attempts,
           (SELECT COUNT(*)::text FROM academy_reward_ledger WHERE student_id = $1::uuid AND reward_key = 'section:term-1/lesson-1:complete' AND revoked_at IS NULL) AS rewards,
           completed, best_score, attempt_count, last_answer_correct
         FROM academy_lesson_progress
         WHERE student_id = $1::uuid AND locale = 'fa' AND term_slug = 'term-1' AND section_key = 'lesson-1'`,
        [studentId],
      ),
    );
    assert.deepEqual(evidence.rows[0], {
      attempts: "4",
      rewards: "1",
      completed: true,
      best_score: 100,
      attempt_count: 4,
      last_answer_correct: true,
    });
  });

  it("keeps progress isolated per student and readable from a different connection", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const studentA = await createStudent();
    const studentB = await createStudent();
    const { resolved } = checkpoint();
    await submit({
      studentId: studentA,
      selectedOptionId: resolved.correctOptionId,
      questionVersion: resolved.checkpoint.questionVersion,
    });

    const projectionA = await transaction((client) =>
      readAcademyTermSectionProjection(client, {
        studentId: studentA,
        locale: "fa",
        termSlug: "term-1",
      }),
    );
    const projectionB = await transaction((client) =>
      readAcademyTermSectionProjection(client, {
        studentId: studentB,
        locale: "fa",
        termSlug: "term-1",
      }),
    );
    assert.equal(projectionA?.summary.completedSections, 1);
    assert.equal(projectionA?.state.xp, 15);
    assert.equal(projectionB?.summary.completedSections, 0);
    assert.equal(projectionB?.state.xp, 0);
  });

  it("blocks later terms until the previous official term is passed", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const studentId = await createStudent();
    const { resolved } = checkpoint("fa", "term-2", "lesson-1");
    const blocked = await submit({
      studentId,
      termSlug: "term-2",
      sectionKey: "lesson-1",
      selectedOptionId: resolved.correctOptionId,
      questionVersion: resolved.checkpoint.questionVersion,
    });
    assert.deepEqual(blocked, { status: "previous_term_required" });

    await withClient((client) =>
      client.query(
        `INSERT INTO academy_term_progress
          (student_id, locale, term_number, status, score, percent, passed_at)
         VALUES ($1::uuid, 'fa', 1, 'passed', 4, 100, NOW())
         ON CONFLICT (student_id, locale, term_number) DO UPDATE SET
           status = 'passed', score = 4, percent = 100, passed_at = NOW(), updated_at = NOW()`,
        [studentId],
      ).then(() => undefined),
    );
    const allowed = await submit({
      studentId,
      termSlug: "term-2",
      sectionKey: "lesson-1",
      selectedOptionId: resolved.correctOptionId,
      questionVersion: resolved.checkpoint.questionVersion,
    });
    assert.equal(allowed.status, "committed");
  });

  it("preserves append-only attempt evidence and rejects physical mutation", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const studentId = await createStudent();
    const { resolved, wrong } = checkpoint();
    await submit({
      studentId,
      selectedOptionId: wrong.id,
      questionVersion: resolved.checkpoint.questionVersion,
    });
    const attempt = await withClient((client) =>
      client.query<{ id: string }>(
        "SELECT id::text FROM academy_section_attempts WHERE student_id = $1::uuid LIMIT 1",
        [studentId],
      ),
    );
    assert.ok(attempt.rows[0]);
    await assert.rejects(() =>
      withClient((client) =>
        client.query(
          "UPDATE academy_section_attempts SET correct = TRUE WHERE id = $1::bigint",
          [attempt.rows[0]!.id],
        ).then(() => undefined),
      ),
    );
    await assert.rejects(() =>
      withClient((client) =>
        client.query(
          "DELETE FROM academy_section_attempts WHERE id = $1::bigint",
          [attempt.rows[0]!.id],
        ).then(() => undefined),
      ),
    );
  });
});
