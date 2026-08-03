import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { withDb, withTx } from "../../lib/db";
import { applyExactOrderFillTx } from "../../lib/trading/matching-order-service";

// Failure/ambiguous-outcome recovery evidence for the Exchange (issue #30,
// residual scope 2). The matching engine treats a market's execution as a
// single-owner critical section, but a real-money exchange also has to survive
// the queue-level hazard *inside* that section: a matching command can be
// delivered twice (duplicate worker delivery, at-least-once requeue, a process
// that dies after settlement but before ack). If a replayed command could apply
// a second fill, it would double-spend a hold and mint base/quote out of thin
// air.
//
// applyExactOrderFillTx is the authoritative fill mutation the engine calls for
// both maker and taker. Its guard — `status IN ('NEW','PARTIALLY_FILLED') AND
// remaining_quantity >= fillQty`, evaluated atomically in the UPDATE's WHERE
// clause — is what makes a duplicate or over-sized fill impossible. This suite
// exercises that guard against real PostgreSQL, including a genuinely concurrent
// duplicate delivery, and pins the engine's rollback contract that turns a
// rejected fill into a no-op for the whole settlement transaction.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

const createdOrderIds = new Set<string>();

async function seedOrder(
  quantity: string,
  side: "buy" | "sell" = "sell",
): Promise<string> {
  const id = randomUUID();
  const seeded = await withDb((client) =>
    client.query(
      `INSERT INTO orders
         (id, user_id, market, side, type, status, price, quantity,
          filled_quantity, remaining_quantity)
       VALUES ($1::uuid, $2, 'BTCUSDT', $3, 'limit', 'NEW',
               100, $4::numeric, 0, $4::numeric)`,
      [id, `fill-idem-${randomUUID()}`, side, quantity],
    ),
  );
  assert.equal(seeded.enabled, true);
  createdOrderIds.add(id);
  return id;
}

async function readOrder(
  id: string,
): Promise<{ status: string; filled: string; remaining: string }> {
  const result = await withDb((client) =>
    client.query<{ status: string; filled: string; remaining: string }>(
      `SELECT status,
              filled_quantity::text AS filled,
              remaining_quantity::text AS remaining
         FROM orders WHERE id = $1::uuid`,
      [id],
    ),
  );
  assert.equal(result.enabled, true);
  const row = result.enabled ? result.value.rows[0] : undefined;
  assert.ok(row, "seeded order must be readable");
  return row!;
}

after(async () => {
  if (!configured || createdOrderIds.size === 0) return;
  await withDb((client) =>
    client.query(`DELETE FROM orders WHERE id = ANY($1::uuid[])`, [
      [...createdOrderIds],
    ]),
  );
});

describe("Exchange fill idempotency guard", () => {
  it(
    "applies a fill once and rejects an identical replayed command",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const id = await seedOrder("10");

      const first = await withTx((client) =>
        applyExactOrderFillTx(client, {
          orderId: id,
          fillQuantity: "10",
          fillPrice: "100",
          newStatus: "FILLED",
        }),
      );
      assert.equal(first.enabled, true);
      assert.equal(first.enabled && first.value, true, "the first fill must apply");

      const afterFirst = await readOrder(id);
      assert.equal(afterFirst.status, "FILLED");
      assert.equal(afterFirst.filled, "10.0000000000");
      assert.equal(afterFirst.remaining, "0.0000000000");

      // Replay the exact same command. A terminal order fails the status guard,
      // so the UPDATE matches no row and the fill is a no-op — not a second fill.
      const replay = await withTx((client) =>
        applyExactOrderFillTx(client, {
          orderId: id,
          fillQuantity: "10",
          fillPrice: "100",
          newStatus: "FILLED",
        }),
      );
      assert.equal(replay.enabled, true);
      assert.equal(
        replay.enabled && replay.value,
        false,
        "a replayed fill on a terminal order must be rejected",
      );

      const afterReplay = await readOrder(id);
      assert.equal(afterReplay.filled, "10.0000000000", "no second fill may accrue");
      assert.equal(afterReplay.remaining, "0.0000000000");
    },
  );

  it(
    "rejects a fill larger than the remaining quantity",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const id = await seedOrder("10");

      const partial = await withTx((client) =>
        applyExactOrderFillTx(client, {
          orderId: id,
          fillQuantity: "6",
          fillPrice: "100",
          newStatus: "PARTIALLY_FILLED",
        }),
      );
      assert.equal(partial.enabled && partial.value, true);

      // Only 4 remain; a 5-unit fill would overspend the hold. The
      // `remaining_quantity >= fillQty` guard must reject it atomically.
      const overfill = await withTx((client) =>
        applyExactOrderFillTx(client, {
          orderId: id,
          fillQuantity: "5",
          fillPrice: "100",
          newStatus: "FILLED",
        }),
      );
      assert.equal(overfill.enabled, true);
      assert.equal(
        overfill.enabled && overfill.value,
        false,
        "a fill exceeding the remaining quantity must be rejected",
      );

      const state = await readOrder(id);
      assert.equal(state.status, "PARTIALLY_FILLED");
      assert.equal(state.filled, "6.0000000000", "the rejected overfill must not accrue");
      assert.equal(state.remaining, "4.0000000000");
    },
  );

  it(
    "admits exactly one fill under concurrent duplicate delivery",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const id = await seedOrder("10");

      // Two identical commands race — the real duplicate-delivery hazard. The
      // row-level UPDATE serializes them: exactly one observes NEW with enough
      // remaining and wins; the other sees the terminal row and applies nothing.
      const [a, b] = await Promise.all([
        withTx((client) =>
          applyExactOrderFillTx(client, {
            orderId: id,
            fillQuantity: "10",
            fillPrice: "100",
            newStatus: "FILLED",
          }),
        ),
        withTx((client) =>
          applyExactOrderFillTx(client, {
            orderId: id,
            fillQuantity: "10",
            fillPrice: "100",
            newStatus: "FILLED",
          }),
        ),
      ]);

      assert.equal(a.enabled && b.enabled, true);
      const outcomes = [
        a.enabled ? a.value : null,
        b.enabled ? b.value : null,
      ].sort();
      assert.deepEqual(
        outcomes,
        [false, true],
        "exactly one concurrent duplicate delivery may apply the fill",
      );

      const state = await readOrder(id);
      assert.equal(state.filled, "10.0000000000", "concurrent duplicates must not double-fill");
      assert.equal(state.remaining, "0.0000000000");
    },
  );

  it("the engine rejects the whole settlement when a fill is rejected", async () => {
    // The DB guard only prevents a double fill if the engine treats a rejected
    // fill as fatal to the enclosing settlement transaction — otherwise a trade
    // and its fund movements could commit while the order rows stay unchanged.
    // Pin that contract in the real matching path: both the maker and taker fill
    // results are checked and throw, inside the single withTx block, so any
    // rejected fill rolls back the trade, the settlement and the counterpart
    // fill together.
    const engineSource = await readFile(
      new URL("../../lib/trading/engine.ts", import.meta.url),
      "utf8",
    );

    assert.match(
      engineSource,
      /const makerUpdated = await applyExactOrderFillTx\(/,
      "the engine must capture the maker fill result",
    );
    assert.match(
      engineSource,
      /if \(!makerUpdated\) throw new Error\("maker_fill_rejected"\)/,
      "a rejected maker fill must throw and roll back the settlement",
    );
    assert.match(
      engineSource,
      /if \(!updated\) throw new Error\("taker_fill_rejected"\)/,
      "a rejected taker fill must throw and roll back the settlement",
    );
    assert.match(
      engineSource,
      /await withTx\(async \(client\)/,
      "trade creation, settlement and fills must share one transaction",
    );
  });
});
