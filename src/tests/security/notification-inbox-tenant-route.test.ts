import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

// Source guards for the two routes whose tenant now has to come from the
// request rather than from a default.
//
// Both were found by review on the notification_center slice, and both are the
// same shape: a boundary was added to the row while the caller still resolved
// its tenant implicitly, so the boundary either excluded everything or asserted
// ownership that was not true. A source guard is the right instrument here
// because the failure is a missing argument, not a value a query can observe.

const ROOT = path.resolve(import.meta.dirname, "../../..");

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

describe("Notification inbox tenant routes", () => {
  it("resolves the inbox principal in the request's verified tenant", async () => {
    const route = await source("src/app/api/notifications/route.ts");

    // resolveNotificationPrincipal defaults to the platform tenant when no
    // tenant is supplied. With notification_center scoped (migration 0071),
    // that default meant a non-default tenant's inbox could never drain.
    assert.match(route, /resolveTenantPrincipalContext\(\{/);
    assert.match(
      route,
      /resolveNotificationPrincipal\(client, identity, tenantContext\.tenantId\)/,
    );
    assert.doesNotMatch(
      route,
      /resolveNotificationPrincipal\(client, identity\)/,
      "the inbox principal must never be resolved without a tenant",
    );
    assert.match(route, /if \(!tenantContext\.available\)/);
  });

  it("selects campaign recipients through the operator's own bindings", async () => {
    const route = await source("src/app/api/command-center/campaign/route.ts");

    // academy_students has no tenant column, so a global SELECT stamped with the
    // admin's tenant would omit that tenant's students behind the LIMIT and mint
    // undeliverable rows for students who are not in it — reported as sent.
    assert.match(route, /JOIN platform_principal_bindings b/);
    assert.match(route, /b\.tenant_id = \$1/);
    assert.match(route, /b\.workspace_id = \$2/);
    assert.match(route, /b\.status = 'active'/);
    assert.match(
      route,
      /\[authorization\.principal\.tenantId, authorization\.principal\.workspaceId\]/,
    );
    assert.doesNotMatch(
      route,
      /SELECT id FROM academy_students/,
      "campaign recipients must not be selected across every tenant",
    );
  });
});
