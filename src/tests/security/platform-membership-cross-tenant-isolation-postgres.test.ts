import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { getMembership, upsertMembership } from "../../lib/tenant-service";

// Cross-tenant adversarial proof for platform_memberships (#109).
//
// platform_memberships records which tenant a user belongs to and with what
// roles. Its tenant boundary is UNIQUE (user_id, tenant_id): upsertMembership
// writes ON CONFLICT (user_id, tenant_id), and getMembership reads
// `WHERE user_id = $1 AND tenant_id = $2`. Roles read from a membership drive
// authorization, so leaking one tenant's membership into another's request is a
// privilege-confusion bug.
//
// The threat proven closed: the same user enrolled in two tenants must resolve
// to each tenant's own membership (and roles); and a user enrolled in only one
// tenant must not resolve to any membership under another tenant. If getMembership
// dropped its tenant_id predicate, it would return the user's membership from a
// different tenant — handing that tenant's roles to the wrong tenant's request.

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

async function seedTenant(tenantId: string, workspaceId: string): Promise<void> {
  cleanupTenants.add(tenantId);
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

describe("Platform membership cross-tenant isolation", () => {
  it(
    "resolves each tenant's own membership and roles for a user enrolled in two tenants",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const tenantA = `tenant-a-${randomUUID()}`;
      const tenantB = `tenant-b-${randomUUID()}`;
      const workspaceA = `workspace-a-${randomUUID()}`;
      const workspaceB = `workspace-b-${randomUUID()}`;
      const userId = `user-${randomUUID()}`;
      await seedTenant(tenantA, workspaceA);
      await seedTenant(tenantB, workspaceB);

      // Same user, two tenants, deliberately different roles per tenant.
      await upsertMembership(userId, tenantA, ["student"], workspaceA);
      await upsertMembership(userId, tenantB, ["admin"], workspaceB);

      const inA = await getMembership(userId, tenantA);
      assert.equal(inA?.tenantId, tenantA);
      assert.deepEqual(inA?.roles, ["student"]);

      const inB = await getMembership(userId, tenantB);
      assert.equal(inB?.tenantId, tenantB);
      assert.deepEqual(inB?.roles, ["admin"]);

      // The two memberships are distinct rows — a tenant-blind read could return
      // one tenant's roles for the other tenant's request.
      assert.notEqual(inA?.id, inB?.id);
    },
  );

  it(
    "returns no membership for a tenant the user is not enrolled in",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const tenantA = `tenant-a-${randomUUID()}`;
      const tenantB = `tenant-b-${randomUUID()}`;
      const workspaceA = `workspace-a-${randomUUID()}`;
      const userId = `user-${randomUUID()}`;
      await seedTenant(tenantA, workspaceA);
      await seedTenant(tenantB, `workspace-b-${randomUUID()}`);

      // Enrolled in tenant A only.
      await upsertMembership(userId, tenantA, ["student"], workspaceA);

      // Load-bearing negative: the user has no membership under tenant B, so the
      // resolve must fail closed. A resolver that dropped its tenant_id predicate
      // would hand back the tenant-A membership (and its roles) here.
      const inB = await getMembership(userId, tenantB);
      assert.equal(inB, null, "user must not resolve a membership under an unenrolled tenant");

      // Sanity: tenant A still resolves correctly.
      const inA = await getMembership(userId, tenantA);
      assert.equal(inA?.tenantId, tenantA);
    },
  );
});
