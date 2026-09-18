import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  persistOperationalAlertDeliveryAttemptTx,
  persistOperationalAlertTx,
  persistOperationalJobRunTx,
  persistOperationalSignalDeliveryAttemptTx,
  persistOperationalSignalTx,
  type OperationalAlertEvidence,
  type OperationalJobRunEvidence,
  type OperationalSignalEvidence,
} from "../../lib/ops/operational-job-evidence";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function run(runId: string): OperationalJobRunEvidence {
  return {
    runId,
    jobName: "community-challenge-finalization",
    schedulerUnit: "tecpey-community-challenge-finalizer.service",
    hostName: "postgres-test",
    resultStatus: "partial_failure",
    startedAt: "2026-07-21T08:00:00.000Z",
    completedAt: "2026-07-21T08:00:01.000Z",
    batchesProcessed: 1,
    selectedCount: 2,
    finalizedCompletedCount: 1,
    finalizedNotCompletedCount: 0,
    failureCount: 1,
    drainLimitReached: false,
    failureFingerprints: ["0123456789abcdef01234567"],
    reasonCodes: ["evidence_invalid"],
  };
}

function alert(evidence: OperationalJobRunEvidence): OperationalAlertEvidence {
  return {
    schemaVersion: 1,
    alertId: `${evidence.jobName}:${evidence.runId}`,
    run: evidence,
    severity: "warning",
    occurredAt: evidence.completedAt,
  };
}

function signal(
  incidentId: string,
  lifecycle: "firing" | "resolved" = "firing",
): OperationalSignalEvidence {
  return {
    schemaVersion: 1,
    signalId: `mentor-profile-health:${incidentId}:${lifecycle}`,
    incidentId,
    source: "mentor-profile-health",
    sourceUnit: "tecpey-mentor-profile-health.service",
    hostName: "postgres-test",
    severity: "critical",
    lifecycle,
    condition: "projection-health",
    conditionFingerprint: "a".repeat(64),
    occurredAt:
      lifecycle === "firing"
        ? "2026-09-18T12:00:00.000Z"
        : "2026-09-18T12:05:00.000Z",
    reasonCodes:
      lifecycle === "firing"
        ? ["dead_letter_present"]
        : ["condition_recovered"],
    counters: {
      unresolved_dead_letters: lifecycle === "firing" ? 1 : 0,
    },
    gauges: {
      oldest_ready_age_seconds: lifecycle === "firing" ? 301 : null,
    },
  };
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Operational job evidence PostgreSQL authority", () => {
  it("replays exact run and alert evidence but rejects divergent identity", {
    skip: !configured,
  }, async () => {
    const evidence = run(randomUUID());
    const first = await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const runResult = await persistOperationalJobRunTx(client, evidence);
        const alertResult = await persistOperationalAlertTx(client, alert(evidence));
        await client.query("COMMIT");
        return { runResult, alertResult };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    assert.equal(first.runResult.replayed, false);
    assert.equal(first.alertResult.replayed, false);

    const replay = await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const runResult = await persistOperationalJobRunTx(client, evidence);
        const alertResult = await persistOperationalAlertTx(client, alert(evidence));
        await client.query("COMMIT");
        return { runResult, alertResult };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    assert.equal(replay.runResult.replayed, true);
    assert.equal(replay.alertResult.replayed, true);

    await assert.rejects(
      withClient(async (client) => {
        await client.query("BEGIN");
        try {
          await persistOperationalJobRunTx(client, {
            ...evidence,
            selectedCount: 3,
          });
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }),
      /operational_run_identity_conflict/,
    );
  });

  it("stores append-only delivery attempts with exact replay", {
    skip: !configured,
  }, async () => {
    const evidence = run(randomUUID());
    const alertEvidence = alert(evidence);
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await persistOperationalAlertTx(client, alertEvidence);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    const attempt = {
      alertId: alertEvidence.alertId,
      attemptNumber: 1,
      deliveryResult: "delivered" as const,
      httpStatus: 204,
      errorCode: null,
      attemptedAt: "2026-07-21T08:01:00.000Z",
      evidence: { provider: "webhook" as const, responseBodyBytes: 0 },
    };
    const first = await withClient((client) =>
      persistOperationalAlertDeliveryAttemptTx(client, attempt),
    );
    const replay = await withClient((client) =>
      persistOperationalAlertDeliveryAttemptTx(client, attempt),
    );
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    await assert.rejects(
      withClient((client) =>
        persistOperationalAlertDeliveryAttemptTx(client, {
          ...attempt,
          httpStatus: 200,
        }),
      ),
      /operational_attempt_identity_conflict/,
    );
  });

  it("stores generic operational signals and attempts with exact replay", {
    skip: !configured,
  }, async () => {
    const incidentId = randomUUID();
    const firing = signal(incidentId);
    const first = await withClient((client) =>
      persistOperationalSignalTx(client, firing),
    );
    const replay = await withClient((client) =>
      persistOperationalSignalTx(client, firing),
    );
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);

    await assert.rejects(
      withClient((client) =>
        persistOperationalSignalTx(client, {
          ...firing,
          reasonCodes: ["terminal_projection_failure"],
        }),
      ),
      /operational_signal_identity_conflict/,
    );

    const attempt = {
      signalId: firing.signalId,
      attemptNumber: 1,
      deliveryResult: "retryable_failure" as const,
      httpStatus: 503,
      errorCode: "webhook_http_503",
      attemptedAt: "2026-09-18T12:00:01.000Z",
      evidence: {
        provider: "webhook" as const,
        responseBodyBytes: 0,
      },
    };
    assert.equal(
      (await withClient((client) =>
        persistOperationalSignalDeliveryAttemptTx(client, attempt),
      )).replayed,
      false,
    );
    assert.equal(
      (await withClient((client) =>
        persistOperationalSignalDeliveryAttemptTx(client, attempt),
      )).replayed,
      true,
    );
    await assert.rejects(
      withClient((client) =>
        persistOperationalSignalDeliveryAttemptTx(client, {
          ...attempt,
          httpStatus: 500,
        }),
      ),
      /operational_signal_attempt_identity_conflict/,
    );

    const resolved = signal(incidentId, "resolved");
    assert.equal(
      (await withClient((client) =>
        persistOperationalSignalTx(client, resolved),
      )).replayed,
      false,
    );

    await assert.rejects(
      withClient((client) =>
        persistOperationalSignalTx(client, {
          ...resolved,
          signalId: `mentor-profile-health:${incidentId}:resolved-second`,
        } as OperationalSignalEvidence),
      ),
      /operational_signal_identity_invalid/,
    );
  });

  it("rejects updates and deletes across all operational evidence tables", {
    skip: !configured,
  }, async () => {
    const evidence = run(randomUUID());
    const alertEvidence = alert(evidence);
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await persistOperationalAlertTx(client, alertEvidence);
        await persistOperationalAlertDeliveryAttemptTx(client, {
          alertId: alertEvidence.alertId,
          attemptNumber: 1,
          deliveryResult: "retryable_failure",
          httpStatus: 503,
          errorCode: "webhook_http_503",
          attemptedAt: "2026-07-21T08:01:00.000Z",
          evidence: { provider: "webhook", responseBodyBytes: 0 },
        });
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    const mutations: Array<{ statement: string; params: unknown[] }> = [
      {
        statement: "UPDATE platform_operational_job_runs SET host_name = 'changed' WHERE run_id = $1::uuid",
        params: [evidence.runId],
      },
      {
        statement: "DELETE FROM platform_operational_alerts WHERE alert_id = $1",
        params: [alertEvidence.alertId],
      },
      {
        statement: "UPDATE platform_operational_alert_delivery_attempts SET http_status = 200 WHERE alert_id = $1",
        params: [alertEvidence.alertId],
      },
    ];
    const incidentId = randomUUID();
    const signalEvidence = signal(incidentId);
    await withClient(async (client) => {
      await persistOperationalSignalTx(client, signalEvidence);
      await persistOperationalSignalDeliveryAttemptTx(client, {
        signalId: signalEvidence.signalId,
        attemptNumber: 1,
        deliveryResult: "retryable_failure",
        httpStatus: 503,
        errorCode: "webhook_http_503",
        attemptedAt: "2026-09-18T12:00:01.000Z",
        evidence: { provider: "webhook", responseBodyBytes: 0 },
      });
    });
    mutations.push(
      {
        statement:
          "UPDATE platform_operational_signals SET host_name = 'changed' WHERE signal_id = $1",
        params: [signalEvidence.signalId],
      },
      {
        statement:
          "DELETE FROM platform_operational_signal_delivery_attempts WHERE signal_id = $1",
        params: [signalEvidence.signalId],
      },
    );

    for (const mutation of mutations) {
      await assert.rejects(
        withClient((client) => client.query(mutation.statement, mutation.params)),
        /operational evidence is append-only/,
      );
    }
  });
});
