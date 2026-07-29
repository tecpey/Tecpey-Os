// Security notification events — Phase 37.
//
// Persists structured security events to security_notifications table.
// Delivery (email, push, in-app) reads from this table independently.
// This module never blocks the caller — all writes are fire-and-forget.

import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";

export type SecurityNotificationType =
  | "withdrawal_requested"
  | "withdrawal_approved"
  | "withdrawal_rejected"
  | "withdrawal_blocked"
  | "withdrawal_compliance_review"
  | "new_device_detected"
  | "risky_withdrawal"
  | "suspicious_login"
  | "2fa_disabled"
  | "password_changed"
  | "api_key_created";

export type SecurityNotification = {
  userId: string;
  type: SecurityNotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
};

/** Persist a security notification. Fire-and-forget — never throws. */
export function emitSecurityNotification(n: SecurityNotification): void {
  void (async () => {
    try {
      await withDb(async (db) => {
        await db.query(
          `INSERT INTO security_notifications (id, user_id, type, title, body, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            crypto.randomUUID(),
            n.userId,
            n.type,
            n.title.slice(0, 200),
            n.body.slice(0, 1000),
            JSON.stringify(n.metadata ?? {}),
          ],
        );
        return true;
      });
    } catch (err) {
      logger.debug("[security-notifications] write failed", { type: n.type, err: String(err) });
    }
  })();
}

// ── Pre-built notification factories ─────────────────────────────────────────

export function notifyWithdrawalRequested(userId: string, opts: {
  withdrawalId: string; asset: string; amount: string; amountUsd: number; network: string;
}): void {
  emitSecurityNotification({
    userId,
    type: "withdrawal_requested",
    title: "Withdrawal Request Submitted",
    body: `Your request to withdraw ${opts.amount} ${opts.asset} (~$${opts.amountUsd.toFixed(2)} USD) has been submitted and is under review.`,
    metadata: opts,
  });
}

export function notifyWithdrawalBlocked(userId: string, opts: {
  withdrawalId: string; asset: string; amount: string; reason: string;
}): void {
  emitSecurityNotification({
    userId,
    type: "withdrawal_blocked",
    title: "Withdrawal Blocked",
    body: `Your withdrawal of ${opts.amount} ${opts.asset} was blocked. If you believe this is an error, please contact support.`,
    metadata: opts,
  });
}

export function notifyWithdrawalApproved(userId: string, opts: {
  withdrawalId: string; asset: string; amount: string;
}): void {
  emitSecurityNotification({
    userId,
    type: "withdrawal_approved",
    title: "Withdrawal Approved",
    body: `Your withdrawal of ${opts.amount} ${opts.asset} has been approved and will be processed shortly.`,
    metadata: opts,
  });
}

export function notifyWithdrawalRejected(userId: string, opts: {
  withdrawalId: string; asset: string; amount: string; reason?: string;
}): void {
  emitSecurityNotification({
    userId,
    type: "withdrawal_rejected",
    title: "Withdrawal Rejected",
    body: `Your withdrawal of ${opts.amount} ${opts.asset} was rejected.${opts.reason ? ` Reason: ${opts.reason}` : ""}`,
    metadata: opts,
  });
}

export function notifyNewDevice(userId: string, opts: {
  ip: string; userAgent: string;
}): void {
  emitSecurityNotification({
    userId,
    type: "new_device_detected",
    title: "New Device Login Detected",
    body: `A login was detected from a new device. If this was not you, please secure your account immediately.`,
    metadata: opts,
  });
}

export function notifyRiskyWithdrawal(userId: string, opts: {
  withdrawalId: string; reason: string; asset: string; amount: string;
}): void {
  emitSecurityNotification({
    userId,
    type: "risky_withdrawal",
    title: "High-Risk Withdrawal Under Review",
    body: `Your withdrawal of ${opts.amount} ${opts.asset} has been flagged for additional review. You will be notified when a decision is made.`,
    metadata: opts,
  });
}
