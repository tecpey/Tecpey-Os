import { createHash, randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { NextRequest } from "next/server";
import Decimal from "decimal.js";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { getArenaMarketPriceSnapshot } from "@/lib/arena-market-price";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { recordLearningEvent } from "@/lib/learning-os";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import {
  ARENA_ATTEMPTS_PER_CYCLE,
  ARENA_INITIAL_BALANCE,
  type ArenaAccount,
  type ArenaAttempt,
} from "@/lib/trading-arena-account";
import {
  applyArenaExecutionActionV2,
  computeArenaExecutionEquity,
  createArenaExecutionStateV2,
  type ArenaExecutionActionV2,
  type ArenaExecutionStateV2,
  type ArenaPriceSnapshot,
} from "@/lib/trading-arena-execution-v2";
import { validateArenaExecutionStateV2 } from "@/lib/trading-arena-execution-state-validation";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

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

type ExistingCommandRow = {
  request_hash: string;
  result_response: Record<string, unknown>;
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
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`arena-execution-v2:${studentId}`]);
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

function loadExecution(row: AttemptRow): { state: ArenaExecutionStateV2; revision: number } {
  const revision = Number(row.execution_revision);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("arena_revision_invalid");
  const raw = row.execution_state;
  const empty = Boolean(
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    Object.keys(raw as Record<string, unknown>).length === 0,
  );
  return {
    state: empty
      ? createArenaExecutionStateV2(row.starting_balance)
      : validateArenaExecutionStateV2(raw),
    revision,
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
    .join(",")}}`;
}

function requestHash(expectedRevision: number, action: ArenaExecutionActionV2): string {
  return createHash("sha256")
    .update(canonical({ expectedRevision, action }))
    .digest("hex");
}

function decimalString(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80) return null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)) return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() && parsed.gt(0) ? parsed.toFixed() : null;
  } catch {
    return null;
  }
}

function asset(value: unknown): "BTC" | "ETH" | null {
  return value === "BTC" || value === "ETH" ? value : null;
}

function optionalDecimal(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return decimalString(value);
}

function parseAction(value: unknown): ArenaExecutionActionV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  if (raw.type === "refresh_market") return { type: "refresh_market" };

  if (raw.type === "cancel_order") {
    const orderId = cleanText(raw.orderId, 160);
    return orderId ? { type: "cancel_order", orderId } : null;
  }

  if (raw.type === "close_position") {
    const positionId = cleanText(raw.positionId, 160);
    return positionId ? { type: "close_position", positionId, reason: "manual" } : null;
  }

  if (raw.type === "market_buy") {
    const selectedAsset = asset(raw.asset);
    const quoteAmount = decimalString(raw.quoteAmount);
    const stopLoss = optionalDecimal(raw.stopLoss);
    const takeProfit = optionalDecimal(raw.takeProfit);
    if (!selectedAsset || !quoteAmount || stopLoss === null || takeProfit === null) return null;
    return {
      type: "market_buy",
      asset: selectedAsset,
      quoteAmount,
      ...(stopLoss ? { stopLoss } : {}),
      ...(takeProfit ? { takeProfit } : {}),
      preTradePlan: cleanText(raw.preTradePlan, 1_500),
      emotionalState: cleanText(raw.emotionalState, 120),
    };
  }

  if (raw.type === "limit_buy") {
    const selectedAsset = asset(raw.asset);
    const quoteAmount = decimalString(raw.quoteAmount);
    const limitPrice = decimalString(raw.limitPrice);
    const stopLoss = optionalDecimal(raw.stopLoss);
    const takeProfit = optionalDecimal(raw.takeProfit);
    if (!selectedAsset || !quoteAmount || !limitPrice || stopLoss === null || takeProfit === null) return null;
    return {
      type: "limit_buy",
      asset: selectedAsset,
      quoteAmount,
      limitPrice,
      ...(stopLoss ? { stopLoss } : {}),
      ...(takeProfit ? { takeProfit } : {}),
      preTradePlan: cleanText(raw.preTradePlan, 1_500),
      emotionalState: cleanText(raw.emotionalState, 120),
    };
  }

  return null;
}

function idempotencyKey(request: NextRequest, body: Record<string, unknown>): string | null {
  const value = request.headers.get("idempotency-key") ?? body.idempotencyKey;
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,120}$/.test(value) ? value : null;
}

function decisionMetrics(state: ArenaExecutionStateV2, action: ArenaExecutionActionV2) {
  if (action.type !== "market_buy" && action.type !== "limit_buy") return null;
  const equity = new Decimal(state.equity);
  const riskPercent = equity.gt(0)
    ? new Decimal(action.quoteAmount).div(equity).mul(100)
    : new Decimal(100);
  const text = `${action.preTradePlan ?? ""} ${action.emotionalState ?? ""}`.toLowerCase();
  const hasStop = Boolean(action.stopLoss);
  const riskFlag = riskPercent.gt(5) || /revenge|انتقام|fomo|فومو/.test(text);
  const discipline = Decimal.max(
    0,
    Decimal.min(
      100,
      new Decimal(100)
        .minus(riskPercent.mul(8))
        .plus(hasStop ? 10 : 0)
        .plus((action.preTradePlan?.length ?? 0) > 30 ? 8 : 0),
    ),
  ).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return {
    symbol: action.asset,
    orderType: action.type === "market_buy" ? "market" : "limit",
    quoteAmount: action.quoteAmount,
    riskPercent: riskPercent.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
    entryReason: action.preTradePlan ?? "",
    emotion: action.emotionalState ?? "not-recorded",
    riskPlan: `SL:${action.stopLoss ?? "not-set"} TP:${action.takeProfit ?? "not-set"}`,
    mentorNote: riskFlag
      ? "Arena execution recorded a risk or behavioral warning for Mentor review."
      : "Arena execution recorded for Mentor discipline analysis.",
    disciplineScore: discipline.toNumber(),
    riskFlag,
  };
}

async function saveDecision(
  client: PoolClient,
  studentId: string,
  stateBefore: ArenaExecutionStateV2,
  action: ArenaExecutionActionV2,
): Promise<void> {
  const metrics = decisionMetrics(stateBefore, action);
  if (!metrics) return;
  await client.query(
    `INSERT INTO academy_trading_arena_trades
       (id, student_id, symbol, side, order_type, size_usdt, risk_percent,
        entry_reason, emotion, risk_plan, mentor_note, discipline_score, risk_flag)
     VALUES ($1::uuid, $2::uuid, $3, 'buy', $4, $5::numeric, $6::numeric,
             $7, $8, $9, $10, $11, $12)`,
    [
      randomUUID(),
      studentId,
      metrics.symbol,
      metrics.orderType,
      metrics.quoteAmount,
      metrics.riskPercent,
      metrics.entryReason,
      metrics.emotion,
      metrics.riskPlan,
      metrics.mentorNote,
      metrics.disciplineScore,
      metrics.riskFlag,
    ],
  );
}

async function optionalMarketForRead(): Promise<ArenaPriceSnapshot | null> {
  try {
    return await getArenaMarketPriceSnapshot();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  return withObservability(request, { route: "/api/trading-arena/execution" }, async () => {
    const limit = await rateLimit(request, {
      namespace: "arena-execution-read",
      limit: 120,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(request);
    if (!session.studentId) return apiError("academy_profile_required", 401);
    const market = await optionalMarketForRead();

    try {
      const result = await withTx(async (client) => {
        const context = await ensureArenaContext(client, session.studentId as string);
        if (!context.activeRow || !context.activeAttempt) {
          return { error: "arena_no_active_attempt" as const };
        }
        const execution = loadExecution(context.activeRow);
        const projectedEquity = market
          ? computeArenaExecutionEquity(execution.state, market)
          : execution.state.equity;
        return {
          error: null,
          account: context.account,
          attempts: context.attempts,
          activeAttempt: context.activeAttempt,
          state: execution.state,
          revision: execution.revision,
          market,
          projectedEquity,
          marketStatus: market ? "available" : "unavailable",
        };
      });
      if (!result.enabled) return apiError("arena_execution_unavailable", 503);
      if (result.value.error) return apiError(result.value.error, 409);
      return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
    } catch {
      return apiError("arena_execution_unavailable", 503);
    }
  });
}

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/trading-arena/execution" }, async () => {
    if (!verifyCsrfOrigin(request)) return apiError("forbidden", 403);
    if (!checkBodySize(request.headers.get("content-length"), 12_000)) {
      return apiError("payload_too_large", 413);
    }

    const limit = await rateLimit(request, {
      namespace: "arena-execution-write",
      limit: 90,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(request, { strictRevocation: true });
    if (!session.studentId) return apiError("academy_profile_required", 401);

    let body: Record<string, unknown>;
    try {
      const boundedBodyRequest = await readBoundedJsonRequest(request, {
        maxBytes: 12_000,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      request = boundedBodyRequest.request;
      body = await request.json() as Record<string, unknown>;
    } catch {
      return apiError("invalid_json", 400);
    }

    const action = parseAction(body.action);
    const expectedRevision = Number(body.expectedRevision);
    const key = idempotencyKey(request, body);
    if (!action) return apiError("invalid_arena_action", 400);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return apiError("invalid_revision", 400);
    }
    if (!key) return apiError("idempotency_key_required", 400);

    let requestedMarket: ArenaPriceSnapshot | null = null;
  if (action.type !== "cancel_order") {
    try {
      requestedMarket = await getArenaMarketPriceSnapshot();
    } catch {
      // The transaction checks idempotent replay before a new
      // price-dependent command fails closed.
    }
  }

    const hash = requestHash(expectedRevision, action);
    const operationId = randomUUID();
    const now = new Date().toISOString();

    try {
      const result = await withTx(async (client) => {
        const context = await ensureArenaContext(client, session.studentId as string);
        if (context.account.status !== "active" || !context.activeRow || !context.activeAttempt) {
          return { error: "arena_no_active_attempt" as const };
        }

        const existing = await client.query<ExistingCommandRow>(
          `SELECT request_hash, result_response
           FROM academy_trading_arena_commands
           WHERE attempt_id = $1::uuid AND idempotency_key = $2
           LIMIT 1`,
          [context.activeRow.id, key],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].request_hash !== hash) {
            return { error: "idempotency_key_reused" as const };
          }
          return {
            error: null,
            replay: true,
            response: existing.rows[0].result_response,
            eventType: String(existing.rows[0].result_response.eventType ?? "arena.command_replayed"),
          };
        }

        const execution = loadExecution(context.activeRow);
        if (execution.revision !== expectedRevision) {
          return {
            error: "revision_conflict" as const,
            response: {
              state: execution.state,
              revision: execution.revision,
              account: context.account,
              attempts: context.attempts,
              activeAttempt: context.activeAttempt,
            },
          };
        }

        if (!requestedMarket && action.type !== "cancel_order") {
          return { error: "arena_price_feed_unavailable" as const };
        }
        const market = requestedMarket ?? execution.state.lastMarket;
        if (!market) return { error: "arena_price_feed_unavailable" as const };
        const applied = applyArenaExecutionActionV2(execution.state, action, {
          now,
          operationId,
          market,
          slippageBps: process.env.ARENA_SLIPPAGE_BPS ?? "5",
        });
        if (!applied.ok) return { error: applied.error };

        const nextRevision = execution.revision + 1;
        const saved = await client.query(
          `UPDATE academy_trading_arena_attempts
           SET execution_schema_version = 2,
               execution_state = $2::jsonb,
               execution_revision = $3,
               execution_updated_at = NOW(),
               cash_balance = $4::numeric,
               equity = $5::numeric,
               updated_at = NOW()
           WHERE id = $1::uuid AND execution_revision = $6`,
          [
            context.activeRow.id,
            JSON.stringify(applied.state),
            nextRevision,
            applied.state.cashBalance,
            applied.state.equity,
            execution.revision,
          ],
        );
        if ((saved.rowCount ?? 0) !== 1) throw new Error("arena_revision_write_conflict");

        await client.query(
          `UPDATE academy_trading_arena_accounts
           SET available_balance = $2::numeric,
               revision = revision + 1,
               updated_at = NOW()
           WHERE student_id = $1::uuid`,
          [session.studentId, applied.state.cashBalance],
        );

        await client.query(
          `INSERT INTO academy_trading_arena_execution_events
             (attempt_id, student_id, revision, event_type, payload)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)`,
          [
            context.activeRow.id,
            session.studentId,
            nextRevision,
            applied.eventType,
            JSON.stringify(applied.event),
          ],
        );

        await saveDecision(client, session.studentId as string, execution.state, action);
        await recordLearningEvent(client, {
          studentId: session.studentId as string,
          eventType: "simulator_decision_saved",
          payload: {
            actionType: action.type,
            eventType: applied.eventType,
            attemptNumber: context.activeAttempt.attemptNumber,
            revision: nextRevision,
          },
        });

        const response = {
          account: {
            ...context.account,
            availableBalance: applied.state.cashBalance,
            revision: context.account.revision + 1,
          },
          attempts: context.attempts.map((attempt) =>
            attempt.id === context.activeAttempt?.id
              ? { ...attempt, cashBalance: applied.state.cashBalance, equity: applied.state.equity }
              : attempt,
          ),
          activeAttempt: {
            ...context.activeAttempt,
            cashBalance: applied.state.cashBalance,
            equity: applied.state.equity,
          },
          state: applied.state,
          revision: nextRevision,
          eventType: applied.eventType,
          market,
        };

        await client.query(
          `INSERT INTO academy_trading_arena_commands
             (id, attempt_id, student_id, idempotency_key, action_type,
              expected_revision, request_hash, result_revision, result_event_type, result_response)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
          [
            operationId,
            context.activeRow.id,
            session.studentId,
            key,
            action.type,
            expectedRevision,
            hash,
            nextRevision,
            applied.eventType,
            JSON.stringify(response),
          ],
        );

        return { error: null, replay: false, response, eventType: applied.eventType };
      });

      if (!result.enabled) return apiError("arena_execution_unavailable", 503);
      if (result.value.error === "revision_conflict") {
        return apiError("revision_conflict", 409, result.value.response);
      }
      if (result.value.error === "idempotency_key_reused") {
        return apiError("idempotency_key_reused", 409);
      }
      if (result.value.error === "arena_no_active_attempt") {
        return apiError("arena_no_active_attempt", 409);
      }
      if (result.value.error === "arena_price_feed_unavailable") {
        return apiError("arena_price_feed_unavailable", 503);
      }
      if (result.value.error) return apiError(result.value.error, 400);

      if (!result.value.replay && result.value.eventType !== "arena.market_refreshed") {
        scheduleMentorProfileUpdate(session.studentId, "trading_trade_created");
      }
      return apiOk({ ...result.value.response, idempotentReplay: result.value.replay }, 200, {
        "Cache-Control": "no-store, max-age=0",
      });
    } catch {
      return apiError("arena_execution_unavailable", 503);
    }
  });
}
