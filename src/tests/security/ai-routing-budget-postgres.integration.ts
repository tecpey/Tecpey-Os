import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  admitAiAgentExecution,
  markAiAgentSpendEgress,
  releaseUnmarkedAiAgentSpend,
  reserveAiAgentSpend,
  settleAiAgentSpend,
  settleAiAgentSpendAndRecordRoutingDecision,
  type AiAgentLimits,
} from "../../lib/ai/control-plane-store";
import { PLATFORM } from "../../lib/platform-config";

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

async function createWorkspace(tenantId: string, workspaceId = `${tenantId}-main`) {
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
  return workspaceId;
}

describe("AI monthly spend authority", () => {
  it(
    "allows only the default-environment Mentor egress exception and preserves mark replay authority",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const tenantId = PLATFORM.DEFAULT_TENANT_ID;
      const workspaceId = PLATFORM.DEFAULT_WORKSPACE_ID;
      const admitted = await admitAiAgentExecution({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        configurationSource: "environment",
        idempotencyKey: `environment-egress:${randomUUID()}`,
        estimatedInputTokens: 10,
        maxOutputTokens: 64,
        limits: { ...limits, monthlyBudgetUsdMicros: 1_000_000_000 },
      });
      assert.equal(admitted.ok, true);
      if (!admitted.ok) return;

      const attemptId = randomUUID();
      const marked = await markAiAgentSpendEgress({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        configurationSource: "environment",
        reservationId: admitted.spend.reservationId,
        attemptId,
      });
      assert.equal(marked.ok, true);
      if (!marked.ok) return;
      assert.equal(marked.replayed, false);

      const replayed = await markAiAgentSpendEgress({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        configurationSource: "environment",
        reservationId: admitted.spend.reservationId,
        attemptId,
      });
      assert.equal(replayed.ok, true);
      if (!replayed.ok) return;
      assert.equal(replayed.replayed, true);

      const conflicting = await markAiAgentSpendEgress({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        configurationSource: "environment",
        reservationId: admitted.spend.reservationId,
        attemptId: randomUUID(),
      });
      assert.deepEqual(conflicting, { ok: false, reason: "already_marked" });

      const refusedRelease = await releaseUnmarkedAiAgentSpend({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        reservationId: admitted.spend.reservationId,
      });
      assert.deepEqual(refusedRelease, {
        ok: false,
        reason: "attempt_mismatch",
      });
      const stillMarked = await withClient((client) =>
        client.query<{
          status: string;
          egress_attempt_id: string | null;
        }>(
          `SELECT status, egress_attempt_id
             FROM ai_spend_reservations
            WHERE id = $1::uuid`,
          [admitted.spend.reservationId],
        ).then((result) => result.rows[0]),
      );
      assert.deepEqual(stillMarked, {
        status: "active",
        egress_attempt_id: attemptId,
      });

      const settled = await settleAiAgentSpend({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        reservationId: admitted.spend.reservationId,
        accountedCostUsdMicros: 0,
        egressAttemptId: attemptId,
      });
      assert.equal(settled.ok && settled.status, "settled");
    },
  );

  it(
    "rejects environment provenance spoofing when any managed binding exists",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const tenantId = PLATFORM.DEFAULT_TENANT_ID;
      const workspaceId = PLATFORM.DEFAULT_WORKSPACE_ID;
      const lockScope = `ai-agent:${tenantId}:${workspaceId}:mentor_coach`;
      const model = `provenance-spoof-${randomUUID()}`;
      let providerInserted = false;
      let bindingInserted = false;
      let pendingReleased = false;
      const pending = await reserveAiAgentSpend({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        idempotencyKey: `provenance-spoof:${randomUUID()}`,
        limits: { ...limits, monthlyBudgetUsdMicros: 1_000_000_000 },
      });
      assert.equal(pending.ok, true);
      if (!pending.ok) return;

      try {
        await withClient(async (client) => {
          await client.query("BEGIN");
          try {
            await client.query(
              "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
              [lockScope],
            );
            const existing = await client.query(
              `SELECT 1 FROM ai_agent_bindings
                WHERE tenant_id = $1 AND workspace_id = $2
                  AND agent_id = 'mentor_coach'`,
              [tenantId, workspaceId],
            );
            assert.equal(existing.rowCount, 0);
            const provider = await client.query(
              `INSERT INTO ai_provider_configs
                 (tenant_id, workspace_id, provider_id, enabled)
               VALUES ($1, $2, 'openai', FALSE)
               ON CONFLICT DO NOTHING
               RETURNING provider_id`,
              [tenantId, workspaceId],
            );
            providerInserted = provider.rowCount === 1;
            await client.query(
              `INSERT INTO ai_agent_bindings
                 (tenant_id, workspace_id, agent_id, enabled, provider_id,
                  model, daily_request_limit, daily_token_limit,
                  max_input_tokens, max_output_tokens,
                  max_request_cost_usd_micros, monthly_budget_usd_micros,
                  approval_mode)
               VALUES ($1, $2, 'mentor_coach', FALSE, 'openai', $3,
                       10, 10000, 1000, 200, 500000, 1000000, 'none')`,
              [tenantId, workspaceId, model],
            );
            bindingInserted = true;
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }
        });

        const spoofedAdmission = await admitAiAgentExecution({
          tenantId,
          workspaceId,
          agentId: "mentor_coach",
          configurationSource: "environment",
          idempotencyKey: `spoofed-admission:${randomUUID()}`,
          estimatedInputTokens: 10,
          maxOutputTokens: 64,
          limits: { ...limits, monthlyBudgetUsdMicros: 1_000_000_000 },
        });
        assert.deepEqual(spoofedAdmission, {
          ok: false,
          reason: "tenant_isolation_unresolved",
        });

        const spoofedEgress = await markAiAgentSpendEgress({
          tenantId,
          workspaceId,
          agentId: "mentor_coach",
          configurationSource: "environment",
          reservationId: pending.reservation.reservationId,
          attemptId: randomUUID(),
        });
        assert.deepEqual(spoofedEgress, {
          ok: false,
          reason: "tenant_isolation_unresolved",
        });
        const released = await releaseUnmarkedAiAgentSpend({
          tenantId,
          workspaceId,
          agentId: "mentor_coach",
          reservationId: pending.reservation.reservationId,
        });
        assert.equal(released.ok && released.status, "released");
        pendingReleased = true;
        const reservation = await withClient((client) =>
          client.query<{ status: string; egress_attempt_id: string | null }>(
            `SELECT status, egress_attempt_id
               FROM ai_spend_reservations
              WHERE id = $1::uuid`,
            [pending.reservation.reservationId],
          ).then((result) => result.rows[0]),
        );
        assert.deepEqual(reservation, {
          status: "released",
          egress_attempt_id: null,
        });

        const nonDefaultTenantId = `environment-spoof-${randomUUID()}`;
        assert.deepEqual(
          await admitAiAgentExecution({
            tenantId: nonDefaultTenantId,
            workspaceId: `${nonDefaultTenantId}-main`,
            agentId: "mentor_coach",
            configurationSource: "environment",
            idempotencyKey: `non-default:${randomUUID()}`,
            estimatedInputTokens: 10,
            maxOutputTokens: 64,
            limits,
          }),
          { ok: false, reason: "tenant_isolation_unresolved" },
        );
        assert.deepEqual(
          await markAiAgentSpendEgress({
            tenantId: nonDefaultTenantId,
            workspaceId: `${nonDefaultTenantId}-main`,
            agentId: "mentor_coach",
            configurationSource: "environment",
            reservationId: randomUUID(),
            attemptId: randomUUID(),
          }),
          { ok: false, reason: "tenant_isolation_unresolved" },
        );
      } finally {
        if (!pendingReleased) {
          await releaseUnmarkedAiAgentSpend({
            tenantId,
            workspaceId,
            agentId: "mentor_coach",
            reservationId: pending.reservation.reservationId,
          });
        }
        if (bindingInserted || providerInserted) {
          await withClient(async (client) => {
            await client.query("BEGIN");
            try {
              await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                [lockScope],
              );
              if (bindingInserted) {
                await client.query(
                  `DELETE FROM ai_agent_bindings
                    WHERE tenant_id = $1 AND workspace_id = $2
                      AND agent_id = 'mentor_coach' AND model = $3`,
                  [tenantId, workspaceId, model],
                );
              }
              if (providerInserted) {
                await client.query(
                  `DELETE FROM ai_provider_configs
                    WHERE tenant_id = $1 AND workspace_id = $2
                      AND provider_id = 'openai'`,
                  [tenantId, workspaceId],
                );
              }
              await client.query("COMMIT");
            } catch (error) {
              await client.query("ROLLBACK");
              throw error;
            }
          });
        }
      }
    },
  );

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

        const firstAttemptId = randomUUID();
        const marked = await markAiAgentSpendEgress({
          tenantId,
          workspaceId,
          agentId: "mentor_coach",
          configurationSource: "managed",
          reservationId: first.reservation.reservationId,
          attemptId: firstAttemptId,
        });
        assert.deepEqual(marked, {
          ok: false,
          reason: "tenant_isolation_unresolved",
        });
        // The launch wrapper is deliberately closed. Seed the dormant durable
        // state directly so the independent settlement invariants remain
        // covered without introducing a runtime/test override.
        await withClient((client) =>
          client.query(
            `UPDATE ai_spend_reservations
                SET egress_attempt_id = $2::uuid, egress_started_at = NOW()
              WHERE id = $1::uuid`,
            [first.reservation.reservationId, firstAttemptId],
          ),
        );

        const foreignScope = await settleAiAgentSpend({
          tenantId: `${tenantId}-other`,
          workspaceId,
          agentId: "mentor_coach",
          reservationId: first.reservation.reservationId,
          accountedCostUsdMicros: 40_000,
          egressAttemptId: firstAttemptId,
        });
        // FORCE RLS makes another tenant's row indistinguishable from a
        // nonexistent reservation. Returning scope_mismatch here would leak
        // cross-tenant row existence through the settlement API.
        assert.deepEqual(foreignScope, { ok: false, reason: "not_found" });
        const unchangedAfterForeignScope = await withClient((client) =>
          client.query<{ status: string; settled_usd_micros: string | null }>(
            `SELECT status, settled_usd_micros
               FROM ai_spend_reservations
              WHERE id = $1::uuid`,
            [first.reservation.reservationId],
          ),
        );
        assert.deepEqual(unchangedAfterForeignScope.rows, [{
          status: "active",
          settled_usd_micros: null,
        }]);

        const settled = await settleAiAgentSpend({
          tenantId,
          workspaceId,
          agentId: "mentor_coach",
          reservationId: first.reservation.reservationId,
          accountedCostUsdMicros: 40_000,
          egressAttemptId: firstAttemptId,
        });
        assert.deepEqual(settled, {
          ok: true,
          reservedUsdMicros: 100_000,
          chargedUsdMicros: 40_000,
          overrunUsdMicros: 0,
          status: "settled",
          reconciliationRequired: false,
          replayed: false,
        });
        const released = await settleAiAgentSpend({
          tenantId,
          workspaceId,
          agentId: "mentor_coach",
          reservationId: second.reservation.reservationId,
          accountedCostUsdMicros: 0,
          egressAttemptId: null,
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

        const scopedEvidence = await withClient(async (client) => {
          const monthly = await client.query<{ active_reserved_usd_micros: string }>(
            `SELECT active_reserved_usd_micros::text
               FROM ai_agent_spend_monthly
              WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = 'mentor_coach'`,
            [tenantId, workspaceId],
          );
          const reservations = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM ai_spend_reservations
              WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = 'mentor_coach'`,
            [tenantId, workspaceId],
          );
          return { monthly: monthly.rows, reservations: reservations.rows };
        });
        assert.equal(scopedEvidence.monthly.length, 1);
        assert.equal(Number(scopedEvidence.reservations[0]?.count ?? 0) >= 3, true);
      } finally {
        // The CI database is job-scoped and every identity above is randomized.
        // Avoid cascade cleanup here: concurrent FK/DDL authorities can hold
        // table locks after the assertions are complete and make teardown hang.
      }
    },
  );

  it(
    "reconciles marked and unmarked expiry across month rollover and accepts only monotonic late settlement",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const tenantId = `ai-budget-rollover-${randomUUID()}`;
      const workspaceId = await createWorkspace(tenantId);
      const otherWorkspaceId = `${tenantId}-other`;
      await withClient((client) =>
        client.query(
          `INSERT INTO platform_workspaces
             (id, tenant_id, slug, display_name, products, settings)
           VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
          [otherWorkspaceId, tenantId],
        ).then(() => undefined),
      );
      const releasedId = randomUUID();
      const ambiguousId = randomUUID();
      const ambiguousAttemptId = randomUUID();
      await withClient(async (client) => {
        await client.query(
          `INSERT INTO ai_agent_spend_monthly
             (tenant_id, workspace_id, agent_id, budget_month,
              active_reserved_usd_micros, settled_usd_micros)
           VALUES ($1, $2, 'mentor_coach',
                   (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date,
                   200000, 0)`,
          [tenantId, workspaceId],
        );
        await client.query(
          `INSERT INTO ai_spend_reservations
             (id, tenant_id, workspace_id, agent_id, budget_month,
              idempotency_key, reserved_usd_micros, egress_attempt_id,
              egress_started_at, expires_at)
           VALUES
             ($1::uuid, $3, $4, 'mentor_coach',
              (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date,
              $5, 100000, NULL, NULL, NOW() - INTERVAL '1 minute'),
             ($2::uuid, $3, $4, 'mentor_coach',
              (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date,
              $6, 100000, $7::uuid, NOW() - INTERVAL '2 minutes',
              NOW() - INTERVAL '1 minute')`,
          [
            releasedId,
            ambiguousId,
            tenantId,
            workspaceId,
            `rollover:released:${randomUUID()}`,
            `rollover:ambiguous:${randomUUID()}`,
            ambiguousAttemptId,
          ],
        );
      });

      const nextMonthActivity = await reserveAiAgentSpend({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        idempotencyKey: `rollover:next:${randomUUID()}`,
        limits,
      });
      assert.equal(nextMonthActivity.ok, true);

      const reconciled = await withClient(async (client) => {
        const monthly = await client.query<{
          active_reserved_usd_micros: string;
          settled_usd_micros: string;
        }>(
          `SELECT active_reserved_usd_micros::text, settled_usd_micros::text
             FROM ai_agent_spend_monthly
            WHERE tenant_id = $1 AND workspace_id = $2
              AND agent_id = 'mentor_coach'
              AND budget_month =
                (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date`,
          [tenantId, workspaceId],
        );
        const reservations = await client.query<{
          id: string;
          status: string;
          settled_usd_micros: string;
          reconciliation_required: boolean;
        }>(
          `SELECT id, status, settled_usd_micros::text,
                  reconciliation_required
             FROM ai_spend_reservations
            WHERE id = ANY($1::uuid[])
            ORDER BY id`,
          [[releasedId, ambiguousId]],
        );
        return { monthly: monthly.rows[0], reservations: reservations.rows };
      });
      assert.deepEqual(reconciled.monthly, {
        active_reserved_usd_micros: "0",
        settled_usd_micros: "100000",
      });
      const released = reconciled.reservations.find((row) => row.id === releasedId);
      const ambiguous = reconciled.reservations.find((row) => row.id === ambiguousId);
      assert.deepEqual(released, {
        id: releasedId,
        status: "released",
        settled_usd_micros: "0",
        reconciliation_required: false,
      });
      assert.deepEqual(ambiguous, {
        id: ambiguousId,
        status: "settled",
        settled_usd_micros: "100000",
        reconciliation_required: true,
      });

      const releasedAttemptMismatch = await settleAiAgentSpend({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        reservationId: releasedId,
        accountedCostUsdMicros: 1,
        egressAttemptId: randomUUID(),
      });
      assert.deepEqual(releasedAttemptMismatch, {
        ok: false,
        reason: "attempt_mismatch",
      });
      const late = await settleAiAgentSpend({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        reservationId: ambiguousId,
        accountedCostUsdMicros: 150_000,
        egressAttemptId: ambiguousAttemptId,
      });
      assert.equal(late.ok && late.chargedUsdMicros, 150_000);
      assert.equal(late.ok && late.reconciliationRequired, false);
      const lowerReplay = await settleAiAgentSpend({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        reservationId: ambiguousId,
        accountedCostUsdMicros: 80_000,
        egressAttemptId: ambiguousAttemptId,
      });
      assert.equal(lowerReplay.ok && lowerReplay.chargedUsdMicros, 150_000);
      assert.equal(lowerReplay.ok && lowerReplay.replayed, true);
      const wrongAttempt = await settleAiAgentSpend({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        reservationId: ambiguousId,
        accountedCostUsdMicros: 160_000,
        egressAttemptId: randomUUID(),
      });
      assert.deepEqual(wrongAttempt, { ok: false, reason: "attempt_mismatch" });

      await assert.rejects(
        withClient((client) =>
          client.query("DELETE FROM ai_spend_reservations WHERE id = $1::uuid", [
            releasedId,
          ]),
        ),
        /append-only|mutation|delete/i,
      );
      await assert.rejects(
        withClient((client) =>
          client.query(
            `INSERT INTO ai_routing_decision_events
               (tenant_id, workspace_id, run_id, agent_id, provider_id,
                route_mode, decision_code, candidate_count, data_class,
                criticality, external_effect, approval_mode,
                spend_reservation_id, provider_attempt_count,
                reserved_usd_micros, accounted_cost_usd_micros,
                overrun_usd_micros, decision_hash)
             VALUES ($1, $2, $3::uuid, 'mentor_coach', 'openai', 'primary',
                     'provider_completed', 1, 'public', 'noncritical', FALSE,
                     'none', $4::uuid, 1, 100000, 150000, 50000, $5)`,
            [
              tenantId,
              otherWorkspaceId,
              randomUUID(),
              ambiguousId,
              "a".repeat(64),
            ],
          ),
        ),
        (error: unknown) =>
          typeof error === "object" && error !== null &&
          "code" in error && error.code === "23503",
      );
    },
  );

  it(
    "atomically replays exact settlement evidence and rolls back conflicting retries",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const tenantId = PLATFORM.DEFAULT_TENANT_ID;
      const workspaceId = PLATFORM.DEFAULT_WORKSPACE_ID;
      const admitted = await reserveAiAgentSpend({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        idempotencyKey: `atomic:${randomUUID()}`,
        limits: { ...limits, monthlyBudgetUsdMicros: 1_000_000_000 },
      });
      assert.equal(admitted.ok, true);
      if (!admitted.ok) return;
      const attemptId = randomUUID();
      const marked = await markAiAgentSpendEgress({
        tenantId,
        workspaceId,
        agentId: "mentor_coach",
        configurationSource: "environment",
        reservationId: admitted.reservation.reservationId,
        attemptId,
      });
      assert.equal(marked.ok, true);
      const routing = {
        tenantId,
        workspaceId,
        runId: randomUUID(),
        agentId: "mentor_coach" as const,
        providerId: "openai" as const,
        routeMode: "primary" as const,
        decisionCode: "provider_completed",
        candidateCount: 2,
        dataClass: "public" as const,
        criticality: "noncritical" as const,
        externalEffect: false,
        approvalMode: "none" as const,
        spendReservationId: admitted.reservation.reservationId,
        requestedModel: "gpt-5",
        actualModel: "gpt-5",
        providerAttemptCount: 2,
      };
      const settlement = {
        tenantId,
        workspaceId,
        agentId: "mentor_coach" as const,
        reservationId: admitted.reservation.reservationId,
        accountedCostUsdMicros: 135_000,
        egressAttemptId: attemptId,
      };
      const first = await settleAiAgentSpendAndRecordRoutingDecision({
        settlement,
        routing,
      });
      assert.equal(first.ok && first.settlement.chargedUsdMicros, 135_000);
      const exactReplay = await settleAiAgentSpendAndRecordRoutingDecision({
        settlement,
        routing,
      });
      assert.equal(exactReplay.ok && exactReplay.settlement.replayed, true);

      const conflict = await settleAiAgentSpendAndRecordRoutingDecision({
        settlement: { ...settlement, accountedCostUsdMicros: 160_000 },
        routing,
      });
      assert.deepEqual(conflict, { ok: false, reason: "unavailable" });
      const evidence = await withClient(async (client) => {
        const reservation = await client.query<{
          settled_usd_micros: string;
          overrun_usd_micros: string;
        }>(
          `SELECT settled_usd_micros::text, overrun_usd_micros::text
             FROM ai_spend_reservations WHERE id = $1::uuid`,
          [admitted.reservation.reservationId],
        );
        const events = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM ai_routing_decision_events
            WHERE spend_reservation_id = $1::uuid`,
          [admitted.reservation.reservationId],
        );
        return { reservation: reservation.rows[0], events: events.rows[0] };
      });
      assert.deepEqual(evidence.reservation, {
        settled_usd_micros: "135000",
        overrun_usd_micros: "35000",
      });
      assert.deepEqual(evidence.events, { count: "1" });
    },
  );
});
