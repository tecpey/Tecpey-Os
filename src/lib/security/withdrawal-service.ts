// Withdrawal Service — Phase 37.
//
// Orchestrates the full withdrawal lifecycle:
//   1. Security gate (risk + velocity + 2FA + device trust)
//   2. DB record creation (state: pending)
//   3. Compliance checks (KYC status, AML screening, Sanctions screening)
//   4. State decision: approved | compliance_review | blocked
//   5. Notifications and metrics
//
// Never imports concrete compliance provider classes.
// All provider access via getComplianceProviders() interface.

import { createHash } from "crypto";
import { withDb } from "@/lib/db";
import { runWithdrawGate } from "./withdraw-gate";
import { getComplianceProviders } from "./compliance";
import { trackAuthEvent } from "./auth-metrics";
import { writeAudit } from "./audit-log";
import { enforceWithdrawAllowed } from "./risk-enforcement";
import {
  notifyWithdrawalRequested,
  notifyWithdrawalBlocked,
  notifyRiskyWithdrawal,
} from "./security-notifications";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WithdrawalState =
  | "pending"
  | "compliance_review"
  | "approved"
  | "rejected"
  | "blocked"
  | "completed"
  | "cancelled";

export type WithdrawalRecord = {
  id: string;
  userId: string;
  asset: string;
  amount: string;
  amountUsd: number;
  destinationAddress: string;
  network: string;
  state: WithdrawalState;
  securityGatePassed: boolean;
  twoFaVerified: boolean;
  kycStatus: string | null;
  amlRisk: string | null;
  sanctionsHit: boolean;
  complianceResult: Record<string, unknown>;
  complianceCheckedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type CreateWithdrawalOpts = {
  userId: string;
  asset: string;
  amount: string;      // as string to preserve precision
  amountUsd: number;
  destinationAddress: string;
  network: string;
  deviceFingerprint: string;
  ip: string;
  userAgent: string;
  twoFaVerified: boolean;
};

export type WithdrawalCreateResult =
  | { ok: true; withdrawal: WithdrawalRecord }
  | { ok: false; reason: string; code: number };

// ── Compliance check with timeout ─────────────────────────────────────────────

const COMPLIANCE_TIMEOUT_MS = 5_000;

async function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  const timeout = new Promise<T>((resolve) =>
    setTimeout(() => resolve(fallback), COMPLIANCE_TIMEOUT_MS),
  );
  try {
    return await Promise.race([p, timeout]);
  } catch {
    return fallback;
  }
}

// ── Create withdrawal request ─────────────────────────────────────────────────

export async function createWithdrawalRequest(
  opts: CreateWithdrawalOpts,
): Promise<WithdrawalCreateResult> {
  const {
    userId, asset, amount, amountUsd, destinationAddress,
    network, deviceFingerprint, ip, userAgent, twoFaVerified,
  } = opts;

  // 0. Compute deterministic withdrawal key for DB-level dedup
  const baseId = makeWithdrawalId(userId, asset, amount, destinationAddress, network);

  // 1. Hard risk block (Redis — synchronous)
  const riskBlock = await enforceWithdrawAllowed(userId);
  if (riskBlock) {
    trackAuthEvent("withdrawal_risk_blocked");
    return { ok: false, reason: riskBlock, code: 403 };
  }

  // 2. Full security gate (velocity + 2FA + device trust)
  const gate = await runWithdrawGate({
    userId,
    amountUsd,
    fingerprint: deviceFingerprint,
    has2faVerified: twoFaVerified,
  });

  if (!gate.allowed) {
    trackAuthEvent("withdrawal_risk_blocked");
    writeAudit({
      actorId: userId,
      action: "wallet_withdrawal",
      ip,
      metadata: { event: "security_gate_blocked", reason: gate.reason, asset, amount },
    });
    return { ok: false, reason: gate.reason, code: 403 };
  }

  // 3. Insert withdrawal record with DB-level dedup (ON CONFLICT is atomic)
  const { withdrawalId, isNew } = await insertWithdrawalDedup({
    baseId, userId, asset, amount, amountUsd, destinationAddress, network,
    deviceFingerprint, ip, userAgent, twoFaVerified, gate,
  });

  if (!withdrawalId) {
    return { ok: false, reason: "db_unavailable", code: 503 };
  }
  if (!isNew) {
    const existing = await fetchWithdrawal(withdrawalId, userId);
    if (existing) return { ok: true, withdrawal: existing };
    return { ok: false, reason: "withdrawal_not_found", code: 500 };
  }

  trackAuthEvent("withdrawal_requested");
  writeAudit({
    actorId: userId,
    action: "wallet_withdrawal",
    ip,
    metadata: { event: "withdrawal_created", withdrawalId, asset, amount, amountUsd },
  });

  // 4. Compliance checks (async, best-effort, timeout-wrapped)
  void runComplianceChecks({
    withdrawalId, userId, asset, amount, amountUsd,
    destinationAddress, userAgent, ip,
  });

  // 5. Fetch and return the record
  const record = await fetchWithdrawal(withdrawalId, userId);
  if (!record) return { ok: false, reason: "withdrawal_not_found", code: 500 };

  notifyWithdrawalRequested(userId, {
    withdrawalId, asset, amount, amountUsd, network,
  });

  return { ok: true, withdrawal: record };
}

// ── Compliance checks (run after insertion, update state) ─────────────────────

type ComplianceCheckOpts = {
  withdrawalId: string;
  userId: string;
  asset: string;
  amount: string;
  amountUsd: number;
  destinationAddress: string;
  userAgent: string;
  ip: string;
};

async function runComplianceChecks(opts: ComplianceCheckOpts): Promise<void> {
  const { withdrawalId, userId, asset, amount, amountUsd, destinationAddress } = opts;
  const providers = getComplianceProviders();
  const complianceResult: Record<string, unknown> = {};
  let kycStatus: string | null = null;
  let amlRisk: string | null = null;
  let sanctionsHit = false;

  // KYC check — skip for small amounts (< $100 USD)
  if (providers.kyc && amountUsd >= 100) {
    try {
      const kyc = await withTimeout(providers.kyc.getStatus(userId), { status: "pending" as const, level: "basic" as const, verifiedAt: null, expiresAt: null, rejectionReason: null, documentCountry: null });
      kycStatus = kyc.status;
      complianceResult.kyc = { status: kyc.status, level: kyc.level };
      trackAuthEvent("compliance_kyc_checked");
    } catch (err) {
      logger.debug("[withdrawal] kyc check failed", { withdrawalId, err: String(err) });
      kycStatus = "skipped";
    }
  } else {
    kycStatus = amountUsd < 100 ? "skipped" : "skipped";
  }

  // AML screening
  if (providers.aml) {
    try {
      const aml = await withTimeout(
        providers.aml.screenTransaction({
          userId,
          txId: withdrawalId,
          asset,
          amount,
          direction: "withdrawal",
          counterpartyAddress: destinationAddress,
        }),
        { riskScore: "low" as const, flags: [], requiresReview: false, screenedAt: new Date() },
      );
      amlRisk = aml.riskScore;
      complianceResult.aml = { riskScore: aml.riskScore, flags: aml.flags, requiresReview: aml.requiresReview };
      trackAuthEvent("compliance_aml_checked");
    } catch (err) {
      logger.debug("[withdrawal] aml check failed", { withdrawalId, err: String(err) });
      amlRisk = "low";
    }
  }

  // Sanctions screening of destination address
  if (providers.sanctions) {
    try {
      const sanctions = await withTimeout(
        providers.sanctions.screenAddress(destinationAddress, asset),
        { matched: false, listName: null, matchedName: null, confidence: null, screenedAt: new Date() },
      );
      sanctionsHit = sanctions.matched;
      complianceResult.sanctions = {
        matched: sanctions.matched,
        listName: sanctions.listName,
        confidence: sanctions.confidence,
      };
      trackAuthEvent("compliance_sanctions_checked");
    } catch (err) {
      logger.debug("[withdrawal] sanctions check failed", { withdrawalId, err: String(err) });
    }
  }

  // 5. Determine new state
  let newState: WithdrawalState = "approved";

  if (sanctionsHit) {
    newState = "blocked";
  } else if (amlRisk === "blocked") {
    newState = "blocked";
  } else if (amlRisk === "high" || kycStatus === "rejected") {
    newState = "blocked";
  } else if (amlRisk === "medium" || kycStatus === "pending") {
    newState = "compliance_review";
  } else if (kycStatus === "not_started" && amountUsd >= 500) {
    newState = "compliance_review";
  }

  // 6. Update withdrawal record
  await withDb(async (db) => {
    await db.query(
      `UPDATE withdrawals
       SET state = $1, kyc_status = $2, aml_risk = $3, sanctions_hit = $4,
           compliance_result = $5, compliance_checked_at = NOW(), updated_at = NOW()
       WHERE id = $6`,
      [newState, kycStatus, amlRisk, sanctionsHit, JSON.stringify(complianceResult), withdrawalId],
    );
    return true;
  });

  // 7. Metrics and notifications
  if (newState === "blocked") {
    trackAuthEvent("withdrawal_blocked");
    notifyWithdrawalBlocked(userId, {
      withdrawalId, asset, amount,
      reason: sanctionsHit ? "sanctions_match" : "compliance_blocked",
    });
    writeAudit({
      actorId: userId,
      action: "wallet_withdrawal",
      ip: opts.ip,
      metadata: { event: "withdrawal_blocked", withdrawalId, sanctionsHit, amlRisk },
    });
  } else if (newState === "compliance_review") {
    trackAuthEvent("withdrawal_compliance_review");
    notifyRiskyWithdrawal(userId, {
      withdrawalId, asset, amount,
      reason: amlRisk === "medium" ? "aml_medium_risk" : "kyc_pending",
    });
  } else if (newState === "approved") {
    trackAuthEvent("withdrawal_approved");
  }

  logger.info("[withdrawal] compliance checks complete", {
    withdrawalId, newState, kycStatus, amlRisk, sanctionsHit,
  });
}

// ── Idempotency helpers (DB-level race-safe) ────────────────────────────────────

/** Deterministic withdrawal key derived from request parameters. */
function makeWithdrawalId(
  userId: string, asset: string, amount: string,
  destinationAddress: string, network: string,
): string {
  return createHash("sha256")
    .update(`${userId}\0${asset}\0${amount}\0${destinationAddress}\0${network}`)
    .digest("hex")
    .slice(0, 32);
}

type InsertDedupOpts = {
  baseId: string;
  userId: string;
  asset: string;
  amount: string;
  amountUsd: number;
  destinationAddress: string;
  network: string;
  deviceFingerprint: string;
  ip: string;
  userAgent: string;
  twoFaVerified: boolean;
  gate: { remaining?: number };
};

/**
 * Atomically insert a withdrawal or return the existing one.
 * Uses a deterministic ID so ON CONFLICT DO NOTHING prevents races.
 * If the existing row is in a terminal state, retries with a suffix.
 */
async function insertWithdrawalDedup(
  opts: InsertDedupOpts,
): Promise<{ withdrawalId: string | null; isNew: boolean }> {
  const {
    baseId, userId, asset, amount, amountUsd, destinationAddress, network,
    deviceFingerprint, ip, userAgent, twoFaVerified, gate,
  } = opts;

  for (let attempt = 0; attempt < 5; attempt++) {
    const withdrawalId = attempt === 0 ? baseId : `${baseId}-r${attempt}`;

    const result = await withDb(async (db) => {
      const res = await db.query<{ id: string }>(
        `INSERT INTO withdrawals
           (id, user_id, asset, amount, amount_usd, destination_address, network,
            state, security_gate_passed, device_fingerprint, ip, user_agent,
            two_fa_verified, velocity_used)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',TRUE,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          withdrawalId, userId, asset, amount, amountUsd,
          destinationAddress, network,
          deviceFingerprint.slice(0, 64), ip.slice(0, 80),
          userAgent.slice(0, 500), twoFaVerified,
          gate.remaining !== undefined ? amountUsd : null,
        ],
      );
      return res.rows[0]?.id ?? null;
    });

    if (!result.enabled) return { withdrawalId: null, isNew: false };

    if (result.value !== null) {
      return { withdrawalId: result.value, isNew: true };
    }

    // Row exists — check state
    const existing = await fetchWithdrawal(withdrawalId, userId);
    if (!existing) continue;
    if (existing.state !== "completed" && existing.state !== "cancelled") {
      return { withdrawalId: existing.id, isNew: false };
    }
    // Terminal state → retry with a different ID
  }

  return { withdrawalId: null, isNew: false };
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

type WithdrawalRow = {
  id: string;
  user_id: string;
  asset: string;
  amount: string;
  amount_usd: string;
  destination_address: string;
  network: string;
  state: string;
  security_gate_passed: boolean;
  two_fa_verified: boolean;
  kyc_status: string | null;
  aml_risk: string | null;
  sanctions_hit: boolean;
  compliance_result: Record<string, unknown>;
  compliance_checked_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function rowToRecord(r: WithdrawalRow): WithdrawalRecord {
  return {
    id: r.id,
    userId: r.user_id,
    asset: r.asset,
    amount: r.amount,
    amountUsd: parseFloat(r.amount_usd),
    destinationAddress: r.destination_address,
    network: r.network,
    state: r.state as WithdrawalState,
    securityGatePassed: r.security_gate_passed,
    twoFaVerified: r.two_fa_verified,
    kycStatus: r.kyc_status,
    amlRisk: r.aml_risk,
    sanctionsHit: r.sanctions_hit,
    complianceResult: r.compliance_result ?? {},
    complianceCheckedAt: r.compliance_checked_at,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    reviewNotes: r.review_notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
  };
}

export async function fetchWithdrawal(
  id: string,
  userId?: string,
): Promise<WithdrawalRecord | null> {
  const result = await withDb(async (db) => {
    const res = await db.query<WithdrawalRow>(
      userId
        ? `SELECT * FROM withdrawals WHERE id = $1 AND user_id = $2`
        : `SELECT * FROM withdrawals WHERE id = $1`,
      userId ? [id, userId] : [id],
    );
    return res.rows[0] ?? null;
  });
  if (!result.enabled || !result.value) return null;
  return rowToRecord(result.value);
}

export async function listUserWithdrawals(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<WithdrawalRecord[]> {
  const result = await withDb(async (db) => {
    const res = await db.query<WithdrawalRow>(
      `SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, Math.min(limit, 100), offset],
    );
    return res.rows;
  });
  if (!result.enabled) return [];
  return result.value.map(rowToRecord);
}

// ── Admin operations ──────────────────────────────────────────────────────────

export type AdminWithdrawalAction = "approve" | "reject" | "block" | "flag_review";

export async function adminActOnWithdrawal(opts: {
  withdrawalId: string;
  adminId: string;
  action: AdminWithdrawalAction;
  notes?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; reason?: string }> {
  const { withdrawalId, adminId, action, notes, metadata } = opts;

  const stateMap: Record<AdminWithdrawalAction, WithdrawalState> = {
    approve: "approved",
    reject: "rejected",
    block: "blocked",
    flag_review: "compliance_review",
  };
  const newState = stateMap[action];

  const result = await withDb(async (db) => {
    // Fetch current state
    const current = await db.query<{ state: string }>(
      `SELECT state FROM withdrawals WHERE id = $1`,
      [withdrawalId],
    );
    if (!current.rows[0]) return { ok: false, reason: "not_found" };

    const currentState = current.rows[0].state;
    // Terminal states: completed, cancelled — cannot be acted on
    if (currentState === "completed" || currentState === "cancelled") {
      return { ok: false, reason: "terminal_state" };
    }

    // Update withdrawal state
    await db.query(
      `UPDATE withdrawals
       SET state = $1, reviewed_by = $2, reviewed_at = NOW(),
           review_notes = $3, updated_at = NOW()
       WHERE id = $4`,
      [newState, adminId, notes ?? null, withdrawalId],
    );

    // Append immutable action log
    await db.query(
      `INSERT INTO withdrawal_admin_actions
         (id, withdrawal_id, admin_id, action, notes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        crypto.randomUUID(),
        withdrawalId,
        adminId,
        action,
        notes ?? null,
        JSON.stringify(metadata ?? {}),
      ],
    );

    return { ok: true };
  });

  if (!result.enabled) return { ok: false, reason: "db_unavailable" };
  const r = result.value;
  if (!r.ok) return r;

  // Metrics
  if (action === "approve") trackAuthEvent("withdrawal_approved");
  else if (action === "reject") trackAuthEvent("withdrawal_rejected");
  else if (action === "block") trackAuthEvent("withdrawal_blocked");

  writeAudit({
    actorId: adminId,
    action: "admin_action",
    resourceType: "withdrawal",
    resourceId: withdrawalId,
    metadata: { action, notes },
  });

  return { ok: true };
}

export async function listPendingReviewWithdrawals(
  limit = 50,
  offset = 0,
): Promise<WithdrawalRecord[]> {
  const result = await withDb(async (db) => {
    const res = await db.query<WithdrawalRow>(
      `SELECT * FROM withdrawals
       WHERE state IN ('pending', 'compliance_review')
       ORDER BY created_at ASC
       LIMIT $1 OFFSET $2`,
      [Math.min(limit, 200), offset],
    );
    return res.rows;
  });
  if (!result.enabled) return [];
  return result.value.map(rowToRecord);
}

export async function cancelWithdrawal(
  id: string,
  userId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const result = await withDb(async (db) => {
    const res = await db.query<{ state: string }>(
      `SELECT state FROM withdrawals WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    const row = res.rows[0];
    if (!row) return { ok: false, reason: "not_found" };
    if (!["pending", "compliance_review"].includes(row.state)) {
      return { ok: false, reason: "cannot_cancel_in_current_state" };
    }
    await db.query(
      `UPDATE withdrawals SET state = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    return { ok: true };
  });

  if (!result.enabled) return { ok: false, reason: "db_unavailable" };
  const r = result.value;
  if (!r.ok) return r;

  trackAuthEvent("withdrawal_cancelled");
  return { ok: true };
}
