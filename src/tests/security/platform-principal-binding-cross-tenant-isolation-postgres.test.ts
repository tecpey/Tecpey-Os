import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { resolveBoundTenantPrincipal } from "../../lib/security/tenant-principal-context";

// Cross-tenant adversarial proof for platform_principal_bindings (#109).
//
// platform_principal_bindings is the root of the whole tenant model: it maps a
// principal to the tenant(s)/workspace(s) it is admitted into, and
// resolveBoundTenantPrincipal turns a request's preferred tenant into the bound
// context every downstream authority trusts. Its tenant boundary is the primary
// key (tenant_id, workspace_id, principal_type, principal_id) plus the resolver
// predicate `($3::text IS NULL OR binding.tenant_id = $3)`, where $3 is the
// caller's preferred tenant.
//
// The threat proven closed: a principal bound only into tenant A must not be
// resolvable as tenant B. If the resolver dropped its tenant predicate, a
// request asserting tenant B for that principal would be handed tenant A's
// binding — the single most dangerous cross-tenant confusion, since every
// domain authority downstream trusts the resolved tenantId. The proof asserts
// each tenant resolves only its own binding, and an unbound tenant resolves to
// binding_missing.

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

// Seeds a tenant + workspace + an active student binding for principalId.
// Binding the same principalId under two tenants exercises the PK's tenant
// column: both bindings must coexist as distinct rows.
async function seedBinding(input: {
  tenantId: string;
  workspaceId: string;
  principalId: string;
}): Promise<void> {
  cleanupTenants.add(input.tenantId);
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

function resolve(principalId: string, preferredTenantId: string) {
  return resolveBoundTenantPrincipal({
    principalType: "student",
    principalId,
    preferredTenantId,
    scopes: ["offline-sync:write"],
    requestId: `request-${randomUUID()}`,
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

describe("Platform principal binding cross-tenant isolation", () => {
  it(
    "resolves each tenant to its own binding when a principal is bound into two tenants",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const tenantA = `tenant-a-${randomUUID()}`;
      const tenantB = `tenant-b-${randomUUID()}`;
      const workspaceA = `workspace-a-${randomUUID()}`;
      const workspaceB = `workspace-b-${randomUUID()}`;
      const principalId = randomUUID();

      // The same principal admitted into both tenants — two distinct bindings.
      await seedBinding({ tenantId: tenantA, workspaceId: workspaceA, principalId });
      await seedBinding({ tenantId: tenantB, workspaceId: workspaceB, principalId });

      const asA = await resolve(principalId, tenantA);
      assert.equal(asA.available, true);
      if (asA.available) {
        assert.equal(asA.tenantId, tenantA);
        assert.equal(asA.workspaceId, workspaceA);
      }

      const asB = await resolve(principalId, tenantB);
      assert.equal(asB.available, true);
      if (asB.available) {
        assert.equal(asB.tenantId, tenantB);
        assert.equal(asB.workspaceId, workspaceB);
      }
    },
  );

  it(
    "refuses to resolve a principal into a tenant it is not bound to",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const tenantA = `tenant-a-${randomUUID()}`;
      const tenantB = `tenant-b-${randomUUID()}`;
      const workspaceA = `workspace-a-${randomUUID()}`;
      const principalId = randomUUID();

      // Principal is admitted into tenant A only; tenant B exists but has no
      // binding for this principal.
      await seedBinding({ tenantId: tenantA, workspaceId: workspaceA, principalId });
      await seedBinding({
        tenantId: tenantB,
        workspaceId: `workspace-b-${randomUUID()}`,
        principalId: randomUUID(),
      });

      // The load-bearing negative: asserting tenant B for a principal bound only
      // to tenant A must fail closed. A resolver that dropped its tenant
      // predicate would hand back tenant A's binding here — a cross-tenant
      // principal confusion that every downstream authority would then trust.
      const asB = await resolve(principalId, tenantB);
      assert.deepEqual(asB, { available: false, reason: "binding_missing" });

      // Sanity: the principal still resolves correctly for its own tenant.
      const asA = await resolve(principalId, tenantA);
      assert.equal(asA.available, true);
      if (asA.available) assert.equal(asA.tenantId, tenantA);
    },
  );
});
