import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  claimApiCommandTx,
  completeApiCommandTx,
  hashApiCommand,
  purgeExpiredApiCommandReceipts,
  type ApiCommandScope,
} from "../../lib/security/api-command-idempotency";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);
let pool: Pool | null = null;

function scope(overrides: Partial<ApiCommandScope> = {}): ApiCommandScope {
  const suffix = randomUUID();
  return {
    tenantId: `test-${suffix}`,
    principalType: "user",
    principalId: `principal-${suffix}`,
    operation: "test.command",
    idempotencyKey: `idempotency-${suffix}`,
    requestHash: hashApiCommand({ command: "test", suffix }),
    ...overrides,
  };
}

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function inTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
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

async function cleanup(): Promise<void> {
  if (!pool) return;
  await withClient(async (client) => {
    await client.query(
      "DELETE FROM api_command_receipts WHERE tenant_id LIKE 'test-%'",
    );
    await client.query(
      "DELETE FROM api_command_idempotency_test_effects WHERE effect_key LIKE 'idem-%'",
    );
  });
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 8,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient(async (client) => {
    await applyDatabaseMigrationsWithLock(client);
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_command_idempotency_test_effects (
        effect_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  });
  await cleanup();
});

after(async () => {
  await cleanup();
  await pool?.end();
  pool = null;
});

describe("tenant-scoped API command receipts", () => {
  it(
    "returns the exact stored terminal result and rejects changed payload reuse",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const command = scope();
      const first = await inTransaction(async (client) => {
        const claim = await claimApiCommandTx<{ accepted: boolean }>(client, command);
        assert.deepEqual(claim, { status: "claimed" });
        await completeApiCommandTx(client, command, {
          httpStatus: 202,
          response: { accepted: true },
        });
        return claim;
      });
      assert.equal(first.status, "claimed");

      const replay = await inTransaction((client) =>
        claimApiCommandTx<{ accepted: boolean }>(client, command),
      );
      assert.deepEqual(replay, {
        status: "replayed",
        httpStatus: 202,
        response: { accepted: true },
      });

      const conflict = await inTransaction((client) =>
        claimApiCommandTx(client, {
          ...command,
          requestHash: hashApiCommand({ command: "changed" }),
        }),
      );
      assert.deepEqual(conflict, { status: "conflict" });
    },
  );

  it(
    "serializes concurrent duplicate delivery and applies the effect once",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const command = scope();
      const effectKey = `idem-${randomUUID()}`;

      async function execute() {
        return inTransaction(async (client) => {
          const claim = await claimApiCommandTx<{ effectKey: string }>(client, command);
          if (claim.status !== "claimed") return claim;

          await client.query(
            `INSERT INTO api_command_idempotency_test_effects (effect_key, payload)
             VALUES ($1, $2::jsonb)`,
            [effectKey, JSON.stringify({ applied: true })],
          );
          await client.query("SELECT pg_sleep(0.15)");
          await completeApiCommandTx(client, command, {
            httpStatus: 200,
            response: { effectKey },
          });
          return { status: "executed" as const };
        });
      }

      const results = await Promise.all([execute(), execute(), execute()]);
      assert.equal(results.filter((result) => result.status === "executed").length, 1);
      assert.equal(results.filter((result) => result.status === "replayed").length, 2);

      await withClient(async (client) => {
        const effects = await client.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM api_command_idempotency_test_effects WHERE effect_key = $1",
          [effectKey],
        );
        const receipts = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM api_command_receipts
            WHERE tenant_id = $1
              AND principal_type = $2
              AND principal_id = $3
              AND operation = $4
              AND idempotency_key = $5
              AND status = 'completed'`,
          [
            command.tenantId,
            command.principalType,
            command.principalId,
            command.operation,
            command.idempotencyKey,
          ],
        );
        assert.equal(Number(effects.rows[0]?.count), 1);
        assert.equal(Number(receipts.rows[0]?.count), 1);
      });
    },
  );

  it(
    "isolates the same key across tenants and principals",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const key = `shared-key-${randomUUID()}`;
      const requestHash = hashApiCommand({ action: "shared" });
      const first = scope({
        tenantId: `test-tenant-a-${randomUUID()}`,
        principalId: "principal-shared",
        idempotencyKey: key,
        requestHash,
      });
      const second = {
        ...first,
        tenantId: `test-tenant-b-${randomUUID()}`,
      };
      const third = {
        ...first,
        principalId: `principal-other-${randomUUID()}`,
      };

      for (const command of [first, second, third]) {
        await inTransaction(async (client) => {
          assert.deepEqual(await claimApiCommandTx(client, command), {
            status: "claimed",
          });
          await completeApiCommandTx(client, command, {
            httpStatus: 200,
            response: { tenantId: command.tenantId, principalId: command.principalId },
          });
        });
      }

      await withClient(async (client) => {
        const receipts = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM api_command_receipts
            WHERE idempotency_key = $1
              AND request_hash = $2`,
          [key, requestHash],
        );
        assert.equal(Number(receipts.rows[0]?.count), 3);
      });
    },
  );

  it(
    "rolls back command evidence and the domain effect together",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const command = scope();
      const effectKey = `idem-${randomUUID()}`;

      await assert.rejects(
        inTransaction(async (client) => {
          assert.deepEqual(await claimApiCommandTx(client, command), {
            status: "claimed",
          });
          await client.query(
            `INSERT INTO api_command_idempotency_test_effects (effect_key, payload)
             VALUES ($1, '{}'::jsonb)`,
            [effectKey],
          );
          throw new Error("forced_domain_failure");
        }),
        /forced_domain_failure/,
      );

      await withClient(async (client) => {
        const evidence = await client.query<{ receipts: string; effects: string }>(
          `SELECT
             (SELECT COUNT(*) FROM api_command_receipts
               WHERE tenant_id = $1 AND idempotency_key = $2)::text AS receipts,
             (SELECT COUNT(*) FROM api_command_idempotency_test_effects
               WHERE effect_key = $3)::text AS effects`,
          [command.tenantId, command.idempotencyKey, effectKey],
        );
        assert.equal(Number(evidence.rows[0]?.receipts), 0);
        assert.equal(Number(evidence.rows[0]?.effects), 0);
      });
    },
  );

  it(
    "keeps completed evidence immutable and purges only expired terminal rows",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const immutable = scope();
      await inTransaction(async (client) => {
        await claimApiCommandTx(client, immutable);
        await completeApiCommandTx(client, immutable, {
          httpStatus: 200,
          response: { immutable: true },
        });
      });

      await assert.rejects(
        withClient((client) =>
          client.query(
            `UPDATE api_command_receipts
                SET response_body = '{"immutable":false}'::jsonb
              WHERE tenant_id = $1
                AND principal_type = $2
                AND principal_id = $3
                AND operation = $4
                AND idempotency_key = $5`,
            [
              immutable.tenantId,
              immutable.principalType,
              immutable.principalId,
              immutable.operation,
              immutable.idempotencyKey,
            ],
          ),
        ),
        (error: unknown) =>
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: string }).code === "55000",
      );

      const expired = scope();
      const active = scope();
      await withClient(async (client) => {
        for (const [command, retainUntil] of [
          [expired, "NOW() - INTERVAL '1 day'"],
          [active, "NOW() + INTERVAL '1 day'"],
        ] as const) {
          await client.query(
            `INSERT INTO api_command_receipts
               (tenant_id, principal_type, principal_id, operation,
                idempotency_key, request_hash, status, http_status,
                response_body, completed_at, retain_until)
             VALUES ($1, $2, $3, $4, $5, $6, 'completed', 200,
                     '{}'::jsonb, NOW(), ${retainUntil})`,
            [
              command.tenantId,
              command.principalType,
              command.principalId,
              command.operation,
              command.idempotencyKey,
              command.requestHash,
            ],
          );
        }

        assert.equal(await purgeExpiredApiCommandReceipts(client, 10), 1);
        const remaining = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id
             FROM api_command_receipts
            WHERE tenant_id = ANY($1::text[])
            ORDER BY tenant_id`,
          [[expired.tenantId, active.tenantId]],
        );
        assert.deepEqual(remaining.rows.map((row) => row.tenant_id), [active.tenantId]);
      });
    },
  );
});
