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
    // The write path now carries the workspace as well as the tenant. Both must
    // come from the resolved context: defaulting the workspace filed the derived
    // learning event under 'main', which the composite principal binding rejects
    // (audit finding F-13). Pinning the pair keeps a future edit from dropping
    // back to the tenant alone.
    assert.match(
      route,
      /createBrainNotification\(client, tenantContext\.principalId, locale, \{\s*tenantId: tenantContext\.tenantId,\s*workspaceId: tenantContext\.workspaceId,\s*\}\)/,
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
