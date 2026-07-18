import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { getCanonicalSession } from "@/lib/auth-session";
import { cleanText, numeric } from "@/lib/student-cartax";
import { maybeAwardAchievement, recordLearningEvent } from "@/lib/learning-os";
import { withTx } from "@/lib/db";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import { apiOk, apiError, checkBodySize } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  ARENA_ATTEMPTS_PER_CYCLE,
  ARENA_INITIAL_BALANCE,
  summarizeArenaDecisions,
  type ArenaAccount,
  type ArenaAttempt,
  type ArenaDecision,
} from "@/lib/trading-arena-account";

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
};

type DecisionRow = {
  id: string;
  student_id: string;
  symbol: string;
  side: string;
  order_type: string;
  size_usdt: string | number;
  risk_percent: string | number;
  entry_reason: string | null;
  emotion: string | null;
  risk_plan: string | null;
  mentor_note: string | null;
  discipline_score: number;
  risk_flag: boolean;
  created_at: Date | string;
};

type NormalizedDecision = ArenaDecision;

function asIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return new Date(value).toISOString();
}

function mapAccount(row: AccountRow): ArenaAccount {
  return {
    cycleId: String(row.cycle_id),
    status: row.status,
    initialBalance: String(row.initial_balance),
    availableBalance: String(row.available_balance),
    attemptsTotal: Number(row.attempts_total),
    attemptsUsed: Number(row.attempts_used),
    attemptsRemaining: Math.max(0, Number(row.attempts_total) - Number(row.attempts_used)),
    currentAttempt: Number(row.current_attempt),
    revision: Number(row.revision),
    cycleStartedAt: asIso(row.cycle_started_at) as string,
    cycleEndsAt: asIso(row.cycle_ends_at) as string,
  };
}

function mapAttempt(row: AttemptRow): ArenaAttempt {
  return {
    id: String(row.id),
    cycleId: String(row.cycle_id),
    attemptNumber: Number(row.attempt_number),
    status: row.status,
    startingBalance: String(row.starting_balance),
    cashBalance: String(row.cash_balance),
    equity: String(row.equity),
    startedAt: asIso(row.started_at),
    endedAt: asIso(row.ended_at),
  };
}

function mapDecision(row: DecisionRow): ArenaDecision {
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    symbol: String(row.symbol),
    side: row.side === "sell" ? "sell" : "buy",
    orderType: row.order_type === "limit" || row.order_type === "stop" ? row.order_type : "market",
    size: Number(row.size_usdt || 0),
    risk: Number(row.risk_percent || 0),
    entryReason: String(row.entry_reason || ""),
    emotion: String(row.emotion || ""),
    plan: String(row.risk_plan || ""),
    mentorNote: String(row.mentor_note || ""),
    disciplineScore: Number(row.discipline_score || 0),
    riskFlag: Boolean(row.risk_flag),
    createdAt: asIso(row.created_at) as string,
  };
}

async function ensureArenaAccount(client: PoolClient, studentId: string) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`arena-account:${studentId}`]);
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
  if (!accountRow) throw new Error("arena_account_creation_failed");

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
            started_at, ended_at
     FROM academy_trading_arena_attempts
     WHERE student_id = $1::uuid AND cycle_id = $2::uuid
     ORDER BY attempt_number ASC`,
    [studentId, accountRow.cycle_id],
  );

  const account = mapAccount(accountRow);
  const attempts = attemptsResult.rows.map(mapAttempt);
  return {
    account,
    attempts,
    activeAttempt: attempts.find((attempt) => attempt.status === "active") ?? null,
  };
}

async function getDecisions(client: PoolClient, studentId: string): Promise<ArenaDecision[]> {
  const result = await client.query<DecisionRow>(
    `SELECT id::text, student_id::text, symbol, side, order_type,
            size_usdt, risk_percent, entry_reason, emotion, risk_plan,
            mentor_note, discipline_score, risk_flag, created_at
     FROM academy_trading_arena_trades
     WHERE student_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT 100`,
    [studentId],
  );
  return result.rows.map(mapDecision);
}

function mentorNote(input: {
  risk: number;
  emotion: string;
  entryReason: string;
  plan: string;
  locale: "fa" | "en";
}) {
  const isFa = input.locale === "fa";
  const text = `${input.emotion} ${input.entryReason} ${input.plan}`.toLowerCase();
  if (input.risk > 3) {
    return isFa
      ? "هشدار منتور: ریسک این تصمیم بالاتر از استاندارد تمرینی است. اندازه موقعیت و حد ابطال را بازبینی کن."
      : "Mentor warning: risk is above the training standard. Review position size and invalidation.";
  }
  if (/انتقام|revenge|جبران|angry|عصبانی/.test(text)) {
    return isFa
      ? "منتور نشانه‌های معامله انتقامی را تشخیص داد. توقف کوتاه و مرور ژورنال قبلی پیشنهاد می‌شود."
      : "Mentor detected revenge-trading signals. Pause and review the previous journal.";
  }
  if (/بدون حد|no stop|حد ضرر ندار|بدون برنامه/.test(text)) {
    return isFa
      ? "منتور نبود برنامه خروج را پرریسک می‌داند. حد ابطال و سناریوی خروج را مشخص کن."
      : "Mentor flags missing exit planning. Define invalidation and an exit scenario.";
  }
  return isFa
    ? "تصمیم در حافظه آموزشی حساب شما ثبت شد و منتور دلیل ورود، احساس و انضباط ریسک را بررسی می‌کند."
    : "Decision saved to your account learning memory for entry, emotion and risk-discipline review.";
}

function normalizeDecision(body: Record<string, unknown>, studentId: string): NormalizedDecision {
  const requestedId = cleanText(body.id, 80);
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedId)
    ? requestedId
    : randomUUID();
  const symbol = cleanText(body.symbol || "BTC", 12).toUpperCase().replace(/[^A-Z0-9]/g, "") || "BTC";
  const side = body.side === "sell" ? "sell" : "buy";
  const orderType = body.orderType === "limit" || body.orderType === "stop" ? body.orderType : "market";
  const size = Math.max(10, Math.min(100_000, numeric(body.size, 1_000)));
  const risk = Math.max(0.1, Math.min(8, numeric(body.risk, 2)));
  const entryReason = cleanText(body.entryReason, 600);
  const emotion = cleanText(body.emotion, 120) || "calm";
  const plan = cleanText(body.plan || body.riskPlan, 600);
  const locale: "fa" | "en" = cleanText(body.locale || "fa", 10) === "en" ? "en" : "fa";
  const disciplineScore = Math.max(
    0,
    Math.min(100, Math.round(100 - risk * 12 + (entryReason.length > 30 ? 8 : 0) + (plan.length > 30 ? 10 : 0))),
  );
  const riskFlag = risk > 3 || /انتقام|revenge|بدون حد|no stop|فومو|fomo/i.test(`${emotion} ${entryReason} ${plan}`);

  return {
    id,
    studentId,
    symbol,
    side,
    orderType,
    size,
    risk,
    entryReason,
    emotion,
    plan,
    mentorNote: mentorNote({ risk, emotion, entryReason, plan, locale }),
    disciplineScore,
    riskFlag,
    createdAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  return withObservability(request, { route: "/api/trading-arena" }, async () => {
    const limit = await rateLimit(request, {
      namespace: "trading-arena-read",
      limit: 100,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(request);
    if (!session.studentId) return apiError("academy_profile_required", 401);

    try {
      const result = await withTx(async (client) => {
        const accountState = await ensureArenaAccount(client, session.studentId as string);
        const decisions = await getDecisions(client, session.studentId as string);
        return {
          ...accountState,
          trades: decisions,
          summary: summarizeArenaDecisions(decisions),
          executionMode: "decision_journal" as const,
        };
      });

      if (!result.enabled) return apiError("trading_arena_unavailable", 503);
      return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
    } catch {
      return apiError("trading_arena_unavailable", 503);
    }
  });
}

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/trading-arena" }, async () => {
    if (!verifyCsrfOrigin(request)) return apiError("forbidden", 403);
    if (!checkBodySize(request.headers.get("content-length"), 8_000)) return apiError("payload_too_large", 413);

    const limit = await rateLimit(request, {
      namespace: "trading-arena-write",
      limit: 40,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(request, { strictRevocation: true });
    if (!session.studentId) return apiError("academy_profile_required", 401);

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return apiError("invalid_json", 400);
    }

    const decision = normalizeDecision(body, session.studentId);
    if (decision.entryReason.length < 8 || decision.plan.length < 8) {
      return apiError("journal_required", 400);
    }

    try {
      const result = await withTx(async (client) => {
        const accountState = await ensureArenaAccount(client, session.studentId as string);
        if (accountState.account.status !== "active" || !accountState.activeAttempt) {
          return { blocked: "arena_cycle_not_active" as const };
        }
        if (decision.size > Number(accountState.activeAttempt.cashBalance)) {
          return { blocked: "insufficient_virtual_balance" as const };
        }

        await client.query(
          `INSERT INTO academy_trading_arena_trades
             (id, student_id, symbol, side, order_type, size_usdt, risk_percent,
              entry_reason, emotion, risk_plan, mentor_note, discipline_score, risk_flag)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO NOTHING`,
          [
            decision.id,
            session.studentId,
            decision.symbol,
            decision.side,
            decision.orderType,
            decision.size,
            decision.risk,
            decision.entryReason,
            decision.emotion,
            decision.plan,
            decision.mentorNote,
            decision.disciplineScore,
            decision.riskFlag,
          ],
        );

        await client.query(
          `UPDATE academy_trading_arena_accounts
           SET revision = revision + 1, updated_at = NOW()
           WHERE student_id = $1::uuid`,
          [session.studentId],
        );

        await recordLearningEvent(client, {
          studentId: session.studentId as string,
          eventType: "simulator_decision_saved",
          payload: {
            symbol: decision.symbol,
            side: decision.side,
            orderType: decision.orderType,
            risk: decision.risk,
            riskFlag: decision.riskFlag,
            disciplineScore: decision.disciplineScore,
            ip: getClientIp(request),
          },
        });
        await maybeAwardAchievement(client, session.studentId as string, "simulator-journalist", {
          tradeId: decision.id,
          symbol: decision.symbol,
        });

        const refreshedAccount = await ensureArenaAccount(client, session.studentId as string);
        const decisions = await getDecisions(client, session.studentId as string);
        return {
          blocked: null,
          trade: decision,
          ...refreshedAccount,
          trades: decisions,
          summary: summarizeArenaDecisions(decisions),
          executionMode: "decision_journal" as const,
        };
      });

      if (!result.enabled) return apiError("trading_arena_unavailable", 503);
      if (result.value.blocked === "arena_cycle_not_active") return apiError("arena_cycle_not_active", 409);
      if (result.value.blocked === "insufficient_virtual_balance") return apiError("insufficient_virtual_balance", 409);

      scheduleMentorProfileUpdate(session.studentId, "trading_trade_created");
      return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
    } catch {
      return apiError("trading_arena_unavailable", 503);
    }
  });
}
