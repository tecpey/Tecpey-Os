import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { resolveBoundTenantPrincipal } from "../../lib/security/tenant-principal-context";

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
  status?: "active" | "revoked";
}): Promise<void> {
  cleanupTenants.add(input.tenantId);
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO platform_tenants
         (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
      [input.tenantId],
    );
    await client.query(
      `INSERT INTO platform_workspaces
         (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
      [input.workspaceId, input.tenantId],
    );
    await client.query(
      `INSERT INTO platform_principal_bindings
         (tenant_id, workspace_id, principal_type, principal_id, status, source)
       VALUES ($1, $2, 'student', $3, $4, 'test')`,
      [
        input.tenantId,
        input.workspaceId,
        input.principalId,
        input.status ?? "active",
      ],
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

describe("Tenant principal context PostgreSQL authority", () => {
  it(
    "resolves matching tenant, workspace and student binding",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const tenantId = `tenant-${randomUUID()}`;
      const workspaceId = `workspace-${randomUUID()}`;
      const principalId = randomUUID();
      await seedBinding({ tenantId, workspaceId, principalId });

      const result = await resolveBoundTenantPrincipal({
        principalType: "student",
        principalId,
        preferredTenantId: tenantId,
        preferredWorkspaceId: workspaceId,
        scopes: ["offline-sync:write"],
        requestId: `request-${randomUUID()}`,
      });
      assert.equal(result.available, true);
      if (result.available) {
        assert.equal(result.tenantId, tenantId);
        assert.equal(result.workspaceId, workspaceId);
        assert.equal(result.principalId, principalId);
      }
    },
  );

  it(
    "fails closed for missing, revoked and mismatched bindings",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const missing = await resolveBoundTenantPrincipal({
        principalType: "student",
        principalId: randomUUID(),
        scopes: ["offline-sync:write"],
        requestId: `request-${randomUUID()}`,
      });
      assert.deepEqual(missing, { available: false, reason: "binding_missing" });

      const tenantId = `tenant-${randomUUID()}`;
      const workspaceId = `workspace-${randomUUID()}`;
      const principalId = randomUUID();
      await seedBinding({
        tenantId,
        workspaceId,
        principalId,
        status: "revoked",
      });
      const revoked = await resolveBoundTenantPrincipal({
        principalType: "student",
        principalId,
        preferredTenantId: tenantId,
        scopes: ["offline-sync:write"],
        requestId: `request-${randomUUID()}`,
      });
      assert.deepEqual(revoked, { available: false, reason: "binding_revoked" });
    },
  );

  it(
    "rejects a workspace that belongs to another tenant",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const tenantId = `tenant-${randomUUID()}`;
      const workspaceId = `workspace-${randomUUID()}`;
      const principalId = randomUUID();
      await seedBinding({ tenantId, workspaceId, principalId });
      const result = await resolveBoundTenantPrincipal({
        principalType: "student",
        principalId,
        preferredTenantId: tenantId,
        preferredWorkspaceId: `workspace-${randomUUID()}`,
        scopes: ["offline-sync:write"],
        requestId: `request-${randomUUID()}`,
      });
      assert.deepEqual(result, { available: false, reason: "workspace_mismatch" });
    },
  );
});
