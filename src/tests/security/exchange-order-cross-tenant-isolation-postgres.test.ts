import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import {
  admitExchangeOrderCommand,
  type ExchangeOrderAdmissionInput,
} from "../../lib/trading/order-command-service";
import { PLATFORM } from "../../lib/platform-config";
import { isolateExchangeOrderTestCache } from "./exchange-order-test-environment";

// Cross-tenant adversarial proof for exchange_order_commands (#109).
//
// The table's tenant boundary is its idempotency namespace: UNIQUE
// (tenant_id, user_id, idempotency_key), and admitExchangeOrderCommand's
// replay lookup filters `WHERE tenant_id = $1 AND user_id = $2 AND
// idempotency_key = $3`. The threat this proves closed: tenant B reusing an
// idempotency key that tenant A has already spent must NOT collide with,
// replay, or be blocked by tenant A's command. If the WHERE clause or the
// unique constraint dropped tenant_id, tenant B's admission would find tenant
// A's row — and because request_hash mixes in the tenant id, the hashes
// differ, so the collision would surface as a `conflict`: tenant A could
// silently deny tenant B service (or, worse, leak that a command for that key
// exists) simply by picking the same key first. The proof asserts both
// tenants get their own admitted command.

const restoreTestCache = isolateExchangeOrderTestCache();
after(restoreTestCache);

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

const TENANT_A = PLATFORM.DEFAULT_TENANT_ID;
const TENANT_B = `tenant-b-${randomUUID()}`;

function uniqueMarket(): string {
  return `X${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}USDT`;
}

async function seedSecondTenant(tenantId: string): Promise<void> {
  const result = await withDb(async (client) => {
    await client.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])
       ON CONFLICT (id) DO NOTHING`,
      [tenantId],
    );
  });
  assert.equal(result.enabled, true);
}

async function seedMarketAndBalance(input: {
  market: string;
  userId: string;
  available?: string;
}): Promise<void> {
  const result = await withDb(async (client) => {
    await client.query(
      `INSERT INTO markets
        (symbol, base_asset, quote_asset, status, tick_size, step_size,
         min_order_value, max_order_value, price_precision,
         quantity_precision, maker_fee, taker_fee)
       VALUES ($1, $2, 'USDT', 'active', '0.01', '0.00001', '1', '1000000', 2, 5, '0.001', '0.001')
       ON CONFLICT (symbol) DO NOTHING`,
      [input.market, input.market.replace(/USDT$/, "")],
    );
    await client.query(
      `INSERT INTO wallet_balances
        (user_id, asset, available_balance, held_balance)
       VALUES ($1, 'USDT', $2::numeric, 0)
       ON CONFLICT (user_id, asset)
       DO UPDATE SET available_balance = EXCLUDED.available_balance,
                     held_balance = 0,
                     updated_at = NOW()`,
      [input.userId, input.available ?? "1000.0000000000"],
    );
  });
  assert.equal(result.enabled, true);
}

function command(input: {
  tenantId: string;
  market: string;
  userId: string;
  key: string;
}): ExchangeOrderAdmissionInput {
  return {
    tenantId: input.tenantId,
    userId: input.userId,
    idempotencyKey: input.key,
    request: {
      market: input.market,
      side: "buy",
      type: "limit",
      quantity: "0.10000",
      price: "100.00",
      timeInForce: "GTC",
      clientOrderId: `client-${randomUUID()}`,
    },
    hold: { asset: "USDT", amount: "10.0000000000" },
  };
}

async function tenantOfCommand(commandId: string): Promise<string | null> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{ tenant_id: string }>(
      "SELECT tenant_id FROM exchange_order_commands WHERE id = $1::uuid",
      [commandId],
    );
    return rows.rows[0]?.tenant_id ?? null;
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) throw new Error("test_database_unavailable");
  return result.value;
}

describe("Exchange order command cross-tenant isolation", () => {
  it(
    "keeps each tenant's idempotency key private: same key + user under two tenants admits two distinct commands",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      await seedSecondTenant(TENANT_B);
      const market = uniqueMarket();
      const userId = `cross-tenant-${randomUUID()}`;
      // One shared balance row (wallet_balances is keyed by user/asset, not
      // tenant), funded for both holds so a divergent outcome cannot be
      // blamed on insufficient funds.
      await seedMarketAndBalance({ market, userId, available: "1000.0000000000" });

      const sharedKey = `cross-tenant-key-${randomUUID()}`;

      const admittedA = await admitExchangeOrderCommand(
        command({ tenantId: TENANT_A, market, userId, key: sharedKey }),
      );
      assert.equal(admittedA.status, "admitted");

      const admittedB = await admitExchangeOrderCommand(
        command({ tenantId: TENANT_B, market, userId, key: sharedKey }),
      );
      // The core negative assertion: tenant B is NOT replayed tenant A's
      // command and is NOT blocked by a cross-tenant hash conflict.
      assert.equal(admittedB.status, "admitted");

      if (admittedA.status !== "admitted" || admittedB.status !== "admitted") {
        throw new Error("admission did not succeed for both tenants");
      }

      assert.notEqual(
        admittedA.commandId,
        admittedB.commandId,
        "the two tenants must own distinct command rows",
      );
      assert.equal(await tenantOfCommand(admittedA.commandId), TENANT_A);
      assert.equal(await tenantOfCommand(admittedB.commandId), TENANT_B);
    },
  );

  it(
    "replays within the owning tenant only: re-admitting tenant A's key returns tenant A's command, not tenant B's",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      await seedSecondTenant(TENANT_B);
      const market = uniqueMarket();
      const userId = `cross-tenant-replay-${randomUUID()}`;
      await seedMarketAndBalance({ market, userId, available: "1000.0000000000" });

      const sharedKey = `cross-tenant-replay-key-${randomUUID()}`;
      const inputA = command({ tenantId: TENANT_A, market, userId, key: sharedKey });
      const inputB = command({ tenantId: TENANT_B, market, userId, key: sharedKey });

      const firstA = await admitExchangeOrderCommand(inputA);
      const firstB = await admitExchangeOrderCommand(inputB);
      assert.equal(firstA.status, "admitted");
      assert.equal(firstB.status, "admitted");
      if (firstA.status !== "admitted" || firstB.status !== "admitted") {
        throw new Error("admission did not succeed for both tenants");
      }

      // Replaying the identical tenant-A request must resolve to tenant A's
      // command — proving the idempotency lookup is scoped by tenant and does
      // not leak across to tenant B's identically-keyed row.
      const replayA = await admitExchangeOrderCommand(inputA);
      assert.equal(replayA.status, "replayed");
      if (replayA.status !== "replayed") {
        throw new Error("expected tenant A replay");
      }
      assert.equal(replayA.commandId, firstA.commandId);
      assert.notEqual(replayA.commandId, firstB.commandId);
      assert.equal(await tenantOfCommand(replayA.commandId), TENANT_A);
    },
  );
});
