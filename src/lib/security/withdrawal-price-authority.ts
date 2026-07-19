import { createHmac, timingSafeEqual } from "crypto";
import { withDb } from "@/lib/db";
import { D } from "@/lib/trading/decimal";
import { WITHDRAWAL_ADMISSION_POLICY_VERSION } from "./withdrawal-command-authority";

export const WITHDRAWAL_PRICE_MAX_AGE_MS = 2 * 60 * 1000;

export type WithdrawalPriceEvidence = {
  snapshotId: string;
  priceUsd: string;
  amountUsd: string;
  source: string;
  observedAt: Date;
  policyVersion: string;
};

type ValuationResult =
  | { ok: true; evidence: WithdrawalPriceEvidence }
  | { ok: false; reason: string };

function priceSecret(): Buffer | null {
  const raw = process.env.TECPEY_WITHDRAWAL_PRICE_SECRET?.trim();
  if (raw && raw.length >= 32) return Buffer.from(raw, "utf8");
  if (process.env.NODE_ENV !== "production") {
    return Buffer.from("tecpey-dev-withdraw-price-secret-32chars", "utf8");
  }
  return null;
}

function signaturePayload(input: {
  asset: string;
  price: string;
  source: string;
  observedAt: Date;
  expiresAt: Date;
  policyVersion: string;
}): string {
  return JSON.stringify([
    input.asset,
    "USD",
    D(input.price).toFixed(18),
    input.source,
    input.observedAt.toISOString(),
    input.expiresAt.toISOString(),
    input.policyVersion,
  ]);
}

function signSnapshot(input: {
  asset: string;
  price: string;
  source: string;
  observedAt: Date;
  expiresAt: Date;
  policyVersion: string;
}): string | null {
  const secret = priceSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(signaturePayload(input)).digest("hex");
}

export async function recordWithdrawalPriceSnapshot(input: {
  asset: string;
  priceUsd: string;
  source: string;
  observedAt?: Date;
  ttlSeconds?: number;
  policyVersion?: string;
}): Promise<string | null> {
  const asset = input.asset.toUpperCase().trim();
  const source = input.source.trim();
  const observedAt = input.observedAt ?? new Date();
  if (observedAt.getTime() > Date.now() + 30_000) return null;

  let price: string;
  try {
    const parsed = D(input.priceUsd);
    if (!parsed.isFinite() || parsed.lte(0)) return null;
    price = parsed.toFixed(18);
  } catch {
    return null;
  }
  if (!/^[A-Z0-9]{2,20}$/.test(asset) || !source) return null;

  const ttlSeconds = Math.min(300, Math.max(15, input.ttlSeconds ?? 120));
  const expiresAt = new Date(observedAt.getTime() + ttlSeconds * 1000);
  const policyVersion = input.policyVersion ?? WITHDRAWAL_ADMISSION_POLICY_VERSION;
  const signature = signSnapshot({
    asset,
    price,
    source,
    observedAt,
    expiresAt,
    policyVersion,
  });
  if (!signature) return null;

  const result = await withDb(async (db) => {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO withdrawal_price_snapshots
         (asset, quote_currency, price, source, observed_at, expires_at, signature, policy_version)
       VALUES ($1, 'USD', $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [asset, price, source, observedAt, expiresAt, signature, policyVersion],
    );
    return inserted.rows[0]?.id ?? null;
  });
  return result.enabled ? result.value : null;
}

async function readAuthoritativeUsdValuation(
  asset: string,
  amount: string,
): Promise<ValuationResult> {
  const result = await withDb(async (db) => {
    const rows = await db.query<{
      id: string;
      price: string;
      source: string;
      observed_at: Date;
      expires_at: Date;
      signature: string;
      policy_version: string;
    }>(
      `SELECT id, price::text AS price, source, observed_at, expires_at,
              signature, policy_version
         FROM withdrawal_price_snapshots
        WHERE asset = $1
          AND quote_currency = 'USD'
          AND observed_at <= NOW() + INTERVAL '30 seconds'
          AND expires_at > NOW()
        ORDER BY observed_at DESC
        LIMIT 1`,
      [asset.toUpperCase()],
    );
    return rows.rows[0] ?? null;
  });
  if (!result.enabled) return { ok: false, reason: "price_storage_unavailable" };
  const row = result.value;
  if (!row) return { ok: false, reason: "price_snapshot_unavailable" };
  if (Date.now() - row.observed_at.getTime() > WITHDRAWAL_PRICE_MAX_AGE_MS) {
    return { ok: false, reason: "price_snapshot_stale" };
  }

  const expected = signSnapshot({
    asset: asset.toUpperCase(),
    price: row.price,
    source: row.source,
    observedAt: row.observed_at,
    expiresAt: row.expires_at,
    policyVersion: row.policy_version,
  });
  if (!expected) return { ok: false, reason: "price_authority_unavailable" };
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(row.signature, "hex");
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return { ok: false, reason: "price_snapshot_signature_invalid" };
  }

  return {
    ok: true,
    evidence: {
      snapshotId: row.id,
      priceUsd: D(row.price).toFixed(18),
      amountUsd: D(amount).times(row.price).toFixed(18),
      source: row.source,
      observedAt: row.observed_at,
      policyVersion: row.policy_version,
    },
  };
}

export async function getAuthoritativeUsdValuation(
  asset: string,
  amount: string,
): Promise<ValuationResult> {
  const existing = await readAuthoritativeUsdValuation(asset, amount);
  if (
    existing.ok ||
    !["price_snapshot_unavailable", "price_snapshot_stale"].includes(existing.reason)
  ) {
    return existing;
  }

  // Dynamic import prevents a static authority cycle: the producer may persist
  // snapshots through recordWithdrawalPriceSnapshot, but never owns validation.
  const { refreshWithdrawalPriceSnapshot } = await import("./withdrawal-price-producer");
  const refreshed = await refreshWithdrawalPriceSnapshot(asset);
  if (!refreshed) return { ok: false, reason: "price_consensus_unavailable" };
  return readAuthoritativeUsdValuation(asset, amount);
}
