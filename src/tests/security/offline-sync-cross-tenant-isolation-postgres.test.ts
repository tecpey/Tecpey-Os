import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  processOfflineSyncCommand,
  type OfflineSyncAuthorityContext,
} from "../../lib/offline-sync-authority";
import type { OfflineSyncItem } from "../../lib/offline-sync";
import { PLATFORM } from "../../lib/platform-config";

// Cross-tenant adversarial proof for offline_sync_commands (#109).
//
// This is a genuinely multi-tenant write path: processOfflineSyncCommand takes
// the tenant from the resolved principal context, the row is claimed with
// `ON CONFLICT (tenant_id, student_id, client_event_id) DO NOTHING`, and every
// follow-up read/update is filtered `WHERE tenant_id = $1`. The threat proven
// closed: the same student replaying the same client_event_id under a second
// tenant must NOT be served tenant A's already-committed command. If the unique
// key or the WHERE clause dropped tenant_id, tenant B's identical item would
// collide with tenant A's row, the command hashes would match, and B would be
// handed tenant A's committed domain event as a replay — a cross-tenant read of
// another tenant's learning evidence. The proof asserts B commits its own,
// distinct event instead.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT_A = PLATFORM.DEFAULT_TENANT_ID;
const WORKSPACE_A = PLATFORM.DEFAULT_WORKSPACE_ID;
const TENANT_B = `tenant-b-${randomUUID()}`;
const WORKSPACE_B = `workspace-b-${randomUUID()}`;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function item(id: string, payload: Record<string, unknown> = {}): OfflineSyncItem {
  return {
    id,
    eventType: "lesson_viewed",
    source: "pwa",
    locale: "fa",
    clientCreatedAt: "2026-07-19T12:00:00.000Z",
    payload,
  };
}

function context(
  tenantId: string,
  workspaceId: string,
  studentId: string,
): OfflineSyncAuthorityContext {
  return {
    available: true,
    tenantId,
    workspaceId,
    principalType: "student",
    principalId: studentId,
    roles: [],
    scopes: ["offline-sync:write"],
    bindingSource: "academy_students_trigger",
    bindingStatus: "active",
    membershipId: null,
    requestId: `request-${randomUUID()}`,
    authEvidence: { strictRevocation: true, sessionPrincipal: true },
  };
}

async function commandRowsFor(
  studentId: string,
  clientEventId: string,
): Promise<Array<{ tenant_id: string; domain_event_id: string | null }>> {
  return withClient(async (client) => {
    const rows = await client.query<{ tenant_id: string; domain_event_id: string | null }>(
      `SELECT tenant_id, domain_event_id
         FROM offline_sync_commands
        WHERE student_id = $1::uuid AND client_event_id = $2
        ORDER BY tenant_id`,
      [studentId, clientEventId],
    );
    return rows.rows;
  });
}

// A command can only exist for a real principal binding in its tenant
// (offline_sync_commands_principal_binding_fk). Tenant A's binding is created
// automatically by the academy_students trigger; tenant B needs one seeded
// explicitly, which is itself part of the isolation: the same student must be
// separately admitted into tenant B before any tenant-B command can land.
async function seedStudentAndTenantBBinding(studentId: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO academy_students (id, locale, email, display_name)
       VALUES ($1::uuid, 'fa', $2, 'cross-tenant')`,
      [studentId, `xt-${studentId}@offline.test`],
    );
    await client.query(
      `INSERT INTO platform_principal_bindings
         (tenant_id, workspace_id, principal_type, principal_id, status, source)
       VALUES ($1, $2, 'student', $3, 'active', 'test')
       ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
      [TENANT_B, WORKSPACE_B, studentId],
    );
  });
}

async function cleanupStudent(studentId: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      "DELETE FROM offline_sync_commands WHERE student_id = $1::uuid",
      [studentId],
    );
    await client.query(
      "DELETE FROM learning_events WHERE student_id = $1::uuid",
      [studentId],
    );
    await client.query(
      "DELETE FROM platform_principal_bindings WHERE principal_id = $1 AND tenant_id = $2",
      [studentId, TENANT_B],
    );
    await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
  });
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 8, allowExitOnIdle: true });
  await withClient(async (client) => {
    await applyDatabaseMigrationsWithLock(client);
    await client.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_B],
    );
    await client.query(
      `INSERT INTO platform_workspaces
         (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [WORKSPACE_B, TENANT_B],
    );
  });
});

after(async () => {
  if (pool) {
    // platform_tenants ON DELETE CASCADE clears TENANT_B's workspace and bindings.
    await withClient((client) =>
      client.query("DELETE FROM platform_tenants WHERE id = $1", [TENANT_B]),
    );
  }
  await pool?.end();
  pool = null;
});

describe("Offline sync command cross-tenant isolation", () => {
  it(
    "keeps each tenant's client_event_id private: same student + event ID under two tenants commits two distinct events",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const studentId = randomUUID();
      const clientEventId = `offline-xt-${randomUUID()}`;
      await seedStudentAndTenantBBinding(studentId);

      try {
        const committedA = await processOfflineSyncCommand({
          context: context(TENANT_A, WORKSPACE_A, studentId),
          item: item(clientEventId, { progress: 10 }),
        });
        assert.equal(committedA.status, "committed");

        // Tenant B, same student, same client_event_id, byte-identical item —
        // the exact shape that would replay if tenant_id were not part of the
        // idempotency key.
        const committedB = await processOfflineSyncCommand({
          context: context(TENANT_B, WORKSPACE_B, studentId),
          item: item(clientEventId, { progress: 10 }),
        });
        assert.equal(committedB.status, "committed");

        // The core negative assertion: tenant B did NOT replay tenant A's
        // command — it committed a fresh event of its own.
        assert.equal(
          committedB.status === "committed" && committedB.replayed,
          false,
          "tenant B must not be served tenant A's committed command as a replay",
        );

        const rows = await commandRowsFor(studentId, clientEventId);
        assert.equal(rows.length, 2, "each tenant must own a distinct command row");
        assert.deepEqual(
          rows.map((row) => row.tenant_id),
          [TENANT_A, TENANT_B].sort(),
        );
        const [first, second] = rows;
        assert.notEqual(
          first.domain_event_id,
          second.domain_event_id,
          "the two tenants must commit distinct learning events",
        );
      } finally {
        await cleanupStudent(studentId);
      }
    },
  );

  it(
    "replays within the owning tenant only: re-sending tenant A's event returns tenant A's committed event",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const studentId = randomUUID();
      const clientEventId = `offline-xt-replay-${randomUUID()}`;
      await seedStudentAndTenantBBinding(studentId);

      try {
        const first = await processOfflineSyncCommand({
          context: context(TENANT_A, WORKSPACE_A, studentId),
          item: item(clientEventId, { progress: 42 }),
        });
        assert.equal(first.status === "committed" && first.replayed, false);
        await processOfflineSyncCommand({
          context: context(TENANT_B, WORKSPACE_B, studentId),
          item: item(clientEventId, { progress: 42 }),
        });

        // Re-sending the identical tenant-A event must replay tenant A's own
        // committed event, proving the idempotency lookup does not reach across
        // to tenant B's identically-keyed row.
        const replayA = await processOfflineSyncCommand({
          context: context(TENANT_A, WORKSPACE_A, studentId),
          item: item(clientEventId, { progress: 42 }),
        });
        assert.equal(replayA.status, "committed");
        assert.equal(replayA.status === "committed" && replayA.replayed, true);

        if (first.status === "committed" && replayA.status === "committed") {
          assert.equal(replayA.learningEventId, first.learningEventId);
        }
      } finally {
        await cleanupStudent(studentId);
      }
    },
  );
});
