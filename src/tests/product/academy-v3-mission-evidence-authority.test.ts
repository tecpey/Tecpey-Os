import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient, QueryResult } from "pg";
import {
  issueAcademyV3MissionAttemptTx,
  submitAcademyV3MissionDecisionTx,
} from "../../lib/academy-v3-mission-evidence-authority";

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}
const studentId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const missionId = "MISSION.T6.NO_TRADE.INSUFFICIENT_EVIDENCE";
const issuedAt = new Date("2026-09-25T12:00:00.000Z");

describe("Academy V3 mission evidence DB authority", () => {
  it("issues server-derived attempts and exact-replays the same key", async () => {
    let inserted: Record<string, unknown> | undefined;
    const client = { query: async (sql: string, values?: unknown[]) => {
      if (sql.includes("pg_advisory_xact_lock")) return result([]);
      if (sql.includes("INSERT INTO academy_v3_mission_attempts")) {
        inserted = { id: attemptId, locale: values?.[3], mission_id: values?.[4], mission_version: values?.[5],
          concept_id: values?.[6], objective_ids: JSON.parse(String(values?.[7])), policy_version: values?.[8],
          mission_sha256: values?.[9], issued_at: values?.[10], idempotency_key: values?.[11], created_at: values?.[10] };
        return result([inserted]);
      }
      return result([]);
    }} as unknown as PoolClient;
    const first = await issueAcademyV3MissionAttemptTx(client, {
      tenantId:"tenant-a",workspaceId:"workspace-a",studentId,missionId,locale:"fa",
      idempotencyKey:"attempt:one",issuedAt,
    });
    assert.equal(first.replayed,false);
    assert.equal(first.attemptId,attemptId);
    assert.equal(first.missionId,missionId);
    assert.equal(first.missionSha256,String(inserted?.mission_sha256));
  });

  it("rejects attempt idempotency replay with a different canonical payload", async () => {
    let inserts = 0;
    const client = { query: async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return result([]);
      if (sql.includes("INSERT INTO academy_v3_mission_attempts")) { inserts++; return result([]); }
      if (sql.includes("FROM academy_v3_mission_attempts")) return result([{
        id:attemptId,locale:"en",mission_id:missionId,mission_version:1,concept_id:"T6.NO_TRADE",
        objective_ids:["O.NOTRADE.IDENTIFY","O.NOTRADE.DEFEND"],policy_version:"academy-v3-mission-attempt-v1",
        mission_sha256:"0".repeat(64),issued_at:issuedAt.toISOString(),idempotency_key:"attempt:one",created_at:issuedAt.toISOString(),
      }]);
      return result([]);
    }} as unknown as PoolClient;
    await assert.rejects(issueAcademyV3MissionAttemptTx(client,{
      tenantId:"tenant-a",workspaceId:"workspace-a",studentId,missionId,locale:"fa",
      idempotencyKey:"attempt:one",issuedAt,
    }),/academy_v3_attempt_replay_mismatch/);
    assert.equal(inserts,1);
  });

  it("grades decisions on the server and records no mastery, league, credential or financial authority", async () => {
    const { issueAcademyV3MissionAttempt } = await import("../../lib/academy-v3-mission-authority");
    const canonical = issueAcademyV3MissionAttempt({missionId,locale:"en",issuedAt});
    const client = { query: async (sql: string, values?: unknown[]) => {
      if (sql.includes("pg_advisory_xact_lock")) return result([]);
      if (sql.includes("FROM academy_v3_mission_attempts")) return result([{
        id:attemptId,locale:"en",mission_id:canonical.missionId,mission_version:canonical.missionVersion,
        concept_id:canonical.conceptId,objective_ids:canonical.objectiveIds,policy_version:canonical.policyVersion,
        mission_sha256:canonical.missionSha256,issued_at:canonical.issuedAt,idempotency_key:"attempt:one",created_at:canonical.issuedAt,
      }]);
      if (sql.includes("INSERT INTO academy_v3_mission_decision_events")) return result([{
        id:"33333333-3333-4333-8333-333333333333",choice_id:values?.[4],correct:values?.[5],
        misconception_id:values?.[6],policy_version:values?.[7],mission_sha256:values?.[8],
        submitted_at:values?.[9],reassessment_due_after:values?.[10],idempotency_key:values?.[11],
        evidence:JSON.parse(String(values?.[12])),created_at:values?.[9],
      }]);
      return result([]);
    }} as unknown as PoolClient;
    const decision = await submitAcademyV3MissionDecisionTx(client,{
      tenantId:"tenant-a",workspaceId:"workspace-a",studentId,attemptId,choiceId:"no-trade-yet",
      idempotencyKey:"decision:one",submittedAt:new Date("2026-09-25T12:01:00.000Z"),
    });
    assert.equal(decision.correct,true);
    assert.deepEqual(decision.authorityEffects,{grantsMastery:false,grantsLeagueScore:false,grantsCredential:false,grantsFinancialValue:false});
    assert.equal(decision.replayed,false);
  });

  it("rejects decision replay when the same key is reused for a different choice", async () => {
    const { issueAcademyV3MissionAttempt } = await import("../../lib/academy-v3-mission-authority");
    const canonical = issueAcademyV3MissionAttempt({missionId,locale:"en",issuedAt});
    const client = { query: async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return result([]);
      if (sql.includes("FROM academy_v3_mission_attempts")) return result([{
        id:attemptId,locale:"en",mission_id:canonical.missionId,mission_version:canonical.missionVersion,
        concept_id:canonical.conceptId,objective_ids:canonical.objectiveIds,policy_version:canonical.policyVersion,
        mission_sha256:canonical.missionSha256,issued_at:canonical.issuedAt,idempotency_key:"attempt:one",created_at:canonical.issuedAt,
      }]);
      if (sql.includes("INSERT INTO academy_v3_mission_decision_events")) return result([]);
      if (sql.includes("FROM academy_v3_mission_decision_events")) return result([{
        id:"33333333-3333-4333-8333-333333333333",choice_id:"no-trade-yet",correct:true,misconception_id:null,
        policy_version:canonical.policyVersion,mission_sha256:canonical.missionSha256,
        submitted_at:"2026-09-25T12:01:00.000Z",reassessment_due_after:"2026-09-26T12:01:00.000Z",
        idempotency_key:"decision:one",evidence:{},created_at:"2026-09-25T12:01:00.000Z",
      }]);
      return result([]);
    }} as unknown as PoolClient;
    await assert.rejects(submitAcademyV3MissionDecisionTx(client,{
      tenantId:"tenant-a",workspaceId:"workspace-a",studentId,attemptId,choiceId:"enter-now",
      idempotencyKey:"decision:one",submittedAt:new Date("2026-09-25T12:02:00.000Z"),
    }),/academy_v3_decision_replay_mismatch/);
  });
});
