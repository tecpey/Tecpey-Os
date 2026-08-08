import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const route = readFileSync("src/app/api/notification-brain/route.ts", "utf8");

describe("notification brain route tenant authority", () => {
  it("derives notification brain tenant from the bound student principal", () => {
    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /resolveTenantPrincipalContext\(\{/);
    assert.match(route, /requiredPrincipalType: "student"/);
    assert.match(route, /scopes: \["academy:notification-brain:read"\]/);
    assert.match(route, /scopes: \["academy:notification-brain:write"\]/);
    assert.match(
      route,
      /buildNotificationBrain\(client, tenantContext\.principalId, locale, tenantContext\.tenantId\)/,
    );
    assert.match(
      route,
      /createBrainNotification\(client, tenantContext\.principalId, locale, tenantContext\.tenantId\)/,
    );
  });

  it("does not write notification brain snapshots under an unbound default tenant", () => {
    assert.doesNotMatch(route, /buildNotificationBrain\(client, session\.studentId, locale\)/);
    assert.doesNotMatch(route, /createBrainNotification\(client, session\.studentId, locale\)/);
    assert.doesNotMatch(route, /getStudentSessionFromRequest/);
    assert.match(route, /notification_brain_unavailable/);
  });

  it("marks personalized notification brain responses private and cookie-varying", () => {
    assert.match(route, /Cache-Control", "private, no-store"/);
    assert.match(route, /Vary", "Cookie"/);
  });
});
