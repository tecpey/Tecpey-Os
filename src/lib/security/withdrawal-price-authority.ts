import { createHmac, timingSafeEqual } from "crypto";
import { withDb } from "@/lib/db";
import { D } from "@/lib/trading/decimal";
import { WITHDRAWAL_ADMISSION_POLICY_VERSION } from "./withdrawal-command-authority";

export const WITHDRAWAL_PRICE_MAX_AGE_MS = 2 * 60 * 1000;
const PRICE_FEED_TIMEOUT_MS = 4_000;

export type WithdrawalPriceEvidence = {
  snapshotId: string;
  priceUsd: string;
  amountUsd: string;
  source: string;
  observedAt: Date;
  policyVersion: string;
};

export type WithdrawalPriceFeedPayload = {
  asset: string;
  quoteCurrency: "USD";
  priceUsd: string;
  source: string;
  observedAt: string;
};

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

export function parseWithdrawalPriceFeedPayload(
  value: unknown,
  expectedAsset: string,
): WithdrawalPriceFeedPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const asset = typeof row.asset === "string" ? row.asset.toUpperCase().trim() : "";
  const quoteCurrency = row.quoteCurrency;
  const priceUsd = typeof row.priceUsd === "string" ? row.priceUsd.trim() : "";
  const source = typeof row.source === "string" ? row.source.trim() : "";
  const observedAtRaw = typeof row.observedAt === "string" ? row.observedAt.trim() : "";
  const observedAt = new Date(observedAtRaw);

  if (asset !== expectedAsset.toUpperCase().trim()) return null;
  if (quoteCurrency !== "USD") return null;
  if (!source || source.length > 100) return null;
  if (!observedAtRaw || Number.isNaN(observedAt.getTime())) return null;
  const ageMs = Date.now() - observedAt.getTime();
  if (ageMs > WITHDRAWAL_PRICE_MAX_AGE_MS || ageMs < -30_000) return null;
  try {
    const price = D(priceUsd);
    if (!price.isFinite() || price.lte(0)) return null;
  } catch {
    return null;
  }

  return {
    asset,
    quoteCurrency: "USD",
    priceUsd,
    source,
    observedAt: observedAt.toISOString(),
  };
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

/**
 * Pull one authoritative USD quote from the configured server-side feed and
 * persist a signed snapshot. The feed contract is a POST endpoint accepting
 * { asset, quoteCurrency: "USD" } and returning WithdrawalPriceFeedPayload.
 */
export async function produceWithdrawalPriceSnapshot(
  asset: string,
): Promise<
  | { ok: true; snapshotId: string }
  | { ok: false; reason: string }
> {
  const endpoint = process.env.TECPEY_WITHDRAWAL_PRICE_FEED_URL?.trim();
  const token = process.env.TECPEY_WITHDRAWAL_PRICE_FEED_TOKEN?.trim();
  if (!endpoint || !token) {
    return { ok: false, reason: "price_feed_not_configured" };
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, reason: "price_feed_not_configured" };
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    return { ok: false, reason: "price_feed_not_secure" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRICE_FEED_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ asset: asset.toUpperCase(), quoteCurrency: "USD" }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: "price_feed_unavailable" };
    const payload = parseWithdrawalPriceFeedPayload(
      await response.json().catch(() => null),
      asset,
    );
    if (!payload) return { ok: false, reason: "price_feed_malformed" };

    const snapshotId = await recordWithdrawalPriceSnapshot({
      asset: payload.asset,
      priceUsd: payload.priceUsd,
      source: payload.source,
      observedAt: new Date(payload.observedAt),
      ttlSeconds: 120,
    });
    return snapshotId
      ? { ok: true, snapshotId }
      : { ok: false, reason: "price_snapshot_store_failed" };
  } catch {
    return { ok: false, reason: "price_feed_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export async function getAuthoritativeUsdValuation(
  asset: string,
  amount: string,
): Promise<
  | { ok: true; evidence: WithdrawalPriceEvidence }
  | { ok: false; reason: string }
> {
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

export async function getOrProduceAuthoritativeUsdValuation(
  asset: string,
  amount: string,
): ReturnType<typeof getAuthoritativeUsdValuation> {
  const existing = await getAuthoritativeUsdValuation(asset, amount);
  if (
    existing.ok ||
    !["price_snapshot_unavailable", "price_snapshot_stale"].includes(existing.reason)
  ) {
    return existing;
  }

  const produced = await produceWithdrawalPriceSnapshot(asset);
  if (!produced.ok) return produced;
  return getAuthoritativeUsdValuation(asset, amount);
}
