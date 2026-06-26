import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { getCanonicalSession } from "@/lib/auth-session";
// TODO(cookie-migration): remove getStudentSessionFromRequest once canonical session
//   replaces all per-cookie reads in academy routes.
import { cleanText, numeric } from "@/lib/student-cartax";
import { maybeAwardAchievement, recordLearningEvent } from "@/lib/learning-os";
import { withDb } from "@/lib/db";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";

type ArenaTrade = {
  id: string;
  studentId: string;
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop";
  size: number;
  risk: number;
  entryReason: string;
  emotion: string;
  plan: string;
  mentorNote: string;
  disciplineScore: number;
  riskFlag: boolean;
  createdAt: string;
};

type LocalStore = Record<string, ArenaTrade[]>;

function localPath() {
  return path.join(process.cwd(), "storage", "trading-arena.local.json");
}

function canUseLocalArena() {
  return process.env.NODE_ENV !== "production" || process.env.TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE === "true";
}

async function readLocal(): Promise<LocalStore> {
  if (!canUseLocalArena()) return {};
  try {
    const parsed = JSON.parse(await readFile(localPath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeLocal(store: LocalStore) {
  if (!canUseLocalArena()) return;
  await mkdir(path.dirname(localPath()), { recursive: true });
  await writeFile(localPath(), JSON.stringify(store, null, 2), "utf8");
}


function mentorNote(input: { risk: number; emotion: string; entryReason: string; plan: string; locale: string }) {
  const isFa = input.locale !== "en";
  const text = `${input.emotion} ${input.entryReason} ${input.plan}`.toLowerCase();
  if (input.risk > 3) return isFa ? "هشدار منتور: ریسک این تصمیم بالاتر از استاندارد تمرینی است. قبل از ادامه، اندازه موقعیت و حد ابطال را بازبینی کن." : "Mentor warning: risk is above the training standard. Review position size and invalidation before continuing.";
  if (/انتقام|revenge|جبران|angry|عصبانی/.test(text)) return isFa ? "منتور الگوی معامله انتقامی را تشخیص داد. این تصمیم ثبت شد، اما پیشنهاد می‌شود چند دقیقه توقف و ژورنال قبلی را مرور کنی." : "Mentor detected revenge-trading signals. The decision is saved, but pause and review the previous journal before continuing.";
  if (/بدون حد|no stop|حد ضرر ندار|بدون برنامه/.test(text)) return isFa ? "منتور نبودِ برنامه خروج را پرریسک می‌داند. هر تصمیم تمرینی باید حد ابطال و سناریوی خروج داشته باشد." : "Mentor flags missing exit planning. Every practice decision needs invalidation and exit scenarios.";
  return isFa ? "تصمیم ثبت شد. منتور این معامله را با تمرکز بر دلیل ورود، احساس و انضباط ریسک در حافظه آموزشی تو نگه می‌دارد." : "Decision saved. Mentor keeps this trade in your learning memory with focus on entry logic, emotion and risk discipline.";
}

function normalizeTrade(body: any, studentId: string) {
  const symbol = cleanText(body.symbol || "BTC", 12).toUpperCase().replace(/[^A-Z0-9]/g, "") || "BTC";
  const side = body.side === "sell" ? "sell" : "buy";
  const orderType = body.orderType === "limit" || body.orderType === "stop" ? body.orderType : "market";
  const size = Math.max(10, Math.min(1_000_000, numeric(body.size, 1000)));
  const risk = Math.max(0.1, Math.min(25, numeric(body.risk, 2)));
  const entryReason = cleanText(body.entryReason, 600);
  const emotion = cleanText(body.emotion, 120) || "calm";
  const plan = cleanText(body.plan || body.riskPlan, 600);
  const locale = cleanText(body.locale || "fa", 10) === "en" ? "en" : "fa";
  const disciplineScore = Math.max(0, Math.min(100, Math.round(100 - risk * 12 + (entryReason.length > 30 ? 8 : 0) + (plan.length > 30 ? 10 : 0))));
  const riskFlag = risk > 3 || /انتقام|revenge|بدون حد|no stop|فومو|fomo/i.test(`${emotion} ${entryReason} ${plan}`);
  const note = mentorNote({ risk, emotion, entryReason, plan, locale });
  return {
    id: cleanText(body.id, 80) || randomUUID(),
    studentId,
    symbol,
    side,
    orderType,
    size,
    risk,
    entryReason,
    emotion,
    plan,
    mentorNote: note,
    disciplineScore,
    riskFlag,
    createdAt: new Date().toISOString(),
  } satisfies ArenaTrade;
}

function summarize(trades: ArenaTrade[]) {
  const count = trades.length;
  const discipline = count ? Math.round(trades.reduce((sum, item) => sum + item.disciplineScore, 0) / count) : 0;
  const avgRisk = count ? Number((trades.reduce((sum, item) => sum + item.risk, 0) / count).toFixed(2)) : 0;
  const riskFlags = trades.filter((item) => item.riskFlag).length;
  const journalQuality = count ? Math.round(trades.filter((item) => item.entryReason.length > 30 && item.plan.length > 30).length / count * 100) : 0;
  const winRate = count ? Math.max(20, Math.min(88, 50 + Math.round((discipline - 50) / 2))) : 0;
  return {
    count,
    discipline,
    avgRisk,
    riskFlags,
    journalQuality,
    winRate,
    mentorSnapshot: {
      strongestSignal: discipline >= 75 ? "risk_control" : "needs_structure",
      warning: riskFlags >= 3 ? "repeated_risk_flags" : null,
      nextAction: journalQuality < 70 ? "write_deeper_journal" : "continue_demo_challenge",
    },
  };
}

type AnyQueryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

async function getDbTrades(client: AnyQueryable, studentId: string) {
  const rows = await client.query(
    `SELECT id, student_id, symbol, side, order_type, size_usdt, risk_percent, entry_reason, emotion, risk_plan, mentor_note, discipline_score, risk_flag, created_at
     FROM academy_trading_arena_trades
     WHERE student_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT 50`,
    [studentId],
  );
  return rows.rows.map((row) => ({
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
    createdAt: new Date(row.created_at).toISOString(),
  } satisfies ArenaTrade));
}

export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "trading-arena-read", limit: 100, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const session = await getCanonicalSession(req);
  if (!session.studentId) return NextResponse.json({ ok: false, error: "academy_profile_required" }, { status: 401 });
  const studentId = session.studentId;

  try {
    const result = await withDb((client) => getDbTrades(client, studentId));
    const trades = result.enabled && result.value ? result.value : (await readLocal())[studentId] || [];
    return NextResponse.json({ ok: true, trades, summary: summarize(trades) });
  } catch {
    const store = await readLocal();
    const trades = store[studentId] || [];
    return NextResponse.json({ ok: true, trades, summary: summarize(trades) });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const limit = await rateLimit(req, { namespace: "trading-arena-write", limit: 40, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const session = await getCanonicalSession(req);
  if (!session.studentId) return NextResponse.json({ ok: false, error: "academy_profile_required" }, { status: 401 });
  const studentId = session.studentId;

  try {
    const raw = await req.text();
    if (raw.length > 8_000) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    const trade = normalizeTrade(JSON.parse(raw || "{}"), studentId);
    if (trade.entryReason.length < 8 || trade.plan.length < 8) return NextResponse.json({ ok: false, error: "journal_required" }, { status: 400 });

    const result = await withDb(async (client) => {
      await client.query(
        `INSERT INTO academy_trading_arena_trades
          (id, student_id, symbol, side, order_type, size_usdt, risk_percent, entry_reason, emotion, risk_plan, mentor_note, discipline_score, risk_flag)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [trade.id, studentId, trade.symbol, trade.side, trade.orderType, trade.size, trade.risk, trade.entryReason, trade.emotion, trade.plan, trade.mentorNote, trade.disciplineScore, trade.riskFlag],
      );
      await recordLearningEvent(client, {
        studentId,
        eventType: "simulator_decision_saved",
        payload: { symbol: trade.symbol, side: trade.side, orderType: trade.orderType, risk: trade.risk, riskFlag: trade.riskFlag, disciplineScore: trade.disciplineScore, ip: getClientIp(req) },
      });
      if (trade.entryReason && trade.plan) await maybeAwardAchievement(client, studentId, "simulator-journalist", { tradeId: trade.id, symbol: trade.symbol });
      const trades = await getDbTrades(client, studentId);
      return { trades, summary: summarize(trades) };
    });

    if (result.enabled && result.value) {
      scheduleMentorProfileUpdate(studentId, "trading_trade_created");
      return NextResponse.json({ ok: true, trade, ...result.value });
    }

    if (!canUseLocalArena()) return NextResponse.json({ ok: false, error: "trading_arena_unavailable" }, { status: 503 });
    const store = await readLocal();
    const trades = [trade, ...(store[studentId] || []).filter((item) => item.id !== trade.id)].slice(0, 50);
    store[studentId] = trades;
    await writeLocal(store);
    scheduleMentorProfileUpdate(studentId, "trading_trade_created");
    return NextResponse.json({ ok: true, trade, trades, summary: summarize(trades) });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
