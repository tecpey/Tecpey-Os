import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  claimApiCommandTx,
  completeApiCommandTx,
  hashApiCommand,
  type ApiCommandScope,
} from "../../lib/security/api-command-idempotency";

// Cross-tenant adversarial proof for api_command_receipts (#109).
//
// api_command_receipts is the generic API idempotency ledger. Its tenant
// boundary is the primary key — (tenant_id, principal_type, principal_id,
// operation, idempotency_key) — and claimApiCommandTx/completeApiCommandTx both
// scope every read and write `WHERE tenant_id = $1 AND ...`. A completed receipt
// stores the response body that is replayed to the caller.
//
// The threat proven closed: tenant B reusing an idempotency key that tenant A
// has already completed must NOT be replayed tenant A's stored response. If the
// PK or the claim WHERE dropped tenant_id, tenant B's claim with the same
// (principal, operation, key) would resolve to tenant A's completed receipt and
// return A's response body — a cross-tenant response/data leak, or a spurious
// conflict that lets A deny B service by picking the key first. The proof
// asserts each tenant claims and replays its own receipt only.

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

// Two scopes sharing everything except tenant_id — the exact shape that would
// collide across tenants if tenant_id were not part of the receipt identity.
function tenantScopes() {
  const shared = randomUUID();
  const requestHash = hashApiCommand({ command: "cross-tenant", shared });
  const identity = {
    principalType: "user" as const,
    principalId: `principal-${shared}`,
    operation: "test.cross-tenant.command",
    idempotencyKey: `idem-${shared.replace(/-/g, "")}`,
    requestHash,
  };
  const tenantA: ApiCommandScope = { tenantId: `tenant-a-${shared}`, ...identity };
  const tenantB: ApiCommandScope = { tenantId: `tenant-b-${shared}`, ...identity };
  return { tenantA, tenantB };
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 8, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("API command receipt cross-tenant isolation", () => {
  it(
    "keeps each tenant's idempotency namespace private: the same key under two tenants claims two independent receipts",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const { tenantA, tenantB } = tenantScopes();

      // Tenant A claims and completes with a tenant-A-specific response.
      const claimA = await inTransaction((client) => claimApiCommandTx(client, tenantA));
      assert.equal(claimA.status, "claimed");
      await inTransaction((client) =>
        completeApiCommandTx(client, tenantA, {
          httpStatus: 200,
          response: { owner: "tenant-a", secret: `A-${tenantA.tenantId}` },
        }),
      );

      // Tenant B claims the byte-identical (principal, operation, key, hash).
      // The core negative assertion: B gets a fresh claim, NOT a replay of A's
      // completed receipt — a tenant-blind PK/lookup would return "replayed"
      // with tenant A's response body here.
      const claimB = await inTransaction((client) => claimApiCommandTx(client, tenantB));
      assert.equal(
        claimB.status,
        "claimed",
        "tenant B must claim its own receipt, not replay tenant A's response",
      );
    },
  );

  it(
    "replays each tenant to its own response: A replays A's body and B replays B's, never the other tenant's",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const { tenantA, tenantB } = tenantScopes();
      const responseA = { owner: "tenant-a", secret: `A-${randomUUID()}` };
      const responseB = { owner: "tenant-b", secret: `B-${randomUUID()}` };

      // Claim BOTH tenants while both receipts are still 'processing' BEFORE
      // completing either. This is what guards the completion *write* path: a
      // tenant-blind completion UPDATE (WHERE ...status='processing' without
      // tenant_id) would match both processing rows at once — rowCount = 2,
      // which completeApiCommandTx rejects. Completing A before B is even
      // claimed would hide that break, because the other tenant's row would be
      // absent or already completed.
      const claimA = await inTransaction((client) => claimApiCommandTx(client, tenantA));
      const claimB = await inTransaction((client) => claimApiCommandTx(client, tenantB));
      assert.equal(claimA.status, "claimed");
      assert.equal(claimB.status, "claimed");

      await inTransaction((client) =>
        completeApiCommandTx(client, tenantA, { httpStatus: 200, response: responseA }),
      );
      await inTransaction((client) =>
        completeApiCommandTx(client, tenantB, { httpStatus: 201, response: responseB }),
      );

      // Re-claiming the identical request under each tenant must replay THAT
      // tenant's own stored response — never the other tenant's identically-keyed
      // receipt.
      const replayA = await inTransaction((client) =>
        claimApiCommandTx<typeof responseA>(client, tenantA),
      );
      const replayB = await inTransaction((client) =>
        claimApiCommandTx<typeof responseB>(client, tenantB),
      );

      assert.equal(replayA.status, "replayed");
      assert.equal(replayB.status, "replayed");
      if (replayA.status !== "replayed" || replayB.status !== "replayed") {
        throw new Error("expected both tenants to replay their own receipt");
      }

      assert.equal(replayA.httpStatus, 200);
      assert.deepEqual(replayA.response, responseA);
      assert.equal(replayB.httpStatus, 201);
      assert.deepEqual(replayB.response, responseB);
      assert.notDeepEqual(
        replayB.response,
        responseA,
        "tenant B's replay must not return tenant A's response body",
      );
    },
  );
});
