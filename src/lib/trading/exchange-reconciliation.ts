// Exchange reconciliation authority — issue #30.
//
// The matching path enforces conservation *preventively*: every fill, hold and
// settlement is transaction-coupled and asserted at write time. That proves each
// individual command was internally consistent. It does not prove the resulting
// state still agrees with the immutable ledger afterwards, which is what a
// real-money exchange has to be able to demonstrate on demand.
//
// This module is the *detective* half. It re-derives balances, fills, fees and
// holds from `wallet_ledger` and `trades`, compares them to the authoritative
// rows, and reports every non-zero delta it cannot explain. It never repairs and
// never writes — immutable financial history stays immutable, and a delta is an
// operator decision, not an automatic correction.
//
// Every comparison runs in PostgreSQL NUMERIC. No financial value is ever parsed
// into a JavaScript number.

import { withDb } from "@/lib/db";
import { createHash } from "node:crypto";

export const EXCHANGE_RECONCILIATION_POLICY_VERSION = "exchange-reconciliation-v1";

export type ReconciliationDeltaCode =
  | "wallet_available_ledger_divergence"
  | "wallet_held_ledger_divergence"
  | "order_quantity_identity_broken"
  | "order_fill_trade_divergence"
  | "trade_fee_ledger_divergence"
  | "terminal_order_residual_hold";

export type ReconciliationDelta = {
  code: ReconciliationDeltaCode;
  subject: string;
  expected: string;
  observed: string;
  delta: string;
};

export type ExchangeReconciliationReport = {
  policyVersion: string;
  generatedAt: string;
  checks: ReconciliationDeltaCode[];
  deltaCount: number;
  deltas: ReconciliationDelta[];
  reconciled: boolean;
  evidenceDigest: string;
};

// Ledger `amount` is unsigned; `type` carries the direction. Verified against
// src/lib/trading/wallet-balance-service.ts:
//   available += deposit, trade_credit, release
//   available -= hold, trade_debit, fee
//   held      += hold
//   held      -= release, withdraw
const AVAILABLE_FROM_LEDGER = `
  SUM(CASE
    WHEN type IN ('deposit', 'trade_credit', 'release') THEN amount
    WHEN type IN ('hold', 'trade_debit', 'fee') THEN -amount
    ELSE 0
  END)`;

const HELD_FROM_LEDGER = `
  SUM(CASE
    WHEN type = 'hold' THEN amount
    WHEN type IN ('release', 'withdraw') THEN -amount
    ELSE 0
  END)`;

const TERMINAL_ORDER_STATES = "('FILLED', 'CANCELLED', 'EXPIRED', 'REJECTED')";

type DeltaRow = {
  subject: string;
  expected: string;
  observed: string;
  delta: string;
};

function canonicalDigest(
  deltas: ReconciliationDelta[],
  policyVersion: string,
): string {
  const canonical = deltas
    .map((entry) =>
      [entry.code, entry.subject, entry.expected, entry.observed].join(""),
    )
    .sort()
    .join("");
  return createHash("sha256")
    .update(`${policyVersion}${canonical}`)
    .digest("hex");
}

/**
 * Re-derives every authoritative financial projection from the immutable ledger
 * and reports the deltas. Read-only: it opens no transaction and writes nothing.
 *
 * Throws when the database is unavailable — an unreachable authority is never
 * reported as "reconciled".
 */
export async function reconcileExchangeLedger(): Promise<ExchangeReconciliationReport> {
  const result = await withDb(async (client) => {
    const deltas: ReconciliationDelta[] = [];

    const push = (code: ReconciliationDeltaCode, rows: DeltaRow[]) => {
      for (const row of rows) {
        deltas.push({
          code,
          subject: row.subject,
          expected: row.expected,
          observed: row.observed,
          delta: row.delta,
        });
      }
    };

    // 1 & 2 — wallet balances must equal what the ledger replays. A wallet with
    // rows on only one side is itself a divergence, so this is a FULL JOIN.
    // NUMERIC text renders zero as "0.000000000000000000", so whether a value
    // diverged is decided in SQL. Comparing the rendered strings in JavaScript
    // would report every matching row as a delta.
    const walletRows = await client.query<{
      subject: string;
      expected_available: string;
      observed_available: string;
      available_delta: string;
      available_diverged: boolean;
      expected_held: string;
      observed_held: string;
      held_delta: string;
      held_diverged: boolean;
    }>(
      `WITH replayed AS (
         SELECT wallet_id, asset,
                ${AVAILABLE_FROM_LEDGER} AS available,
                ${HELD_FROM_LEDGER} AS held
           FROM wallet_ledger
          GROUP BY wallet_id, asset
       )
       SELECT COALESCE(b.user_id, r.wallet_id) || ':' || COALESCE(b.asset, r.asset) AS subject,
              COALESCE(r.available, 0)::text AS expected_available,
              COALESCE(b.available_balance, 0)::text AS observed_available,
              (COALESCE(b.available_balance, 0) - COALESCE(r.available, 0))::text AS available_delta,
              (COALESCE(b.available_balance, 0) <> COALESCE(r.available, 0)) AS available_diverged,
              COALESCE(r.held, 0)::text AS expected_held,
              COALESCE(b.held_balance, 0)::text AS observed_held,
              (COALESCE(b.held_balance, 0) - COALESCE(r.held, 0))::text AS held_delta,
              (COALESCE(b.held_balance, 0) <> COALESCE(r.held, 0)) AS held_diverged
         FROM wallet_balances b
         FULL OUTER JOIN replayed r
           ON r.wallet_id = b.user_id AND r.asset = b.asset
        WHERE COALESCE(b.available_balance, 0) <> COALESCE(r.available, 0)
           OR COALESCE(b.held_balance, 0) <> COALESCE(r.held, 0)
        ORDER BY subject`,
    );
    for (const row of walletRows.rows) {
      if (row.available_diverged) {
        deltas.push({
          code: "wallet_available_ledger_divergence",
          subject: row.subject,
          expected: row.expected_available,
          observed: row.observed_available,
          delta: row.available_delta,
        });
      }
      if (row.held_diverged) {
        deltas.push({
          code: "wallet_held_ledger_divergence",
          subject: row.subject,
          expected: row.expected_held,
          observed: row.observed_held,
          delta: row.held_delta,
        });
      }
    }

    // 3 — filled + remaining must still reconstruct the original quantity.
    const identityRows = await client.query<DeltaRow>(
      `SELECT id::text AS subject,
              quantity::text AS expected,
              (filled_quantity + remaining_quantity)::text AS observed,
              ((filled_quantity + remaining_quantity) - quantity)::text AS delta
         FROM orders
        WHERE filled_quantity + remaining_quantity <> quantity
        ORDER BY id`,
    );
    push("order_quantity_identity_broken", identityRows.rows);

    // 4 — an order's recorded fill must equal the trades that produced it.
    const fillRows = await client.query<DeltaRow>(
      `WITH traded AS (
         SELECT order_id, SUM(quantity) AS quantity
           FROM (
             SELECT buyer_order_id AS order_id, quantity FROM trades
             UNION ALL
             SELECT seller_order_id AS order_id, quantity FROM trades
           ) sides
          GROUP BY order_id
       )
       SELECT o.id::text AS subject,
              COALESCE(t.quantity, 0)::text AS expected,
              o.filled_quantity::text AS observed,
              (o.filled_quantity - COALESCE(t.quantity, 0))::text AS delta
         FROM orders o
         LEFT JOIN traded t ON t.order_id = o.id
        WHERE o.filled_quantity <> COALESCE(t.quantity, 0)
        ORDER BY o.id`,
    );
    push("order_fill_trade_divergence", fillRows.rows);

    // 5 — fees recorded on the trade must equal the fees actually posted.
    const feeRows = await client.query<DeltaRow>(
      `WITH posted AS (
         SELECT reference_id, SUM(amount) AS amount
           FROM wallet_ledger
          WHERE type = 'fee' AND reference_type = 'trade'
          GROUP BY reference_id
       )
       SELECT t.id::text AS subject,
              (t.fee_buyer + t.fee_seller)::text AS expected,
              COALESCE(p.amount, 0)::text AS observed,
              (COALESCE(p.amount, 0) - (t.fee_buyer + t.fee_seller))::text AS delta
         FROM trades t
         LEFT JOIN posted p ON p.reference_id = t.id::text
        WHERE (t.fee_buyer + t.fee_seller) <> COALESCE(p.amount, 0)
        ORDER BY t.id`,
    );
    push("trade_fee_ledger_divergence", feeRows.rows);

    // 6 — a terminal order may not still be holding funds. This mirrors
    // getOrderHoldResidualTx, which the write path asserts is zero at
    // finalization; a non-zero residual here means that assertion was bypassed
    // or the order never reached a clean terminal transition.
    const residualRows = await client.query<DeltaRow>(
      `WITH residual AS (
         SELECT reference_id,
                SUM(CASE
                  WHEN type = 'hold' THEN amount
                  WHEN type = 'release' THEN -amount
                  ELSE 0
                END) AS amount
           FROM wallet_ledger
          WHERE reference_type = 'order'
          GROUP BY reference_id
       )
       SELECT o.id::text AS subject,
              '0' AS expected,
              r.amount::text AS observed,
              r.amount::text AS delta
         FROM orders o
         JOIN residual r ON r.reference_id = o.id::text
        WHERE o.status IN ${TERMINAL_ORDER_STATES}
          AND r.amount <> 0
        ORDER BY o.id`,
    );
    push("terminal_order_residual_hold", residualRows.rows);

    return deltas;
  });

  if (!result.enabled) {
    throw new Error("exchange_reconciliation_storage_unavailable");
  }

  const deltas = result.value;
  return {
    policyVersion: EXCHANGE_RECONCILIATION_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    checks: [
      "wallet_available_ledger_divergence",
      "wallet_held_ledger_divergence",
      "order_quantity_identity_broken",
      "order_fill_trade_divergence",
      "trade_fee_ledger_divergence",
      "terminal_order_residual_hold",
    ],
    deltaCount: deltas.length,
    deltas,
    reconciled: deltas.length === 0,
    evidenceDigest: canonicalDigest(deltas, EXCHANGE_RECONCILIATION_POLICY_VERSION),
  };
}
