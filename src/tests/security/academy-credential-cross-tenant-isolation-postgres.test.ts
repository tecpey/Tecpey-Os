import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  appendAcademyCredentialLifecycleEvent,
  issueAcademyCredential,
  listOwnedAcademyCredentialHistory,
  listOwnedAcademyCredentials,
  setOwnedAcademyCredentialVisibility,
  type AcademyCredentialScope,
} from "../../lib/academy-credential-authority";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";

// Load-bearing adversarial guard for academy_credential_records (#109).
//
// The ledger is intentionally append-only, and platform_principal_bindings
// allows the SAME student UUID to be active in two tenants. This suite proves
// the credential authority keeps those two worlds apart: same student, same
// credential key, independent rows, scoped cabinet reads, and rejected
// cross-tenant visibility/lifecycle writes by credential id.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const RUN_ID = randomUUID();
const TENANT_A = `credential-a-${RUN_ID}`;
const WORKSPACE_A = `credential-ws-a-${RUN_ID}`;
const TENANT_B = `credential-b-${RUN_ID}`;
const WORKSPACE_B = `credential-ws-b-${RUN_ID}`;

const credentialKey = `credential-isolation:${RUN_ID}`;

const SCOPE_A_BASE = { tenantId: TENANT_A, workspaceId: WORKSPACE_A };
const SCOPE_B_BASE = { tenantId: TENANT_B, workspaceId: WORKSPACE_B };

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function seedTenantStudentPair(client: PoolClient): Promise<string> {
  const studentId = randomUUID();
  for (const [tenantId, workspaceId] of [
    [TENANT_A, WORKSPACE_A],
    [TENANT_B, WORKSPACE_B],
  ]) {
    await client.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', ARRAY['academy'])
       ON CONFLICT (id) DO NOTHING`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO platform_workspaces
         (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, ARRAY['academy'], '{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [workspaceId, tenantId],
    );
  }
  await client.query(
    `INSERT INTO academy_students (id, locale, display_name)
     VALUES ($1::uuid, 'fa', 'Credential Tenant Isolation Probe')
     ON CONFLICT (id) DO NOTHING`,
    [studentId],
  );
  for (const [tenantId, workspaceId] of [
    [TENANT_A, WORKSPACE_A],
    [TENANT_B, WORKSPACE_B],
  ]) {
    await client.query(
      `INSERT INTO platform_principal_bindings
         (tenant_id, workspace_id, principal_type, principal_id, status, source)
       VALUES ($1, $2, 'student', $3, 'active', 'test')
       ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id)
       DO NOTHING`,
      [tenantId, workspaceId, studentId],
    );
    await client.query(
      `INSERT INTO platform_principals (tenant_id, student_id, status, locale)
       VALUES ($1, $2::uuid, 'active', 'fa')
       ON CONFLICT (tenant_id, student_id)
       WHERE student_id IS NOT NULL
       DO UPDATE SET status = 'active', locale = 'fa'`,
      [tenantId, studentId],
    );
  }
  return studentId;
}

async function issueFixtureCredential(
  client: PoolClient,
  scope: AcademyCredentialScope,
  tenantMarker: "A" | "B",
) {
  return issueAcademyCredential(client, {
    ...scope,
    credentialKey,
    credentialType: "achievement",
    code: `credential-isolation-${tenantMarker.toLowerCase()}`,
    titleFa: `مدرک تست tenant ${tenantMarker}`,
    titleEn: `Tenant ${tenantMarker} Credential`,
    descriptionFa: `اثبات ایزولیشن tenant ${tenantMarker}`,
    descriptionEn: `Tenant ${tenantMarker} isolation proof`,
    icon: "shield",
    policyVersion: "credential-isolation-proof-v1",
    evidence: { tenantMarker, runId: RUN_ID },
    issuedAt: tenantMarker === "A"
      ? "2026-08-15T08:00:00.000Z"
      : "2026-08-15T08:01:00.000Z",
  });
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  if (!pool) return;
  await pool.end();
  pool = null;
});

describe("Academy credential ledger cross-tenant isolation", () => {
  it(
    "keeps one student's same credential key independent across tenants and rejects cross-tenant mutations",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withClient(async (client) => {
        const studentId = await seedTenantStudentPair(client);
        const scopeA: AcademyCredentialScope = { ...SCOPE_A_BASE, studentId };
        const scopeB: AcademyCredentialScope = { ...SCOPE_B_BASE, studentId };

        const issuedA = await issueFixtureCredential(client, scopeA, "A");
        const issuedB = await issueFixtureCredential(client, scopeB, "B");

        assert.notEqual(
          issuedA.credentialId,
          issuedB.credentialId,
          "same student/key must produce independent credential rows per tenant",
        );

        const rawRows = await client.query<{ tenant_id: string; workspace_id: string; id: string }>(
          `SELECT tenant_id, workspace_id, id::text AS id
             FROM academy_credential_records
            WHERE student_id = $1::uuid AND credential_key = $2
            ORDER BY tenant_id`,
          [studentId, credentialKey],
        );
        assert.equal(rawRows.rows.length, 2, "both tenants must be able to store the same credential key");
        assert.deepEqual(
          rawRows.rows.map((row) => [row.tenant_id, row.workspace_id]),
          [[TENANT_A, WORKSPACE_A], [TENANT_B, WORKSPACE_B]],
        );

        const [credentialsA, credentialsB] = await Promise.all([
          listOwnedAcademyCredentials(client, scopeA),
          listOwnedAcademyCredentials(client, scopeB),
        ]);
        assert.deepEqual(
          credentialsA.map((credential) => credential.id),
          [issuedA.credentialId],
          "tenant A cabinet must not read tenant B's credential",
        );
        assert.deepEqual(
          credentialsB.map((credential) => credential.id),
          [issuedB.credentialId],
          "tenant B cabinet must not read tenant A's credential",
        );

        const crossTenantVisibility = await setOwnedAcademyCredentialVisibility(client, {
          ...scopeB,
          credentialId: issuedA.credentialId,
          visibility: "public",
          idempotencyKey: `visibility-cross:${RUN_ID}`,
        });
        assert.equal(
          crossTenantVisibility,
          null,
          "tenant B must not change tenant A credential visibility by id",
        );

        const ownVisibility = await setOwnedAcademyCredentialVisibility(client, {
          ...scopeB,
          credentialId: issuedB.credentialId,
          visibility: "profile",
          idempotencyKey: `visibility-own:${RUN_ID}`,
        });
        assert.equal(ownVisibility?.visibility, "profile");

        const crossTenantLifecycle = await appendAcademyCredentialLifecycleEvent(client, {
          tenantId: TENANT_B,
          workspaceId: WORKSPACE_B,
          credentialId: issuedA.credentialId,
          actorType: "admin",
          actorId: randomUUID(),
          eventType: "suspended",
          reasonCode: "tenant.isolation.probe",
          idempotencyKey: `lifecycle-cross:${RUN_ID}`,
          metadata: { attemptedFromTenant: TENANT_B },
          occurredAt: "2026-08-15T08:02:00.000Z",
        });
        assert.equal(
          crossTenantLifecycle,
          null,
          "tenant B must not append a lifecycle event to tenant A credential by id",
        );

        const forbiddenWrites = await client.query<{ visibility_events: string; lifecycle_events: string }>(
          `SELECT
             COUNT(*) FILTER (
               WHERE visibility.idempotency_key = $2
             )::text AS visibility_events,
             COUNT(*) FILTER (
               WHERE lifecycle.idempotency_key = $3
             )::text AS lifecycle_events
           FROM academy_credential_records record
           LEFT JOIN academy_credential_visibility_events visibility
             ON visibility.credential_id = record.id
           LEFT JOIN academy_credential_events lifecycle
             ON lifecycle.credential_id = record.id
          WHERE record.id = $1::uuid`,
          [issuedA.credentialId, `visibility-cross:${RUN_ID}`, `lifecycle-cross:${RUN_ID}`],
        );
        assert.equal(forbiddenWrites.rows[0]?.visibility_events, "0");
        assert.equal(forbiddenWrites.rows[0]?.lifecycle_events, "0");

        const [historyA, historyB] = await Promise.all([
          listOwnedAcademyCredentialHistory(client, scopeA),
          listOwnedAcademyCredentialHistory(client, scopeB),
        ]);
        assert.deepEqual(
          [...new Set(historyA.map((event) => event.credential_id))],
          [issuedA.credentialId],
          "tenant A history must stay scoped to tenant A credential events",
        );
        assert.deepEqual(
          [...new Set(historyB.map((event) => event.credential_id))],
          [issuedB.credentialId],
          "tenant B history must stay scoped to tenant B credential events",
        );
      });
    },
  );
});
