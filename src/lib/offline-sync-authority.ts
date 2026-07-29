import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withTx } from "./db";
import { logger } from "./logger";
import type { OfflineSyncItem, OfflineSyncResult } from "./offline-sync";
import type { AvailableTenantPrincipalContext } from "./security/tenant-principal-context";

const STALE_PROCESSING_MS = 5 * 60 * 1_000;
const RETENTION_DAYS = 90;

export type OfflineSyncAuthorityContext = AvailableTenantPrincipalContext & {
  principalType: "student";
};

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return "null";
}

function principalCommandIdentity(args: {
  tenantId: string;
  studentId: string;
  clientEventId: string;
}): string {
  return `${args.tenantId}\u0000${args.studentId}\u0000${args.clientEventId}`;
}

export function offlineCommandHash(item: OfflineSyncItem): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        eventType: item.eventType,
        source: item.source,
        locale: item.locale,
        clientCreatedAt: item.clientCreatedAt,
        payload: item.payload,
      }),
    )
    .digest("hex");
}

export function offlineLearningEventId(args: {
  tenantId: string;
  studentId: string;
  clientEventId: string;
}): string {
  return `OFFLINE-${createHash("sha256")
    .update(principalCommandIdentity(args))
    .digest("hex")}`;
}

function offlineCommandLockKey(args: {
  tenantId: string;
  studentId: string;
  clientEventId: string;
}): string {
  return createHash("sha256")
    .update(principalCommandIdentity(args))
    .digest("hex");
}

type ExistingCommandRow = {
  command_hash: string;
  status: "processing" | "committed" | "retryable" | "rejected";
  domain_event_id: string | null;
  committed_at: Date | string | null;
  processing_started_at: Date | string | null;
};

function committedResult(
  item: OfflineSyncItem,
  eventId: string,
  committedAt: Date | string,
  replayed: boolean,
): OfflineSyncResult {
  return {
    id: item.id,
    status: "committed",
    replayed,
    learningEventId: eventId,
    committedAt:
      committedAt instanceof Date
        ? committedAt.toISOString()
        : new Date(committedAt).toISOString(),
  };
}

function assertOfflineContext(
  context: AvailableTenantPrincipalContext,
): asserts context is OfflineSyncAuthorityContext {
  if (context.principalType !== "student") {
    throw new Error("offline_context_principal_type_invalid");
  }
  if (!context.scopes.includes("offline-sync:write")) {
    throw new Error("offline_context_scope_missing");
  }
}

async function insertLearningEventExactlyOnce(
  client: PoolClient,
  args: {
    eventId: string;
    context: OfflineSyncAuthorityContext;
    item: OfflineSyncItem;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO learning_events
      (event_id, student_id, event_type, source, locale, payload,
       tenant_id, workspace_id, principal_type, principal_id)
     VALUES ($1, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
     ON CONFLICT (event_id) DO NOTHING`,
    [
      args.eventId,
      args.context.principalId,
      args.item.eventType,
      args.item.source,
      args.item.locale,
      JSON.stringify({
        ...args.item.payload,
        offlineClientEventId: args.item.id,
        clientCreatedAt: args.item.clientCreatedAt,
      }),
      args.context.tenantId,
      args.context.workspaceId,
      args.context.principalType,
      args.context.principalId,
    ],
  );
}

export async function processOfflineSyncCommand(input: {
  context: AvailableTenantPrincipalContext;
  item: OfflineSyncItem;
}): Promise<OfflineSyncResult> {
  try {
    assertOfflineContext(input.context);
  } catch (error) {
    logger.error("[offline-sync] invalid authority context", {
      requestId: input.context.requestId,
      error: String(error),
    });
    return { id: input.item.id, status: "rejected", reason: "principal_context_invalid" };
  }

  const context = input.context;
  const tenantId = context.tenantId;
  const studentId = context.principalId;
  const commandHash = offlineCommandHash(input.item);
  const eventId = offlineLearningEventId({
    tenantId,
    studentId,
    clientEventId: input.item.id,
  });
  const lockKey = offlineCommandLockKey({
    tenantId,
    studentId,
    clientEventId: input.item.id,
  });

  try {
    const transaction = await withTx(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [lockKey],
      );

      const claimed = await client.query<{ id: string }>(
        `INSERT INTO offline_sync_commands
          (tenant_id, workspace_id, principal_type, student_id,
           client_event_id, command_hash, event_type, source, locale,
           client_created_at, payload, status, domain_event_id,
           processing_started_at, retain_until)
         VALUES
          ($1, $2, $3, $4::uuid, $5, $6, $7, $8, $9, $10::timestamptz,
           $11::jsonb, 'processing', $12, NOW(),
           NOW() + ($13::text || ' days')::interval)
         ON CONFLICT (tenant_id, student_id, client_event_id) DO NOTHING
         RETURNING id`,
        [
          tenantId,
          context.workspaceId,
          context.principalType,
          studentId,
          input.item.id,
          commandHash,
          input.item.eventType,
          input.item.source,
          input.item.locale,
          input.item.clientCreatedAt,
          JSON.stringify(input.item.payload),
          eventId,
          String(RETENTION_DAYS),
        ],
      );

      if (!claimed.rows[0]) {
        const existing = await client.query<ExistingCommandRow>(
          `SELECT command_hash, status, domain_event_id, committed_at,
                  processing_started_at
             FROM offline_sync_commands
            WHERE tenant_id = $1
              AND student_id = $2::uuid
              AND client_event_id = $3
            FOR UPDATE`,
          [tenantId, studentId, input.item.id],
        );
        const row = existing.rows[0];
        if (!row) throw new Error("offline_command_conflict_without_row");

        if (row.command_hash !== commandHash) {
          return {
            id: input.item.id,
            status: "rejected" as const,
            reason: "idempotency_conflict",
          };
        }

        if (row.status === "committed" && row.domain_event_id && row.committed_at) {
          return committedResult(input.item, row.domain_event_id, row.committed_at, true);
        }

        const processingStartedAt = row.processing_started_at
          ? new Date(row.processing_started_at).getTime()
          : 0;
        if (
          row.status === "processing" &&
          processingStartedAt > Date.now() - STALE_PROCESSING_MS
        ) {
          return {
            id: input.item.id,
            status: "retryable" as const,
            reason: "command_in_progress",
          };
        }

        await client.query(
          `UPDATE offline_sync_commands
              SET status = 'processing',
                  domain_event_id = $4,
                  processing_started_at = NOW(),
                  attempt_count = attempt_count + 1,
                  last_error_code = NULL,
                  updated_at = NOW()
            WHERE tenant_id = $1
              AND student_id = $2::uuid
              AND client_event_id = $3`,
          [tenantId, studentId, input.item.id, eventId],
        );
      }

      await insertLearningEventExactlyOnce(client, {
        eventId,
        context,
        item: input.item,
      });

      const committed = await client.query<{ committed_at: Date }>(
        `UPDATE offline_sync_commands
            SET status = 'committed',
                domain_event_id = $4,
                result = jsonb_build_object(
                  'learningEventId', $4::text,
                  'clientEventId', $3::text
                ),
                committed_at = NOW(),
                processing_started_at = NULL,
                last_error_code = NULL,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND student_id = $2::uuid
            AND client_event_id = $3
          RETURNING committed_at`,
        [tenantId, studentId, input.item.id, eventId],
      );
      if (!committed.rows[0]) throw new Error("offline_command_commit_missing");
      return committedResult(input.item, eventId, committed.rows[0].committed_at, false);
    });

    if (!transaction.enabled) {
      return { id: input.item.id, status: "retryable", reason: "storage_unavailable" };
    }
    return transaction.value;
  } catch (error) {
    logger.error("[offline-sync] command transaction failed", {
      tenantFingerprint: createHash("sha256").update(tenantId).digest("hex"),
      principalFingerprint: createHash("sha256").update(studentId).digest("hex"),
      clientEventId: input.item.id,
      requestId: context.requestId,
      error: String(error),
    });
    return { id: input.item.id, status: "retryable", reason: "storage_unavailable" };
  }
}

export async function reconcileStaleOfflineCommands(
  client: PoolClient,
  options: { limit?: number; staleBefore?: Date } = {},
): Promise<{ committed: number; retryable: number }> {
  const limit = Math.max(1, Math.min(500, options.limit ?? 100));
  const staleBefore = options.staleBefore ?? new Date(Date.now() - STALE_PROCESSING_MS);
  const stale = await client.query<{ id: string; domain_event_id: string | null }>(
    `SELECT id, domain_event_id
       FROM offline_sync_commands
      WHERE status = 'processing'
        AND processing_started_at < $1::timestamptz
      ORDER BY processing_started_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $2`,
    [staleBefore.toISOString(), limit],
  );

  let committed = 0;
  let retryable = 0;
  for (const row of stale.rows) {
    const event = row.domain_event_id
      ? await client.query<{ event_id: string }>(
          "SELECT event_id FROM learning_events WHERE event_id = $1 LIMIT 1",
          [row.domain_event_id],
        )
      : { rows: [] as { event_id: string }[] };

    if (event.rows[0] && row.domain_event_id) {
      await client.query(
        `UPDATE offline_sync_commands
            SET status = 'committed',
                result = jsonb_build_object('learningEventId', $2::text),
                committed_at = COALESCE(committed_at, NOW()),
                processing_started_at = NULL,
                last_error_code = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [row.id, row.domain_event_id],
      );
      committed += 1;
    } else {
      await client.query(
        `UPDATE offline_sync_commands
            SET status = 'retryable',
                processing_started_at = NULL,
                last_error_code = 'stale_processing_recovered',
                updated_at = NOW()
          WHERE id = $1`,
        [row.id],
      );
      retryable += 1;
    }
  }
  return { committed, retryable };
}

export async function purgeExpiredOfflineCommands(
  client: PoolClient,
  limit = 1_000,
): Promise<number> {
  const bounded = Math.max(1, Math.min(5_000, limit));
  const deleted = await client.query<{ id: string }>(
    `WITH expired AS (
       SELECT id
         FROM offline_sync_commands
        WHERE retain_until < NOW()
          AND status IN ('committed', 'rejected')
        ORDER BY retain_until ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     DELETE FROM offline_sync_commands command
      USING expired
      WHERE command.id = expired.id
      RETURNING command.id`,
    [bounded],
  );
  return deleted.rowCount ?? 0;
}
