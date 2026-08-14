import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  applyAuthProviderEvidenceMutation,
  loadAuthProviderEvidenceByProvider,
  submitAuthProviderReviewRequest,
} from "../../lib/admin-auth-provider-evidence-store";
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
  // Evidence events are append-only by design; the CI database is ephemeral, so
  // this proof closes the pool without deleting the event trail it just proved.
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
      const expiresAt = new Date(Date.now() + 86_400_000).toISOString();

      const readyA = await applyAuthProviderEvidenceMutation({
        tenantId: tenantA,
        workspaceId: workspaceA,
        actorAdminId: adminA.adminId,
        providerId: "google",
        gateId: "client_registered",
        action: "mark_ready",
        evidenceRef: "vault://oauth/google/client-a",
        evidenceSha256: "a".repeat(64),
        expiresAt,
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

      const eventExpiry = await withClient((client) =>
        client.query<{ tenant_id: string; expires_at: Date | null }>(
          `SELECT tenant_id, expires_at
             FROM admin_auth_provider_evidence_events
            WHERE tenant_id = ANY($1::text[])
            ORDER BY tenant_id`,
          [[tenantA, tenantB]],
        ),
      );
      assert.equal(eventExpiry.rows.find((row) => row.tenant_id === tenantA)?.expires_at?.toISOString(), expiresAt);
      assert.equal(eventExpiry.rows.find((row) => row.tenant_id === tenantB)?.expires_at, null);

      const reviewRequest = await submitAuthProviderReviewRequest({
        tenantId: tenantA,
        workspaceId: workspaceA,
        actorAdminId: adminA.adminId,
        sessionId: null,
        effectiveRoles: ["super_admin"],
        providerId: "google",
        requestedState: "enabled",
        requestId: `auth-provider-review-${suffix}`,
        sourceIp: "127.0.0.1",
        userAgent: "node:test",
      });

      assert.equal(reviewRequest.ok, true);
      if (!reviewRequest.ok) return;

      const reviewRows = await withClient((client) =>
        client.query<{
          request_action: string;
          resource_type: string;
          resource_id: string;
          requested_by: string;
          payload_tenant_id: string;
          payload_workspace_id: string;
          payload_provider_id: string;
          audit_count: string;
        }>(
          `SELECT request.action AS request_action,
                  request.resource_type,
                  request.resource_id,
                  request.requested_by::text AS requested_by,
                  request.payload ->> 'tenantId' AS payload_tenant_id,
                  request.payload ->> 'workspaceId' AS payload_workspace_id,
                  request.payload ->> 'providerId' AS payload_provider_id,
                  COUNT(audit.id)::text AS audit_count
             FROM admin_approval_requests request
             LEFT JOIN admin_audit_events audit
               ON audit.approval_request_id = request.id
            WHERE request.id = $1::uuid
            GROUP BY request.id`,
          [reviewRequest.approvalRequestId],
        ),
      );

      assert.deepEqual(reviewRows.rows, [
        {
          request_action: "auth_provider.request_enable",
          resource_type: "auth_provider",
          resource_id: `${tenantA}/${workspaceA}/google`,
          requested_by: adminA.adminId,
          payload_tenant_id: tenantA,
          payload_workspace_id: workspaceA,
          payload_provider_id: "google",
          audit_count: "1",
        },
      ]);
    },
  );
});
