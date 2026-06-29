import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";

type ArenaTrade = {
  risk?: number;
  riskFlag?: boolean;
  disciplineScore?: number;
  emotion?: string;
  entryReason?: string;
  plan?: string;
  createdAt?: string;
};

type TermRow = {
  term_number?: number;
  termNumber?: number;
  score?: number;
  percent?: number;
  status?: string;
};

function localArenaPath() {
  return path.join(process.cwd(), "storage", "trading-arena.local.json");
}

function localProgressPath() {
  return path.join(process.cwd(), "storage", "academy-term-progress.local.json");
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function summarizeMemory(terms: TermRow[], trades: ArenaTrade[]) {
  const completedTerms = terms.filter((item) => item.status === "passed").length;
  const avgQuiz = terms.length ? Math.round(terms.reduce((sum, item) => sum + Number(item.percent || 0), 0) / terms.length) : 0;
  const tradeCount = trades.length;
  const avgRisk = tradeCount ? Number((trades.reduce((sum, item) => sum + Number(item.risk || 0), 0) / tradeCount).toFixed(2)) : 0;
  const avgDiscipline = tradeCount ? Math.round(trades.reduce((sum, item) => sum + Number(item.disciplineScore || 0), 0) / tradeCount) : 0;
  const riskFlags = trades.filter((item) => item.riskFlag).length;
  const emotionText = trades.map((item) => item.emotion || "").join(" ").toLowerCase();
  const weakAreas = [
    avgQuiz && avgQuiz < 80 ? "academy_review" : null,
    avgRisk > 3 ? "risk_management" : null,
    riskFlags >= 2 ? "trading_discipline" : null,
    /انتقام|revenge|fear|ترس|هیجان|excited/.test(emotionText) ? "trading_psychology" : null,
  ].filter(Boolean) as string[];
  const strongAreas = [
    completedTerms >= 2 ? "learning_consistency" : null,
    avgDiscipline >= 75 ? "risk_control" : null,
    tradeCount >= 5 ? "practice_commitment" : null,
  ].filter(Boolean) as string[];
  const nextBestAction = weakAreas.includes("risk_management")
    ? "/academy/risk-simulator"
    : weakAreas.includes("trading_psychology")
      ? "/academy/psychology-lab"
      : tradeCount === 0
        ? "/academy/simulator"
        : "/academy/daily-challenge";
  const confidence = Math.max(0, Math.min(100, Math.round((avgQuiz || 40) * 0.45 + (avgDiscipline || 40) * 0.45 + Math.min(10, completedTerms * 3))));
  return {
    completedTerms,
    avgQuiz,
    tradeCount,
    avgRisk,
    avgDiscipline,
    riskFlags,
    weakAreas,
    strongAreas,
    confidence,
    nextBestAction,
    mentorMessageFa: weakAreas.length
      ? "منتور بر اساس آزمون‌ها و ژورنال معامله، چند نقطه تمرین هدفمند برای تو پیدا کرده است."
      : "منتور مسیر تو را پایدار می‌بیند؛ حالا وقت چالش تمرینی عمیق‌تر است.",
    mentorMessageEn: weakAreas.length
      ? "Mentor found targeted practice areas from your quizzes and trading journal."
      : "Mentor sees a stable path; now try a deeper practice challenge.",
  };
}

export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "academy-mentor-memory", limit: 80, windowMs: 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);
  const session = await getCanonicalSession(req);
  if (!session.studentId) return apiError("academy_profile_required", 401);
  const studentId = session.studentId;

  const dbResult = await withDb(async (client) => {
    const termRows = await client.query(
      `SELECT term_number, score, percent, status FROM academy_term_progress WHERE student_id = $1::uuid ORDER BY term_number ASC`,
      [studentId],
    );
    const tradeRows = await client.query(
      `SELECT risk_percent, risk_flag, discipline_score, emotion, entry_reason, risk_plan, created_at
       FROM academy_trading_arena_trades
       WHERE student_id = $1::uuid
       ORDER BY created_at DESC
       LIMIT 100`,
      [studentId],
    ).catch(() => ({ rows: [] }));
    const trades = tradeRows.rows.map((item) => ({
      risk: Number(item.risk_percent || 0),
      riskFlag: Boolean(item.risk_flag),
      disciplineScore: Number(item.discipline_score || 0),
      emotion: String(item.emotion || ""),
      entryReason: String(item.entry_reason || ""),
      plan: String(item.risk_plan || ""),
      createdAt: item.created_at ? new Date(item.created_at).toISOString() : undefined,
    }));
    return summarizeMemory(termRows.rows, trades);
  });

  if (dbResult.enabled && dbResult.value) return apiOk({ memory: dbResult.value });

  const progressStore = await readJson<Record<string, TermRow[]>>(localProgressPath(), {});
  const arenaStore = await readJson<Record<string, ArenaTrade[]>>(localArenaPath(), {});
  const memory = summarizeMemory(progressStore[studentId] || [], arenaStore[studentId] || []);
  return apiOk({ memory });
}
