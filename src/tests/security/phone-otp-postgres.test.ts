import { randomInt } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  finalizePhoneOtpSend,
  preparePhoneOtpChallenge,
  verifyPhoneOtpChallenge,
} from "../../lib/security/phone-otp-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    allowExitOnIdle: true,
  });
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

describe("phone OTP PostgreSQL authority", () => {
  it(
    "stores only a digest and atomically clears it after local verification",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const phoneE164 = `+98912${String(randomInt(10_000_000)).padStart(7, "0")}`;
      const prepared = await preparePhoneOtpChallenge({ phoneE164, purpose: "signup" });
      assert.equal(prepared.status, "prepared");
      if (prepared.status !== "prepared") return;
      assert.match(prepared.code, /^\d{6}$/);

      const initial = await pool!.query<{
        status: string;
        otp_code_digest: string | null;
        attempt_count: number;
      }>(
        `SELECT status, otp_code_digest, attempt_count
           FROM identity_phone_otp_challenges
          WHERE id = $1`,
        [prepared.challengeId],
      );
      assert.equal(initial.rows[0]?.status, "prepared");
      assert.match(initial.rows[0]?.otp_code_digest ?? "", /^[0-9a-f]{64}$/);
      assert.notEqual(initial.rows[0]?.otp_code_digest, prepared.code);
      assert.equal(initial.rows[0]?.attempt_count, 0);

      assert.equal(await finalizePhoneOtpSend({ challengeId: prepared.challengeId, sent: true }), true);
      const wrongCode = prepared.code === "000000" ? "999999" : "000000";
      assert.deepEqual(
        await verifyPhoneOtpChallenge({ challengeId: prepared.challengeId, code: wrongCode }),
        { status: "invalid_code" },
      );

      const retriable = await pool!.query<{
        status: string;
        otp_code_digest: string | null;
        attempt_count: number;
      }>(
        `SELECT status, otp_code_digest, attempt_count
           FROM identity_phone_otp_challenges
          WHERE id = $1`,
        [prepared.challengeId],
      );
      assert.equal(retriable.rows[0]?.status, "sent");
      assert.match(retriable.rows[0]?.otp_code_digest ?? "", /^[0-9a-f]{64}$/);
      assert.equal(retriable.rows[0]?.attempt_count, 1);

      assert.deepEqual(
        await verifyPhoneOtpChallenge({ challengeId: prepared.challengeId, code: prepared.code }),
        { status: "verified", purpose: "signup" },
      );
      const verified = await pool!.query<{
        status: string;
        otp_code_digest: string | null;
        verified_at: Date | null;
        attempt_count: number;
      }>(
        `SELECT status, otp_code_digest, verified_at, attempt_count
           FROM identity_phone_otp_challenges
          WHERE id = $1`,
        [prepared.challengeId],
      );
      assert.equal(verified.rows[0]?.status, "verified");
      assert.equal(verified.rows[0]?.otp_code_digest, null);
      assert.ok(verified.rows[0]?.verified_at instanceof Date);
      assert.equal(verified.rows[0]?.attempt_count, 2);
      assert.deepEqual(
        await verifyPhoneOtpChallenge({ challengeId: prepared.challengeId, code: prepared.code }),
        { status: "invalid_state" },
      );
    },
  );
});
