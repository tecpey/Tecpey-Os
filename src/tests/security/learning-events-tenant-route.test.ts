import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const route = readFileSync("src/app/api/learning-events/route.ts", "utf8");

describe("learning events route tenant authority", () => {
  it("derives event writes from the bound student tenant context", () => {
    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /resolveTenantPrincipalContext\(\{/);
    assert.match(route, /requiredPrincipalType: "student"/);
    assert.match(route, /scopes: \["academy:learning-events:write"\]/);
    assert.match(route, /recordLearningEvent\(client, \{/);
    assert.match(route, /studentId: tenantContext\.principalId/);
    assert.match(route, /tenantId: tenantContext\.tenantId/);
  });

  it("does not persist client learning events under an unbound default tenant", () => {
    assert.doesNotMatch(route, /getStudentSessionFromRequest/);
    assert.doesNotMatch(route, /studentId: session\.studentId/);
    assert.doesNotMatch(route, /tenantId: PLATFORM\.DEFAULT_TENANT_ID/);
    assert.match(route, /learning_events_unavailable/);
  });

  it("keeps personalized write responses private and cookie-varying", () => {
    assert.match(route, /Cache-Control", "private, no-store"/);
    assert.match(route, /Vary", "Cookie"/);
  });
});
