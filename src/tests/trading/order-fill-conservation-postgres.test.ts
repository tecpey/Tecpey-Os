import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { withDb, withTx } from "../../lib/db";
import { applyExactOrderFillTx } from "../../lib/trading/matching-order-service";

// Fund-conservation evidence for the Exchange fill mutation (issue #30, residual
// scope: exact base/quote conservation under duplicate/oversized matching
// commands).
//
// applyExactOrderFillTx is the authoritative fill the engine applies to both
// maker and taker. Its guard — `status IN ('NEW','PARTIALLY_FILLED') AND
// remaining_quantity >= fillQty`, evaluated atomically in the UPDATE's WHERE
// clause — is a CONSERVATION guard, not a command-dedup primitive. It guarantees
// the accounting identity `filled_quantity + remaining_quantity = quantity`
// stays intact: a fill can never exceed the remaining quantity, and a terminal
// order can never be re-filled. This is what bounds total fills for a market so
// duplicate delivery or a tampered oversized command cannot mint base/quote.
//
// It is deliberately NOT idempotent against a repeated *in-range partial*
// command (see the final test): two identical 5-unit fills on a 20-unit order
// both satisfy the predicate and both apply, because command de-duplication is a
// separate authority — the durable admission command
// (exchange_order_commands.idempotency_key), which admits a given client command
// exactly once before it ever reaches this mutation. Documenting that boundary
// truthfully is part of the evidence: this function conserves value; the command
// layer dedupes identity.

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
      [id, `fill-cons-${randomUUID()}`, side, quantity],
    ),
  );
  assert.equal(seeded.enabled, true);
  createdOrderIds.add(id);
  return id;
}

async function readOrder(
  id: string,
): Promise<{ status: string; filled: string; remaining: string; quantity: string }> {
  const result = await withDb((client) =>
    client.query<{
      status: string;
      filled: string;
      remaining: string;
      quantity: string;
    }>(
      `SELECT status,
              filled_quantity::text AS filled,
              remaining_quantity::text AS remaining,
              quantity::text AS quantity
         FROM orders WHERE id = $1::uuid`,
      [id],
    ),
  );
  assert.equal(result.enabled, true);
  const row = result.enabled ? result.value.rows[0] : undefined;
  assert.ok(row, "seeded order must be readable");
  return row!;
}

function fill(
  id: string,
  fillQuantity: string,
  newStatus: "PARTIALLY_FILLED" | "FILLED",
): Promise<{ enabled: boolean; value?: boolean }> {
  return withTx((client) =>
    applyExactOrderFillTx(client, {
      orderId: id,
      fillQuantity,
      fillPrice: "100",
      newStatus,
    }),
  ) as Promise<{ enabled: boolean; value?: boolean }>;
}

after(async () => {
  if (!configured || createdOrderIds.size === 0) return;
  await withDb((client) =>
    client.query(`DELETE FROM orders WHERE id = ANY($1::uuid[])`, [
      [...createdOrderIds],
    ]),
  );
});

describe("Exchange fill conservation guard", () => {
  it(
    "rejects a re-fill of a terminal order",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const id = await seedOrder("10");

      const first = await fill(id, "10", "FILLED");
      assert.equal(first.enabled && first.value, true, "the first fill must apply");

      const afterFirst = await readOrder(id);
      assert.equal(afterFirst.status, "FILLED");
      assert.equal(afterFirst.filled, "10.0000000000");
      assert.equal(afterFirst.remaining, "0.0000000000");

      // A terminal order fails the status guard, so the UPDATE matches no row.
      const replay = await fill(id, "10", "FILLED");
      assert.equal(
        replay.enabled && replay.value,
        false,
        "a fill on a terminal order must be rejected",
      );

      const afterReplay = await readOrder(id);
      assert.equal(afterReplay.filled, "10.0000000000", "no fill may accrue past terminal");
      assert.equal(afterReplay.remaining, "0.0000000000");
    },
  );

  it(
    "rejects a fill larger than the remaining quantity",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const id = await seedOrder("10");

      const partial = await fill(id, "6", "PARTIALLY_FILLED");
      assert.equal(partial.enabled && partial.value, true);

      // Only 4 remain; a 5-unit fill would overspend the hold and break the
      // `filled + remaining = quantity` identity. The guard rejects it atomically.
      const overfill = await fill(id, "5", "FILLED");
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
    "admits exactly one of two concurrent full-consume commands",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const id = await seedOrder("10");

      // Two identical commands that each consume the ENTIRE remaining race — the
      // real duplicate-delivery hazard for a fill that closes the order. The
      // row-level UPDATE serializes them: one observes NEW with 10 remaining and
      // wins; the other sees the now-terminal row and applies nothing. Total
      // filled stays 10, never 20.
      const [a, b] = await Promise.all([
        fill(id, "10", "FILLED"),
        fill(id, "10", "FILLED"),
      ]);

      assert.equal(a.enabled && b.enabled, true);
      const outcomes = [a.value ?? null, b.value ?? null].sort();
      assert.deepEqual(
        outcomes,
        [false, true],
        "exactly one concurrent full-consume command may apply",
      );

      const state = await readOrder(id);
      assert.equal(state.filled, "10.0000000000", "concurrent duplicates must not double-fill");
      assert.equal(state.remaining, "0.0000000000");
    },
  );

  it(
    "conserves quantity even when an in-range partial command repeats",
    { skip: !configured, timeout: 30_000 },
    async () => {
      // Codex-raised boundary: applyExactOrderFillTx is a conservation guard, not
      // a dedup primitive. A repeated in-range partial (5 twice on a 20-unit
      // order) both satisfies `remaining >= fillQty`, so BOTH apply — this is the
      // honest, asserted behavior, not an oversight. What it must never do is
      // break conservation: total filled stays bounded by quantity and the
      // `filled + remaining = quantity` identity holds after every apply.
      //
      // De-duplicating an identical client command is the job of the durable
      // admission authority (exchange_order_commands.idempotency_key), which
      // admits the command once before it reaches this mutation — not of this
      // value-conserving fill.
      const id = await seedOrder("20");

      const first = await fill(id, "5", "PARTIALLY_FILLED");
      assert.equal(first.enabled && first.value, true);

      const repeat = await fill(id, "5", "PARTIALLY_FILLED");
      assert.equal(
        repeat.enabled && repeat.value,
        true,
        "a repeated in-range partial applies again — dedup is the command layer's job",
      );

      const state = await readOrder(id);
      assert.equal(state.filled, "10.0000000000", "both in-range partials applied");
      assert.equal(state.remaining, "10.0000000000");
      // Conservation is the invariant this mutation owns: never over-filled.
      assert.equal(
        Number(state.filled) + Number(state.remaining),
        Number(state.quantity),
        "filled + remaining must equal the original quantity",
      );
      assert.ok(
        Number(state.filled) <= Number(state.quantity),
        "filled may never exceed the original quantity",
      );
    },
  );
});
