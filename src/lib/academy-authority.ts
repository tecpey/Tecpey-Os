import type { PoolClient } from "pg";
import { hashLearningCommand } from "@/lib/academy-assessment";
import { enqueueAcademyAssessmentCompleted } from "@/lib/notifications/academy-domain-events";

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

function isSectionCheckpointCommand(commandType: string): boolean {
  return commandType.startsWith("section_checkpoint:");
}

function commandLocale(request: unknown): "fa" | "en" {
  if (!request || typeof request !== "object") {
    throw new Error("academy_section_command_locale_missing");
  }
  const locale = (request as Record<string, unknown>).locale;
  if (locale !== "fa" && locale !== "en") {
    throw new Error("academy_section_command_locale_invalid");
  }
  return locale;
}

async function readSectionCommand<T>(
  client: PoolClient,
  input: {
    studentId: string;
    commandType: string;
    requestHash: string;
    request: unknown;
    idempotencyKey: string | null;
  },
): Promise<{ requestHash: string; response: T | null; idempotencyConflict: boolean }> {
  if (!input.idempotencyKey) throw new Error("academy_section_idempotency_key_required");
  const locale = commandLocale(input.request);

  const byKey = await client.query<{ request_hash: string; result_response: T }>(
    `SELECT request_hash, result_response
       FROM academy_section_commands
      WHERE student_id = $1::uuid AND idempotency_key = $2
      FOR SHARE`,
    [input.studentId, input.idempotencyKey],
  );
  if (byKey.rows[0]) {
    const sameRequest = byKey.rows[0].request_hash === input.requestHash;
    return {
      requestHash: input.requestHash,
      response: sameRequest ? byKey.rows[0].result_response : null,
      idempotencyConflict: !sameRequest,
    };
  }

  const byRequest = await client.query<{ result_response: T }>(
    `SELECT result_response
       FROM academy_section_commands
      WHERE student_id = $1::uuid
        AND locale = $2
        AND command_type = $3
        AND request_hash = $4
      ORDER BY created_at ASC
      LIMIT 1
      FOR SHARE`,
    [input.studentId, locale, input.commandType, input.requestHash],
  );
  if (!byRequest.rows[0]) {
    return { requestHash: input.requestHash, response: null, idempotencyConflict: false };
  }

  const alias = await client.query<{ id: string }>(
    `INSERT INTO academy_section_commands
       (student_id, locale, command_type, idempotency_key, request_hash, result_response)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (student_id, idempotency_key) DO NOTHING
     RETURNING id::text`,
    [
      input.studentId,
      locale,
      input.commandType,
      input.idempotencyKey,
      input.requestHash,
      JSON.stringify(byRequest.rows[0].result_response),
    ],
  );
  if (!alias.rows[0]) {
    const raced = await client.query<{ request_hash: string; result_response: T }>(
      `SELECT request_hash, result_response
         FROM academy_section_commands
        WHERE student_id = $1::uuid AND idempotency_key = $2
        FOR SHARE`,
      [input.studentId, input.idempotencyKey],
    );
    if (!raced.rows[0] || raced.rows[0].request_hash !== input.requestHash) {
      return { requestHash: input.requestHash, response: null, idempotencyConflict: true };
    }
    return {
      requestHash: input.requestHash,
      response: raced.rows[0].result_response,
      idempotencyConflict: false,
    };
  }

  return {
    requestHash: input.requestHash,
    response: byRequest.rows[0].result_response,
    idempotencyConflict: false,
  };
}

export async function readLearningCommand<T>(
  client: PoolClient,
  studentId: string,
  commandType: string,
  request: unknown,
  idempotencyKey?: string | null,
): Promise<{ requestHash: string; response: T | null; idempotencyConflict: boolean }> {
  const requestHash = hashLearningCommand(request);
  if (isSectionCheckpointCommand(commandType)) {
    return readSectionCommand<T>(client, {
      studentId,
      commandType,
      requestHash,
      request,
      idempotencyKey: idempotencyKey ?? null,
    });
  }

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

function termAssessmentCommand(commandType: string): {
  locale: "fa" | "en";
  termNumber: number;
} | null {
  const match = /^term_assessment:(fa|en):([1-7])$/.exec(commandType);
  if (!match) return null;
  return {
    locale: match[1] as "fa" | "en",
    termNumber: Number.parseInt(match[2], 10),
  };
}

export async function storeLearningCommand(
  client: PoolClient,
  input: {
    studentId: string;
    locale?: "fa" | "en";
    commandType: string;
    requestHash: string;
    idempotencyKey?: string | null;
    result: Record<string, unknown>;
  },
): Promise<void> {
  if (isSectionCheckpointCommand(input.commandType)) {
    if (!input.locale || !input.idempotencyKey) {
      throw new Error("academy_section_command_identity_missing");
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO academy_section_commands
         (student_id, locale, command_type, idempotency_key, request_hash, result_response)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (student_id, idempotency_key) DO NOTHING
       RETURNING id::text`,
      [
        input.studentId,
        input.locale,
        input.commandType,
        input.idempotencyKey,
        input.requestHash,
        JSON.stringify(input.result),
      ],
    );
    if (!inserted.rows[0]) {
      const existing = await client.query<{ request_hash: string }>(
        `SELECT request_hash
           FROM academy_section_commands
          WHERE student_id = $1::uuid AND idempotency_key = $2
          FOR SHARE`,
        [input.studentId, input.idempotencyKey],
      );
      if (!existing.rows[0] || existing.rows[0].request_hash !== input.requestHash) {
        throw new Error("academy_section_command_idempotency_conflict");
      }
    }
    return;
  }

  const inserted = await client.query<{ created_at: Date }>(
    `INSERT INTO academy_learning_commands
       (student_id, command_type, request_hash, idempotency_key, result_response)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
     ON CONFLICT DO NOTHING
     RETURNING created_at`,
    [
      input.studentId,
      input.commandType,
      input.requestHash,
      input.idempotencyKey ?? null,
      JSON.stringify(input.result),
    ],
  );

  const command = termAssessmentCommand(input.commandType);
  const createdAt = inserted.rows[0]?.created_at;
  if (!command || !createdAt) return;

  const percent = input.result.percent;
  const passed = input.result.passed;
  const resultTermNumber = input.result.termNumber;
  if (
    !Number.isInteger(percent)
    || Number(percent) < 0
    || Number(percent) > 100
    || typeof passed !== "boolean"
    || resultTermNumber !== command.termNumber
  ) {
    throw new Error("academy_term_assessment_command_result_invalid");
  }

  await enqueueAcademyAssessmentCompleted(client, {
    studentId: input.studentId,
    locale: command.locale,
    termNumber: command.termNumber,
    percent: Number(percent),
    passed,
    requestHash: input.requestHash,
    occurredAt: createdAt.toISOString(),
  });
}
