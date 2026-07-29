import type { PoolClient } from "pg";

export type NotificationOutboxClaim = {
  outboxId: string;
  notificationId: string;
  attemptNumber: number;
  maxAttempts: number;
  payloadHash: string;
  title: string;
  body: string;
  locale: "fa" | "en";
  actionUrl: string | null;
  expiresAt: string | null;
};

export type NotificationOutboxFailure = {
  errorCode: string;
  errorDetail: string | null;
  retryable: boolean;
};

type ClaimedRow = {
  outbox_id: string;
  notification_id: string;
  attempt_number: number;
  max_attempts: number;
  payload_hash: string | null;
  title: string;
  body: string;
  locale: "fa" | "en";
  action_url: string | null;
  expires_at: Date | null;
};

function validateWorkerId(workerId: string): void {
  if (
    workerId.trim().length < 1 ||
    workerId.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/.test(workerId)
  ) {
    throw new Error("notification_worker_id_invalid");
  }
}

function validateError(failure: NotificationOutboxFailure): void {
  if (
    failure.errorCode.trim().length < 1 ||
    failure.errorCode.length > 100
  ) {
    throw new Error("notification_error_code_invalid");
  }
  if (failure.errorDetail !== null && failure.errorDetail.length > 2_000) {
    throw new Error("notification_error_detail_too_large");
  }
}

function retryDelaySeconds(attemptNumber: number): number {
  return Math.min(3_600, 15 * 2 ** Math.max(0, attemptNumber - 1));
}

function mapClaim(row: ClaimedRow): NotificationOutboxClaim {
  if (!row.payload_hash) throw new Error("notification_outbox_payload_hash_missing");
  return {
    outboxId: row.outbox_id,
    notificationId: row.notification_id,
    attemptNumber: row.attempt_number,
    maxAttempts: row.max_attempts,
    payloadHash: row.payload_hash,
    title: row.title,
    body: row.body,
    locale: row.locale,
    actionUrl: row.action_url,
    expiresAt: row.expires_at?.toISOString() ?? null,
  };
}

async function insertDeadLetter(
  client: PoolClient,
  outboxId: string,
  notificationId: string,
  reason: string,
): Promise<void> {
  await client.query(
    `INSERT INTO notification_dead_letters
      (outbox_id, notification_id, terminal_reason, snapshot)
     SELECT o.id, o.notification_id, $3,
            jsonb_build_object(
              'status', o.status,
              'attemptCount', o.attempt_count,
              'maxAttempts', o.max_attempts,
              'lastErrorCode', o.last_error_code,
              'lastErrorDetail', o.last_error_detail,
              'payloadHash', o.payload_hash,
              'terminalAt', o.terminal_at,
              'notificationExpiresAt', n.expires_at
            )
       FROM notification_outbox o
       JOIN platform_notifications n ON n.id = o.notification_id
      WHERE o.id = $1 AND o.notification_id = $2
     ON CONFLICT (outbox_id) DO NOTHING`,
    [outboxId, notificationId, reason],
  );
}

export async function expireDueNotificationOutbox(
  client: PoolClient,
  limit = 100,
): Promise<number> {
  const boundedLimit = Math.min(500, Math.max(1, limit));
  const expired = await client.query<{
    outbox_id: string;
    notification_id: string;
  }>(
    `WITH candidates AS (
       SELECT o.id
         FROM notification_outbox o
         JOIN platform_notifications n ON n.id = o.notification_id
        WHERE o.status IN ('pending', 'failed_retryable')
          AND n.expires_at IS NOT NULL
          AND n.expires_at <= NOW()
        ORDER BY n.expires_at, o.created_at
        FOR UPDATE OF o SKIP LOCKED
        LIMIT $1
     )
     UPDATE notification_outbox o
        SET status = 'expired',
            terminal_at = NOW(),
            locked_at = NULL,
            locked_by = NULL,
            lease_expires_at = NULL,
            last_error_code = 'notification_expired',
            last_error_detail = NULL,
            updated_at = NOW()
       FROM candidates c
      WHERE o.id = c.id
     RETURNING o.id AS outbox_id, o.notification_id`,
    [boundedLimit],
  );

  for (const row of expired.rows) {
    await insertDeadLetter(
      client,
      row.outbox_id,
      row.notification_id,
      "notification_expired",
    );
  }
  return expired.rowCount ?? 0;
}

export async function recoverExpiredNotificationLeases(
  client: PoolClient,
  limit = 100,
): Promise<{ recovered: number; terminal: number }> {
  const boundedLimit = Math.min(500, Math.max(1, limit));
  const stale = await client.query<{
    outbox_id: string;
    notification_id: string;
    attempt_number: number;
    terminal: boolean;
  }>(
    `WITH candidates AS (
       SELECT o.id, o.notification_id, o.attempt_count,
              o.attempt_count >= o.max_attempts AS terminal
         FROM notification_outbox o
        WHERE o.status = 'processing'
          AND o.lease_expires_at <= NOW()
        ORDER BY o.lease_expires_at, o.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     ), updated AS (
       UPDATE notification_outbox o
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
       RETURNING o.id AS outbox_id, o.notification_id,
                 o.attempt_count AS attempt_number, c.terminal
     )
     SELECT * FROM updated`,
    [boundedLimit],
  );

  for (const row of stale.rows) {
    await client.query(
      `UPDATE notification_delivery_attempts
          SET status = 'lease_recovered',
              error_code = 'worker_lease_expired',
              completed_at = NOW()
        WHERE outbox_id = $1
          AND attempt_number = $2
          AND status = 'claimed'`,
      [row.outbox_id, row.attempt_number],
    );
    if (row.terminal) {
      await insertDeadLetter(
        client,
        row.outbox_id,
        row.notification_id,
        "worker_lease_expired_after_max_attempts",
      );
    }
  }

  return {
    recovered: stale.rows.filter((row) => !row.terminal).length,
    terminal: stale.rows.filter((row) => row.terminal).length,
  };
}

export async function claimNotificationOutbox(
  client: PoolClient,
  options: { workerId: string; limit?: number; leaseSeconds?: number },
): Promise<NotificationOutboxClaim[]> {
  validateWorkerId(options.workerId);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const leaseSeconds = Math.min(300, Math.max(15, options.leaseSeconds ?? 60));

  await expireDueNotificationOutbox(client, limit);
  await recoverExpiredNotificationLeases(client, limit);

  const claimed = await client.query<ClaimedRow>(
    `WITH candidates AS (
       SELECT o.id
         FROM notification_outbox o
         JOIN platform_notifications n ON n.id = o.notification_id
        WHERE o.channel = 'in_app'
          AND o.status IN ('pending', 'failed_retryable')
          AND o.available_at <= NOW()
          AND o.attempt_count < o.max_attempts
          AND (n.expires_at IS NULL OR n.expires_at > NOW())
        ORDER BY o.available_at, o.created_at
        FOR UPDATE OF o SKIP LOCKED
        LIMIT $1
     ), updated AS (
       UPDATE notification_outbox o
          SET status = 'processing',
              attempt_count = o.attempt_count + 1,
              locked_at = NOW(),
              locked_by = $2,
              lease_expires_at = NOW() + make_interval(secs => $3),
              last_attempt_at = NOW(),
              last_error_code = NULL,
              last_error_detail = NULL,
              updated_at = NOW()
         FROM candidates c
        WHERE o.id = c.id
       RETURNING o.id, o.notification_id, o.attempt_count,
                 o.max_attempts, o.payload_hash
     )
     SELECT u.id AS outbox_id, u.notification_id,
            u.attempt_count AS attempt_number, u.max_attempts,
            u.payload_hash, n.title, n.body, n.locale, n.action_url,
            n.expires_at
       FROM updated u
       JOIN platform_notifications n ON n.id = u.notification_id
      ORDER BY u.id`,
    [limit, options.workerId, leaseSeconds],
  );

  for (const row of claimed.rows) {
    await client.query(
      `INSERT INTO notification_delivery_attempts
        (outbox_id, attempt_number, worker_id, status)
       VALUES ($1, $2, $3, 'claimed')`,
      [row.outbox_id, row.attempt_number, options.workerId],
    );
  }

  return claimed.rows.map(mapClaim);
}

export async function acceptInAppNotificationDelivery(
  client: PoolClient,
  claim: NotificationOutboxClaim,
  workerId: string,
): Promise<void> {
  validateWorkerId(workerId);
  const updated = await client.query(
    `UPDATE notification_outbox
        SET status = 'provider_accepted',
            provider_message_id = $4,
            terminal_at = NOW(),
            locked_at = NULL,
            locked_by = NULL,
            lease_expires_at = NULL,
            last_error_code = NULL,
            last_error_detail = NULL,
            updated_at = NOW()
      WHERE id = $1
        AND status = 'processing'
        AND locked_by = $2
        AND attempt_count = $3
        AND lease_expires_at > NOW()`,
    [
      claim.outboxId,
      workerId,
      claim.attemptNumber,
      `in-app:${claim.notificationId}`,
    ],
  );
  if ((updated.rowCount ?? 0) !== 1) {
    throw new Error("notification_outbox_lease_lost");
  }

  const attempt = await client.query(
    `UPDATE notification_delivery_attempts
        SET status = 'provider_accepted', completed_at = NOW()
      WHERE outbox_id = $1
        AND attempt_number = $2
        AND worker_id = $3
        AND status = 'claimed'`,
    [claim.outboxId, claim.attemptNumber, workerId],
  );
  if ((attempt.rowCount ?? 0) !== 1) {
    throw new Error("notification_attempt_state_missing");
  }
}

export async function failNotificationDelivery(
  client: PoolClient,
  claim: NotificationOutboxClaim,
  workerId: string,
  failure: NotificationOutboxFailure,
): Promise<{ terminal: boolean; availableAt: string | null }> {
  validateWorkerId(workerId);
  validateError(failure);
  const terminal = !failure.retryable || claim.attemptNumber >= claim.maxAttempts;
  const delaySeconds = retryDelaySeconds(claim.attemptNumber);

  const updated = await client.query<{
    notification_id: string;
    available_at: Date;
  }>(
    `UPDATE notification_outbox
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
      RETURNING notification_id, available_at`,
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
  if (!row) throw new Error("notification_outbox_lease_lost");

  const attempt = await client.query(
    `UPDATE notification_delivery_attempts
        SET status = $4,
            error_code = $5,
            error_detail = $6,
            completed_at = NOW()
      WHERE outbox_id = $1
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
    throw new Error("notification_attempt_state_missing");
  }

  if (terminal) {
    await insertDeadLetter(
      client,
      claim.outboxId,
      row.notification_id,
      failure.errorCode,
    );
  }

  return {
    terminal,
    availableAt: terminal ? null : row.available_at.toISOString(),
  };
}

export async function processInAppNotificationBatch(
  client: PoolClient,
  options: { workerId: string; limit?: number; leaseSeconds?: number },
): Promise<{ claimed: number; accepted: number; failed: number }> {
  const claims = await claimNotificationOutbox(client, options);
  let accepted = 0;
  let failed = 0;

  for (const claim of claims) {
    try {
      await acceptInAppNotificationDelivery(client, claim, options.workerId);
      accepted += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "in_app_delivery_failed";
      if (message !== "notification_outbox_lease_lost") {
        await failNotificationDelivery(client, claim, options.workerId, {
          errorCode: "in_app_delivery_failed",
          errorDetail: message.slice(0, 2_000),
          retryable: true,
        });
      }
    }
  }

  return { claimed: claims.length, accepted, failed };
}

export async function getNotificationOutboxReconciliation(
  client: PoolClient,
): Promise<Record<string, number>> {
  const result = await client.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count
       FROM notification_outbox
      GROUP BY status`,
  );
  const stale = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM notification_outbox
      WHERE status = 'processing' AND lease_expires_at <= NOW()`,
  );
  const missingAttempt = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM notification_outbox o
      WHERE o.status = 'processing'
        AND NOT EXISTS (
          SELECT 1 FROM notification_delivery_attempts a
           WHERE a.outbox_id = o.id
             AND a.attempt_number = o.attempt_count
             AND a.status = 'claimed'
        )`,
  );

  return {
    ...Object.fromEntries(
      result.rows.map((row) => [row.status, Number.parseInt(row.count, 10)]),
    ),
    staleProcessing: Number.parseInt(stale.rows[0]?.count ?? "0", 10),
    processingWithoutAttempt: Number.parseInt(
      missingAttempt.rows[0]?.count ?? "0",
      10,
    ),
  };
}
