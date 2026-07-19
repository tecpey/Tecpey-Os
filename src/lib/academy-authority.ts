import type { PoolClient } from "pg";
import { hashLearningCommand } from "@/lib/academy-assessment";

export type AcademyRewardInput = {
  studentId: string;
  locale: "fa" | "en";
  rewardKey: string;
  rewardType: string;
  sourceType: string;
  sourceId: string;
  xp?: number;
  badgeCode?: string | null;
  metadata?: Record<string, unknown>;
};

export async function awardAcademyReward(client: PoolClient, input: AcademyRewardInput): Promise<boolean> {
  const inserted = await client.query(
    `INSERT INTO academy_reward_ledger
       (student_id, locale, reward_key, reward_type, source_type, source_id, xp, badge_code, metadata)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (student_id, locale, reward_key) DO NOTHING
     RETURNING id`,
    [
      input.studentId,
      input.locale,
      input.rewardKey,
      input.rewardType,
      input.sourceType,
      input.sourceId,
      Math.max(0, Math.round(input.xp ?? 0)),
      input.badgeCode ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return Boolean(inserted.rows[0]);
}

export async function readLearningCommand<T>(
  client: PoolClient,
  studentId: string,
  commandType: string,
  request: unknown,
  idempotencyKey?: string | null,
): Promise<{ requestHash: string; response: T | null; idempotencyConflict: boolean }> {
  const requestHash = hashLearningCommand(request);
  const existing = await client.query<{ result_response: T }>(
    `SELECT result_response
     FROM academy_learning_commands
     WHERE student_id = $1::uuid AND command_type = $2 AND request_hash = $3
     LIMIT 1`,
    [studentId, commandType, requestHash],
  );
  if (existing.rows[0]) {
    return { requestHash, response: existing.rows[0].result_response, idempotencyConflict: false };
  }

  if (idempotencyKey) {
    const byKey = await client.query<{ request_hash: string; result_response: T }>(
      `SELECT request_hash, result_response
       FROM academy_learning_commands
       WHERE student_id = $1::uuid AND idempotency_key = $2
       LIMIT 1`,
      [studentId, idempotencyKey],
    );
    if (byKey.rows[0]) {
      return {
        requestHash,
        response: byKey.rows[0].request_hash === requestHash ? byKey.rows[0].result_response : null,
        idempotencyConflict: byKey.rows[0].request_hash !== requestHash,
      };
    }
  }

  return { requestHash, response: null, idempotencyConflict: false };
}

export async function storeLearningCommand(
  client: PoolClient,
  input: {
    studentId: string;
    commandType: string;
    requestHash: string;
    idempotencyKey?: string | null;
    result: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO academy_learning_commands
       (student_id, command_type, request_hash, idempotency_key, result_response)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
     ON CONFLICT DO NOTHING`,
    [input.studentId, input.commandType, input.requestHash, input.idempotencyKey ?? null, JSON.stringify(input.result)],
  );
}
