import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { D } from "@/lib/trading/decimal";
import { getComplianceProviders } from "./compliance";

export const WITHDRAWAL_ADMISSION_POLICY_VERSION = "withdrawal-admission-v1";
export const WITHDRAWAL_COMPLIANCE_POLICY_VERSION = "withdrawal-compliance-v1";
export const WITHDRAWAL_AUTHORIZATION_TTL_SECONDS = 5 * 60;
export const WITHDRAWAL_PRICE_MAX_AGE_MS = 2 * 60 * 1000;

const ASSET_DECIMALS: Record<string, number> = {
  BTC: 8,
  ETH: 18,
  USDT: 18,
  USDC: 18,
  BNB: 18,
  XRP: 6,
  SOL: 9,
  ADA: 6,
  DOGE: 8,
  TRX: 6,
  LTC: 8,
  DOT: 10,
  LINK: 18,
  AVAX: 18,
  MATIC: 18,
};

const NETWORK_ASSETS: Record<string, ReadonlySet<string>> = {
  bitcoin: new Set(["BTC"]),
  ethereum: new Set(["ETH", "USDT", "USDC", "LINK"]),
  tron: new Set(["TRX", "USDT", "USDC"]),
  bsc: new Set(["BNB", "USDT", "USDC", "LINK"]),
  solana: new Set(["SOL", "USDT", "USDC"]),
  ripple: new Set(["XRP"]),
  cardano: new Set(["ADA"]),
  polygon: new Set(["MATIC", "USDT", "USDC", "LINK"]),
  avalanche: new Set(["AVAX", "USDT", "USDC"]),
  litecoin: new Set(["LTC"]),
};

export type CanonicalWithdrawalCommand = {
  userId: string;
  asset: string;
  amount: string;
  destinationAddress: string;
  destinationTag: string | null;
  network: string;
  idempotencyKey: string;
};

export type WithdrawalPriceEvidence = {
  snapshotId: string;
  priceUsd: string;
  amountUsd: string;
  source: string;
  observedAt: Date;
  policyVersion: string;
};

export type WithdrawalComplianceDecision = {
  state: "approved" | "compliance_review" | "blocked";
  kycStatus: string;
  amlRisk: string;
  sanctionsHit: boolean;
  evidence: Record<string, unknown>;
  reason: string;
};

function cleanAscii(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /[^\x20-\x7E]/.test(trimmed)) return null;
  return trimmed;
}

export function canonicalizeWithdrawalCommand(input: {
  userId: string;
  asset: string;
  amount: string;
  destinationAddress: string;
  destinationTag?: string | null;
  network: string;
  idempotencyKey: string;
}):
  | { ok: true; command: CanonicalWithdrawalCommand; requestHash: string }
  | { ok: false; reason: string } {
  const userId = input.userId.trim();
  const asset = input.asset.toUpperCase().trim();
  const network = input.network.toLowerCase().trim();
  const destinationAddress = cleanAscii(input.destinationAddress);
  const destinationTagRaw = input.destinationTag?.trim() || null;
  const destinationTag = destinationTagRaw ? cleanAscii(destinationTagRaw) : null;
  const idempotencyKey = cleanAscii(input.idempotencyKey);

  if (!userId) return { ok: false, reason: "authentication_required" };
  if (!(asset in ASSET_DECIMALS)) return { ok: false, reason: "unsupported_asset" };
  if (!NETWORK_ASSETS[network]?.has(asset)) {
    return { ok: false, reason: "asset_network_mismatch" };
  }
  if (!destinationAddress || destinationAddress.length > 200) {
    return { ok: false, reason: "invalid_destination_address" };
  }
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    return { ok: false, reason: "invalid_idempotency_key" };
  }
  if (!/^\d+(\.\d+)?$/.test(input.amount.trim())) {
    return { ok: false, reason: "invalid_amount" };
  }

  let amount: string;
  try {
    const parsed = D(input.amount.trim());
    if (!parsed.isFinite() || parsed.lte(0)) {
      return { ok: false, reason: "invalid_amount" };
    }
    if (parsed.decimalPlaces() > ASSET_DECIMALS[asset]) {
      return { ok: false, reason: "amount_precision_exceeded" };
    }
    amount = parsed.toFixed(ASSET_DECIMALS[asset]).replace(/\.?0+$/, "");
  } catch {
    return { ok: false, reason: "invalid_amount" };
  }

  const destinationReason = validateWithdrawalDestination({
    asset,
    network,
    address: destinationAddress,
    destinationTag,
  });
  if (destinationReason) return { ok: false, reason: destinationReason };

  const command: CanonicalWithdrawalCommand = {
    userId,
    asset,
    amount,
    destinationAddress,
    destinationTag,
    network,
    idempotencyKey,
  };
  return {
    ok: true,
    command,
    requestHash: withdrawalRequestHash(command),
  };
}

export function withdrawalRequestHash(command: CanonicalWithdrawalCommand): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        command.userId,
        command.asset,
        command.amount,
        command.network,
        command.destinationAddress,
        command.destinationTag ?? "",
        command.idempotencyKey,
      ]),
    )
    .digest("hex");
}

export function validateWithdrawalDestination(input: {
  asset: string;
  network: string;
  address: string;
  destinationTag: string | null;
}): string | null {
  const { network, address, destinationTag } = input;
  if (/^(0x0{40}|0+)$/.test(address.toLowerCase())) {
    return "invalid_destination_address";
  }

  const evm = /^0x[0-9a-fA-F]{40}$/;
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  let valid = false;
  switch (network) {
    case "bitcoin":
      valid = /^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address);
      break;
    case "ethereum":
    case "bsc":
    case "polygon":
    case "avalanche":
      valid = evm.test(address);
      break;
    case "tron":
      valid = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
      break;
    case "solana":
      valid = address.length >= 32 && address.length <= 44 && base58.test(address);
      break;
    case "ripple":
      valid = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
      if (!destinationTag || !/^\d{1,10}$/.test(destinationTag)) {
        return "destination_tag_required";
      }
      break;
    case "cardano":
      valid = /^addr1[0-9a-z]{20,}$/.test(address);
      break;
    case "litecoin":
      valid = /^(ltc1[ac-hj-np-z02-9]{11,71}|[LM3][a-km-zA-HJ-NP-Z1-9]{26,33})$/.test(address);
      break;
  }

  if (!valid) return "destination_network_mismatch";
  if (network !== "ripple" && destinationTag) return "unexpected_destination_tag";
  return null;
}

function priceSecret(): Buffer | null {
  const raw = process.env.TECPEY_WITHDRAWAL_PRICE_SECRET?.trim();
  if (raw && raw.length >= 32) return Buffer.from(raw, "utf8");
  if (process.env.NODE_ENV !== "production") {
    return Buffer.from("tecpey-dev-withdraw-price-secret-32chars", "utf8");
  }
  return null;
}

function priceSignaturePayload(input: {
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

function signPriceSnapshot(input: {
  asset: string;
  price: string;
  source: string;
  observedAt: Date;
  expiresAt: Date;
  policyVersion: string;
}): string | null {
  const secret = priceSecret();
  if (!secret) return null;
  return createHmac("sha256", secret)
    .update(priceSignaturePayload(input))
    .digest("hex");
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
  if (!(asset in ASSET_DECIMALS)) return null;
  const observedAt = input.observedAt ?? new Date();
  const ttlSeconds = Math.min(300, Math.max(15, input.ttlSeconds ?? 120));
  const expiresAt = new Date(observedAt.getTime() + ttlSeconds * 1000);
  const policyVersion = input.policyVersion ?? WITHDRAWAL_ADMISSION_POLICY_VERSION;
  const source = input.source.trim();
  if (!source || !D(input.priceUsd).isFinite() || D(input.priceUsd).lte(0)) return null;
  const signature = signPriceSnapshot({
    asset,
    price: input.priceUsd,
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
      [asset, D(input.priceUsd).toFixed(18), source, observedAt, expiresAt, signature, policyVersion],
    );
    return inserted.rows[0]?.id ?? null;
  });
  return result.enabled ? result.value : null;
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

  const expected = signPriceSnapshot({
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
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
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

export async function issueWithdrawalAuthorization(input: {
  userId: string;
  requestHash: string;
}): Promise<{ id: string; expiresAt: Date } | null> {
  if (!/^[a-f0-9]{64}$/.test(input.requestHash)) return null;
  const expiresAt = new Date(Date.now() + WITHDRAWAL_AUTHORIZATION_TTL_SECONDS * 1000);
  const result = await withDb(async (db) => {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO withdrawal_authorizations
         (user_id, request_hash, policy_version, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.userId, input.requestHash, WITHDRAWAL_ADMISSION_POLICY_VERSION, expiresAt],
    );
    return inserted.rows[0]?.id ?? null;
  });
  if (!result.enabled || !result.value) return null;
  return { id: result.value, expiresAt };
}

export async function consumeWithdrawalAuthorizationTx(
  client: PoolClient,
  input: { authorizationId: string; userId: string; requestHash: string },
): Promise<boolean> {
  const consumed = await client.query(
    `UPDATE withdrawal_authorizations
        SET consumed_at = NOW()
      WHERE id = $1
        AND user_id = $2
        AND request_hash = $3
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING id`,
    [input.authorizationId, input.userId, input.requestHash],
  );
  return (consumed.rowCount ?? 0) === 1;
}

export async function getStrictWithdrawalRiskLevel(
  userId: string,
): Promise<
  | { ok: true; level: "withdraw_blocked" | "all_blocked" | "review" | null }
  | { ok: false; reason: "risk_authority_unavailable" }
> {
  const redis = globalThis.tecpeyRedisClient;
  if (!redis) return { ok: false, reason: "risk_authority_unavailable" };
  try {
    const value = await redis.get(`tecpey:risk:level:${userId}`);
    if (value === "withdraw_blocked" || value === "all_blocked" || value === "review") {
      return { ok: true, level: value };
    }
    return { ok: true, level: null };
  } catch (error) {
    logger.warn("[withdrawal-admission] risk authority unavailable", {
      userId,
      error: String(error),
    });
    return { ok: false, reason: "risk_authority_unavailable" };
  }
}

type ControlResult<T> =
  | { status: "ok"; value: T }
  | { status: "unavailable" | "timeout" | "malformed"; error?: string };

async function runControl<T>(
  operation: (() => Promise<T>) | null,
  validate: (value: T) => boolean,
): Promise<ControlResult<T>> {
  if (!operation) return { status: "unavailable" };
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("control_timeout")), 5_000);
    });
    const value = await Promise.race([operation(), timeout]);
    if (!validate(value)) return { status: "malformed" };
    return { status: "ok", value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: message === "control_timeout" ? "timeout" : "unavailable",
      error: message,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function evaluateWithdrawalCompliance(input: {
  withdrawalId: string;
  userId: string;
  asset: string;
  amount: string;
  destinationAddress: string;
}): Promise<WithdrawalComplianceDecision> {
  const providers = getComplianceProviders();
  const [kyc, aml, sanctions] = await Promise.all([
    runControl(
      providers.kyc ? () => providers.kyc!.getStatus(input.userId) : null,
      (value) =>
        Boolean(value) &&
        ["not_started", "pending", "approved", "rejected", "expired"].includes(
          (value as { status?: string }).status ?? "",
        ),
    ),
    runControl(
      providers.aml
        ? () =>
            providers.aml!.screenTransaction({
              userId: input.userId,
              txId: input.withdrawalId,
              asset: input.asset,
              amount: input.amount,
              direction: "withdrawal",
              counterpartyAddress: input.destinationAddress,
            })
        : null,
      (value) =>
        Boolean(value) &&
        ["low", "medium", "high", "blocked"].includes(
          (value as { riskScore?: string }).riskScore ?? "",
        ) &&
        Array.isArray((value as { flags?: unknown }).flags) &&
        typeof (value as { requiresReview?: unknown }).requiresReview === "boolean",
    ),
    runControl(
      providers.sanctions
        ? () => providers.sanctions!.screenAddress(input.destinationAddress, input.asset)
        : null,
      (value) =>
        Boolean(value) &&
        typeof (value as { matched?: unknown }).matched === "boolean" &&
        (value as { confidence?: unknown }).confidence !== undefined,
    ),
  ]);

  const kycStatus = kyc.status === "ok" ? kyc.value.status : kyc.status;
  const amlRisk = aml.status === "ok" ? aml.value.riskScore : aml.status;
  const sanctionsHit = sanctions.status === "ok" ? sanctions.value.matched : false;
  const evidence: Record<string, unknown> = {
    policyVersion: WITHDRAWAL_COMPLIANCE_POLICY_VERSION,
    checkedAt: new Date().toISOString(),
    kyc:
      kyc.status === "ok"
        ? { status: kyc.value.status, level: kyc.value.level }
        : { status: kyc.status, error: kyc.error ?? null },
    aml:
      aml.status === "ok"
        ? {
            status: "ok",
            riskScore: aml.value.riskScore,
            flags: aml.value.flags,
            requiresReview: aml.value.requiresReview,
          }
        : { status: aml.status, error: aml.error ?? null },
    sanctions:
      sanctions.status === "ok"
        ? {
            status: "ok",
            matched: sanctions.value.matched,
            listName: sanctions.value.listName,
            confidence: sanctions.value.confidence,
          }
        : { status: sanctions.status, error: sanctions.error ?? null },
  };

  if (
    sanctionsHit ||
    amlRisk === "blocked" ||
    amlRisk === "high" ||
    kycStatus === "rejected"
  ) {
    return {
      state: "blocked",
      kycStatus,
      amlRisk,
      sanctionsHit,
      evidence,
      reason: sanctionsHit ? "sanctions_match" : "compliance_blocked",
    };
  }

  const allControlsPass =
    kyc.status === "ok" &&
    kyc.value.status === "approved" &&
    aml.status === "ok" &&
    aml.value.riskScore === "low" &&
    !aml.value.requiresReview &&
    sanctions.status === "ok" &&
    !sanctions.value.matched;

  if (!allControlsPass) {
    return {
      state: "compliance_review",
      kycStatus,
      amlRisk,
      sanctionsHit,
      evidence,
      reason: "compliance_evidence_incomplete",
    };
  }

  if (process.env.TECPEY_REAL_WITHDRAWALS_ENABLED !== "1") {
    return {
      state: "compliance_review",
      kycStatus,
      amlRisk,
      sanctionsHit,
      evidence: { ...evidence, custodyLaunchGate: "disabled" },
      reason: "custody_launch_gate_disabled",
    };
  }

  return {
    state: "approved",
    kycStatus,
    amlRisk,
    sanctionsHit,
    evidence: { ...evidence, custodyLaunchGate: "enabled" },
    reason: "all_controls_passed",
  };
}
