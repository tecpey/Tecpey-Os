import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

// Source guards for routes whose tenant has to come from the request rather
// than from a default.
//
// They all share one shape, which is the recurring mistake of this whole
// tenant-boundary programme: a boundary gets added to a row while some caller
// still resolves its tenant implicitly, so the boundary either excludes
// everything, or asserts an ownership that is not true, or silently reads across
// tenants. Two of these were found by review; the third was found by walking the
// chain afterwards rather than waiting to be told.
//
// A source guard is the right instrument here because each failure is a missing
// argument or a predicate that is simply absent — not a value a query can
// observe once the argument is gone.

const ROOT = path.resolve(import.meta.dirname, "../../..");

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

describe("Tenant-scoped route guards", () => {
  it("reads the student certificate list inside the acting tenant", async () => {
    const route = await source("src/app/api/academy-certificates/route.ts");

    // academy_certificates gained a tenant boundary in migration 0070, but the
    // student's own list was still keyed by student_id alone, so a student bound
    // to two tenants saw both tenants' certificates in whichever one they opened.
    assert.match(route, /WHERE tenant_id = \$2 AND workspace_id = \$3 AND student_id = \$1::uuid/);
    assert.doesNotMatch(
      route,
      /FROM academy_certificates WHERE student_id = \$1::uuid/,
      "the certificate list must not be read across every tenant",
    );
    assert.doesNotMatch(
      route,
      /getStudentSessionFromRequest/,
      "a retired legacy cookie must not carry a tenant-scoped read",
    );
    // Strict revocation fails closed to a guest when the revocation store is
    // unreachable, so that guest is a fallback rather than a fact and the read
    // must report itself degraded — the silent degradation F-2 exists to
    // prevent. The discriminator has to be the session's own outage flag:
    // cookie presence cannot distinguish an unreachable authority from a valid
    // account-only session, an expired cookie or a revoked one, all of which
    // genuinely have nothing to list.
    assert.match(route, /if \(session\.authorityDegraded\)/);
    assert.doesNotMatch(
      route,
      /req\.cookies\.get\(UNIFIED_SESSION_COOKIE\)/,
      "cookie presence must not be used as an outage signal",
    );
  });

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

// Routes that serve a product have to check the acting tenant's entitlement
// (multi-tenant #20, section 3.3).
//
// platform_tenants.products[] existed for the whole programme and was read by
// nothing, so a tenant provisioned without Academy was served every Academy
// route exactly like one that bought it. The gate is one call, which is exactly
// the kind of thing a new handler forgets — so the count of gates is pinned to
// the count of resolved tenants rather than merely asserting one is present.

const PRODUCT_ROUTES: ReadonlyArray<{ route: string; product: string }> = [
  { route: "src/app/api/academy-certificates/route.ts", product: "academy" },
  { route: "src/app/api/academy-lesson-assessment/route.ts", product: "academy" },
  { route: "src/app/api/academy-mastery-seasons/route.ts", product: "academy" },
  { route: "src/app/api/academy-simulator-decision/route.ts", product: "academy" },
  { route: "src/app/api/academy-term-progress/route.ts", product: "academy" },
  { route: "src/app/api/mentor-challenge/route.ts", product: "mentor" },
];

describe("Tenant product entitlement route guards", () => {
  for (const { route, product } of PRODUCT_ROUTES) {
    it(`gates ${route.replace("src/app/api/", "").replace("/route.ts", "")} on the ${product} entitlement`, async () => {
      const text = await source(route);

      const resolved = text.match(/await resolveTenantPrincipalContext\(/g) ?? [];
      const gated = text.match(/await requireTenantProduct\(/g) ?? [];
      assert.equal(
        gated.length,
        resolved.length,
        "every handler that resolves an acting tenant must also check its entitlement",
      );
      assert.ok(resolved.length > 0, "this route is expected to resolve a tenant");

      // The entitlement has to be read for the tenant the request acts in. A
      // literal or a default here would gate every tenant on one tenant's
      // purchase, which is the whole failure this guards against.
      const calls = text.match(/requireTenantProduct\(([^)]*)\)/g) ?? [];
      assert.equal(calls.length, gated.length);
      for (const call of calls) {
        assert.match(call, /tenantContext\.tenantId/, call);
        assert.match(call, new RegExp(`"${product}"`), call);
      }
      assert.doesNotMatch(
        text,
        /requireTenantProduct\(\s*PLATFORM\./,
        "the entitlement must not be read for the platform default tenant",
      );
    });
  }
});
