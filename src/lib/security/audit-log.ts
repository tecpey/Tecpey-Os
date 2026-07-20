// Immutable audit trail — append-only writes to audit_events.
//
// Rules:
//   - Never UPDATE or DELETE from audit_events
//   - Every sensitive action must produce an event
//   - writeAudit() is fire-and-forget (non-blocking) — failures are logged,
//     not propagated to callers, so an audit failure never breaks a user action

import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";

export type AuditAction =
  | "login" | "logout" | "logout_all" | "session_revoked"
  | "password_changed" | "2fa_enabled" | "2fa_disabled" | "2fa_verify_success" | "2fa_verify_failed"
  | "api_key_created" | "api_key_rotated" | "api_key_disabled" | "api_key_deleted"
  | "order_placed" | "order_cancelled"
  | "wallet_deposit" | "wallet_withdrawal"
  | "offline_sync"
  | "admin_action" | "permission_changed" | "risk_event"
  | "webauthn_registered" | "webauthn_registration_failed";

export type AuditEvent = {
  actorId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

export function writeAudit(event: AuditEvent): void {
  void writeAuditAsync(event);
}

async function writeAuditAsync(event: AuditEvent): Promise<void> {
  try {
    await withDb(async (db) => {
      await db.query(
        `INSERT INTO audit_events
           (actor_id, action, resource_type, resource_id, ip, user_agent, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          event.actorId, event.action,
          event.resourceType ?? null, event.resourceId ?? null,
          event.ip?.slice(0, 80) ?? null,
          event.userAgent?.slice(0, 500) ?? null,
          JSON.stringify(event.metadata ?? {}),
        ],
      );
      return true;
    });
  } catch (err) {
    logger.error("[audit-log] write failed", {
      action: event.action, actorId: event.actorId, err: String(err),
    });
  }
}

export type AuditRecord = {
  id: string;
  actorId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export async function getAuditLog(opts: {
  actorId?: string;
  action?: AuditAction;
  limit?: number;
  before?: Date;
}): Promise<AuditRecord[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.actorId) { conditions.push(`actor_id = $${idx++}`); params.push(opts.actorId); }
  if (opts.action)  { conditions.push(`action = $${idx++}`);   params.push(opts.action);  }
  if (opts.before)  { conditions.push(`created_at < $${idx++}`); params.push(opts.before); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(opts.limit ?? 50, 200);

  const r = await withDb(async (db) => {
    const result = await db.query<{
      id: string; actor_id: string; action: string;
      resource_type: string | null; resource_id: string | null;
      ip: string | null; user_agent: string | null;
      metadata: Record<string, unknown>; created_at: Date;
    }>(
      `SELECT id, actor_id, action, resource_type, resource_id,
              ip, user_agent, metadata, created_at
       FROM audit_events ${where}
       ORDER BY created_at DESC LIMIT ${limit}`,
      params,
    );
    return result.rows.map((row) => ({
      id: row.id, actorId: row.actor_id, action: row.action,
      resourceType: row.resource_type, resourceId: row.resource_id,
      ip: row.ip, userAgent: row.user_agent,
      metadata: row.metadata, createdAt: row.created_at,
    }));
  });

  return r.enabled ? r.value : [];
}
