import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyAuthProviderEvidenceMutation, loadAuthProviderEvidenceByProvider } from "../../lib/admin-auth-provider-evidence-store";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";

// Cross-tenant adversarial proof for admin_auth_provider_evidence and
// admin_auth_provider_evidence_events (#109).
//
// The provider evidence table gates whether social login providers can advance
// from locked setup into admin review. The tenant boundary is the composite
// identity (tenant_id, workspace_id, provider_id, gate_id), and all ready-state
// reads filter by tenant_id + workspace_id. If either predicate is dropped,
// tenant B could make tenant A's Google/Apple evidence look ready or overwrite
// A's review state with B's evidence. The append-only event table carries the
// same tenant/workspace scope so audit trails do not collapse across tenants.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const cleanupTenants = new Set<string>();
let pool: Pool | null = null;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function seedTenantAdmin(
  tenantId: string,
  workspaceId: string,
): Promise<{ adminId: string }> {
  cleanupTenants.add(tenantId);
  return withClient(async (client) => {
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
    const admin = await client.query<{ id: string }>(
      `INSERT INTO admin_users (email, display_name, status, tenant_id, workspace_id)
       VALUES ($1, $2, 'active', $3, $4)
       RETURNING id::text AS id`,
      [`admin-${tenantId}@tecpey.test`, `admin ${tenantId}`, tenantId, workspaceId],
    );

    return { adminId: admin.rows[0]!.id };
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
      const tenants = [...cleanupTenants];
      if (tenants.length === 0) return;

      await client.query("DELETE FROM admin_auth_provider_evidence_events WHERE tenant_id = ANY($1::text[])", [
        tenants,
      ]);
      await client.query("DELETE FROM admin_auth_provider_evidence WHERE tenant_id = ANY($1::text[])", [
        tenants,
      ]);
      await client.query("DELETE FROM admin_users WHERE tenant_id = ANY($1::text[])", [tenants]);
      await client.query("DELETE FROM platform_workspaces WHERE tenant_id = ANY($1::text[])", [tenants]);
      await client.query("DELETE FROM platform_tenants WHERE id = ANY($1::text[])", [tenants]);
    });
  }
  await pool?.end();
  pool = null;
});

describe("Admin auth provider evidence cross-tenant isolation", () => {
  it(
    "keeps provider readiness and evidence events scoped to each tenant/workspace",
    { skip: !configured, timeout: 45_000 },
    async () => {
      const suffix = randomUUID();
      const tenantA = `tenant-a-${suffix}`;
      const tenantB = `tenant-b-${suffix}`;
      const workspaceA = `workspace-a-${suffix}`;
      const workspaceB = `workspace-b-${suffix}`;
      const adminA = await seedTenantAdmin(tenantA, workspaceA);
      const adminB = await seedTenantAdmin(tenantB, workspaceB);

      const readyA = await applyAuthProviderEvidenceMutation({
        tenantId: tenantA,
        workspaceId: workspaceA,
        actorAdminId: adminA.adminId,
        providerId: "google",
        gateId: "client_registered",
        action: "mark_ready",
        evidenceRef: "vault://oauth/google/client-a",
        evidenceSha256: "a".repeat(64),
      });
      const readyB = await applyAuthProviderEvidenceMutation({
        tenantId: tenantB,
        workspaceId: workspaceB,
        actorAdminId: adminB.adminId,
        providerId: "google",
        gateId: "domain_verified",
        action: "mark_ready",
        evidenceRef: "vault://oauth/google/domain-b",
        evidenceSha256: "b".repeat(64),
      });

      assert.equal(readyA.ok, true);
      assert.equal(readyB.ok, true);

      const evidenceA = await loadAuthProviderEvidenceByProvider({
        tenantId: tenantA,
        workspaceId: workspaceA,
      });
      const evidenceB = await loadAuthProviderEvidenceByProvider({
        tenantId: tenantB,
        workspaceId: workspaceB,
      });

      assert.notEqual(evidenceA, "unavailable");
      assert.notEqual(evidenceB, "unavailable");
      if (evidenceA === "unavailable" || evidenceB === "unavailable") return;

      assert.deepEqual(evidenceA.google, { client_registered: true });
      assert.deepEqual(evidenceB.google, { domain_verified: true });

      const rows = await withClient((client) =>
        client.query<{
          tenant_id: string;
          gate_id: string;
          evidence_sha256: string;
          event_count: string;
        }>(
          `SELECT evidence.tenant_id,
                  evidence.gate_id,
                  evidence.evidence_sha256,
                  COUNT(events.id)::text AS event_count
             FROM admin_auth_provider_evidence evidence
             JOIN admin_auth_provider_evidence_events events
               ON events.tenant_id = evidence.tenant_id
              AND events.workspace_id = evidence.workspace_id
              AND events.provider_id = evidence.provider_id
              AND events.gate_id = evidence.gate_id
            WHERE evidence.tenant_id = ANY($1::text[])
            GROUP BY evidence.tenant_id, evidence.gate_id, evidence.evidence_sha256
            ORDER BY evidence.tenant_id`,
          [[tenantA, tenantB]],
        ),
      );

      assert.deepEqual(rows.rows, [
        {
          tenant_id: tenantA,
          gate_id: "client_registered",
          evidence_sha256: "a".repeat(64),
          event_count: "1",
        },
        {
          tenant_id: tenantB,
          gate_id: "domain_verified",
          evidence_sha256: "b".repeat(64),
          event_count: "1",
        },
      ]);
    },
  );
});
