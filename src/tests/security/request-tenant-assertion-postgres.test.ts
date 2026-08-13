import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";

import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";
import type { CanonicalSession } from "../../lib/auth-session";
import { resolveTenantPrincipalContext } from "../../lib/security/tenant-principal-context";
import { resetTenantHostDirectoryCache } from "../../lib/security/request-tenant-assertion";

// The request edge's tenant assertion (#20, roadmap 7.1.3).
//
// platform_tenant_domains, resolveTenantHostHint and resolveRequestTenant were
// each built and proven in isolation, and then never connected to a request —
// both pure resolvers had zero production callers. A white-label host therefore
// resolved to nothing and every request fell through to the platform default.
//
// These cases prove the wiring in both directions, which is the whole point: a
// host must be able to SELECT among the tenants a principal is bound to, and
// must never be able to REACH one it is not. The second half is the security
// half — the Host header is attacker-controlled.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;
const cleanupTenants = new Set<string>();

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

/** A tenant with a workspace, a bound principal, and its own custom domain. */
async function seedTenant(input: {
  principalId: string;
  host?: string | null;
  tenantId?: string;
  workspaceId?: string;
}): Promise<{ tenantId: string; workspaceId: string; host: string | null }> {
  const tenantId = input.tenantId ?? `tenant-h-${randomUUID()}`;
  const workspaceId = input.workspaceId ?? `ws-h-${randomUUID()}`;
  if (tenantId !== PLATFORM.DEFAULT_TENANT_ID) cleanupTenants.add(tenantId);

  await withClient(async (client) => {
    await client.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])
       ON CONFLICT (id) DO NOTHING`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO platform_workspaces
         (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [workspaceId, tenantId],
    );
    await client.query(
      `INSERT INTO platform_principal_bindings
         (tenant_id, workspace_id, principal_type, principal_id, status, source)
       VALUES ($1, $2, 'student', $3, 'active', 'test')
       ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
      [tenantId, workspaceId, input.principalId],
    );
    if (input.host) {
      await client.query(
        `INSERT INTO platform_tenant_domains (host, tenant_id, workspace_id)
         VALUES ($1, $2, $3) ON CONFLICT (host) DO NOTHING`,
        [input.host, tenantId, workspaceId],
      );
    }
  });

  return { tenantId, workspaceId, host: input.host ?? null };
}

/** Registers a domain for a tenant the principal is NOT bound to. */
async function seedForeignTenantDomain(host: string): Promise<string> {
  const tenantId = `tenant-foreign-${randomUUID()}`;
  const workspaceId = `ws-foreign-${randomUUID()}`;
  cleanupTenants.add(tenantId);
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO platform_workspaces
         (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
      [workspaceId, tenantId],
    );
    await client.query(
      `INSERT INTO platform_tenant_domains (host, tenant_id, workspace_id)
       VALUES ($1, $2, $3)`,
      [host, tenantId, workspaceId],
    );
  });
  return tenantId;
}

function studentSession(studentId: string): CanonicalSession {
  return {
    userId: null,
    studentId,
    academyAccountId: null,
    role: "student",
    email: null,
    displayName: null,
    username: null,
    isAcademyUser: false,
    isAdmin: false,
    authorityDegraded: false,
  };
}

function requestWithHost(host: string | null) {
  return { headers: { get: (name: string) => (name.toLowerCase() === "host" ? host : null) } };
}

function resolveFor(studentId: string, host: string | null) {
  return resolveTenantPrincipalContext({
    session: studentSession(studentId),
    requiredPrincipalType: "student",
    scopes: ["academy:learning-events:read"],
    requestId: `request-${randomUUID()}`,
    request: host === null ? null : requestWithHost(host),
  });
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

beforeEach(() => {
  // The directory is cached per process; a suite that seeds a domain must not
  // read a map loaded before it existed.
  resetTenantHostDirectoryCache();
});

after(async () => {
  if (pool) {
    await withClient(async (client) => {
      for (const tenantId of cleanupTenants) {
        await client.query("DELETE FROM platform_tenants WHERE id = $1", [tenantId]);
      }
      await client.query(
        "DELETE FROM platform_principal_bindings WHERE source = 'test' AND tenant_id = $1",
        [PLATFORM.DEFAULT_TENANT_ID],
      );
    });
  }
  await pool?.end();
  pool = null;
  resetTenantHostDirectoryCache();
});

describe("Request tenant assertion from the Host header", () => {
  it(
    "lets a white-label host select among the tenants a principal is bound to",
    { skip: !configured, timeout: 45_000 },
    async () => {
      const principalId = randomUUID();
      const host = `acme-${randomUUID().slice(0, 8)}.example.com`;
      const branded = await seedTenant({ principalId, host });
      await seedTenant({
        principalId,
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
      });

      // Load-bearing. Without the host the default tenant ranks first, so this
      // is the one case where the wiring — and nothing else — decides.
      const onDefaultDomain = await resolveFor(principalId, "tecpey.ir");
      assert.equal(onDefaultDomain.available, true);
      if (onDefaultDomain.available) {
        assert.equal(onDefaultDomain.tenantId, PLATFORM.DEFAULT_TENANT_ID);
      }

      const onBrandedDomain = await resolveFor(principalId, host);
      assert.equal(onBrandedDomain.available, true);
      if (onBrandedDomain.available) {
        assert.equal(
          onBrandedDomain.tenantId,
          branded.tenantId,
          "a bound custom domain must select its own tenant",
        );
        assert.equal(onBrandedDomain.workspaceId, branded.workspaceId);
      }
    },
  );

  it(
    "refuses to let a foreign tenant's host reach that tenant",
    { skip: !configured, timeout: 45_000 },
    async () => {
      const principalId = randomUUID();
      await seedTenant({
        principalId,
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
      });
      const foreignHost = `foreign-${randomUUID().slice(0, 8)}.example.com`;
      const foreignTenantId = await seedForeignTenantDomain(foreignHost);

      // The security half. The Host header is attacker-controlled, and this host
      // is a real, bound tenant domain — it is simply not this principal's. The
      // hint must be discarded, not honored.
      const context = await resolveFor(principalId, foreignHost);
      assert.notEqual(
        context.available && context.tenantId,
        foreignTenantId,
        "a host must never move a principal into a tenant it is not bound to",
      );
      assert.equal(
        context.available,
        true,
        "and the legitimate principal must still resolve its own tenant",
      );
      if (context.available) {
        assert.equal(context.tenantId, PLATFORM.DEFAULT_TENANT_ID);
      }
    },
  );

  it(
    "still refuses the foreign tenant if the allow-list is bypassed entirely",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // Defense in depth, stated rather than assumed. Probing the case above by
      // removing the allow-list check showed the request becomes *unavailable*
      // rather than escalated — because the binding filter underneath refuses a
      // tenant the principal has no binding in. This pins that second line
      // directly, by asserting the foreign tenant the way a bypassed allow-list
      // would.
      const principalId = randomUUID();
      await seedTenant({
        principalId,
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
      });
      const foreignTenantId = await seedForeignTenantDomain(
        `deep-${randomUUID().slice(0, 8)}.example.com`,
      );

      const context = await resolveTenantPrincipalContext({
        session: studentSession(principalId),
        requiredPrincipalType: "student",
        scopes: ["academy:learning-events:read"],
        requestId: `request-${randomUUID()}`,
        assertedTenantId: foreignTenantId,
      });

      assert.deepEqual(context, { available: false, reason: "binding_missing" });
    },
  );

  it(
    "treats an unbound host as no assertion at all",
    { skip: !configured, timeout: 45_000 },
    async () => {
      const principalId = randomUUID();
      await seedTenant({
        principalId,
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
      });

      for (const host of [
        "unlisted.example.org",
        // Smuggling shapes normalizeHostHeader refuses outright, checked here
        // through the wiring rather than only at the pure layer.
        "acme.example.com@evil.example.org",
        "evil.example.org/acme.example.com",
        "",
      ]) {
        const context = await resolveFor(principalId, host);
        assert.equal(context.available, true, `host ${JSON.stringify(host)}`);
        if (context.available) {
          assert.equal(context.tenantId, PLATFORM.DEFAULT_TENANT_ID);
        }
      }
    },
  );

  it(
    "resolves identically with no request at all",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // The inertness property: a caller that passes no request behaves exactly
      // as it did before this wiring existed.
      const principalId = randomUUID();
      const branded = await seedTenant({
        principalId,
        host: `solo-${randomUUID().slice(0, 8)}.example.com`,
      });

      const withoutRequest = await resolveFor(principalId, null);
      assert.equal(withoutRequest.available, true);
      if (withoutRequest.available) {
        assert.equal(withoutRequest.tenantId, branded.tenantId);
      }
    },
  );
});
