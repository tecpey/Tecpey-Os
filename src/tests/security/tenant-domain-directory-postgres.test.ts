import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { loadTenantHostDirectory } from "../../lib/security/tenant-domain-directory";
import { resolveTenantHostHint } from "../../lib/security/tenant-host-resolution";

// P2 of multi-tenancy (#20): platform_tenant_domains is the single authority
// for host→tenant, and it must (1) keep each tenant's hosts isolated — one
// tenant's domain never resolves to another's — and (2) make a cross-tenant
// workspace binding impossible at the database level, the DB-enforced twin of
// the pure resolver's "never pair a tenant with a foreign workspace" invariant.

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

async function seedTenantDomain(input: {
  tenantId: string;
  workspaceId: string;
  host: string;
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
      `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [input.workspaceId, input.tenantId],
    );
    await client.query(
      `INSERT INTO platform_tenant_domains (host, tenant_id, workspace_id, is_primary)
       VALUES ($1, $2, $3, TRUE)`,
      [input.host, input.tenantId, input.workspaceId],
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

describe("platform_tenant_domains host directory", { skip: !configured }, () => {
  it("resolves each tenant's host only to that tenant, never across the boundary", async () => {
    const tenantA = `tenant-a-${randomUUID()}`;
    const tenantB = `tenant-b-${randomUUID()}`;
    const wsA = `ws-a-${randomUUID()}`;
    const wsB = `ws-b-${randomUUID()}`;
    const hostA = `acme-${randomUUID().slice(0, 8)}.example`;
    const hostB = `globex-${randomUUID().slice(0, 8)}.example`;

    await seedTenantDomain({ tenantId: tenantA, workspaceId: wsA, host: hostA });
    await seedTenantDomain({ tenantId: tenantB, workspaceId: wsB, host: hostB });

    const lookup = await withClient((client) => loadTenantHostDirectory(client));

    // A's host resolves to A; B's host resolves to B — and neither crosses over.
    assert.deepEqual(resolveTenantHostHint(hostA, lookup), {
      hintTenantId: tenantA,
      hintWorkspaceId: wsA,
      hintSource: "host",
    });
    assert.deepEqual(resolveTenantHostHint(hostB, lookup), {
      hintTenantId: tenantB,
      hintWorkspaceId: wsB,
      hintSource: "host",
    });
    assert.notEqual(resolveTenantHostHint(hostA, lookup)?.hintTenantId, tenantB);
    assert.notEqual(resolveTenantHostHint(hostB, lookup)?.hintWorkspaceId, wsA);
  });

  it("normalizes an incoming Host header (case + port) before matching a stored row", async () => {
    const tenantId = `tenant-a-${randomUUID()}`;
    const workspaceId = `ws-a-${randomUUID()}`;
    const host = `shop-${randomUUID().slice(0, 8)}.example`;
    await seedTenantDomain({ tenantId, workspaceId, host });

    const lookup = await withClient((client) => loadTenantHostDirectory(client));

    assert.deepEqual(resolveTenantHostHint(`${host.toUpperCase()}:443`, lookup), {
      hintTenantId: tenantId,
      hintWorkspaceId: workspaceId,
      hintSource: "host",
    });
  });

  it("yields no hint for a host that is not a registered tenant domain", async () => {
    const lookup = await withClient((client) => loadTenantHostDirectory(client));
    assert.equal(resolveTenantHostHint(`unregistered-${randomUUID()}.example`, lookup), null);
  });

  it("REJECTS at the database a domain that binds a workspace from another tenant", async () => {
    // The load-bearing DB invariant: the composite FK to
    // platform_workspaces(tenant_id, id) makes {tenantA, workspaceB} impossible.
    const tenantA = `tenant-a-${randomUUID()}`;
    const tenantB = `tenant-b-${randomUUID()}`;
    const wsA = `ws-a-${randomUUID()}`;
    const wsB = `ws-b-${randomUUID()}`;
    await seedTenantDomain({
      tenantId: tenantA,
      workspaceId: wsA,
      host: `a-${randomUUID().slice(0, 8)}.example`,
    });
    await seedTenantDomain({
      tenantId: tenantB,
      workspaceId: wsB,
      host: `b-${randomUUID().slice(0, 8)}.example`,
    });

    await assert.rejects(
      () =>
        withClient((client) =>
          client.query(
            `INSERT INTO platform_tenant_domains (host, tenant_id, workspace_id)
             VALUES ($1, $2, $3)`,
            [`evil-${randomUUID().slice(0, 8)}.example`, tenantA, wsB], // A's tenant, B's workspace
          ),
        ),
      /foreign key|platform_tenant_domains_workspace_in_tenant/i,
    );
  });

  it("REJECTS at the database a second row claiming a host already owned by another tenant", async () => {
    // host is the PRIMARY KEY, so a hostname belongs to exactly one tenant.
    const tenantA = `tenant-a-${randomUUID()}`;
    const tenantB = `tenant-b-${randomUUID()}`;
    const wsA = `ws-a-${randomUUID()}`;
    const wsB = `ws-b-${randomUUID()}`;
    const contestedHost = `contested-${randomUUID().slice(0, 8)}.example`;
    await seedTenantDomain({ tenantId: tenantA, workspaceId: wsA, host: contestedHost });
    await withClient(async (client) => {
      await client.query(
        `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
         VALUES ($1, $1, $1, 'enterprise', '{}'::text[]) ON CONFLICT (id) DO NOTHING`,
        [tenantB],
      );
      cleanupTenants.add(tenantB);
      await client.query(
        `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
         VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
        [wsB, tenantB],
      );
    });

    await assert.rejects(
      () =>
        withClient((client) =>
          client.query(
            `INSERT INTO platform_tenant_domains (host, tenant_id, workspace_id)
             VALUES ($1, $2, $3)`,
            [contestedHost, tenantB, wsB],
          ),
        ),
      /duplicate key|platform_tenant_domains_pkey/i,
    );
  });
});
