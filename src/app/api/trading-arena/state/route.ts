import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { recordLearningEvent } from "@/lib/learning-os";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText, numeric } from "@/lib/student-cartax";
import {
  ARENA_ATTEMPTS_PER_CYCLE,
  ARENA_INITIAL_BALANCE,
  type ArenaAccount,
  type ArenaAttempt,
} from "@/lib/trading-arena-account";
import {
  applyArenaExecutionAction,
  createAuthoritativeArenaState,
  executionEquity,
  normalizeArenaExecutionState,
  type ArenaExecutionAction,
} from "@/lib/trading-arena-execution";
import type { Asset, ClosureReason, TradingArenaState } from "@/lib/trading-arena";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccountRow = {
  cycle_id: string;
  status: ArenaAccount["status"];
  initial_balance: string;
  available_balance: string;
  attempts_total: number;
  attempts_used: number;
  current_attempt: number;
  revision: string;
  cycle_started_at: Date | string;
  cycle_ends_at: Date | string;
};

type AttemptRow = {
  id: string;
  cycle_id: string;
  attempt_number: number;
  status: ArenaAttempt["status"];
  starting_balance: string;
  cash_balance: string;
  equity: string;
  started_at: Date | string | null;
  ended_at: Date | string | null;
  execution_state: unknown;
  execution_revision: string;
};

type ArenaContext = {
  account: ArenaAccount;
  attempts: ArenaAttempt[];
  activeAttempt: ArenaAttempt | null;
  activeRow: AttemptRow | null;
};

function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function mapAccount(row: AccountRow): ArenaAccount {
  const total = Number(row.attempts_total);
  const used = Number(row.attempts_used);
  return {
    cycleId: row.cycle_id,
    status: row.status,
    initialBalance: row.initial_balance,
    availableBalance: row.available_balance,
    attemptsTotal: total,
    attemptsUsed: used,
    attemptsRemaining: Math.max(0, total - used),
    currentAttempt: Number(row.current_attempt),
    revision: Number(row.revision),
    cycleStartedAt: iso(row.cycle_started_at) as string,
    cycleEndsAt: iso(row.cycle_ends_at) as string,
  };
}

function mapAttempt(row: AttemptRow): ArenaAttempt {
  return {
    id: row.id,
    cycleId: row.cycle_id,
    attemptNumber: Number(row.attempt_number),
    status: row.status,
    startingBalance: row.starting_balance,
    cashBalance: row.cash_balance,
    equity: row.equity,
    startedAt: iso(row.started_at),
    endedAt: iso(row.ended_at),
  };
}

async function ensureArenaContext(client: PoolClient, studentId: string): Promise<ArenaContext> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`arena-execution:${studentId}`]);
  await client.query(
    `INSERT INTO academy_trading_arena_accounts
       (student_id, initial_balance, available_balance, attempts_total, attempts_used, current_attempt)
     VALUES ($1::uuid, $2::numeric, $2::numeric, $3, 0, 1)
     ON CONFLICT (student_id) DO NOTHING`,
    [studentId, ARENA_INITIAL_BALANCE, ARENA_ATTEMPTS_PER_CYCLE],
  );

  const accountResult = await client.query<AccountRow>(
    `SELECT cycle_id::text, status, initial_balance::text, available_balance::text,
            attempts_total, attempts_used, current_attempt, revision::text,
            cycle_started_at, cycle_ends_at
     FROM academy_trading_arena_accounts
     WHERE student_id = $1::uuid
     FOR UPDATE`,
    [studentId],
  );
  const accountRow = accountResult.rows[0];
  if (!accountRow) throw new Error("arena_account_not_found");

  await client.query(
    `INSERT INTO academy_trading_arena_attempts
       (student_id, cycle_id, attempt_number, status, starting_balance, cash_balance, equity, started_at)
     SELECT $1::uuid, $2::uuid, attempt_number,
            CASE WHEN attempt_number = 1 THEN 'active' ELSE 'available' END,
            $3::numeric, $3::numeric, $3::numeric,
            CASE WHEN attempt_number = 1 THEN NOW() ELSE NULL END
     FROM generate_series(1, $4::int) AS attempt_number
     ON CONFLICT (student_id, cycle_id, attempt_number) DO NOTHING`,
    [studentId, accountRow.cycle_id, ARENA_INITIAL_BALANCE, ARENA_ATTEMPTS_PER_CYCLE],
  );

  const attemptsResult = await client.query<AttemptRow>(
    `SELECT id::text, cycle_id::text, attempt_number, status,
            starting_balance::text, cash_balance::text, equity::text,
            started_at, ended_at, execution_state, execution_revision::text
     FROM academy_trading_arena_attempts
     WHERE student_id = $1::uuid AND cycle_id = $2::uuid
     ORDER BY attempt_number ASC
     FOR UPDATE`,
    [studentId, accountRow.cycle_id],
  );

  const activeRow = attemptsResult.rows.find((row) => row.status === "active") ?? null;
  return {
    account: mapAccount(accountRow),
    attempts: attemptsResult.rows.map(mapAttempt),
    activeAttempt: activeRow ? mapAttempt(activeRow) : null,
    activeRow,
  };
}

async function initializeStateIfNeeded(
  client: PoolClient,
  context: ArenaContext,
): Promise<{ state: TradingArenaState | null; revision: number }> {
  if (!context.activeRow) return { state: null, revision: 0 };
  const revision = Number(context.activeRow.execution_revision);
  const initialBalance = Number(context.activeRow.starting_balance) || 100_000;
  const state = normalizeArenaExecutionState(context.activeRow.execution_state, initialBalance);

  if (revision > 0 && Object.keys(context.activeRow.execution_state as object ?? {}).length > 0) {
    return { state, revision };
  }

  const fresh = createAuthoritativeArenaState(initialBalance);
  const saved = await client.query<{ execution_revision: string }>(
    `UPDATE academy_trading_arena_attempts
     SET execution_state = $2::jsonb,
         execution_revision = 1,
         execution_updated_at = NOW(),
         cash_balance = $3::numeric,
         equity = $3::numeric,
         updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING execution_revision::text`,
    [context.activeRow.id, JSON.stringify(fresh), fresh.balance],
  );
  return { state: fresh, revision: Number(saved.rows[0]?.execution_revision ?? 1) };
}

function positivePrice(value: unknown): number | null {
  const price = numeric(value, 0);
  return price > 0 && price < 100_000_000 ? price : null;
}

function optionalPrice(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return positivePrice(value) ?? undefined;
}

function asset(value: unknown): Asset | null {
  return value === "BTC" || value === "ETH" ? value : null;
}

function parseAction(value: unknown): ArenaExecutionAction | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  if (raw.type === "market_buy") {
    const selectedAsset = asset(raw.asset);
    const marketPrice = positivePrice(raw.marketPrice);
    const usdtAmount = numeric(raw.usdtAmount, 0);
    if (!selectedAsset || !marketPrice || usdtAmount < 10 || usdtAmount > 100_000) return null;
    return {
      type: "market_buy",
      asset: selectedAsset,
      usdtAmount,
      marketPrice,
      stopLoss: optionalPrice(raw.stopLoss),
      takeProfit: optionalPrice(raw.takeProfit),
      preTradePlan: cleanText(raw.preTradePlan, 1_500),
      emotionalState: cleanText(raw.emotionalState, 80),
    };
  }

  if (raw.type === "limit_order") {
    const selectedAsset = asset(raw.asset);
    const limitPrice = positivePrice(raw.limitPrice);
    const usdtAmount = numeric(raw.usdtAmount, 0);
    if (!selectedAsset || !limitPrice || usdtAmount < 10 || usdtAmount > 100_000) return null;
    return {
      type: "limit_order",
      asset: selectedAsset,
      usdtAmount,
      limitPrice,
      stopLoss: optionalPrice(raw.stopLoss),
      takeProfit: optionalPrice(raw.takeProfit),
      preTradePlan: cleanText(raw.preTradePlan, 1_500),
      emotionalState: cleanText(raw.emotionalState, 80),
    };
  }

  if (raw.type === "close_position") {
    const positionId = cleanText(raw.positionId, 120);
    const exitPrice = positivePrice(raw.exitPrice);
    const reason: ClosureReason = raw.reason === "stop-loss" || raw.reason === "take-profit" || raw.reason === "scenario-end"
      ? raw.reason
      : "manual";
    if (!positionId || !exitPrice) return null;
    return { type: "close_position", positionId, exitPrice, reason };
  }

  if (raw.type === "cancel_order") {
    const orderId = cleanText(raw.orderId, 120);
    return orderId ? { type: "cancel_order", orderId } : null;
  }

  if (raw.type === "price_tick") {
    const btc = positivePrice((raw.prices as Record<string, unknown> | undefined)?.BTC);
    const eth = positivePrice((raw.prices as Record<string, unknown> | undefined)?.ETH);
    return btc && eth ? { type: "price_tick", prices: { BTC: btc, ETH: eth } } : null;
  }

  if (raw.type === "scenario_result") {
    const scenarioId = cleanText(raw.scenarioId, 160);
    const status = raw.status === "passed" ? "passed" : raw.status === "failed" ? "failed" : null;
    return scenarioId && status ? { type: "scenario_result", scenarioId, status } : null;
  }

  return null;
}

function actionPrices(action: ArenaExecutionAction): Partial<Record<Asset, number>> | undefined {
  if (action.type === "price_tick") return action.prices;
  if (action.type === "market_buy") return { [action.asset]: action.marketPrice };
  if (action.type === "close_position") return undefined;
  return undefined;
}

async function recordTradeDecision(
  client: PoolClient,
  studentId: string,
  stateBefore: TradingArenaState,
  action: ArenaExecutionAction,
) {
  if (action.type !== "market_buy" && action.type !== "limit_order") return;
  const price = action.type === "market_buy" ? action.marketPrice : action.limitPrice;
  const risk = stateBefore.initialBalance > 0
    ? Number(((action.usdtAmount / stateBefore.initialBalance) * 100).toFixed(2))
    : 0;
  const riskFlag = risk > 5 || /revenge|انتقام|fomo|فومو/i.test(`${action.emotionalState ?? ""} ${action.preTradePlan ?? ""}`);
  const discipline = Math.max(0, Math.min(100, Math.round(100 - risk * 8 + (action.stopLoss ? 10 : 0) + ((action.preTradePlan?.length ?? 0) > 30 ? 8 : 0))));
  const riskPlan = [
    action.stopLoss ? `SL:${action.stopLoss}` : "SL:not-set",
    action.takeProfit ? `TP:${action.takeProfit}` : "TP:not-set",
  ].join(" ");

  await client.query(
    `INSERT INTO academy_trading_arena_trades
       (id, student_id, symbol, side, order_type, size_usdt, risk_percent,
        entry_reason, emotion, risk_plan, mentor_note, discipline_score, risk_flag)
     VALUES ($1::uuid, $2::uuid, $3, 'buy', $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      randomUUID(),
      studentId,
      action.asset,
      action.type === "market_buy" ? "market" : "limit",
      action.usdtAmount,
      risk,
      action.preTradePlan || `Arena execution at ${price}`,
      action.emotionalState || "not-recorded",
      riskPlan,
      "Execution state stored on the active Arena attempt.",
      discipline,
      riskFlag,
    ],
  );
}

async function activateNextAttempt(client: PoolClient, studentId: string, context: ArenaContext) {
  const active = context.activeRow;
  if (!active) return { error: "arena_no_active_attempt" as const };

  await client.query(
    `UPDATE academy_trading_arena_attempts
     SET status = 'failed', ended_at = NOW(), updated_at = NOW()
     WHERE id = $1::uuid`,
    [active.id],
  );

  const used = Math.min(context.account.attemptsTotal, context.account.attemptsUsed + 1);
  if (active.attempt_number >= context.account.attemptsTotal) {
    await client.query(
      `UPDATE academy_trading_arena_accounts
       SET status = 'locked', attempts_used = $2, available_balance = 0,
           revision = revision + 1, updated_at = NOW()
       WHERE student_id = $1::uuid`,
      [studentId, used],
    );
    return { error: "arena_attempts_exhausted" as const };
  }

  const nextNumber = active.attempt_number + 1;
  const fresh = createAuthoritativeArenaState(Number(active.starting_balance) || 100_000);
  const next = await client.query<AttemptRow>(
    `UPDATE academy_trading_arena_attempts
     SET status = 'active', started_at = NOW(), ended_at = NULL,
         cash_balance = starting_balance, equity = starting_balance,
         execution_state = $4::jsonb, execution_revision = 1,
         execution_updated_at = NOW(), updated_at = NOW()
     WHERE student_id = $1::uuid AND cycle_id = $2::uuid AND attempt_number = $3
     RETURNING id::text, cycle_id::text, attempt_number, status,
               starting_balance::text, cash_balance::text, equity::text,
               started_at, ended_at, execution_state, execution_revision::text`,
    [studentId, active.cycle_id, nextNumber, JSON.stringify(fresh)],
  );
  if (!next.rows[0]) throw new Error("arena_next_attempt_not_found");

  await client.query(
    `UPDATE academy_trading_arena_accounts
     SET status = 'active', attempts_used = $2, current_attempt = $3,
         available_balance = $4::numeric, revision = revision + 1, updated_at = NOW()
     WHERE student_id = $1::uuid`,
    [studentId, used, nextNumber, fresh.balance],
  );

  return { state: fresh, revision: 1, attempt: mapAttempt(next.rows[0]) };
}

export async function GET(request: NextRequest) {
  return withObservability(request, { route: "/api/trading-arena/state" }, async () => {
    const limit = await rateLimit(request, { namespace: "arena-state-read", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(request);
    if (!session.studentId) return apiError("academy_profile_required", 401);

    try {
      const result = await withTx(async (client) => {
        const context = await ensureArenaContext(client, session.studentId as string);
        const execution = await initializeStateIfNeeded(client, context);
        return {
          account: context.account,
          attempts: context.attempts,
          activeAttempt: context.activeAttempt,
          state: execution.state,
          revision: execution.revision,
        };
      });
      if (!result.enabled) return apiError("arena_state_unavailable", 503);
      return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
    } catch {
      return apiError("arena_state_unavailable", 503);
    }
  });
}

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/trading-arena/state" }, async () => {
    if (!verifyCsrfOrigin(request)) return apiError("forbidden", 403);
    if (!checkBodySize(request.headers.get("content-length"), 24_000)) return apiError("payload_too_large", 413);

    const limit = await rateLimit(request, { namespace: "arena-state-write", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(request, { strictRevocation: true });
    if (!session.studentId) return apiError("academy_profile_required", 401);

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return apiError("invalid_json", 400);
    }

    const resetAttempt = body.action === "start_next_attempt";
    const action = resetAttempt ? null : parseAction(body.action);
    const expectedRevision = Number(body.expectedRevision);
    if (!resetAttempt && !action) return apiError("invalid_arena_action", 400);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return apiError("invalid_revision", 400);

    try {
      const result = await withTx(async (client) => {
        const context = await ensureArenaContext(client, session.studentId as string);
        if (resetAttempt) {
          const advanced = await activateNextAttempt(client, session.studentId as string, context);
          if ("error" in advanced) return advanced;
          const refreshed = await ensureArenaContext(client, session.studentId as string);
          await recordLearningEvent(client, {
            studentId: session.studentId as string,
            eventType: "arena_attempt_started",
            payload: { attemptNumber: advanced.attempt.attemptNumber },
          });
          return {
            error: null,
            account: refreshed.account,
            attempts: refreshed.attempts,
            activeAttempt: advanced.attempt,
            state: advanced.state,
            revision: advanced.revision,
            eventType: "arena_attempt_started",
          };
        }

        if (context.account.status !== "active" || !context.activeRow || !context.activeAttempt) {
          return { error: "arena_no_active_attempt" as const };
        }

        const execution = await initializeStateIfNeeded(client, context);
        if (!execution.state) return { error: "arena_no_active_attempt" as const };
        if (execution.revision !== expectedRevision) {
          return {
            error: "revision_conflict" as const,
            state: execution.state,
            revision: execution.revision,
            account: context.account,
            attempts: context.attempts,
            activeAttempt: context.activeAttempt,
          };
        }

        const applied = applyArenaExecutionAction(execution.state, action as ArenaExecutionAction);
        if (!applied.ok) return { error: applied.error as string };
        const state = normalizeArenaExecutionState(applied.state, execution.state.initialBalance);
        const prices = actionPrices(action as ArenaExecutionAction);
        const equity = executionEquity(state, prices);

        const saved = await client.query<{ execution_revision: string }>(
          `UPDATE academy_trading_arena_attempts
           SET execution_state = $2::jsonb,
               execution_revision = execution_revision + 1,
               execution_updated_at = NOW(),
               cash_balance = $3::numeric,
               equity = $4::numeric,
               updated_at = NOW()
           WHERE id = $1::uuid
           RETURNING execution_revision::text`,
          [context.activeRow.id, JSON.stringify(state), state.balance, equity],
        );
        const revision = Number(saved.rows[0]?.execution_revision ?? execution.revision + 1);

        await client.query(
          `UPDATE academy_trading_arena_accounts
           SET available_balance = $2::numeric, revision = revision + 1, updated_at = NOW()
           WHERE student_id = $1::uuid`,
          [session.studentId, state.balance],
        );

        await recordTradeDecision(client, session.studentId as string, execution.state, action as ArenaExecutionAction);
        if ((action as ArenaExecutionAction).type !== "price_tick") {
          await recordLearningEvent(client, {
            studentId: session.studentId as string,
            eventType: "arena_execution_action",
            payload: {
              actionType: (action as ArenaExecutionAction).type,
              attemptNumber: context.activeAttempt.attemptNumber,
              revision,
            },
          });
        }

        const refreshed = await ensureArenaContext(client, session.studentId as string);
        return {
          error: null,
          account: refreshed.account,
          attempts: refreshed.attempts,
          activeAttempt: refreshed.activeAttempt,
          state,
          revision,
          eventType: applied.eventType,
        };
      });

      if (!result.enabled) return apiError("arena_state_unavailable", 503);
      if (result.value.error === "revision_conflict") {
        return apiError("revision_conflict", 409, result.value);
      }
      if (result.value.error === "arena_attempts_exhausted") return apiError("arena_attempts_exhausted", 409);
      if (result.value.error === "arena_no_active_attempt") return apiError("arena_no_active_attempt", 409);
      if (result.value.error) return apiError(result.value.error, 400);

      if (result.value.eventType !== "price_tick_processed") {
        scheduleMentorProfileUpdate(session.studentId, "trading_trade_created");
      }
      return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
    } catch {
      return apiError("arena_state_unavailable", 503);
    }
  });
}
