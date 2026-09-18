import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DeadLetterRow = {
  dead_letter_id: string;
  tenant_id: string;
  workspace_id: string;
  outbox_id: string;
  student_fingerprint: string;
};

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
  throw new Error("mentor_profile_resolution_value_invalid");
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function iso(value: string, code: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(code);
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(code);
  return normalized;
}

export async function resolveMentorProfileDeadLettersAfterRepairTx(
  client: PoolClient,
  input: {
    studentId: string;
    repairRunId: string;
    repairStartedAt: string;
    resolvedAt: string;
  },
): Promise<{ selected: number; resolved: number; replayed: number }> {
  if (!UUID_RE.test(input.studentId)) {
    throw new Error("mentor_profile_resolution_student_invalid");
  }
  if (!UUID_RE.test(input.repairRunId)) {
    throw new Error("mentor_profile_resolution_run_invalid");
  }
  const repairStartedAt = iso(
    input.repairStartedAt,
    "mentor_profile_resolution_started_at_invalid",
  );
  const resolvedAt = iso(
    input.resolvedAt,
    "mentor_profile_resolution_resolved_at_invalid",
  );
  if (Date.parse(resolvedAt) < Date.parse(repairStartedAt)) {
    throw new Error("mentor_profile_resolution_time_order_invalid");
  }

  const candidates = await client.query<DeadLetterRow>(
    `SELECT dl.id::text AS dead_letter_id,
            dl.tenant_id,
            dl.workspace_id,
            dl.outbox_id::text,
            dl.student_fingerprint
       FROM mentor_profile_update_dead_letters dl
       JOIN mentor_profile_update_outbox o
         ON o.id = dl.outbox_id
        AND o.tenant_id = dl.tenant_id
        AND o.workspace_id = dl.workspace_id
       LEFT JOIN mentor_profile_dead_letter_resolutions r
         ON r.dead_letter_id = dl.id
      WHERE o.student_id = $1::uuid
        AND dl.created_at <= $2::timestamptz
        AND r.dead_letter_id IS NULL
      ORDER BY dl.created_at, dl.id
      FOR SHARE OF dl, o`,
    [input.studentId, repairStartedAt],
  );

  let resolved = 0;
  let replayed = 0;
  for (const row of candidates.rows) {
    const resolutionHash = sha256({
      deadLetterId: row.dead_letter_id,
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      outboxId: row.outbox_id,
      repairRunId: input.repairRunId.toLowerCase(),
      studentFingerprint: row.student_fingerprint,
      resolutionType: "recomputed_current_state",
      repairStartedAt,
      resolvedAt,
    });
    const inserted = await client.query(
      `INSERT INTO mentor_profile_dead_letter_resolutions
         (dead_letter_id, tenant_id, workspace_id, outbox_id, repair_run_id,
          student_fingerprint, resolution_type, repair_started_at, resolved_at,
          resolution_hash)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6,
               'recomputed_current_state', $7::timestamptz, $8::timestamptz, $9)
       ON CONFLICT (dead_letter_id) DO NOTHING`,
      [
        row.dead_letter_id,
        row.tenant_id,
        row.workspace_id,
        row.outbox_id,
        input.repairRunId,
        row.student_fingerprint,
        repairStartedAt,
        resolvedAt,
        resolutionHash,
      ],
    );
    if ((inserted.rowCount ?? 0) === 1) resolved += 1;
    else replayed += 1;
  }

  return { selected: candidates.rows.length, resolved, replayed };
}

export async function resolveMentorProfileDeadLettersAfterRepair(
  input: {
    studentId: string;
    repairRunId: string;
    repairStartedAt: string;
    resolvedAt: string;
  },
): Promise<
  | { enabled: false; value: null }
  | {
      enabled: true;
      value: { selected: number; resolved: number; replayed: number };
    }
> {
  return withTx((client) =>
    resolveMentorProfileDeadLettersAfterRepairTx(client, input),
  );
}
