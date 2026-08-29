import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  reserveAiAgentSpend,
  settleAiAgentSpend,
  type AiAgentLimits,
} from "../../lib/ai/control-plane-store";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

async function withClient<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    connectionTimeoutMillis: 5_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
    allowExitOnIdle: true,
  });
});

after(async () => {
  await pool?.end();
  pool = null;
});

const limits: AiAgentLimits = {
  dailyRequests: 100,
  dailyTokens: 1_000_000,
  maxInputTokens: 10_000,
  maxOutputTokens: 1_000,
  maxRequestCostUsdMicros: 100_000,
  monthlyBudgetUsdMicros: 200_000,
};

describe("AI monthly spend authority", () => {
  it(
    "caps concurrent reservations, settles actual cost and preserves tenant scope",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const tenantId = `ai-budget-${randomUUID()}`;
      const workspaceId = `${tenantId}-main`;
      await withClient(async (client) => {
        await client.query(
          `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
           VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
          [tenantId],
        );
        await client.query(
          `INSERT INTO platform_workspaces
             (id, tenant_id, slug, display_name, products, settings)
           VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
          [workspaceId, tenantId],
        );
      });
      try {
        const attempts = await Promise.all(
          ["one", "two", "three"].map((suffix) =>
            reserveAiAgentSpend({
              tenantId,
              workspaceId,
              agentId: "mentor_coach",
              idempotencyKey: `budget-test:${suffix}:${randomUUID()}`,
              limits,
            }),
          ),
        );
        assert.equal(attempts.filter((item) => item.ok).length, 2);
        assert.equal(
          attempts.filter((item) => !item.ok && item.reason === "budget_exhausted").length,
          1,
        );
        const admitted = attempts.filter((item) => item.ok);
        const first = admitted[0];
        const second = admitted[1];
        assert.ok(first?.ok && second?.ok);
        if (!first?.ok || !second?.ok) return;

        const wrongScope = await settleAiAgentSpend({
          tenantId: `${tenantId}-other`,
          workspaceId,
          agentId: "mentor_coach",
          reservationId: first.reservation.reservationId,
          costUsdMicros: 40_000,
          providerAttempted: true,
        });
        assert.deepEqual(wrongScope, { ok: false, reason: "scope_mismatch" });

        const settled = await settleAiAgentSpend({
          tenantId,
          workspaceId,
          agentId: "mentor_coach",
          reservationId: first.reservation.reservationId,
          costUsdMicros: 40_000,
          providerAttempted: true,
        });
        assert.deepEqual(settled, {
          ok: true,
          chargedUsdMicros: 40_000,
          overrunUsdMicros: 0,
          status: "settled",
        });
        const released = await settleAiAgentSpend({
          tenantId,
          workspaceId,
          agentId: "mentor_coach",
          reservationId: second.reservation.reservationId,
          costUsdMicros: 0,
          providerAttempted: false,
        });
        assert.equal(released.ok && released.status, "released");

        const replacement = await reserveAiAgentSpend({
          tenantId,
          workspaceId,
          agentId: "mentor_coach",
          idempotencyKey: `budget-test:replacement:${randomUUID()}`,
          limits,
        });
        assert.equal(replacement.ok, true);
      } finally {
        // The CI database is job-scoped and every identity above is randomized.
        // Avoid cascade cleanup here: concurrent FK/DDL authorities can hold
        // table locks after the assertions are complete and make teardown hang.
      }
    },
  );
});
