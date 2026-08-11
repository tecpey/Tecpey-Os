import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const route = readFileSync("src/app/api/learning-events/route.ts", "utf8");
const tenantAwareProducerRoutes = [
  "src/app/api/academy-simulator-decision/route.ts",
  "src/app/api/mentor-challenge/route.ts",
  "src/app/api/notifications/read/route.ts",
  "src/app/api/trading-arena/route.ts",
  "src/app/api/trading-arena/execution/route.ts",
  "src/app/api/trading-arena/reflections/route.ts",
];

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

  it("keeps production learning-event producers tenant-bound before writing events", () => {
    for (const file of tenantAwareProducerRoutes) {
      const source = readFileSync(file, "utf8");
      assert.match(source, /resolveTenantPrincipalContext\(\{/, `${file} must resolve a tenant principal context`);
      assert.match(source, /requiredPrincipalType: "student"/, `${file} must bind student principals`);
      assert.match(source, /scopes: \["academy:learning-events:write"\]/, `${file} must declare the learning-events write scope`);
      assert.match(source, /tenantId: tenantContext\.tenantId/, `${file} must pass tenantId into recordLearningEvent`);
      assert.doesNotMatch(source, /recordLearningEvent\(client,\s*\{\s*studentId:\s*session\.studentId/, `${file} must not write events from the raw session student`);
    }
  });
});
