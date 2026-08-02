import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { enqueueNotificationDomainEvent } from "../../lib/notifications/domain-outbox";
import { PLATFORM } from "../../lib/platform-config";

// Cross-tenant adversarial proof for notification_domain_outbox (#109).
//
// notification_domain_outbox is the durable producer→notification hand-off
// ledger. Its tenant boundary is UNIQUE (tenant_id, event_type, event_id):
// enqueueNotificationDomainEvent inserts ON CONFLICT (tenant_id, event_type,
// event_id) DO NOTHING and, on conflict, reads the existing row back
// (WHERE tenant_id = $1 AND event_type = $2 AND event_id = $3 FOR UPDATE) and
// throws `notification_domain_event_identity_conflict` unless payload_hash
// matches. Because hashNotificationDomainEvent folds tenant_id into the hash,
// two tenants that share an (event_type, event_id) always hash differently.
//
// The threat proven closed: tenant B enqueueing an event whose (event_type,
// event_id) collides with one tenant A already enqueued must record its OWN
// outbox row, not be rejected as a cross-tenant identity conflict. If the unique
// key or the conflict read-back dropped tenant_id, tenant B's insert would
// collide with tenant A's row, the hashes would differ, and B would throw a
// cross-tenant conflict — letting tenant A deny tenant B the ability to enqueue
// simply by picking the event id first, and leaking that A holds it. The proof
// asserts each tenant enqueues its own row, and each tenant's replay resolves to
// its own row.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT_A = PLATFORM.DEFAULT_TENANT_ID;
const TENANT_B = `tenant-b-${randomUUID()}`;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function inTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const value = await callback(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

type ProducerEvent = {
  id: string;
  tenantId: string;
  principalId: string;
  occurredAt: string;
  locale: "fa" | "en";
  version: 1;
  type: "security.new_login";
  payload: Record<string, never>;
};

function event(overrides: Partial<ProducerEvent> = {}): ProducerEvent {
  return {
    id: `evt-${randomUUID()}`,
    tenantId: TENANT_A,
    principalId: randomUUID(),
    occurredAt: new Date().toISOString(),
    locale: "fa",
    version: 1,
    type: "security.new_login",
    payload: {},
    ...overrides,
  };
}

function enqueue(rawEvent: ProducerEvent) {
  return inTransaction((client) => enqueueNotificationDomainEvent(client, rawEvent));
}

async function outboxRow(
  tenantId: string,
  eventType: string,
  eventId: string,
): Promise<{ id: string; tenant_id: string } | null> {
  return withClient(async (client) => {
    const rows = await client.query<{ id: string; tenant_id: string }>(
      `SELECT id::text, tenant_id
         FROM notification_domain_outbox
        WHERE tenant_id = $1 AND event_type = $2 AND event_id = $3`,
      [tenantId, eventType, eventId],
    );
    return rows.rows[0] ?? null;
  });
}

// A domain event can only be enqueued for a principal that exists in its tenant
// (notification_domain_outbox_(tenant_id, principal_id) FK -> platform_principals,
// whose id is globally unique). Each tenant therefore has its own principal; the
// shared surface under test is (event_type, event_id), which the unique key must
// keep tenant-private.
async function seedPrincipal(tenantId: string, principalId: string): Promise<void> {
  await withClient((client) =>
    client.query(
      `INSERT INTO platform_principals (id, tenant_id, status, locale)
       VALUES ($1::uuid, $2, 'active', 'fa')
       ON CONFLICT (id) DO NOTHING`,
      [principalId, tenantId],
    ),
  );
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
  });
});

after(async () => {
  if (pool) {
    // notification_domain_outbox is append-only (no DELETE); platform_tenants
    // ON DELETE RESTRICT from the outbox means tenant B's rows are intentionally
    // left in place — harmless in the ephemeral CI database (fresh random ids).
    await pool.end();
  }
  pool = null;
});

describe("Notification domain outbox cross-tenant isolation", () => {
  it(
    "keeps each tenant's (event_type, event_id) private: the same id under two tenants enqueues two rows",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const principalA = randomUUID();
      const principalB = randomUUID();
      await seedPrincipal(TENANT_A, principalA);
      await seedPrincipal(TENANT_B, principalB);

      const sharedEventId = `evt-shared-${randomUUID().replace(/-/g, "")}`;
      const inputA = event({ id: sharedEventId, principalId: principalA, tenantId: TENANT_A });
      // Same (type, event_id), same occurredAt/payload — only the tenant (and its
      // own principal) differ. This is the exact shape that would collide if
      // tenant_id were not part of the unique key.
      const inputB: ProducerEvent = { ...inputA, tenantId: TENANT_B, principalId: principalB };

      const committedA = await enqueue(inputA);
      assert.equal(committedA.replayed, false);

      // The core negative assertion: tenant B records its OWN outbox row and is
      // NOT rejected as a cross-tenant identity conflict against tenant A's event.
      const committedB = await enqueue(inputB);
      assert.equal(
        committedB.replayed,
        false,
        "tenant B must enqueue its own event under a shared (event_type, event_id)",
      );
      assert.notEqual(
        committedA.outboxId,
        committedB.outboxId,
        "the two tenants must own distinct outbox rows for the same event id",
      );

      const rowA = await outboxRow(TENANT_A, inputA.type, sharedEventId);
      const rowB = await outboxRow(TENANT_B, inputB.type, sharedEventId);
      assert.equal(rowA?.tenant_id, TENANT_A);
      assert.equal(rowB?.tenant_id, TENANT_B);
      assert.equal(rowA?.id, committedA.outboxId);
      assert.equal(rowB?.id, committedB.outboxId);
    },
  );

  it(
    "replays within the owning tenant only: each tenant's re-enqueue returns its own row",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const principalA = randomUUID();
      const principalB = randomUUID();
      await seedPrincipal(TENANT_A, principalA);
      await seedPrincipal(TENANT_B, principalB);

      const sharedEventId = `evt-replay-${randomUUID().replace(/-/g, "")}`;
      const inputA = event({ id: sharedEventId, principalId: principalA, tenantId: TENANT_A });
      const inputB: ProducerEvent = { ...inputA, tenantId: TENANT_B, principalId: principalB };

      // A is enqueued first, then B — so a read that lost its tenant_id predicate
      // would resolve one tenant to the other's row by insertion order.
      const firstA = await enqueue(inputA);
      const firstB = await enqueue(inputB);
      assert.equal(firstA.replayed, false);
      assert.equal(firstB.replayed, false);
      assert.notEqual(firstA.outboxId, firstB.outboxId);

      // Re-sending each tenant's identical event must replay that tenant's own
      // row. Replaying B is the load-bearing case: because A was enqueued first,
      // a tenant-blind conflict read-back would hand B tenant A's outbox id (and,
      // since the hashes differ, throw a spurious cross-tenant identity conflict).
      const replayA = await enqueue(inputA);
      assert.equal(replayA.replayed, true);
      assert.equal(replayA.outboxId, firstA.outboxId);

      const replayB = await enqueue(inputB);
      assert.equal(replayB.replayed, true);
      assert.equal(replayB.outboxId, firstB.outboxId);
      assert.notEqual(
        replayB.outboxId,
        firstA.outboxId,
        "tenant B's replay must not return tenant A's outbox row",
      );
    },
  );
});
