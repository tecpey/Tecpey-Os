import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import type { CommerceProviderAdapter, CommercialEvent } from "../../lib/commerce/commerce-authority";
import {
  CommerceProviderDispatchError,
  cancelCommerceSubscription,
  refundCommercePayment,
} from "../../lib/commerce/commerce-provider-dispatch";
import { runProCommerceAuthorityMigrations } from "../../lib/db-migrate-pro-commerce-authority";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

function adapter(input: {
  onCancel?: (value: { providerSubscriptionId: string; idempotencyKey: string }) => Promise<void>;
  onRefund?: (value: { providerPaymentId: string; amountMinor: bigint; currency: string; idempotencyKey: string }) => Promise<void>;
}): CommerceProviderAdapter {
  return {
    provider: "testpay",
    async createCheckout() { throw new Error("unused"); },
    cancel: input.onCancel ?? (async () => undefined),
    refund: input.onRefund ?? (async () => undefined),
    async verifyAndNormalizeWebhook(): Promise<CommercialEvent> { throw new Error("unused"); },
  };
}

async function seed(client: PoolClient, suffix: string) {
  const tenantId = `commerce-dispatch-${suffix}`;
  const workspaceId = `commerce-dispatch-ws-${suffix}`;
  await client.query(
    "INSERT INTO platform_tenants (id,slug,display_name,plan,products) VALUES ($1,$1,$1,'enterprise','{}')",
    [tenantId],
  );
  await client.query(
    "INSERT INTO platform_workspaces (id,tenant_id,slug,display_name,products) VALUES ($1,$2,$1,$1,'{}')",
    [workspaceId, tenantId],
  );
  return { tenantId, workspaceId };
}

test("commerce provider dispatch preserves same-key recovery and prevents duplicate refund/cancel effects", { skip: !databaseUrl, timeout: 45_000 }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const setup = await pool.connect();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  try {
    await runProCommerceAuthorityMigrations(setup);
    const scope = await seed(setup, suffix);

    let refundCalls = 0;
    const refundKeys: string[] = [];
    const refundAdapter = adapter({
      onRefund: async ({ idempotencyKey }) => {
        refundCalls += 1;
        refundKeys.push(idempotencyKey);
        if (refundCalls === 1) throw new Error("simulated provider timeout after dispatch");
      },
    });
    const refundInput = {
      pool, adapter: refundAdapter, scope, providerPaymentId: `pay-${suffix}`,
      amountMinor: BigInt("2500"), currency: "USD", idempotencyKey: `refund-${suffix}-same-key`,
    };
    await assert.rejects(refundCommercePayment(refundInput), (error: unknown) =>
      error instanceof CommerceProviderDispatchError && error.code === "provider_outcome_unknown");
    assert.equal(refundCalls, 1);

    const recovered = await refundCommercePayment(refundInput);
    assert.deepEqual(recovered, { replayed: false });
    assert.equal(refundCalls, 2);
    assert.deepEqual(refundKeys, [refundInput.idempotencyKey, refundInput.idempotencyKey]);

    const replayedRefund = await refundCommercePayment(refundInput);
    assert.deepEqual(replayedRefund, { replayed: true });
    assert.equal(refundCalls, 2, "successful refund must never dispatch again");

    let cancelCalls = 0;
    let releaseCancel!: () => void;
    const cancelBarrier = new Promise<void>((resolve) => { releaseCancel = resolve; });
    const cancelAdapter = adapter({
      onCancel: async () => {
        cancelCalls += 1;
        await cancelBarrier;
      },
    });
    const cancelInput = {
      pool, adapter: cancelAdapter, scope, providerSubscriptionId: `sub-${suffix}`,
      idempotencyKey: `cancel-${suffix}-same-key`,
    };
    const firstCancel = cancelCommerceSubscription(cancelInput);
    for (let i = 0; i < 100 && cancelCalls === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(cancelCalls, 1, "first cancel must reach provider");

    await assert.rejects(cancelCommerceSubscription(cancelInput), (error: unknown) =>
      error instanceof CommerceProviderDispatchError && error.code === "operation_in_progress");
    assert.equal(cancelCalls, 1, "concurrent cancel must not reach provider");

    releaseCancel();
    assert.deepEqual(await firstCancel, { replayed: false });
    assert.deepEqual(await cancelCommerceSubscription(cancelInput), { replayed: true });
    assert.equal(cancelCalls, 1, "completed cancel must remain replay-safe");

    const rows = await setup.query<{ operation_type: string; status: string; count: string }>(
      `SELECT operation_type, status, COUNT(*)::text AS count
         FROM commerce_provider_operations
        WHERE tenant_id=$1 AND workspace_id=$2
        GROUP BY operation_type,status ORDER BY operation_type,status`,
      [scope.tenantId, scope.workspaceId],
    );
    assert.deepEqual(rows.rows, [
      { operation_type: "cancel", status: "succeeded", count: "1" },
      { operation_type: "refund", status: "succeeded", count: "1" },
    ]);
  } finally {
    setup.release();
    await pool.end();
  }
});
