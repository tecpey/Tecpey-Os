import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  createOperationalSignalEpisodeEvidence,
  createOperationalSignalEvidence,
  persistOperationalSignalDeliveryAttemptTx,
  persistOperationalSignalTx,
} from "../../lib/ops/operational-signal-evidence";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

async function withClient<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function signal(
  occurredAt: string,
  uniqueReason: string,
  unresolvedDeadLetters: number,
) {
  return createOperationalSignalEvidence({
    signalType: "mentor_profile_projection_health",
    component: "mentor_profile_projection",
    sourceUnit: "tecpey-mentor-profile-health.service",
    severity: "critical",
    lifecycle: "firing",
    occurredAt,
    dedupeWindowSeconds: 3_600,
    reasonCodes: ["dead_letter_present", uniqueReason],
    measurements: {
      unresolved_dead_letters: unresolvedDeadLetters,
      ready_backlog: 500,
    },
  });
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Operational signal PostgreSQL authority", () => {
  it(
    "persists first observation and replays later observations in the same incident window",
    { skip: !configured },
    async () => {
      const uniqueReason = `test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const firstSignal = signal(
        "2026-09-18T12:05:00.000Z",
        uniqueReason,
        1,
      );
      const laterObservation = signal(
        "2026-09-18T12:45:00.000Z",
        uniqueReason,
        5,
      );
      assert.equal(firstSignal.signalId, laterObservation.signalId);

      const first = await withClient((client) =>
        persistOperationalSignalTx(client, firstSignal),
      );
      const replay = await withClient((client) =>
        persistOperationalSignalTx(client, laterObservation),
      );
      assert.equal(first.replayed, false);
      assert.equal(replay.replayed, true);
      assert.equal(replay.payloadHash, first.payloadHash);

      const stored = await withClient((client) =>
        client.query<{ payload: { measurements?: { unresolved_dead_letters?: number } } }>(
          "SELECT payload FROM platform_operational_signals WHERE signal_id = $1",
          [firstSignal.signalId],
        ),
      );
      assert.equal(
        stored.rows[0]?.payload.measurements?.unresolved_dead_letters,
        1,
      );
    },
  );

  it(
    "stores append-only delivery attempts with exact replay",
    { skip: !configured },
    async () => {
      const uniqueReason = `test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const evidence = signal(
        "2026-09-18T13:05:00.000Z",
        uniqueReason,
        1,
      );
      await withClient((client) =>
        persistOperationalSignalTx(client, evidence),
      );

      const attempt = {
        signalId: evidence.signalId,
        attemptNumber: 1,
        deliveryResult: "delivered" as const,
        httpStatus: 204,
        errorCode: null,
        attemptedAt: "2026-09-18T13:06:00.000Z",
        evidence: {
          provider: "webhook" as const,
          responseBodyBytes: 0,
        },
      };
      const first = await withClient((client) =>
        persistOperationalSignalDeliveryAttemptTx(client, attempt),
      );
      const replay = await withClient((client) =>
        persistOperationalSignalDeliveryAttemptTx(client, attempt),
      );
      assert.equal(first.replayed, false);
      assert.equal(replay.replayed, true);

      await assert.rejects(
        withClient((client) =>
          persistOperationalSignalDeliveryAttemptTx(client, {
            ...attempt,
            httpStatus: 200,
          }),
        ),
        /operational_signal_attempt_identity_conflict/,
      );
    },
  );

  it(
    "rejects UPDATE and DELETE across signal evidence tables",
    { skip: !configured },
    async () => {
      const uniqueReason = `test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const evidence = signal(
        "2026-09-18T14:05:00.000Z",
        uniqueReason,
        1,
      );
      await withClient(async (client) => {
        await persistOperationalSignalTx(client, evidence);
        await persistOperationalSignalDeliveryAttemptTx(client, {
          signalId: evidence.signalId,
          attemptNumber: 1,
          deliveryResult: "retryable_failure",
          httpStatus: 503,
          errorCode: "webhook_http_503",
          attemptedAt: "2026-09-18T14:06:00.000Z",
          evidence: {
            provider: "webhook",
            responseBodyBytes: 0,
          },
        });
      });

      const mutations = [
        {
          statement:
            "UPDATE platform_operational_signals SET severity = 'warning' WHERE signal_id = $1",
          params: [evidence.signalId],
        },
        {
          statement:
            "DELETE FROM platform_operational_signal_delivery_attempts WHERE signal_id = $1",
          params: [evidence.signalId],
        },
      ];
      for (const mutation of mutations) {
        await assert.rejects(
          withClient((client) =>
            client.query(mutation.statement, mutation.params),
          ),
          /operational evidence is append-only/,
        );
      }
    },
  );
});


describe("Operational signal episode PostgreSQL authority", () => {
  it(
    "requires exact payload replay for episode v2 while preserving immutable event identity",
    { skip: !configured },
    async () => {
      const episodeId = randomUUID();
      const first = createOperationalSignalEpisodeEvidence({
        signalType: "mentor_profile_projection_health",
        component: "mentor_profile_projection",
        sourceUnit: "tecpey-mentor-profile-health.service",
        severity: "critical",
        lifecycle: "firing",
        episodeId,
        episodeSequence: 1,
        occurredAt: "2026-09-18T15:05:00.000Z",
        reasonCodes: ["dead_letter_present"],
        measurements: { unresolved_dead_letters: 1 },
      });
      const mutatedPayload = createOperationalSignalEpisodeEvidence({
        signalType: first.signalType,
        component: first.component,
        sourceUnit: first.sourceUnit,
        severity: first.severity,
        lifecycle: first.lifecycle,
        episodeId: first.episodeId,
        episodeSequence: first.episodeSequence,
        occurredAt: first.occurredAt,
        dedupeWindowSeconds: first.dedupeWindowSeconds,
        reasonCodes: first.reasonCodes,
        measurements: { unresolved_dead_letters: 9 },
      });
      assert.equal(first.signalId, mutatedPayload.signalId);

      const inserted = await withClient((client) =>
        persistOperationalSignalTx(client, first),
      );
      const replay = await withClient((client) =>
        persistOperationalSignalTx(client, first),
      );
      assert.equal(inserted.replayed, false);
      assert.equal(replay.replayed, true);

      await assert.rejects(
        withClient((client) =>
          persistOperationalSignalTx(client, mutatedPayload),
        ),
        /operational_signal_payload_identity_conflict/,
      );
    },
  );
});
