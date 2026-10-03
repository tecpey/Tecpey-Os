import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");

async function routeSource(): Promise<string> {
  return readFile(path.join(ROOT, "src/app/api/academy-v3/missions/route.ts"), "utf8");
}

describe("Academy V3 mission route authority", () => {
  it("fails closed through the canonical session, CSRF, tenant principal, scope and product gates", async () => {
    const route = await routeSource();
    assert.match(route, /verifyCsrfOrigin\(req\)/);
    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /if \(!session\.studentId\)/);
    assert.match(route, /resolveTenantPrincipalContext\(\{/);
    assert.match(route, /requiredPrincipalType: "student"/);
    assert.match(route, /scopes: \["academy:missions:write"\]/);
    assert.match(route, /if \(!tenantContext\.available\)/);
    assert.match(route, /requireTenantProduct\(tenantContext\.tenantId, "academy"\)/);
    assert.doesNotMatch(route, /getStudentSessionFromRequest/);
  });

  it("bounds and strictly validates the command surface before authority execution", async () => {
    const route = await routeSource();
    assert.match(route, /readBoundedJsonRequest<Record<string, unknown>>\(req, \{ maxBytes: 2_048 \}\)/);
    assert.match(route, /unsupported_query_parameter/);
    assert.match(route, /exactKeys\(body, \["action","locale","missionId"\]\)/);
    assert.match(route, /exactKeys\(body, \["action","attemptId","choiceId"\]\)/);
    assert.match(route, /IDEMPOTENCY_KEY\.test\(idempotencyKey\)/);
    assert.match(route, /MISSION_ID\.test\(body\.missionId\)/);
    assert.match(route, /UUID\.test\(body\.attemptId\)/);
    assert.match(route, /CHOICE_ID\.test\(body\.choiceId\)/);
  });

  it("rate-limits the bound student and keeps writes inside transaction-owned server authority", async () => {
    const route = await routeSource();
    assert.match(route, /rateLimit\(req, \{ namespace: "academy-v3-mission-write", identity: session\.studentId, limit: 30, windowMs: 60_000 \}\)/);
    assert.match(route, /withTx\(\(client\) => issueAcademyV3MissionAttemptTx\(client,/);
    assert.match(route, /withTx\(\(client\) => submitAcademyV3MissionDecisionTx\(client,/);
    assert.match(route, /studentId: tenantContext\.principalId/);
    assert.doesNotMatch(route, /studentId:\s*body\./);
    assert.doesNotMatch(route, /correct:\s*body\./);
    assert.doesNotMatch(route, /mastery/i);
  });

  it("exposes deterministic replay semantics without caching private authority responses", async () => {
    const route = await routeSource();
    assert.match(route, /result\.value\.replayed \? 200 : 201/g);
    assert.match(route, /code\.endsWith\("_replay_mismatch"\)/);
    assert.match(route, /apiError\(code, 409\)/);
    assert.match(route, /Cache-Control", "private, no-store"/);
    assert.match(route, /Vary", "Cookie"/);
  });

  it("keeps unknown/stale mission commands conflict-safe and storage failures unavailable", async () => {
    const route = await routeSource();
    assert.match(route, /academy_v3_mission_unknown/);
    assert.match(route, /academy_v3_choice_unknown/);
    assert.match(route, /academy_v3_mission_attempt_stale/);
    assert.match(route, /apiError\("academy_v3_unavailable", 503\)/);
  });
});
