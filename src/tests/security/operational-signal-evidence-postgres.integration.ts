import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "@/lib/db-migration-plan";
import {
  createOperationalSignalEvidence,
  persistOperationalSignalDeliveryAttemptTx,
  persistOperationalSignalTx,
} from "@/lib/ops/operational-signal-evidence";

const databaseUrl = process.env.DATABASE_URL;

async function withRolledBackTest(
  callback: (client: PoolClient) => Promise<void>,
): Promise<void> {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
    await client.query("BEGIN");
    await callback(client);
    await client.query("ROLLBACK");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function signal() {
  return createOperationalSignalEvidence({
    signalType: "mentor.profile.projection_stalled",
    component: "mentor-profile",
    detector: "mentor-profile-health-probe",
    severity: "critical",
    statusClassification: "active",
    occurredAt: "2026-09-18T12:00:30.000Z",
    reasonCodes: ["dead_letter_present"],
    attributes: {
      policyVersion: "2026-09-18.3",
      criticalReadyAgeSeconds: 300,
    },
    dedupeWindowSeconds: 900,
  });
}

test(
  "operational signals and delivery attempts are idempotent and append-only",
  { skip: !databaseUrl, timeout: 20_000 },
  async () => {
    await withRolledBackTest(async (client) => {
      const evidence = signal();

      const inserted = await persistOperationalSignalTx(client, evidence);
      assert.equal(inserted.replayed, false);
      assert.match(inserted.payloadHash, /^[0-9a-f]{64}$/);

      const replay = await persistOperationalSignalTx(client, evidence);
      assert.deepEqual(replay, {
        replayed: true,
        payloadHash: inserted.payloadHash,
      });

      const attempt = {
        signalId: evidence.signalId,
        attemptNumber: 1,
        deliveryResult: "delivered" as const,
        httpStatus: 204,
        errorCode: null,
        attemptedAt: "2026-09-18T12:01:00.000Z",
        evidence: {
          provider: "webhook" as const,
          responseBodyBytes: 0,
        },
      };
      assert.deepEqual(
        await persistOperationalSignalDeliveryAttemptTx(client, attempt),
        { replayed: false },
      );
      assert.deepEqual(
        await persistOperationalSignalDeliveryAttemptTx(client, attempt),
        { replayed: true },
      );

      await assert.rejects(
        persistOperationalSignalDeliveryAttemptTx(client, {
          ...attempt,
          attemptNumber: 2,
          deliveryResult: "delivered",
          httpStatus: 500,
          errorCode: "webhook_http_500",
        }),
        /operational_signal_attempt_semantics_invalid/,
      );

      await client.query("SAVEPOINT invalid_attempt_semantics");
      await assert.rejects(
        client.query(
          `INSERT INTO platform_operational_signal_delivery_attempts
             (signal_id, attempt_number, delivery_result, http_status,
              error_code, attempted_at, evidence)
           VALUES ($1, 2, 'delivered', 500, 'webhook_http_500',
                   $2::timestamptz,
                   '{"provider":"webhook","responseBodyBytes":0,
                     "attemptHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb)`,
          [evidence.signalId, "2026-09-18T12:02:00.000Z"],
        ),
        /platform_operational_signal_attempt_semantics_check|check constraint/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT invalid_attempt_semantics");

      await client.query("SAVEPOINT signal_mutation");
      await assert.rejects(
        client.query(
          "UPDATE platform_operational_signals SET severity = 'warning' WHERE signal_id = $1",
          [evidence.signalId],
        ),
        /append-only/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT signal_mutation");

      await client.query("SAVEPOINT attempt_mutation");
      await assert.rejects(
        client.query(
          "DELETE FROM platform_operational_signal_delivery_attempts WHERE signal_id = $1",
          [evidence.signalId],
        ),
        /append-only/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT attempt_mutation");

      const rows = await client.query<{
        payload_hash: string;
        attempts: string;
      }>(
        `SELECT signal.payload_hash,
                COUNT(attempt.signal_id)::text AS attempts
           FROM platform_operational_signals signal
           LEFT JOIN platform_operational_signal_delivery_attempts attempt
             ON attempt.signal_id = signal.signal_id
          WHERE signal.signal_id = $1
          GROUP BY signal.payload_hash`,
        [evidence.signalId],
      );
      assert.equal(rows.rows[0]?.payload_hash, inserted.payloadHash);
      assert.equal(rows.rows[0]?.attempts, "1");
    });
  },
);
