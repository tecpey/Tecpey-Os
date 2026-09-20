import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  computeMentorProfileForStudentTx,
  upsertMentorProfileUpdateTx,
} from "@/lib/mentor-profile-recompute-authority";

export const MENTOR_PROFILE_EVENT_VERSION = 1 as const;

export type MentorProfileEventType =
  | "academy.term_progress"
  | "academy.lesson_assessment"
  | "academy.flashcards_updated"
  | "academy.reflection_updated"
  | "mentor.challenge_attempt"
  | "arena.trade_signal"
  | "mentor.conversation";

export type MentorProfileUpdateReason =
  | "authoritative_term_assessment"
  | "authoritative_lesson_assessment"
  | "authoritative_flashcards_updated"
  | "authoritative_reflection_updated"
  | "mentor_challenge_answered"
  | "trading_trade_created"
  | "mentor_conversation_saved"
  | "mentor_conversation_migrated";

export type MentorProfileEventInput = Readonly<{
  tenantId: string;
  workspaceId: string;
  studentId: string;
  eventType: MentorProfileEventType;
  reason: MentorProfileUpdateReason;
  sourceReference: string;
  occurredAt?: string;
}>;

export type MentorProfileOutboxClaim = Readonly<{
  outboxId: string;
  attemptNumber: number;
  maxAttempts: number;
}>;

type ClaimRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  event_sequence: string | number;
  attempt_count: number;
  max_attempts: number;
};

type ProcessingRow = {
  student_id: string;
  event_id: string;
  payload_hash: string;
};

const TOKEN_RE = /^[A-Za-z0-9._:-]+$/;

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(",")}}`;
  }
  throw new Error("mentor_profile_event_value_invalid");
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function boundedToken(
  value: string,
  minimum: number,
  maximum: number,
  code: string,
): string {
  const normalized = value.trim();
  if (
    normalized.length < minimum ||
    normalized.length > maximum ||
    !TOKEN_RE.test(normalized)
  ) {
    throw new Error(code);
  }
  return normalized;
}

function workerId(value: string): string {
  return boundedToken(value, 1, 200, "mentor_profile_worker_id_invalid");
}

export function mentorProfileRetryDelaySeconds(
  attemptNumber: number,
  outboxId: string,
): number {
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 100) {
    throw new Error("mentor_profile_retry_attempt_invalid");
  }
  const normalizedOutboxId = boundedToken(
    outboxId,
    8,
    200,
    "mentor_profile_retry_outbox_id_invalid",
  );
  const exponential = Math.min(
    3_600,
    15 * 2 ** Math.max(0, attemptNumber - 1),
  );
  const entropy = Number.parseInt(
    sha256({
      authority: "mentor-profile-retry-jitter-v1",
      outboxId: normalizedOutboxId,
      attemptNumber,
    }).slice(0, 8),
    16,
  ) / 0xffff_ffff;
  const jittered = Math.round(exponential * (0.8 + entropy * 0.4));
  return Math.min(3_600, Math.max(15, jittered));
}

export function createMentorProfileEventId(
  input: Pick<
    MentorProfileEventInput,
    "tenantId" | "workspaceId" | "studentId" | "eventType" | "sourceReference"
  >,
): string {
  return `mentor-profile:${sha256({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    studentId: input.studentId,
    eventType: input.eventType,
    sourceReference: input.sourceReference,
    version: MENTOR_PROFILE_EVENT_VERSION,
  })}`;
}

function eventPayloadHash(
  input: MentorProfileEventInput,
  eventId: string,
): string {
  // occurredAt is immutable evidence, but it is not part of event identity.
  // A producer retry for the same authoritative source reference may happen
  // later; it must resolve to the original row rather than look like tampering.
  return sha256({
    eventId,
    eventType: input.eventType,
    eventVersion: MENTOR_PROFILE_EVENT_VERSION,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    studentId: input.studentId,
    sourceReference: input.sourceReference,
    reason: input.reason,
  });
}

export async function enqueueMentorProfileUpdateTx(
  client: PoolClient,
  input: MentorProfileEventInput,
): Promise<{ outboxId: string; eventId: string; replayed: boolean }> {
  const tenantId = boundedToken(
    input.tenantId,
    1,
    100,
    "mentor_profile_tenant_invalid",
  );
  const workspaceId = boundedToken(
    input.workspaceId,
    1,
    120,
    "mentor_profile_workspace_invalid",
  );
  const sourceReference = boundedToken(
    input.sourceReference,
    1,
    180,
    "mentor_profile_source_reference_invalid",
  );
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(occurredAt))) {
    throw new Error("mentor_profile_occurred_at_invalid");
  }

  const eventId = createMentorProfileEventId({
    tenantId,
    workspaceId,
    studentId: input.studentId,
    eventType: input.eventType,
    sourceReference,
  });
  const payloadHash = eventPayloadHash(
    {
      ...input,
      tenantId,
      workspaceId,
      sourceReference,
    },
    eventId,
  );

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO mentor_profile_update_outbox
       (tenant_id, workspace_id, student_id, event_type, event_version,
        event_id, source_reference, reason, payload_hash, occurred_at)
     VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10::timestamptz)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [
      tenantId,
      workspaceId,
      input.studentId,
      input.eventType,
      MENTOR_PROFILE_EVENT_VERSION,
      eventId,
      sourceReference,
      input.reason,
      payloadHash,
      occurredAt,
    ],
  );
  if (inserted.rows[0]) {
    return { outboxId: inserted.rows[0].id, eventId, replayed: false };
  }

  const existing = await client.query<{ id: string; payload_hash: string }>(
    `SELECT id, payload_hash
       FROM mentor_profile_update_outbox
      WHERE event_id = $1
      FOR UPDATE`,
    [eventId],
  );
  const row = existing.rows[0];
  if (!row) throw new Error("mentor_profile_outbox_conflict_missing");
  if (row.payload_hash !== payloadHash) {
    throw new Error("mentor_profile_event_identity_conflict");
  }
  return { outboxId: row.id, eventId, replayed: true };
}

async function deadLetter(
  client: PoolClient,
  outboxId: string,
  reason: string,
): Promise<void> {
  const source = await client.query<{
    tenant_id: string;
    workspace_id: string;
    event_id: string;
    student_id: string;
    payload_hash: string;
  }>(
    `SELECT tenant_id, workspace_id, event_id, student_id::text, payload_hash
       FROM mentor_profile_update_outbox
      WHERE id = $1
      FOR SHARE`,
    [outboxId],
  );
  const row = source.rows[0];
  if (!row) throw new Error("mentor_profile_dead_letter_source_missing");
  const studentFingerprint = sha256({
    domain: "mentor-profile-student-v1",
    studentId: row.student_id,
  });
  await client.query(
    `INSERT INTO mentor_profile_update_dead_letters
       (tenant_id, workspace_id, outbox_id, terminal_reason, event_id,
        student_fingerprint, payload_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (outbox_id) DO NOTHING`,
    [
      row.tenant_id,
      row.workspace_id,
      outboxId,
      reason,
      row.event_id,
      studentFingerprint,
      row.payload_hash,
    ],
  );
}

export async function recoverExpiredMentorProfileLeases(
  client: PoolClient,
  limit = 100,
): Promise<{ recovered: number; terminal: number }> {
  const boundedLimit = Math.min(500, Math.max(1, Math.trunc(limit)));
  const stale = await client.query<{
    tenant_id: string;
    workspace_id: string;
    outbox_id: string;
    attempt_number: number;
    terminal: boolean;
  }>(
    `WITH candidates AS (
       SELECT id, attempt_count, attempt_count >= max_attempts AS terminal
         FROM mentor_profile_update_outbox
        WHERE status = 'processing'
          AND lease_expires_at <= NOW()
        ORDER BY lease_expires_at, event_sequence
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     ), updated AS (
       UPDATE mentor_profile_update_outbox o
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
       RETURNING o.tenant_id, o.workspace_id, o.id AS outbox_id,
                 o.attempt_count AS attempt_number, c.terminal
     )
     SELECT * FROM updated`,
    [boundedLimit],
  );

  for (const row of stale.rows) {
    await client.query(
      `UPDATE mentor_profile_update_attempts
          SET status = 'lease_recovered',
              error_code = 'worker_lease_expired',
              completed_at = NOW()
        WHERE tenant_id = $1
          AND workspace_id = $2
          AND outbox_id = $3
          AND attempt_number = $4
          AND status = 'claimed'`,
      [
        row.tenant_id,
        row.workspace_id,
        row.outbox_id,
        row.attempt_number,
      ],
    );
    if (row.terminal) {
      await deadLetter(
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

export async function claimMentorProfileUpdates(
  client: PoolClient,
  options: { workerId: string; limit?: number; leaseSeconds?: number },
): Promise<MentorProfileOutboxClaim[]> {
  const id = workerId(options.workerId);
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 20)));
  const leaseSeconds = Math.min(
    300,
    Math.max(15, Math.trunc(options.leaseSeconds ?? 60)),
  );
  await recoverExpiredMentorProfileLeases(client, limit);

  const claimed = await client.query<ClaimRow>(
    `WITH candidates AS (
       SELECT id, event_sequence
         FROM mentor_profile_update_outbox
        WHERE status IN ('pending', 'failed_retryable')
          AND available_at <= NOW()
          AND attempt_count < max_attempts
        ORDER BY available_at, event_sequence
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     ), updated AS (
       UPDATE mentor_profile_update_outbox o
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
       RETURNING o.id, o.tenant_id, o.workspace_id, o.event_sequence,
                 o.attempt_count, o.max_attempts
     )
     SELECT * FROM updated ORDER BY event_sequence`,
    [limit, id, leaseSeconds],
  );

  for (const row of claimed.rows) {
    await client.query(
      `INSERT INTO mentor_profile_update_attempts
         (tenant_id, workspace_id, outbox_id, attempt_number, worker_id, status)
       VALUES ($1, $2, $3, $4, $5, 'claimed')`,
      [
        row.tenant_id,
        row.workspace_id,
        row.id,
        row.attempt_count,
        id,
      ],
    );
  }

  return claimed.rows.map((row) => ({
    outboxId: row.id,
    attemptNumber: row.attempt_count,
    maxAttempts: row.max_attempts,
  }));
}

export async function processMentorProfileUpdateClaimTx(
  client: PoolClient,
  claim: MentorProfileOutboxClaim,
  rawWorkerId: string,
): Promise<{ studentId: string; resultHash: string; replayed: boolean }> {
  const id = workerId(rawWorkerId);
  const rowResult = await client.query<ProcessingRow>(
    `SELECT student_id::text, event_id, payload_hash
       FROM mentor_profile_update_outbox
      WHERE id = $1
        AND status = 'processing'
        AND locked_by = $2
        AND attempt_count = $3
        AND lease_expires_at > NOW()
      FOR UPDATE`,
    [claim.outboxId, id, claim.attemptNumber],
  );
  const row = rowResult.rows[0];
  if (!row) {
    const completed = await client.query<{
      student_id: string;
      profile_result_hash: string;
    }>(
      `SELECT student_id::text, profile_result_hash
         FROM mentor_profile_update_outbox
        WHERE id = $1 AND status = 'processed'`,
      [claim.outboxId],
    );
    if (completed.rows[0]) {
      return {
        studentId: completed.rows[0].student_id,
        resultHash: completed.rows[0].profile_result_hash,
        replayed: true,
      };
    }
    throw new Error("mentor_profile_outbox_lease_lost");
  }

  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtext('mentor_profile_projection'),
       hashtext($1)
     )`,
    [row.student_id],
  );
  const update = await computeMentorProfileForStudentTx(client, row.student_id);
  await upsertMentorProfileUpdateTx(client, row.student_id, update);
  const resultHash = sha256({
    studentId: row.student_id,
    sourceEventId: row.event_id,
    sourcePayloadHash: row.payload_hash,
    profile: update,
  });

  const updated = await client.query(
    `UPDATE mentor_profile_update_outbox
        SET status = 'processed',
            processed_at = NOW(),
            terminal_at = NOW(),
            profile_result_hash = $4,
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
    [claim.outboxId, id, claim.attemptNumber, resultHash],
  );
  if ((updated.rowCount ?? 0) !== 1) {
    throw new Error("mentor_profile_outbox_lease_lost");
  }

  const attempt = await client.query(
    `UPDATE mentor_profile_update_attempts
        SET status = 'processed',
            result_hash = $4,
            completed_at = NOW()
      WHERE outbox_id = $1
        AND attempt_number = $2
        AND worker_id = $3
        AND status = 'claimed'`,
    [claim.outboxId, claim.attemptNumber, id, resultHash],
  );
  if ((attempt.rowCount ?? 0) !== 1) {
    throw new Error("mentor_profile_attempt_state_missing");
  }

  return { studentId: row.student_id, resultHash, replayed: false };
}

export async function failMentorProfileUpdateClaim(
  client: PoolClient,
  claim: MentorProfileOutboxClaim,
  rawWorkerId: string,
  failure: { errorCode: string; errorDetail?: string | null; retryable: boolean },
): Promise<{ terminal: boolean; availableAt: string | null }> {
  const id = workerId(rawWorkerId);
  const errorCode = boundedToken(
    failure.errorCode,
    1,
    100,
    "mentor_profile_failure_code_invalid",
  );
  const errorDetail = failure.errorDetail?.slice(0, 2_000) ?? null;
  const terminal = !failure.retryable || claim.attemptNumber >= claim.maxAttempts;
  const delaySeconds = mentorProfileRetryDelaySeconds(
    claim.attemptNumber,
    claim.outboxId,
  );

  const updated = await client.query<{ available_at: Date }>(
    `UPDATE mentor_profile_update_outbox
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
      id,
      claim.attemptNumber,
      terminal ? "failed_terminal" : "failed_retryable",
      terminal,
      delaySeconds,
      errorCode,
      errorDetail,
    ],
  );
  const row = updated.rows[0];
  if (!row) throw new Error("mentor_profile_outbox_lease_lost");

  const attempt = await client.query(
    `UPDATE mentor_profile_update_attempts
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
      id,
      terminal ? "failed_terminal" : "failed_retryable",
      errorCode,
      errorDetail,
    ],
  );
  if ((attempt.rowCount ?? 0) !== 1) {
    throw new Error("mentor_profile_attempt_state_missing");
  }
  if (terminal) await deadLetter(client, claim.outboxId, errorCode);

  return {
    terminal,
    availableAt: terminal ? null : row.available_at.toISOString(),
  };
}

export async function mentorProfileOutboxStatus(
  client: PoolClient,
): Promise<Record<string, number>> {
  const rows = await client.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count
       FROM mentor_profile_update_outbox
      GROUP BY status`,
  );
  const counts: Record<string, number> = {
    pending: 0,
    processing: 0,
    processed: 0,
    failed_retryable: 0,
    failed_terminal: 0,
  };
  for (const row of rows.rows) counts[row.status] = Number.parseInt(row.count, 10);
  const dead = await client.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM mentor_profile_update_dead_letters",
  );
  counts.dead_letters = Number.parseInt(dead.rows[0]?.count ?? "0", 10);
  return counts;
}
