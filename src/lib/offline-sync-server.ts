import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { refreshLearningBrain } from "./learning-os";
import type { OfflineSyncItem, OfflineSyncResult } from "./offline-sync";

type ExistingCommandRow = {
  payload_hash: string;
  learning_event_id: string;
  result: OfflineSyncResult;
};

function canonicalize(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("offline_payload_invalid");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  throw new Error("offline_payload_invalid");
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function offlineSyncPayloadHash(item: OfflineSyncItem): string {
  return sha256(
    stableJson({
      id: item.id,
      eventType: item.eventType,
      source: item.source,
      locale: item.locale,
      clientCreatedAt: item.clientCreatedAt,
      payload: item.payload,
    }),
  );
}

export function offlineLearningEventId(
  studentId: string,
  clientEventId: string,
): string {
  return `OFFLINE-${sha256(`${studentId}:${clientEventId}`).slice(0, 40)}`;
}

export async function applyOfflineSyncBatch(
  client: PoolClient,
  studentId: string,
  items: OfflineSyncItem[],
): Promise<OfflineSyncResult[]> {
  const results: OfflineSyncResult[] = [];
  let inserted = 0;

  for (const item of items) {
    const hash = offlineSyncPayloadHash(item);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `offline-sync:${studentId}:${item.id}`,
    ]);

    const existing = await client.query<ExistingCommandRow>(
      `SELECT payload_hash, learning_event_id, result
         FROM offline_sync_commands
        WHERE student_id = $1::uuid
          AND client_event_id = $2
        LIMIT 1`,
      [studentId, item.id],
    );
    const previous = existing.rows[0];
    if (previous) {
      if (previous.payload_hash !== hash) {
        results.push({
          id: item.id,
          status: "rejected",
          reason: "idempotency_conflict",
        });
      } else {
        results.push({
          ...previous.result,
          id: item.id,
          status: "accepted",
          replayed: true,
          learningEventId: previous.learning_event_id,
        });
      }
      continue;
    }

    const learningEventId = offlineLearningEventId(studentId, item.id);
    const syncedAt = new Date().toISOString();
    await client.query(
      `INSERT INTO learning_events
        (event_id, student_id, event_type, source, locale, payload)
       VALUES ($1, $2::uuid, $3, $4, $5, $6::jsonb)`,
      [
        learningEventId,
        studentId,
        item.eventType,
        item.source,
        item.locale,
        JSON.stringify({
          ...item.payload,
          offlineEventId: item.id,
          clientCreatedAt: item.clientCreatedAt,
          syncedAt,
        }),
      ],
    );

    const result: OfflineSyncResult = {
      id: item.id,
      status: "accepted",
      replayed: false,
      learningEventId,
    };
    await client.query(
      `INSERT INTO offline_sync_commands
        (id, student_id, client_event_id, payload_hash, event_type, source,
         locale, client_created_at, learning_event_id, result)
       VALUES
        ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10::jsonb)`,
      [
        randomUUID(),
        studentId,
        item.id,
        hash,
        item.eventType,
        item.source,
        item.locale,
        item.clientCreatedAt,
        learningEventId,
        JSON.stringify(result),
      ],
    );
    results.push(result);
    inserted += 1;
  }

  if (inserted > 0) await refreshLearningBrain(client, studentId);
  return results;
}
