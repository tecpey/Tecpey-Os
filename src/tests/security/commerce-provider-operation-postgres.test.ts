import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { runProCommerceAuthorityMigrations } from "../../lib/db-migrate-pro-commerce-authority";
import {
  claimCommerceProviderOperationTx,
  completeCommerceProviderOperationTx,
  markCommerceProviderOperationUnknownTx,
} from "../../lib/commerce/commerce-provider-authority";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

type ClaimInput = Parameters<typeof claimCommerceProviderOperationTx>[1];

async function beginScoped(client: PoolClient, tenantId: string, workspaceId: string) {
  await client.query("BEGIN");
  await client.query(
    "SELECT set_config('app.tenant_id',$1,true), set_config('app.workspace_id',$2,true)",
    [tenantId, workspaceId],
  );
}

async function claimCommitted(client: PoolClient, input: ClaimInput) {
  await beginScoped(client, input.tenantId, input.workspaceId);
  try {
    const result = await claimCommerceProviderOperationTx(client, input);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

test("commerce provider operations serialize duplicate effects and preserve same-key recovery", { skip: !databaseUrl, timeout: 45_000 }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const setup = await pool.connect();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenantId = `commerce-provider-${suffix}`;
  const workspaceId = `commerce-provider-ws-${suffix}`;
  try {
    await runProCommerceAuthorityMigrations(setup);
    await setup.query(
      "INSERT INTO platform_tenants (id,slug,display_name,plan,products) VALUES ($1,$1,$1,'enterprise','{}')",
      [tenantId],
    );
    await setup.query(
      "INSERT INTO platform_workspaces (id,tenant_id,slug,display_name,products) VALUES ($1,$2,$1,$1,'{}')",
      [workspaceId, tenantId],
    );

    const input: ClaimInput = {
      tenantId,
      workspaceId,
      provider: "testpay",
      operationType: "refund",
      idempotencyKey: `refund-${suffix}-0001`,
      requestHash: "a".repeat(64),
      staleAfterMs: 60_000,
    };

    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await beginScoped(first, tenantId, workspaceId);
      const claimed = await claimCommerceProviderOperationTx(first, input);
      assert.equal(claimed.status, "claimed");

      await beginScoped(second, tenantId, workspaceId);
      let secondResolved = false;
      const duplicate = claimCommerceProviderOperationTx(second, input).then((result) => {
        secondResolved = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(secondResolved, false, "duplicate claim must wait for the transaction-scoped advisory lock");

      await first.query("COMMIT");
      const duplicateResult = await duplicate;
      assert.equal(duplicateResult.status, "in_progress");
      await second.query("COMMIT");
    } catch (error) {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      first.release();
      second.release();
    }

    await beginScoped(setup, tenantId, workspaceId);
    await completeCommerceProviderOperationTx(setup, {
      tenantId,
      workspaceId,
      provider: input.provider,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      providerObjectId: "refund-provider-1",
    });
    await setup.query("COMMIT");

    assert.deepEqual(await claimCommitted(setup, input), {
      status: "replayed",
      requestHash: input.requestHash,
      providerObjectId: "refund-provider-1",
    });
    assert.deepEqual(await claimCommitted(setup, { ...input, requestHash: "b".repeat(64) }), {
      status: "conflict",
      requestHash: "b".repeat(64),
    });

    const uncertain: ClaimInput = {
      ...input,
      idempotencyKey: `refund-${suffix}-0002`,
      requestHash: "c".repeat(64),
    };
    assert.equal((await claimCommitted(setup, uncertain)).status, "claimed");

    await beginScoped(setup, tenantId, workspaceId);
    await markCommerceProviderOperationUnknownTx(setup, {
      tenantId,
      workspaceId,
      provider: uncertain.provider,
      idempotencyKey: uncertain.idempotencyKey,
      requestHash: uncertain.requestHash,
    });
    await setup.query("COMMIT");

    assert.deepEqual(await claimCommitted(setup, uncertain), {
      status: "retry_same_key",
      requestHash: uncertain.requestHash,
    });

    // A second ambiguous dispatch must be recordable without inventing a new
    // idempotency key. The provider contract is required to dedupe that key.
    await beginScoped(setup, tenantId, workspaceId);
    await markCommerceProviderOperationUnknownTx(setup, {
      tenantId,
      workspaceId,
      provider: uncertain.provider,
      idempotencyKey: uncertain.idempotencyKey,
      requestHash: uncertain.requestHash,
    });
    await setup.query("COMMIT");

    const evidence = await setup.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count
         FROM commerce_provider_operations
        WHERE tenant_id=$1 AND workspace_id=$2
        GROUP BY status ORDER BY status`,
      [tenantId, workspaceId],
    );
    assert.deepEqual(evidence.rows, [
      { status: "succeeded", count: "1" },
      { status: "unknown", count: "1" },
    ]);
  } finally {
    await setup.query("ROLLBACK").catch(() => undefined);
    setup.release();
    await pool.end();
  }
});
