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

  // The student_global reads that were still on the legacy student session
  // (classification registry, #20). Each read one of these tables by a student
  // id that came from getStudentSessionFromRequest — no binding check, no strict
  // revocation, no tenant — so a student bound to two tenants saw their own data
  // under whichever tenant they opened. Each now resolves the acting tenant,
  // which only names a student the session's principal is bound to, and reads
  // from that bound principal.
  const MIGRATED_GLOBAL_READS: ReadonlyArray<{ route: string; table: string }> = [
    { route: "src/app/api/academy-simulator-decision/route.ts", table: "academy_simulator_decisions" },
    { route: "src/app/api/achievements/route.ts", table: "student_achievements" },
    { route: "src/app/api/mentor-challenge/route.ts", table: "mentor_challenge_attempts" },
    { route: "src/app/api/mentor-conversations/route.ts", table: "mentor_conversations" },
    { route: "src/app/api/mentor-insights/route.ts", table: "mentor_insights" },
    { route: "src/app/api/mentor-memory/route.ts", table: "mentor_memories" },
  ];

  for (const { route, table } of MIGRATED_GLOBAL_READS) {
    const name = route.replace("src/app/api/", "").replace("/route.ts", "");
    it(`reads ${name} from the bound principal, not the legacy session`, async () => {
      const text = await source(route);

      // The legacy student session carried no binding and no strict revocation.
      // It must be gone from these files entirely, so no read can slip back onto
      // it — the same call the certificate-list migration retired.
      assert.doesNotMatch(
        text,
        /getStudentSessionFromRequest/,
        `${name} must not resolve a student from the retired legacy session`,
      );
      // The read resolves the acting tenant with the request in hand, so a bound
      // white-label host is honoured and an unbound student is refused.
      assert.match(text, /await resolveTenantPrincipalContext\(/, name);
      assert.match(text, /request: req/, `${name} must pass the request to the resolver`);
      assert.match(
        text,
        /requiredPrincipalType: "student"/,
        `${name} must resolve the student principal`,
      );
      // And the student id the query keys on comes from the resolved binding,
      // never from a session field that skipped it.
      assert.match(
        text,
        /tenantContext\.principalId/,
        `${name} must read from the bound principal id`,
      );
      // This is the student_global table the migration is about; the route is
      // expected to actually read it, so the guard is pinned to the right file.
      assert.ok(text.includes(table), `${name} must read ${table}`);
    });
  }

  it("only reports a degraded achievements read for a genuine storage outage", async () => {
    // A missing, revoked, or workspace-mismatched binding, or a foreign branded
    // host, are ordinary authorization outcomes — not outages. Degrading on them
    // would tell the student their history is coming back after a service blip
    // and fire a false operational alert (#431 review). The route must gate the
    // degraded report on the storage-unavailable reason specifically.
    const text = await source("src/app/api/achievements/route.ts");
    assert.match(
      text,
      /tenantContext\.reason === "binding_storage_unavailable"/,
      "achievements must degrade only on a storage outage, not on any unavailable reason",
    );
    // The unconditional form the review flagged — degrading on every
    // not-available reason — must be gone.
    assert.doesNotMatch(
      text,
      /if \(!tenantContext\.available\) \{\s*recordDegradedRead/,
      "achievements must not record degraded for every unavailable tenant context",
    );
  });

  // The mentor reads signal an outage with storage:"unavailable" (the shape they
  // already used for a storage-down read) rather than recordDegradedRead, but the
  // same two lies must be foreclosed (#434 review): a degraded revocation
  // authority must not be turned into a 401 that tells a valid user their profile
  // is gone, and an unreadable binding must not be turned into an ordinary empty.
  const MENTOR_DEGRADED_READS: ReadonlyArray<{ route: string; empty: string }> = [
    { route: "src/app/api/mentor-conversations/route.ts", empty: "conversations: [], nextCursor: null" },
    { route: "src/app/api/mentor-insights/route.ts", empty: "insights: [], profile: null" },
    { route: "src/app/api/mentor-memory/route.ts", empty: "memories: []" },
  ];
  for (const { route, empty } of MENTOR_DEGRADED_READS) {
    const name = route.replace("src/app/api/", "").replace("/route.ts", "");
    it(`distinguishes an outage from an empty read in ${name}`, async () => {
      const text = await source(route);
      // A degraded revocation authority returns a guest with authorityDegraded
      // and no studentId; that outage must be handled before the 401, not as one.
      assert.match(
        text,
        /if \(session\.authorityDegraded\)/,
        `${name} must treat a degraded revocation authority as an outage, not a 401`,
      );
      // And an unreadable binding must preserve the storage signal, while every
      // ordinary authorization outcome stays an honest empty.
      assert.match(
        text,
        /tenantContext\.reason === "binding_storage_unavailable"/,
        `${name} must degrade only on a storage outage, not on any unavailable reason`,
      );
      // The bare unconditional empty the review flagged — collapsing every
      // not-available reason into a plain empty with no storage signal — must be
      // gone. The empty payload must only ever appear alongside a reason branch.
      assert.doesNotMatch(
        text,
        new RegExp(`if \\(!tenantContext\\.available\\) return apiOk\\(\\{ ${empty.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\}\\)`),
        `${name} must not collapse every unavailable tenant context into a plain empty`,
      );
    });
  }
});

// Routes that serve a product have to check the acting tenant's entitlement
// (multi-tenant #20, section 3.3).
//
// platform_tenants.products[] existed for the whole programme and was read by
// nothing, so a tenant provisioned without Academy was served every Academy
// route exactly like one that bought it.
//
// The first version of this test pinned a hand-written allowlist of six routes,
// and review (#429, Codex P1) rightly called that bypassable: any tenant-
// resolving route left off the list serves its product ungated and the test
// stays green. So the surface is now DERIVED. Every route that resolves an
// acting tenant is discovered from source and must be accounted for — either it
// gates its product, or it is listed as an explicit, reasoned exemption. A new
// tenant-resolving route that is neither fails this test, which is the whole
// point: the contract can no longer be bypassed by omission.
//
// The product a route gates on is NOT derivable from its scope string —
// mentor-challenge carries an `academy:` scope but is a Mentor feature — so the
// map is explicit. What is derived is COMPLETENESS: the union of the gated map
// and the exemptions must equal the set of tenant-resolving routes on disk.

const API_ROOT = path.join(ROOT, "src/app/api");

/** Every route.ts under src/app/api that resolves an acting tenant. */
async function tenantResolvingRoutes(): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.name === "route.ts") {
        const text = await readFile(abs, "utf8");
        if (/await resolveTenantPrincipalContext\(/.test(text)) {
          found.push(path.relative(ROOT, abs));
        }
      }
    }
  }
  await walk(API_ROOT);
  return found.sort();
}

// Routes that gate, and the product each gates on.
const GATED_PRODUCT: Readonly<Record<string, string>> = {
  "src/app/api/achievements/route.ts": "academy",
  "src/app/api/academy-certificates/route.ts": "academy",
  "src/app/api/academy-lesson-assessment/route.ts": "academy",
  "src/app/api/academy-mastery-seasons/route.ts": "academy",
  "src/app/api/academy-simulator-decision/route.ts": "academy",
  "src/app/api/academy-term-progress/route.ts": "academy",
  "src/app/api/learning-events/route.ts": "academy",
  "src/app/api/mentor-challenge/route.ts": "mentor",
  "src/app/api/mentor-conversations/route.ts": "mentor",
  "src/app/api/mentor-insights/route.ts": "mentor",
  "src/app/api/mentor-memory/route.ts": "mentor",
  "src/app/api/mentor-preferences/route.ts": "mentor",
  "src/app/api/notification-brain/route.ts": "academy",
  "src/app/api/trading-arena/route.ts": "academy",
  "src/app/api/trading-arena/execution/route.ts": "academy",
  "src/app/api/trading-arena/reflections/route.ts": "academy",
};

// Routes that resolve a tenant but deliberately do not gate a product yet, each
// with the reason. These are visible and tracked, not silently ungated.
const EXEMPT_REASON: Readonly<Record<string, string>> = {
  // The notification centre is cross-product: it carries withdrawal, security
  // and system notices alongside academy ones. Gating it on academy would
  // suppress the non-academy notices for a tenant without academy, which is a
  // worse failure than the one this contract fixes. It needs a per-notice
  // product decision, tracked as #20 remainder — not a blanket academy gate.
  "src/app/api/notifications/route.ts": "cross-product notification centre",
  "src/app/api/notifications/read/route.ts": "cross-product notification centre",
  // Community is the Social product, whose platform flag is off by default.
  // Gating these on social would 403 all community usage on every deployment
  // that has not enabled social — a behaviour change that belongs with the
  // social product slice, not this academy one.
  "src/app/api/community/profile/route.ts": "social product, default-off flag",
  "src/app/api/community/reputation-evidence/route.ts": "social product, default-off flag",
  "src/app/api/community/journal-discipline-score/route.ts": "social product, default-off flag",
  // Withdrawal is a wallet/custody operation, not a content product surface;
  // its entitlement is the exchange/wallet gate, addressed with that slice.
  "src/app/api/auth/withdraw/route.ts": "wallet custody, not a content product",
  // Offline sync is transport infrastructure shared by every product, with no
  // single product to gate on.
  "src/app/api/offline-sync/route.ts": "cross-product sync transport",
};

describe("Tenant product entitlement route guards", () => {
  it("accounts for every tenant-resolving route — gated or explicitly exempt", async () => {
    const routes = await tenantResolvingRoutes();
    const uncovered = routes.filter(
      (route) => !(route in GATED_PRODUCT) && !(route in EXEMPT_REASON),
    );
    assert.deepEqual(
      uncovered,
      [],
      "a route resolves an acting tenant but neither gates a product nor is listed "
        + "exempt; add it to GATED_PRODUCT with its product or to EXEMPT_REASON with why",
    );
    // And the maps may not name routes that no longer resolve a tenant, or the
    // completeness check above rots into a rubber stamp.
    for (const route of [...Object.keys(GATED_PRODUCT), ...Object.keys(EXEMPT_REASON)]) {
      assert.ok(routes.includes(route), `${route} is listed but no longer resolves a tenant`);
    }
  });

  for (const [route, product] of Object.entries(GATED_PRODUCT)) {
    it(`gates ${route.replace("src/app/api/", "").replace("/route.ts", "")} on the ${product} entitlement`, async () => {
      const text = await source(route);

      // One gate per resolved tenant: a handler that resolves a tenant and skips
      // the gate is exactly the omission this pins closed.
      const resolved = text.match(/await resolveTenantPrincipalContext\(/g) ?? [];
      const gated = text.match(/await requireTenantProduct\(/g) ?? [];
      assert.ok(resolved.length > 0, "this route is expected to resolve a tenant");
      assert.equal(
        gated.length,
        resolved.length,
        "every handler that resolves an acting tenant must also check its entitlement",
      );

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

  for (const route of Object.keys(EXEMPT_REASON)) {
    it(`leaves ${route.replace("src/app/api/", "").replace("/route.ts", "")} ungated on purpose`, async () => {
      // An exemption that has quietly grown a gate should be promoted out of the
      // exempt list, so the reason stays true to the code.
      const text = await source(route);
      assert.doesNotMatch(
        text,
        /await requireTenantProduct\(/,
        "this route now gates a product; move it from EXEMPT_REASON to GATED_PRODUCT",
      );
    });
  }
});
