import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";
import type { CanonicalSession } from "../../lib/auth-session";
import {
  resolveBoundTenantPrincipal,
  resolveTenantPrincipalContext,
} from "../../lib/security/tenant-principal-context";

// resolveTenantPrincipalContext is the helper every tenant-scoped route uses to
// turn a verified session into the tenant it acts in. It used to hand
// resolveBoundTenantPrincipal the hard-coded platform default as the request's
// "preferred" tenant — but that preference is a filter, not a ranking, so the
// pair ('tecpey','main') was the only context it could ever produce. A principal
// bound elsewhere resolved to binding_missing and a principal in a non-default
// workspace of the default tenant to workspace_mismatch, which pinned every
// route on this helper to one tenant.
//
// These cases hold the two halves apart: the helper must reach a principal's own
// binding wherever it lives, while the filter must still refuse a tenant the
// caller asserted but the principal is not bound to.

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

async function seedBinding(input: {
  tenantId: string;
  workspaceId: string;
  principalId: string;
}): Promise<void> {
  if (input.tenantId !== PLATFORM.DEFAULT_TENANT_ID) cleanupTenants.add(input.tenantId);
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])
       ON CONFLICT (id) DO NOTHING`,
      [input.tenantId],
    );
    await client.query(
      `INSERT INTO platform_workspaces
         (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [input.workspaceId, input.tenantId],
    );
    await client.query(
      `INSERT INTO platform_principal_bindings
         (tenant_id, workspace_id, principal_type, principal_id, status, source)
       VALUES ($1, $2, 'student', $3, 'active', 'test')
       ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
      [input.tenantId, input.workspaceId, input.principalId],
    );
  });
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

function resolveFor(studentId: string, asserted?: { tenantId: string; workspaceId?: string }) {
  return resolveTenantPrincipalContext({
    session: studentSession(studentId),
    requiredPrincipalType: "student",
    scopes: ["academy:learning-events:read"],
    requestId: `request-${randomUUID()}`,
    assertedTenantId: asserted?.tenantId ?? null,
    assertedWorkspaceId: asserted?.workspaceId ?? null,
  });
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  if (pool) {
    await withClient(async (client) => {
      for (const tenantId of cleanupTenants) {
        await client.query("DELETE FROM platform_tenants WHERE id = $1", [tenantId]);
      }
    });
  }
  await pool?.end();
  pool = null;
});

describe("Tenant principal context reach", () => {
  it(
    "resolves a principal bound only to a non-default tenant",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const tenantId = `tenant-reach-${randomUUID()}`;
      const workspaceId = `ws-reach-${randomUUID()}`;
      const principalId = randomUUID();
      await seedBinding({ tenantId, workspaceId, principalId });

      // Before the fix this was { available: false, reason: "binding_missing" },
      // so every tenant-scoped route answered this student with an empty,
      // degraded result forever.
      const context = await resolveFor(principalId);
      assert.equal(context.available, true);
      if (context.available) {
        assert.equal(context.tenantId, tenantId);
        assert.equal(context.workspaceId, workspaceId);
      }
    },
  );

  it(
    "resolves a principal in a non-default workspace of the default tenant",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const workspaceId = `ws-alt-${randomUUID()}`;
      const principalId = randomUUID();
      await seedBinding({
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        workspaceId,
        principalId,
      });

      // Before the fix this was { available: false, reason: "workspace_mismatch" }
      // — the default workspace was demanded even though the tenant matched.
      const context = await resolveFor(principalId);
      assert.equal(context.available, true);
      if (context.available) {
        assert.equal(context.tenantId, PLATFORM.DEFAULT_TENANT_ID);
        assert.equal(context.workspaceId, workspaceId);
      }

      await withClient(async (client) => {
        await client.query(
          "DELETE FROM platform_principal_bindings WHERE principal_id = $1",
          [principalId],
        );
        await client.query("DELETE FROM platform_workspaces WHERE id = $1", [workspaceId]);
      });
    },
  );

  it(
    "prefers the default tenant when a principal is bound to several",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const otherTenant = `tenant-other-${randomUUID()}`;
      const otherWorkspace = `ws-other-${randomUUID()}`;
      const principalId = randomUUID();
      await seedBinding({ tenantId: otherTenant, workspaceId: otherWorkspace, principalId });
      await seedBinding({
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
        principalId,
      });

      // Widening reach must not move an existing multi-tenant principal: the
      // resolver's ORDER BY still ranks the default pair first.
      const context = await resolveFor(principalId);
      assert.equal(context.available, true);
      if (context.available) {
        assert.equal(context.tenantId, PLATFORM.DEFAULT_TENANT_ID);
        assert.equal(context.workspaceId, PLATFORM.DEFAULT_WORKSPACE_ID);
      }

      await withClient(async (client) => {
        await client.query(
          "DELETE FROM platform_principal_bindings WHERE principal_id = $1",
          [principalId],
        );
      });
    },
  );

  it(
    "still refuses a tenant the request asserted but the principal is not bound to",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const boundTenant = `tenant-bound-${randomUUID()}`;
      const boundWorkspace = `ws-bound-${randomUUID()}`;
      const foreignTenant = `tenant-foreign-${randomUUID()}`;
      const principalId = randomUUID();
      await seedBinding({
        tenantId: boundTenant,
        workspaceId: boundWorkspace,
        principalId,
      });
      await seedBinding({
        tenantId: foreignTenant,
        workspaceId: `ws-foreign-${randomUUID()}`,
        principalId: randomUUID(),
      });

      // The load-bearing negative. An assertion is still a filter: it may never
      // be satisfied by a binding belonging to some other tenant, or the whole
      // point of the predicate is gone.
      assert.deepEqual(await resolveFor(principalId, { tenantId: foreignTenant }), {
        available: false,
        reason: "binding_missing",
      });

      const asOwn = await resolveFor(principalId, { tenantId: boundTenant });
      assert.equal(asOwn.available, true);
      if (asOwn.available) assert.equal(asOwn.tenantId, boundTenant);
    },
  );

  it(
    "keeps the asserted-tenant filter on the underlying resolver",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const tenantA = `tenant-a-${randomUUID()}`;
      const tenantB = `tenant-b-${randomUUID()}`;
      const principalId = randomUUID();
      await seedBinding({
        tenantId: tenantA,
        workspaceId: `ws-a-${randomUUID()}`,
        principalId,
      });
      await seedBinding({
        tenantId: tenantB,
        workspaceId: `ws-b-${randomUUID()}`,
        principalId: randomUUID(),
      });

      const asB = await resolveBoundTenantPrincipal({
        principalType: "student",
        principalId,
        preferredTenantId: tenantB,
        scopes: ["academy:learning-events:read"],
        requestId: `request-${randomUUID()}`,
      });
      assert.deepEqual(asB, { available: false, reason: "binding_missing" });
    },
  );
});
