import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  CommerceWebhookAuthorityError,
  ingestVerifiedCommercialWebhook,
  type VerifiedCommercialWebhook,
} from "../../lib/commerce/commerce-webhook-authority";
import { runProCommerceAuthorityMigrations } from "../../lib/db-migrate-pro-commerce-authority";
import { runProCommerceLedgerHardeningMigrations } from "../../lib/db-migrate-pro-commerce-ledger-hardening";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

function verified(input: {
  eventId: string;
  subscriptionId: string;
  occurredAt: string;
  state?: "active" | "suspended";
  payloadSha?: string;
}): VerifiedCommercialWebhook {
  return {
    event: {
      provider: "testpay",
      providerAccountScope: "merchant-main",
      providerEventId: input.eventId,
      providerObjectId: input.subscriptionId,
      occurredAt: new Date(input.occurredAt),
      normalizedState: input.state ?? "active",
      currentPeriodEnd: new Date("2026-12-31T00:00:00Z"),
      cancelAt: null,
    },
    eventType: "subscription.updated",
    payloadSha256: input.payloadSha ?? "a".repeat(64),
    payloadRedacted: { object: "subscription" },
    payloadExpiresAt: new Date("2027-01-01T00:00:00Z"),
  };
}

async function seedScope(client: PoolClient, suffix: string) {
  const tenantId = `commerce-webhook-${suffix}`;
  const workspaceId = `commerce-webhook-ws-${suffix}`;
  const accountId = `commerce-webhook-account-${suffix}`;
  await client.query(
    "INSERT INTO platform_tenants (id,slug,display_name,plan,products) VALUES ($1,$1,$1,'enterprise','{}')",
    [tenantId],
  );
  await client.query(
    "INSERT INTO platform_workspaces (id,tenant_id,slug,display_name,products) VALUES ($1,$2,$1,$1,'{}')",
    [workspaceId, tenantId],
  );
  await client.query(
    `INSERT INTO academy_auth_accounts (id,email,username,display_name,password_hash)
     VALUES ($1,$2,$3,'Commerce webhook test','not-a-login-credential')`,
    [accountId, `${suffix}@commerce.invalid`, `commerce_${suffix}`],
  );
  await client.query(
    `INSERT INTO commerce_plan_versions
      (tenant_id,workspace_id,plan_key,version,status,currency,unit_amount_minor,billing_interval,
       capability_grants,legal_copy_version,effective_from)
     VALUES ($1,$2,'pro',1,'active','USD',1000,'month','{"mentor_pro":true}'::jsonb,'v1',
             '2026-01-01T00:00:00Z')`,
    [tenantId, workspaceId],
  );
  return { tenantId, workspaceId, accountId };
}

async function seedSubscription(
  client: PoolClient,
  scope: { tenantId: string; workspaceId: string; accountId: string },
  providerSubscriptionId: string,
) {
  const row = await client.query<{ id: string }>(
    `INSERT INTO commerce_subscriptions
      (tenant_id,workspace_id,account_id,provider,provider_account_scope,provider_subscription_id,
       plan_key,plan_version,state,effective_at,state_version)
     VALUES ($1,$2,$3,'testpay','merchant-main',$4,'pro',1,'pending','2026-09-01T00:00:00Z',1)
     RETURNING id`,
    [scope.tenantId, scope.workspaceId, scope.accountId, providerSubscriptionId],
  );
  return row.rows[0].id;
}

test("commerce webhook transaction is concurrency-idempotent, ordered and rollback-atomic", { skip: !databaseUrl, timeout: 45_000 }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const setup = await pool.connect();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  try {
    await runProCommerceAuthorityMigrations(setup);
    await runProCommerceLedgerHardeningMigrations(setup);
    const scope = await seedScope(setup, suffix);
    const providerSubscriptionId = `sub-${suffix}`;
    const subscriptionPk = await seedSubscription(setup, scope, providerSubscriptionId);

    const firstEvent = verified({
      eventId: `evt-concurrent-${suffix}`,
      subscriptionId: providerSubscriptionId,
      occurredAt: "2026-09-22T10:00:00Z",
    });
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    let concurrent;
    try {
      concurrent = await Promise.all([
        ingestVerifiedCommercialWebhook(c1, scope, firstEvent),
        ingestVerifiedCommercialWebhook(c2, scope, firstEvent),
      ]);
    } finally {
      c1.release();
      c2.release();
    }
    assert.deepEqual(new Set(concurrent.map((result) => result.outcome)), new Set(["applied", "duplicate"]));

    const afterConcurrent = await setup.query<{
      state: string; state_version: string; events: string; reconciliations: string; snapshots: string;
    }>(
      `SELECT s.state, s.state_version::text,
        (SELECT COUNT(*)::text FROM commerce_provider_events e
          WHERE e.tenant_id=s.tenant_id AND e.workspace_id=s.workspace_id
            AND e.provider_event_id=$4) AS events,
        (SELECT COUNT(*)::text FROM commerce_reconciliation_records r
          WHERE r.subscription_id=s.id) AS reconciliations,
        (SELECT COUNT(*)::text FROM commerce_entitlement_snapshots x
          WHERE x.subscription_id=s.id) AS snapshots
       FROM commerce_subscriptions s
       WHERE s.id=$3 AND s.tenant_id=$1 AND s.workspace_id=$2`,
      [scope.tenantId, scope.workspaceId, subscriptionPk, firstEvent.event.providerEventId],
    );
    assert.deepEqual(afterConcurrent.rows[0], {
      state: "active", state_version: "2", events: "1", reconciliations: "1", snapshots: "1",
    });

    const stale = await ingestVerifiedCommercialWebhook(
      setup,
      scope,
      verified({
        eventId: `evt-stale-${suffix}`,
        subscriptionId: providerSubscriptionId,
        occurredAt: "2026-09-22T09:00:00Z",
        state: "suspended",
        payloadSha: "b".repeat(64),
      }),
    );
    assert.equal(stale.outcome, "superseded");
    assert.equal(stale.stateVersion, 2);
    const staleEvidence = await setup.query<{ decision: string; reason_code: string }>(
      `SELECT decision, reason_code FROM commerce_reconciliation_records r
       JOIN commerce_provider_events e ON e.id=r.provider_event_id
       WHERE e.tenant_id=$1 AND e.workspace_id=$2 AND e.provider_event_id=$3`,
      [scope.tenantId, scope.workspaceId, `evt-stale-${suffix}`],
    );
    assert.deepEqual(staleEvidence.rows[0], { decision: "superseded", reason_code: "duplicate_or_stale" });

    await assert.rejects(
      ingestVerifiedCommercialWebhook(
        setup,
        scope,
        { ...firstEvent, payloadSha256: "c".repeat(64) },
      ),
      (error: unknown) =>
        error instanceof CommerceWebhookAuthorityError && error.code === "event_identity_conflict",
    );
    assert.equal(
      Number((await setup.query(
        "SELECT COUNT(*)::int AS count FROM commerce_provider_events WHERE tenant_id=$1 AND workspace_id=$2 AND provider_event_id=$3",
        [scope.tenantId, scope.workspaceId, firstEvent.event.providerEventId],
      )).rows[0].count),
      1,
    );

    const rollbackProviderId = `sub-rollback-${suffix}`;
    const rollbackPk = await seedSubscription(setup, scope, rollbackProviderId);
    await setup.query(
      `INSERT INTO commerce_entitlement_snapshots
        (tenant_id,workspace_id,account_id,subscription_id,snapshot_version,source_kind,
         capabilities,valid_from)
       VALUES ($1,$2,$3,$4,2,'commercial_subscription','{}','2026-09-01T00:00:00Z')`,
      [scope.tenantId, scope.workspaceId, scope.accountId, rollbackPk],
    );
    const rollbackEventId = `evt-rollback-${suffix}`;
    await assert.rejects(
      ingestVerifiedCommercialWebhook(
        setup,
        scope,
        verified({
          eventId: rollbackEventId,
          subscriptionId: rollbackProviderId,
          occurredAt: "2026-09-22T11:00:00Z",
          payloadSha: "d".repeat(64),
        }),
      ),
      /duplicate key|unique constraint/i,
    );
    const rollbackState = await setup.query<{ state: string; state_version: string; events: string; reconciliations: string }>(
      `SELECT s.state, s.state_version::text,
        (SELECT COUNT(*)::text FROM commerce_provider_events e
          WHERE e.tenant_id=s.tenant_id AND e.workspace_id=s.workspace_id AND e.provider_event_id=$4) AS events,
        (SELECT COUNT(*)::text FROM commerce_reconciliation_records r
          JOIN commerce_provider_events e ON e.id=r.provider_event_id
          WHERE e.tenant_id=s.tenant_id AND e.workspace_id=s.workspace_id AND e.provider_event_id=$4) AS reconciliations
       FROM commerce_subscriptions s WHERE s.id=$3 AND s.tenant_id=$1 AND s.workspace_id=$2`,
      [scope.tenantId, scope.workspaceId, rollbackPk, rollbackEventId],
    );
    assert.deepEqual(rollbackState.rows[0], {
      state: "pending", state_version: "1", events: "0", reconciliations: "0",
    });
  } finally {
    setup.release();
    await pool.end();
  }
});
