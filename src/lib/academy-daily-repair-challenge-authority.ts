import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { QuizQuestion } from "@/data/academy/term1Curriculum";
import type { AcademyMasteryLocale } from "@/lib/academy-mastery-seasons-authority";
import { withTx } from "@/lib/db";

export const ACADEMY_DAILY_REPAIR_POLICY_VERSION = "academy-daily-repair-v1";

type WeaknessSignalRow = {
  id: string;
  source_type: string;
  source_id: string;
  concept_tag: string;
  strength: number;
  confidence: number;
  observed_at: Date | string;
};

type ChallengeRow = {
  id: string;
  challenge_date: Date | string;
  concept_tag: string;
  challenge_key: string;
  question_payload: unknown;
  expected_answer: unknown;
  evidence_sha256: string;
  policy_version: string;
  created_at: Date | string;
};

type CompletionRow = {
  id: string;
  answer_sha256: string;
  passed: boolean;
  created_at: Date | string;
};

export type AcademyDailyRepairChallenge = {
  challengeId: string;
  challengeDate: string;
  conceptTag: string;
  challengeKey: string;
  question: QuizQuestion;
  policyVersion: typeof ACADEMY_DAILY_REPAIR_POLICY_VERSION;
  evidenceSha256: string;
  createdAt: string;
  replayed: boolean;
};

export type AcademyDailyRepairAssignmentResult =
  | { assigned: false; reason: "no_weakness_signal" }
  | { assigned: true; challenge: AcademyDailyRepairChallenge };

export type AcademyDailyRepairCompletionResult = {
  eventId: string;
  challengeId: string;
  passed: boolean;
  answerSha256: string;
  replayed: boolean;
  createdAt: string;
};

export type AcademyDailyRepairDrainResult = {
  selectedLearners: number;
  assignedCount: number;
  replayedCount: number;
  skippedCount: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9._-]{1,79}$/;

function assertScope(tenantId: string, workspaceId: string): void {
  if (!SCOPE_PATTERN.test(tenantId) || !SCOPE_PATTERN.test(workspaceId)) {
    throw new Error("daily_repair_scope_invalid");
  }
}

function assertStudentId(studentId: string): void {
  if (!UUID_PATTERN.test(studentId)) throw new Error("daily_repair_student_invalid");
}

function dateKey(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error("daily_repair_date_invalid");
  return value.toISOString().slice(0, 10);
}

function canonicalJson(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sort(nested)]));
  };
  return JSON.stringify(sort(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeAnswer(value: unknown): string {
  return String(value ?? "").trim();
}

function idempotencyKey(input: {
  tenantId: string;
  workspaceId: string;
  studentId: string;
  locale: AcademyMasteryLocale;
  challengeDate: string;
}): string {
  const scopeDigest = sha256(canonicalJson({
    challengeDate: input.challengeDate,
    locale: input.locale,
    studentId: input.studentId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
  })).slice(0, 48);
  return `daily-repair:${input.studentId}:${input.locale}:${input.challengeDate}:${scopeDigest}`;
}

function questionForConcept(conceptTag: string, locale: AcademyMasteryLocale): QuizQuestion {
  const safeTag = TAG_PATTERN.test(conceptTag) ? conceptTag : "risk";
  if (locale === "en") {
    return {
      id: `daily-repair-${safeTag}`,
      type: "single",
      question: `A weakness signal was detected for ${safeTag}. What should you do before the next Arena decision?`,
      options: [
        "Write the rule, risk limit, evidence source and stop condition before acting",
        "Increase size to recover faster",
        "Ignore the weakness if the last outcome was profitable",
        "Ask for a buy or sell signal",
      ],
      correctAnswer: "Write the rule, risk limit, evidence source and stop condition before acting",
      explanation: "Daily repair challenges train process quality: define the rule, cap risk, cite evidence and decide the stop condition before any simulated action.",
      difficulty: "medium",
      conceptTag: safeTag,
    };
  }
  return {
    id: `daily-repair-${safeTag}`,
    type: "single",
    question: `برای ضعف ${safeTag}، قبل از تصمیم بعدی در Arena کدام کار درست‌تر است؟`,
    options: [
      "قانون، حد ریسک، منبع شواهد و شرط توقف را قبل از اقدام بنویسم",
      "برای جبران سریع‌تر حجم را بیشتر کنم",
      "اگر نتیجه قبلی سودده بود ضعف را نادیده بگیرم",
      "یک سیگنال خرید یا فروش بخواهم",
    ],
    correctAnswer: "قانون، حد ریسک، منبع شواهد و شرط توقف را قبل از اقدام بنویسم",
    explanation: "چالش روزانه ضعف، کیفیت فرایند را تمرین می‌دهد: قانون، سقف ریسک، شواهد و شرط توقف باید قبل از اقدام شبیه‌سازی‌شده روشن باشند.",
    difficulty: "medium",
    conceptTag: safeTag,
  };
}

function challengeFromRow(row: ChallengeRow, replayed: boolean): AcademyDailyRepairChallenge {
  return {
    challengeId: row.id,
    challengeDate: new Date(row.challenge_date).toISOString().slice(0, 10),
    conceptTag: row.concept_tag,
    challengeKey: row.challenge_key,
    question: row.question_payload as QuizQuestion,
    policyVersion: ACADEMY_DAILY_REPAIR_POLICY_VERSION,
    evidenceSha256: row.evidence_sha256,
    createdAt: new Date(row.created_at).toISOString(),
    replayed,
  };
}

async function readLatestWeaknessSignal(
  client: PoolClient,
  input: {
    tenantId: string;
    workspaceId: string;
    studentId: string;
    locale: AcademyMasteryLocale;
  },
): Promise<WeaknessSignalRow | null> {
  const result = await client.query<WeaknessSignalRow>(
    `SELECT id::text, source_type, source_id, concept_tag, strength, confidence, observed_at
       FROM academy_mastery_weakness_signals
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND student_id = $3::uuid
        AND locale = $4
        AND strength < 0
        AND observed_at >= NOW() - INTERVAL '120 days'
      ORDER BY ABS(strength) DESC, confidence DESC, observed_at DESC, id DESC
      LIMIT 1`,
    [input.tenantId, input.workspaceId, input.studentId, input.locale],
  );
  return result.rows[0] ?? null;
}

export async function assignDailyRepairChallengeTx(
  client: PoolClient,
  input: {
    tenantId: string;
    workspaceId: string;
    studentId: string;
    locale: AcademyMasteryLocale;
    challengeDate?: Date;
  },
): Promise<AcademyDailyRepairAssignmentResult> {
  assertScope(input.tenantId, input.workspaceId);
  assertStudentId(input.studentId);
  const challengeDate = dateKey(input.challengeDate ?? new Date());

  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    `daily-repair:${input.tenantId}:${input.workspaceId}:${input.studentId}`,
    `${input.locale}:${challengeDate}`,
  ]);

  const signal = await readLatestWeaknessSignal(client, input);
  if (!signal) return { assigned: false, reason: "no_weakness_signal" };
  const conceptTag = signal.concept_tag;
  const challengeKey = `daily-repair:${input.locale}:${challengeDate}:${conceptTag}`;
  const question = questionForConcept(conceptTag, input.locale);
  const expectedAnswer = { type: "single", value: normalizeAnswer(question.correctAnswer) };
  const evidence = {
    authority: ACADEMY_DAILY_REPAIR_POLICY_VERSION,
    signalId: signal.id,
    sourceType: signal.source_type,
    sourceId: signal.source_id,
    conceptTag,
    signalStrength: Number(signal.strength),
    signalConfidence: Number(signal.confidence),
    signalObservedAt: new Date(signal.observed_at).toISOString(),
    challengeDate,
    challengeKey,
    generatedBy: "server_mastery_v1",
  };
  const evidenceJson = canonicalJson(evidence);
  const evidenceSha256 = sha256(evidenceJson);
  const inserted = await client.query<ChallengeRow>(
    `INSERT INTO academy_daily_repair_challenges
       (tenant_id, workspace_id, principal_id, student_id, locale, challenge_date,
        weakness_signal_id, source_type, source_id, concept_tag, challenge_key,
        question_payload, expected_answer, policy_version, evidence_sha256, evidence,
        idempotency_key)
     VALUES ($1, $2, $3, $3::uuid, $4, $5::date, $6::bigint, $7, $8, $9, $10,
             $11::jsonb, $12::jsonb, $13, $14, $15::jsonb, $16)
     ON CONFLICT (tenant_id, workspace_id, student_id, locale, challenge_date)
       DO NOTHING
     RETURNING id::text, challenge_date, concept_tag, challenge_key, question_payload,
               expected_answer, evidence_sha256, policy_version, created_at`,
    [
      input.tenantId,
      input.workspaceId,
      input.studentId,
      input.locale,
      challengeDate,
      signal.id,
      signal.source_type,
      signal.source_id,
      conceptTag,
      challengeKey,
      JSON.stringify(question),
      JSON.stringify(expectedAnswer),
      ACADEMY_DAILY_REPAIR_POLICY_VERSION,
      evidenceSha256,
      evidenceJson,
      idempotencyKey({ ...input, challengeDate }),
    ],
  );
  const insertedRow = inserted.rows[0];
  if (insertedRow) {
    return { assigned: true, challenge: challengeFromRow(insertedRow, false) };
  }

  const existing = await client.query<ChallengeRow>(
    `SELECT id::text, challenge_date, concept_tag, challenge_key, question_payload,
            expected_answer, evidence_sha256, policy_version, created_at
       FROM academy_daily_repair_challenges
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND student_id = $3::uuid
        AND locale = $4
        AND challenge_date = $5::date
      LIMIT 1`,
    [input.tenantId, input.workspaceId, input.studentId, input.locale, challengeDate],
  );
  const row = existing.rows[0];
  if (!row) throw new Error("daily_repair_replay_missing");
  return { assigned: true, challenge: challengeFromRow(row, true) };
}

export async function completeDailyRepairChallengeTx(
  client: PoolClient,
  input: {
    tenantId: string;
    workspaceId: string;
    studentId: string;
    locale: AcademyMasteryLocale;
    challengeId: string;
    answer: unknown;
    idempotencyKey: string;
  },
): Promise<AcademyDailyRepairCompletionResult> {
  assertScope(input.tenantId, input.workspaceId);
  assertStudentId(input.studentId);
  if (!UUID_PATTERN.test(input.challengeId)) throw new Error("daily_repair_challenge_invalid");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/.test(input.idempotencyKey)) {
    throw new Error("daily_repair_idempotency_invalid");
  }
  const challenge = await client.query<ChallengeRow>(
    `SELECT id::text, challenge_date, concept_tag, challenge_key, question_payload,
            expected_answer, evidence_sha256, policy_version, created_at
       FROM academy_daily_repair_challenges
      WHERE id = $1::uuid
        AND tenant_id = $2
        AND workspace_id = $3
        AND student_id = $4::uuid
        AND locale = $5
      LIMIT 1
      FOR SHARE`,
    [input.challengeId, input.tenantId, input.workspaceId, input.studentId, input.locale],
  );
  const row = challenge.rows[0];
  if (!row) throw new Error("daily_repair_challenge_not_found");
  const expected = row.expected_answer as { value?: unknown };
  const normalized = normalizeAnswer(input.answer);
  const expectedValue = normalizeAnswer(expected.value);
  const passed = normalized === expectedValue;
  const answerPayload = { type: "single", value: normalized };
  const answerSha256 = sha256(canonicalJson(answerPayload));
  const evidence = {
    authority: ACADEMY_DAILY_REPAIR_POLICY_VERSION,
    challengeId: row.id,
    challengeKey: row.challenge_key,
    conceptTag: row.concept_tag,
    expectedAnswerSha256: sha256(canonicalJson({ type: "single", value: expectedValue })),
    answerSha256,
    passed,
  };
  const inserted = await client.query<CompletionRow>(
    `INSERT INTO academy_daily_repair_challenge_events
       (challenge_id, tenant_id, workspace_id, principal_id, student_id, locale,
        event_type, idempotency_key, answer_payload, answer_sha256, passed,
        policy_version, evidence)
     VALUES ($1::uuid, $2, $3, $4, $4::uuid, $5, 'completion_submitted',
             $6, $7::jsonb, $8, $9, $10, $11::jsonb)
     ON CONFLICT (tenant_id, workspace_id, challenge_id, event_type, idempotency_key)
       DO NOTHING
     RETURNING id::text, answer_sha256, passed, created_at`,
    [
      row.id,
      input.tenantId,
      input.workspaceId,
      input.studentId,
      input.locale,
      input.idempotencyKey,
      JSON.stringify(answerPayload),
      answerSha256,
      passed,
      ACADEMY_DAILY_REPAIR_POLICY_VERSION,
      canonicalJson(evidence),
    ],
  );
  const insertedRow = inserted.rows[0];
  if (insertedRow) {
    return {
      eventId: insertedRow.id,
      challengeId: row.id,
      passed: Boolean(insertedRow.passed),
      answerSha256: insertedRow.answer_sha256,
      replayed: false,
      createdAt: new Date(insertedRow.created_at).toISOString(),
    };
  }
  const existing = await client.query<CompletionRow>(
    `SELECT id::text, answer_sha256, passed, created_at
       FROM academy_daily_repair_challenge_events
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND challenge_id = $3::uuid
        AND event_type = 'completion_submitted'
        AND idempotency_key = $4
      LIMIT 1`,
    [input.tenantId, input.workspaceId, row.id, input.idempotencyKey],
  );
  const replay = existing.rows[0];
  if (!replay) throw new Error("daily_repair_completion_replay_missing");
  if (replay.answer_sha256 !== answerSha256 || Boolean(replay.passed) !== passed) {
    throw new Error("daily_repair_completion_replay_mismatch");
  }
  return {
    eventId: replay.id,
    challengeId: row.id,
    passed: Boolean(replay.passed),
    answerSha256: replay.answer_sha256,
    replayed: true,
    createdAt: new Date(replay.created_at).toISOString(),
  };
}

export async function assignDueDailyRepairChallengesTx(
  client: PoolClient,
  input: {
    challengeDate?: Date;
    limit?: number;
  } = {},
): Promise<AcademyDailyRepairDrainResult> {
  const challengeDate = dateKey(input.challengeDate ?? new Date());
  const limit = Math.max(1, Math.min(500, Math.floor(Number(input.limit) || 100)));
  const learners = await client.query<{
    tenant_id: string;
    workspace_id: string;
    student_id: string;
    locale: AcademyMasteryLocale;
  }>(
    `SELECT DISTINCT ON (tenant_id, workspace_id, student_id, locale)
            tenant_id, workspace_id, student_id::text, locale
       FROM academy_mastery_weakness_signals signals
      WHERE strength < 0
        AND observed_at >= NOW() - INTERVAL '120 days'
        AND NOT EXISTS (
          SELECT 1
            FROM academy_daily_repair_challenges challenges
           WHERE challenges.tenant_id = signals.tenant_id
             AND challenges.workspace_id = signals.workspace_id
             AND challenges.student_id = signals.student_id
             AND challenges.locale = signals.locale
             AND challenges.challenge_date = $1::date
        )
      ORDER BY tenant_id, workspace_id, student_id, locale, ABS(strength) DESC,
               confidence DESC, observed_at DESC, id DESC
      LIMIT $2`,
    [challengeDate, limit],
  );
  let assignedCount = 0;
  let replayedCount = 0;
  let skippedCount = 0;
  for (const learner of learners.rows) {
    const assigned = await assignDailyRepairChallengeTx(client, {
      tenantId: learner.tenant_id,
      workspaceId: learner.workspace_id,
      studentId: learner.student_id,
      locale: learner.locale === "en" ? "en" : "fa",
      challengeDate: new Date(`${challengeDate}T00:00:00.000Z`),
    });
    if (!assigned.assigned) {
      skippedCount += 1;
    } else if (assigned.challenge.replayed) {
      replayedCount += 1;
    } else {
      assignedCount += 1;
    }
  }
  return {
    selectedLearners: learners.rows.length,
    assignedCount,
    replayedCount,
    skippedCount,
  };
}

export async function assignDueDailyRepairChallenges(
  input: { challengeDate?: Date; limit?: number } = {},
): Promise<AcademyDailyRepairDrainResult> {
  const result = await withTx((client) => assignDueDailyRepairChallengesTx(client, input));
  return result.enabled ? result.value : {
    selectedLearners: 0,
    assignedCount: 0,
    replayedCount: 0,
    skippedCount: 0,
  };
}
