import "server-only";

import type { PoolClient } from "pg";
import {
  ACADEMY_V3_MISSION_ATTEMPT_POLICY_VERSION,
  evaluateAcademyV3MissionDecision,
  issueAcademyV3MissionAttempt,
} from "@/lib/academy-v3-mission-authority";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE_PATTERN = /^[a-z][a-z0-9-]{2,127}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/;

type AttemptRow = {
  id: string; locale: "fa" | "en"; mission_id: string; mission_version: number;
  concept_id: string; objective_ids: unknown; policy_version: string; mission_sha256: string;
  issued_at: Date | string; idempotency_key: string; created_at: Date | string;
};
type EventRow = {
  id: string; choice_id: string; correct: boolean; misconception_id: string | null;
  policy_version: string; mission_sha256: string; submitted_at: Date | string;
  reassessment_due_after: Date | string; idempotency_key: string; evidence: unknown;
  created_at: Date | string;
};

function assertScope(tenantId: string, workspaceId: string, studentId: string) {
  if (!SCOPE_PATTERN.test(tenantId) || !SCOPE_PATTERN.test(workspaceId)) throw new Error("academy_v3_scope_invalid");
  if (!UUID_PATTERN.test(studentId)) throw new Error("academy_v3_student_invalid");
}
function assertIdempotency(value: string) {
  if (!IDEMPOTENCY_PATTERN.test(value)) throw new Error("academy_v3_idempotency_invalid");
}
function iso(value: Date | string) { return new Date(value).toISOString(); }

export async function issueAcademyV3MissionAttemptTx(client: PoolClient, input: {
  tenantId: string; workspaceId: string; studentId: string; missionId: string;
  locale: "fa" | "en"; idempotencyKey: string; issuedAt?: Date;
}) {
  assertScope(input.tenantId, input.workspaceId, input.studentId);
  assertIdempotency(input.idempotencyKey);
  const authority = issueAcademyV3MissionAttempt({ missionId: input.missionId, locale: input.locale, issuedAt: input.issuedAt });
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    `academy-v3:${input.tenantId}:${input.workspaceId}:${input.studentId}`, input.idempotencyKey,
  ]);
  const inserted = await client.query<AttemptRow>(
    `INSERT INTO academy_v3_mission_attempts
      (tenant_id,workspace_id,principal_type,principal_id,student_id,locale,mission_id,mission_version,
       concept_id,objective_ids,policy_version,mission_sha256,issued_at,idempotency_key)
     VALUES ($1,$2,'student',$3,$3::uuid,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::timestamptz,$12)
     ON CONFLICT (tenant_id,workspace_id,principal_id,student_id,idempotency_key) DO NOTHING
     RETURNING id::text,locale,mission_id,mission_version,concept_id,objective_ids,policy_version,
               mission_sha256,issued_at,idempotency_key,created_at`,
    [input.tenantId,input.workspaceId,input.studentId,input.locale,authority.missionId,authority.missionVersion,
     authority.conceptId,JSON.stringify(authority.objectiveIds),authority.policyVersion,authority.missionSha256,
     authority.issuedAt,input.idempotencyKey],
  );
  let row = inserted.rows[0];
  let replayed = false;
  if (!row) {
    const existing = await client.query<AttemptRow>(
      `SELECT id::text,locale,mission_id,mission_version,concept_id,objective_ids,policy_version,
              mission_sha256,issued_at,idempotency_key,created_at
         FROM academy_v3_mission_attempts
        WHERE tenant_id=$1 AND workspace_id=$2 AND principal_id=$3 AND student_id=$3::uuid
          AND idempotency_key=$4 LIMIT 1`,
      [input.tenantId,input.workspaceId,input.studentId,input.idempotencyKey],
    );
    row = existing.rows[0];
    if (!row) throw new Error("academy_v3_attempt_replay_missing");
    if (row.locale !== authority.locale || row.mission_id !== authority.missionId ||
        row.mission_version !== authority.missionVersion || row.concept_id !== authority.conceptId ||
        row.policy_version !== authority.policyVersion || row.mission_sha256 !== authority.missionSha256 ||
        JSON.stringify(row.objective_ids) !== JSON.stringify(authority.objectiveIds)) {
      throw new Error("academy_v3_attempt_replay_mismatch");
    }
    replayed = true;
  }
  return { attemptId: row.id, ...authority, issuedAt: iso(row.issued_at), replayed, createdAt: iso(row.created_at) };
}

export async function submitAcademyV3MissionDecisionTx(client: PoolClient, input: {
  tenantId: string; workspaceId: string; studentId: string; attemptId: string;
  choiceId: string; idempotencyKey: string; submittedAt?: Date;
}) {
  assertScope(input.tenantId,input.workspaceId,input.studentId);
  if (!UUID_PATTERN.test(input.attemptId)) throw new Error("academy_v3_attempt_invalid");
  assertIdempotency(input.idempotencyKey);
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    `academy-v3-decision:${input.tenantId}:${input.workspaceId}:${input.attemptId}`, input.idempotencyKey,
  ]);
  const attempts = await client.query<AttemptRow>(
    `SELECT id::text,locale,mission_id,mission_version,concept_id,objective_ids,policy_version,
            mission_sha256,issued_at,idempotency_key,created_at
       FROM academy_v3_mission_attempts
      WHERE id=$1::uuid AND tenant_id=$2 AND workspace_id=$3 AND principal_id=$4 AND student_id=$4::uuid
      LIMIT 1 FOR SHARE`,
    [input.attemptId,input.tenantId,input.workspaceId,input.studentId],
  );
  const attempt = attempts.rows[0];
  if (!attempt) throw new Error("academy_v3_attempt_not_found");
  if (attempt.policy_version !== ACADEMY_V3_MISSION_ATTEMPT_POLICY_VERSION || attempt.mission_version !== 1) {
    throw new Error("academy_v3_mission_attempt_stale");
  }
  const evaluated = evaluateAcademyV3MissionDecision({
    attempt: { missionId: attempt.mission_id, missionVersion: attempt.mission_version, conceptId: attempt.concept_id,
      objectiveIds: attempt.objective_ids as string[], locale: attempt.locale, policyVersion: ACADEMY_V3_MISSION_ATTEMPT_POLICY_VERSION,
      issuedAt: iso(attempt.issued_at), missionSha256: attempt.mission_sha256 },
    choiceId: input.choiceId, submittedAt: input.submittedAt,
  });
  const evidence = {
    authority: ACADEMY_V3_MISSION_ATTEMPT_POLICY_VERSION, attemptId: attempt.id,
    missionId: evaluated.missionId, missionVersion: evaluated.missionVersion, conceptId: evaluated.conceptId,
    objectiveIds: evaluated.objectiveIds, choiceId: evaluated.choiceId, correct: evaluated.correct,
    misconceptionId: evaluated.misconceptionId, authorityEffects: evaluated.authorityEffects,
  };
  const inserted = await client.query<EventRow>(
    `INSERT INTO academy_v3_mission_decision_events
      (attempt_id,tenant_id,workspace_id,principal_type,principal_id,student_id,choice_id,correct,
       misconception_id,evidence_kind,policy_version,mission_sha256,submitted_at,reassessment_due_after,
       idempotency_key,evidence)
     VALUES ($1::uuid,$2,$3,'student',$4,$4::uuid,$5,$6,$7,'scenario',$8,$9,$10::timestamptz,
             $11::timestamptz,$12,$13::jsonb)
     ON CONFLICT (tenant_id,workspace_id,attempt_id,idempotency_key) DO NOTHING
     RETURNING id::text,choice_id,correct,misconception_id,policy_version,mission_sha256,submitted_at,
               reassessment_due_after,idempotency_key,evidence,created_at`,
    [attempt.id,input.tenantId,input.workspaceId,input.studentId,evaluated.choiceId,evaluated.correct,
     evaluated.misconceptionId,evaluated.policyVersion,evaluated.missionSha256,evaluated.submittedAt,
     evaluated.reassessment.dueAfter,input.idempotencyKey,JSON.stringify(evidence)],
  );
  let row = inserted.rows[0];
  let replayed = false;
  if (!row) {
    const existing = await client.query<EventRow>(
      `SELECT id::text,choice_id,correct,misconception_id,policy_version,mission_sha256,submitted_at,
              reassessment_due_after,idempotency_key,evidence,created_at
         FROM academy_v3_mission_decision_events
        WHERE tenant_id=$1 AND workspace_id=$2 AND attempt_id=$3::uuid AND idempotency_key=$4 LIMIT 1`,
      [input.tenantId,input.workspaceId,attempt.id,input.idempotencyKey],
    );
    row = existing.rows[0];
    if (!row) throw new Error("academy_v3_decision_replay_missing");
    if (row.choice_id !== evaluated.choiceId || row.correct !== evaluated.correct ||
        row.misconception_id !== evaluated.misconceptionId || row.policy_version !== evaluated.policyVersion ||
        row.mission_sha256 !== evaluated.missionSha256) throw new Error("academy_v3_decision_replay_mismatch");
    replayed = true;
  }
  return {
    eventId: row.id, attemptId: attempt.id, choiceId: row.choice_id, correct: Boolean(row.correct),
    misconceptionId: row.misconception_id, evidenceKind: "scenario" as const, policyVersion: row.policy_version,
    missionSha256: row.mission_sha256, submittedAt: iso(row.submitted_at),
    reassessmentDueAfter: iso(row.reassessment_due_after), authorityEffects: evaluated.authorityEffects,
    replayed, createdAt: iso(row.created_at),
  };
}
