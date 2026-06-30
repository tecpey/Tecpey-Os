import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { LedgerEntryType, WalletLedgerEntry } from "./types";
import { createTradingEvent } from "./events";

// ── Row mapper ────────────────────────────────────────────────────────────────

function rowToEntry(row: Record<string, unknown>): WalletLedgerEntry {
  return {
    id: String(row.id),
    walletId: String(row.wallet_id),
    asset: String(row.asset),
    type: String(row.type) as LedgerEntryType,
    amount: String(row.amount),
    balanceAfter: String(row.balance_after),
    referenceId: row.reference_id ? String(row.reference_id) : null,
    referenceType: row.reference_type ? String(row.reference_type) : null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

// ── Post a ledger entry ───────────────────────────────────────────────────────
//
// Balances are never modified directly — every debit or credit goes through
// this function, which appends an immutable audit row.
//
// The caller is responsible for computing balanceAfter from the current balance.
// In a production system, balanceAfter would be derived inside the same DB
// transaction that debits/credits the balance table.

export type PostLedgerEntryInput = {
  walletId: string;
  asset: string;
  type: LedgerEntryType;
  amount: string;
  balanceAfter: string;
  referenceId?: string | null;
  referenceType?: string | null;
};

// Transaction-aware variant — uses caller-provided PoolClient; does not emit events.
export async function postLedgerEntryTx(
  client: import("pg").PoolClient,
  input: PostLedgerEntryInput,
): Promise<WalletLedgerEntry | null> {
  try {
    const rows = await client.query(
      `INSERT INTO wallet_ledger
         (wallet_id, asset, type, amount, balance_after, reference_id, reference_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.walletId,
        input.asset,
        input.type,
        input.amount,
        input.balanceAfter,
        input.referenceId ?? null,
        input.referenceType ?? null,
      ],
    );
    return rows.rows[0] ? rowToEntry(rows.rows[0]) : null;
  } catch (err) {
    logger.error("[ledger-service] postLedgerEntryTx failed", { input, err });
    return null;
  }
}

export async function postLedgerEntry(
  input: PostLedgerEntryInput,
): Promise<WalletLedgerEntry | null> {
  const result = await withDb(async (client) => {
    const rows = await client.query(
      `INSERT INTO wallet_ledger
         (wallet_id, asset, type, amount, balance_after, reference_id, reference_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.walletId,
        input.asset,
        input.type,
        input.amount,
        input.balanceAfter,
        input.referenceId ?? null,
        input.referenceType ?? null,
      ],
    );
    return rows.rows[0] ? rowToEntry(rows.rows[0]) : null;
  });

  if (!result.enabled || !result.value) {
    logger.error("[ledger-service] failed to post ledger entry", { input });
    return null;
  }

  // Emit LedgerPosted event (non-blocking, informational only at this phase).
  const event = createTradingEvent("LedgerPosted", {
    entryId: result.value.id,
    walletId: input.walletId,
    asset: input.asset,
    type: input.type,
    amount: input.amount,
  });
  logger.info("[ledger-service] LedgerPosted", { eventId: event.eventId, ...event.payload });

  return result.value;
}

// ── Query ledger ──────────────────────────────────────────────────────────────

export type LedgerQueryOptions = {
  walletId: string;
  asset?: string;
  type?: LedgerEntryType;
  limit?: number;
  beforeId?: string;
};

export async function queryLedger(options: LedgerQueryOptions): Promise<WalletLedgerEntry[]> {
  const result = await withDb(async (client) => {
    const params: unknown[] = [options.walletId];
    const conditions: string[] = ["wallet_id = $1"];

    if (options.asset) {
      params.push(options.asset);
      conditions.push(`asset = $${params.length}`);
    }
    if (options.type) {
      params.push(options.type);
      conditions.push(`type = $${params.length}`);
    }

    const limit = Math.min(options.limit ?? 50, 200);
    params.push(limit);

    const rows = await client.query(
      `SELECT * FROM wallet_ledger
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.rows.map(rowToEntry);
  });

  if (!result.enabled) return [];
  return result.value ?? [];
}
