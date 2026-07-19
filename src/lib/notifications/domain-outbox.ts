import { createHash } from "crypto";
import type { PoolClient } from "pg";
import {
  parseNotificationProducerEvent,
  type NotificationProducerEvent,
} from "./producers";

export type NotificationDomainOutboxClaim = {
  outboxId: string;
  attemptNumber: number;
  maxAttempts: number;
};

export type NotificationDomainOutboxFailure = {
  errorCode: string;
  errorDetail: string | null;
  retryable: boolean;
};

type DomainOutboxClaimRow = {
  id: string;
  attempt_count: number;
  max_attempts: number;
};

function validateWorkerId(workerId: string): void {
  if (
    workerId.trim().length < 1 ||
    workerId.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/.test(workerId)
  ) {
    throw new Error("notification_domain_worker_id_invalid");
  }
}

function validateFailure(failure: NotificationDomainOutboxFailure): void {
  if (
    failure.errorCode.trim().length < 1 ||
    failure.errorCode.length > 100
  ) {
    throw new Error("notification_domain_error_code_invalid");
  }
  if (failure.errorDetail !== null && failure.errorDetail.length > 2_000) {
    throw new Error("notification_domain_error_detail_too_large");
  }
}

function retryDelaySeconds(attemptNumber: number): number {
  return Math.min(3_600, 15 * 2 ** Math.max(0, attemptNumber - 1));
}

function canonicalEventHash(event: NotificationProducerEvent): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: event.tenantId,
        principalId: event.principalId,
        occurredAt: event.occurredAt,
        locale: event.locale,
        version: event.version,
        type: event.type,
        payload: event.payload,
      }),
    )
    .digest("hex");
}

async function insertDeadLetter(
  client: PoolClient,
  outboxId: string,
  reason: string,
): Promise<void> {
  await client.query(
    `INSERT INTO notification_domain_dead_letters
      (domain_outbox_id, terminal_reason, snapshot)
     SELECT id, $2,
            jsonb_build_object(
              'eventType', event_type,
              'eventVersion', event_version,
              'eventId', event_id,
              'principalId', principal_id,
              'status', status,
              'attemptCount', attempt_count,
              'maxAttempts', max_attempts,
              'payloadHash', payload_hash,
              'lastErrorCode', last_error_code,
              'lastErrorDetail', last_error_detail,
              'terminalAt', terminal_at
            )
       FROM notification_domain_outbox
      WHERE id = $1
     ON CONFLICT (domain_outbox_id) DO NOTHING`,
    [outboxId, reason],
  );
}

/**
 * Must be called inside the authoritative domain transaction. The committed
 * outbox row is the durable hand-off; notification creation happens later and
 * cannot roll back the user's domain action.
 */
export async function enqueueNotificationDomainEvent(
  client: PoolClient,
  rawEvent: unknown,
): Promise<{ outboxId: string; replayed: boolean }> {
  const event = parseNotificationProducerEvent(rawEvent);
  if (!event) throw new Error("notification_domain_event_invalid");
  const eventHash = canonicalEventHash(event);

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO notification_domain_outbox
      (tenant_id, principal_id, event_type, event_version, event_id,
       occurred_at, locale, payload, payload_hash)
     VALUES ($1, $2::uuid, $3, $4, $5, $6::timestamptz, $7, $8::jsonb, $9)
     ON CONFLICT (tenant_id, event_type, event_id) DO NOTHING
     RETURNING id`,
    [
      event.tenantId,
      event.principalId,
      event.type,
      event.version,
      event.id,
      event.occurredAt,
      event.locale,
      JSON.stringify(event.payload),
      eventHash,
    ],
  );

  if (inserted.rows[0]) {
    return { outboxId: inserted.rows[0].id, replayed: false };
  }

  const existing = await client.query<{
    id: string;
    payload_hash: string;
  }>(
    `SELECT id, payload_hash
       FROM notification_domain_outbox
      WHERE tenant_id = $1 AND event_type = $2 AND event_id = $3
      FOR UPDATE`,
    [event.tenantId, event.type, event.id],
  );
  const row = existing.rows[0];
  if (!row) throw new Error("notification_domain_outbox_conflict_missing");
  if (row.payload_hash !== eventHash) {
    throw new Error("notification_domain_event_identity_conflict");
  }
  return { outboxId: row.id, replayed: true };
}

export async function recoverExpiredNotificationDomainLeases(
  client: PoolClient,
  limit = 100,
): Promise<{ recovered: number; terminal: number }> {
  const boundedLimit = Math.min(500, Math.max(1, limit));
  const stale = await client.query<{
    outbox_id: string;
    attempt_number: number;
    terminal: boolean;
  }>(
    `WITH candidates AS (
       SELECT id, attempt_count,
              attempt_count >= max_attempts AS terminal
         FROM notification_domain_outbox
        WHERE status = 'processing'
          AND lease_expires_at <= NOW()
        ORDER BY lease_expires_at, event_sequence
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     ), updated AS (
       UPDATE notification_domain_outbox o
          SET status = CASE WHEN c.terminal THEN 'failed_terminal'
                            ELSE 'failed_retryable' END,
              available_at = CASE WHEN c.terminal THEN o.available_at ELSE NOW() END,
              terminal_at = CASE WHEN c.terminal THEN NOW() ELSE NULL END,
              locked_at = NULL,
              locked_by = NULL,
              lease_expires_at = NULL,
              last_error_code = 'worker_lease_expired',
              last_error_detail = NULL,
              updated_at = NOW()
         FROM candidates c
        WHERE o.id = c.id
       RETURNING o.id AS outbox_id, o.attempt_count AS attempt_number,
                 c.terminal
     )
     SELECT * FROM updated`,
    [boundedLimit],
  );

  for (const row of stale.rows) {
    await client.query(
      `UPDATE notification_domain_outbox_attempts
          SET status = 'lease_recovered',
              error_code = 'worker_lease_expired',
              completed_at = NOW()
        WHERE domain_outbox_id = $1
          AND attempt_number = $2
          AND status = 'claimed'`,
      [row.outbox_id, row.attempt_number],
    );
    if (row.terminal) {
      await insertDeadLetter(
        client,
        row.outbox_id,
        "worker_lease_expired_after_max_attempts",
      );
    }
  }

  return {
    recovered: stale.rows.filter((row) => !row.terminal).length,
    terminal: stale.rows.filter((row) => row.terminal).length,
  };
}

/**
 * Claim returns only lease coordinates. Event payload is deliberately not
 * materialized here: malformed/poison rows must still be claimable so the
 * authoritative processor can classify them terminal and move them to DLQ.
 */
export async function claimNotificationDomainOutbox(
  client: PoolClient,
  options: { workerId: string; limit?: number; leaseSeconds?: number },
): Promise<NotificationDomainOutboxClaim[]> {
  validateWorkerId(options.workerId);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const leaseSeconds = Math.min(300, Math.max(15, options.leaseSeconds ?? 60));
  await recoverExpiredNotificationDomainLeases(client, limit);

  const claimed = await client.query<DomainOutboxClaimRow>(
    `WITH candidates AS (
       SELECT id
         FROM notification_domain_outbox
        WHERE status IN ('pending', 'failed_retryable')
          AND available_at <= NOW()
          AND attempt_count < max_attempts
        ORDER BY available_at, event_sequence
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     ), updated AS (
       UPDATE notification_domain_outbox o
          SET status = 'processing',
              attempt_count = o.attempt_count + 1,
              locked_at = NOW(),
              locked_by = $2,
              lease_expires_at = NOW() + make_interval(secs => $3),
              last_error_code = NULL,
              last_error_detail = NULL,
              updated_at = NOW()
         FROM candidates c
        WHERE o.id = c.id
       RETURNING o.id, o.attempt_count, o.max_attempts
     )
     SELECT * FROM updated ORDER BY id`,
    [limit, options.workerId, leaseSeconds],
  );

  for (const row of claimed.rows) {
    await client.query(
      `INSERT INTO notification_domain_outbox_attempts
        (domain_outbox_id, attempt_number, worker_id, status)
       VALUES ($1, $2, $3, 'claimed')`,
      [row.id, row.attempt_count, options.workerId],
    );
  }

  return claimed.rows.map((row) => ({
    outboxId: row.id,
    attemptNumber: row.attempt_count,
    maxAttempts: row.max_attempts,
  }));
}

export async function failNotificationDomainEvent(
  client: PoolClient,
  claim: NotificationDomainOutboxClaim,
  workerId: string,
  failure: NotificationDomainOutboxFailure,
): Promise<{ terminal: boolean; availableAt: string | null }> {
  validateWorkerId(workerId);
  validateFailure(failure);
  const terminal = !failure.retryable || claim.attemptNumber >= claim.maxAttempts;
  const delaySeconds = retryDelaySeconds(claim.attemptNumber);

  const updated = await client.query<{ available_at: Date }>(
    `UPDATE notification_domain_outbox
        SET status = $4,
            available_at = CASE WHEN $5::boolean THEN available_at
                                ELSE NOW() + make_interval(secs => $6) END,
            terminal_at = CASE WHEN $5::boolean THEN NOW() ELSE NULL END,
            locked_at = NULL,
            locked_by = NULL,
            lease_expires_at = NULL,
            last_error_code = $7,
            last_error_detail = $8,
            updated_at = NOW()
      WHERE id = $1
        AND status = 'processing'
        AND locked_by = $2
        AND attempt_count = $3
        AND lease_expires_at > NOW()
      RETURNING available_at`,
    [
      claim.outboxId,
      workerId,
      claim.attemptNumber,
      terminal ? "failed_terminal" : "failed_retryable",
      terminal,
      delaySeconds,
      failure.errorCode,
      failure.errorDetail,
    ],
  );
  const row = updated.rows[0];
  if (!row) throw new Error("notification_domain_outbox_lease_lost");

  const attempt = await client.query(
    `UPDATE notification_domain_outbox_attempts
        SET status = $4,
            error_code = $5,
            error_detail = $6,
            completed_at = NOW()
      WHERE domain_outbox_id = $1
        AND attempt_number = $2
        AND worker_id = $3
        AND status = 'claimed'`,
    [
      claim.outboxId,
      claim.attemptNumber,
      workerId,
      terminal ? "failed_terminal" : "failed_retryable",
      failure.errorCode,
      failure.errorDetail,
    ],
  );
  if ((attempt.rowCount ?? 0) !== 1) {
    throw new Error("notification_domain_attempt_state_missing");
  }

  if (terminal) {
    await insertDeadLetter(client, claim.outboxId, failure.errorCode);
  }

  return {
    terminal,
    availableAt: terminal ? null : row.available_at.toISOString(),
  };
}

export async function getNotificationDomainOutboxReconciliation(
  client: PoolClient,
): Promise<Record<string, number>> {
  const result = await client.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count
       FROM notification_domain_outbox
      GROUP BY status`,
  );
  const counts: Record<string, number> = {
    pending: 0,
    processing: 0,
    processed: 0,
    failed_retryable: 0,
    failed_terminal: 0,
  };
  for (const row of result.rows) {
    counts[row.status] = Number.parseInt(row.count, 10);
  }
  const deadLetters = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM notification_domain_dead_letters`,
  );
  counts.dead_letters = Number.parseInt(deadLetters.rows[0]?.count ?? "0", 10);
  return counts;
}
