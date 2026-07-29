import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { readCommunityChallengeHostDatabaseEvidence } from "../../lib/ops/community-challenge-host-evidence-db";
import { persistOperationalJobRunTx } from "../../lib/ops/operational-job-evidence";

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

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Community challenge host PostgreSQL evidence", () => {
  it("returns migration 0050 and the latest privacy-minimized scheduler run", {
    skip: !configured,
  }, async () => {
    const runId = randomUUID();
    const startedAt = new Date(Date.now() + 60_000).toISOString();
    const completedAt = new Date(Date.now() + 61_000).toISOString();
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await persistOperationalJobRunTx(client, {
          runId,
          jobName: "community-challenge-finalization",
          schedulerUnit: "tecpey-community-challenge-finalizer.service",
          hostName: "postgres-evidence-test",
          resultStatus: "succeeded",
          startedAt,
          completedAt,
          batchesProcessed: 1,
          selectedCount: 0,
          finalizedCompletedCount: 0,
          finalizedNotCompletedCount: 0,
          failureCount: 0,
          drainLimitReached: false,
          failureFingerprints: [],
          reasonCodes: [],
        });
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    const evidence = await readCommunityChallengeHostDatabaseEvidence(databaseUrl!);
    assert.equal(evidence.migration0050Applied, true);
    assert.equal(evidence.latestRun?.runId, runId);
    assert.equal(evidence.latestRun?.resultStatus, "succeeded");
    assert.equal(evidence.latestRun?.failureCount, 0);
    assert.equal(
      JSON.stringify(evidence).includes("postgresql://"),
      false,
    );
  });

  it("rejects non-PostgreSQL and placeholder connection strings", async () => {
    await assert.rejects(
      readCommunityChallengeHostDatabaseEvidence("https://database.example.test"),
      /host_evidence_database_unavailable|host_evidence_database_url_invalid/,
    );
    await assert.rejects(
      readCommunityChallengeHostDatabaseEvidence("postgresql://CHANGE_ME"),
      /host_evidence_database_unavailable|host_evidence_database_url_invalid/,
    );
  });
});
