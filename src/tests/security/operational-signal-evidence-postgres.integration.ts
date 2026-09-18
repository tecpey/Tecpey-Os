import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "@/lib/db-migration-plan";
import {
  persistOperationalSignalDeliveryAttemptTx,
  persistOperationalSignalTx,
  type OperationalSignalEvidence,
} from "@/lib/ops/operational-signal-evidence";

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

function signal(incidentId: string): OperationalSignalEvidence {
  return {
    schemaVersion: 1,
    signalId: `mentor-profile-health:${incidentId}:1`,
    incidentId,
    sequence: 1,
    source: "mentor-profile-health",
    sourceUnit: "tecpey-mentor-profile-health.service",
    hostName: "postgres-signal-test",
    phase: "opened",
    severity: "critical",
    occurredAt: "2026-09-18T12:00:00.000Z",
    fingerprint: "a".repeat(64),
    reasonCodes: ["dead_letter_present"],
    details: {
      policyVersion: "2026-09-18.3",
      unresolvedDeadLetters: 1,
      readyBacklog: 0,
    },
  };
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
  it("replays exact signal evidence but rejects divergent identity", {
    skip: !configured,
  }, async () => {
    const evidence = signal(randomUUID());
    const first = await withClient((client) =>
      persistOperationalSignalTx(client, evidence),
    );
    const replay = await withClient((client) =>
      persistOperationalSignalTx(client, evidence),
    );
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(first.payloadHash, replay.payloadHash);

    await assert.rejects(
      withClient((client) =>
        persistOperationalSignalTx(client, {
          ...evidence,
          details: {
            ...evidence.details,
            unresolvedDeadLetters: 2,
          },
        }),
      ),
      /operational_signal_identity_conflict/,
    );
  });

  it("stores idempotent signal delivery attempts and rejects divergent replay", {
    skip: !configured,
  }, async () => {
    const evidence = signal(randomUUID());
    await withClient((client) =>
      persistOperationalSignalTx(client, evidence),
    );
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
  });

  it("keeps signal and delivery evidence append-only", {
    skip: !configured,
  }, async () => {
    const evidence = signal(randomUUID());
    await withClient(async (client) => {
      await persistOperationalSignalTx(client, evidence);
      await persistOperationalSignalDeliveryAttemptTx(client, {
        signalId: evidence.signalId,
        attemptNumber: 1,
        deliveryResult: "retryable_failure",
        httpStatus: 503,
        errorCode: "webhook_http_503",
        attemptedAt: "2026-09-18T12:01:00.000Z",
        evidence: {
          provider: "webhook",
          responseBodyBytes: 0,
        },
      });
    });

    for (const mutation of [
      {
        statement:
          "UPDATE platform_operational_signals SET host_name = 'changed' WHERE signal_id = $1",
        params: [evidence.signalId],
      },
      {
        statement:
          "DELETE FROM platform_operational_signal_delivery_attempts WHERE signal_id = $1",
        params: [evidence.signalId],
      },
    ]) {
      await assert.rejects(
        withClient((client) =>
          client.query(mutation.statement, mutation.params),
        ),
        /operational evidence is append-only/,
      );
    }
  });
});
