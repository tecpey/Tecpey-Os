import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient, QueryResult } from "pg";
import {
  ACADEMY_DAILY_REPAIR_POLICY_VERSION,
  assignDailyRepairChallengeTx,
  completeDailyRepairChallengeTx,
} from "../../lib/academy-daily-repair-challenge-authority";
import { ACADEMY_DAILY_REPAIR_CHALLENGES_SQL } from "../../lib/db-migrate-academy-daily-repair-challenges";

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}

const studentId = "11111111-1111-4111-8111-111111111111";
const challengeId = "22222222-2222-4222-8222-222222222222";
const signal = {
  id: "77",
  source_type: "arena",
  source_id: "arena-attempt-77",
  concept_tag: "position-sizing",
  strength: -80,
  confidence: 91,
  observed_at: "2026-08-14T08:00:00.000Z",
};

describe("Academy daily repair challenge authority", () => {
  it("assigns one deterministic daily challenge from the latest scoped weakness signal", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("FROM academy_mastery_weakness_signals")) return result([signal]);
        if (sql.includes("INSERT INTO academy_daily_repair_challenges")) {
          return result([{
            id: challengeId,
            challenge_date: values?.[4],
            concept_tag: values?.[8],
            challenge_key: values?.[9],
            question_payload: JSON.parse(String(values?.[10])),
            expected_answer: JSON.parse(String(values?.[11])),
            evidence_sha256: values?.[13],
            policy_version: values?.[12],
            created_at: "2026-08-15T00:00:00.000Z",
          }]);
        }
        return result([]);
      },
    } as unknown as PoolClient;

    const assigned = await assignDailyRepairChallengeTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      studentId,
      locale: "fa",
      challengeDate: new Date("2026-08-15T00:00:00.000Z"),
    });

    assert.equal(assigned.assigned, true);
    assert.equal(assigned.challenge.challengeKey, "daily-repair:fa:2026-08-15:position-sizing");
    assert.equal(assigned.challenge.question.conceptTag, "position-sizing");
    assert.equal(assigned.challenge.policyVersion, ACADEMY_DAILY_REPAIR_POLICY_VERSION);
    const insert = calls.find(({ sql }) => sql.includes("INSERT INTO academy_daily_repair_challenges"));
    assert.equal(insert?.values?.[0], "tenant-a");
    assert.equal(insert?.values?.[1], "workspace-a");
    assert.equal(insert?.values?.[2], studentId);
    assert.equal(insert?.values?.[5], "77");
    const evidence = JSON.parse(String(insert?.values?.[14]));
    assert.equal(evidence.authority, ACADEMY_DAILY_REPAIR_POLICY_VERSION);
    assert.equal(evidence.sourceType, "arena");
    assert.equal(evidence.conceptTag, "position-sizing");
  });

  it("preserves locale and date in daily assignment idempotency keys for maximum-length scopes", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("FROM academy_mastery_weakness_signals")) return result([signal]);
        if (sql.includes("INSERT INTO academy_daily_repair_challenges")) {
          return result([{
            id: challengeId,
            challenge_date: values?.[4],
            concept_tag: values?.[8],
            challenge_key: values?.[9],
            question_payload: JSON.parse(String(values?.[10])),
            expected_answer: JSON.parse(String(values?.[11])),
            evidence_sha256: values?.[13],
            policy_version: values?.[12],
            created_at: "2026-08-15T00:00:00.000Z",
          }]);
        }
        return result([]);
      },
    } as unknown as PoolClient;
    const tenantId = `t${"a".repeat(63)}`;
    const workspaceId = `w${"b".repeat(63)}`;

    await assignDailyRepairChallengeTx(client, {
      tenantId,
      workspaceId,
      studentId,
      locale: "fa",
      challengeDate: new Date("2026-08-15T00:00:00.000Z"),
    });
    await assignDailyRepairChallengeTx(client, {
      tenantId,
      workspaceId,
      studentId,
      locale: "en",
      challengeDate: new Date("2026-08-16T00:00:00.000Z"),
    });

    const keys = calls
      .filter(({ sql }) => sql.includes("INSERT INTO academy_daily_repair_challenges"))
      .map(({ values }) => String(values?.[15]));
    assert.equal(keys.length, 2);
    assert.notEqual(keys[0], keys[1]);
    assert.match(keys[0] ?? "", /^daily-repair:11111111-1111-4111-8111-111111111111:fa:2026-08-15:[a-f0-9]{48}$/);
    assert.match(keys[1] ?? "", /^daily-repair:11111111-1111-4111-8111-111111111111:en:2026-08-16:[a-f0-9]{48}$/);
    assert.ok(keys.every((key) => key.length <= 180));
  });

  it("grades completion server-side and replays the same idempotency key exactly", async () => {
    let eventAnswerSha256 = "";
    const expected = {
      type: "single",
      value: "Write the rule, risk limit, evidence source and stop condition before acting",
    };
    const question = {
      id: "daily-repair-position-sizing",
      type: "single",
      question: "What should you do?",
      options: [expected.value],
      correctAnswer: expected.value,
      explanation: "Process before action.",
      difficulty: "medium",
      conceptTag: "position-sizing",
    };
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        if (sql.includes("FROM academy_daily_repair_challenges")) {
          return result([{
            id: challengeId,
            challenge_date: "2026-08-15",
            concept_tag: "position-sizing",
            challenge_key: "daily-repair:en:2026-08-15:position-sizing",
            question_payload: question,
            expected_answer: expected,
            evidence_sha256: "a".repeat(64),
            policy_version: ACADEMY_DAILY_REPAIR_POLICY_VERSION,
            created_at: "2026-08-15T00:00:00.000Z",
          }]);
        }
        if (sql.includes("INSERT INTO academy_daily_repair_challenge_events")) {
          eventAnswerSha256 = String(values?.[7]);
          return result([{
            id: "91",
            answer_sha256: values?.[7],
            passed: values?.[8],
            created_at: "2026-08-15T00:02:00.000Z",
          }]);
        }
        return result([]);
      },
    } as unknown as PoolClient;

    const completed = await completeDailyRepairChallengeTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      studentId,
      locale: "en",
      challengeId,
      answer: expected.value,
      idempotencyKey: "completion:2026-08-15",
    });

    assert.equal(completed.passed, true);
    assert.equal(completed.replayed, false);
    assert.equal(completed.eventId, "91");
    assert.equal(completed.answerSha256, eventAnswerSha256);
  });

  it("makes the daily repair ledger tenant-scoped, idempotent and append-only", () => {
    assert.match(ACADEMY_DAILY_REPAIR_CHALLENGES_SQL, /CREATE TABLE IF NOT EXISTS academy_daily_repair_challenges/);
    assert.match(ACADEMY_DAILY_REPAIR_CHALLENGES_SQL, /CREATE TABLE IF NOT EXISTS academy_daily_repair_challenge_events/);
    assert.match(ACADEMY_DAILY_REPAIR_CHALLENGES_SQL, /UNIQUE \(tenant_id, workspace_id, student_id, locale, challenge_date\)/);
    assert.match(ACADEMY_DAILY_REPAIR_CHALLENGES_SQL, /UNIQUE \(tenant_id, workspace_id, idempotency_key\)/);
    assert.match(ACADEMY_DAILY_REPAIR_CHALLENGES_SQL, /REFERENCES platform_principal_bindings/);
    assert.match(ACADEMY_DAILY_REPAIR_CHALLENGES_SQL, /academy_daily_repair_challenges_no_update/);
    assert.match(ACADEMY_DAILY_REPAIR_CHALLENGES_SQL, /academy_daily_repair_challenge_events_no_update/);
  });
});
