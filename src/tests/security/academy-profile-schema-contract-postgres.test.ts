import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  findStudentCartaxProfile,
  upsertStudentCartax,
} from "../../lib/student-cartax";

// Regression coverage for the staging incident where the Academy profile GET
// selected public_student_id and streak_days from academy_students even though
// the canonical schema owns both fields in academy_student_cartax. The same
// drift also made the onboarding writer fail before a profile could be created.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

async function withRollback<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
  } finally {
    client.release();
  }
});

after(async () => {
  if (!pool) return;
  await pool.end();
  pool = null;
});

describe("Academy profile canonical schema contract", () => {
  it(
    "creates and reads a cartax-owned public id and idempotent streak",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
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

        const ownership = await client.query<{ table_name: string; column_name: string }>(
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
      });
    },
  );
});
