// Mentor Memory Engine — server-only DB helpers.
// All writes are fire-and-forget where noted; failures never block the mentor response.

import { withDb } from "@/lib/db";
import { cleanText } from "@/lib/student-cartax";

// ── Constants ─────────────────────────────────────────────────────────────────

export const MEMORY_CATEGORIES = [
  "academy",
  "trading",
  "psychology",
  "risk",
  "discipline",
  "goals",
  "career",
  "mistakes",
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const IMPORTANCE_LEVELS = [1, 5, 10, 100] as const;
export type ImportanceLevel = (typeof IMPORTANCE_LEVELS)[number];

// ── Types ─────────────────────────────────────────────────────────────────────

export type MentorProfile = {
  id: string;
  studentId: string;
  level: "beginner" | "intermediate" | "advanced";
  riskProfile: "low" | "medium" | "high";
  primaryGoal: string;
  weakAreas: string[];
  strongAreas: string[];
  confidenceScore: number;
  /** Phase 5 — computed from trading arena discipline scores. */
  disciplineScore: number;
  /** Phase 5 — inferred learning style: practical | analytical | mixed. */
  learningStyle: string;
  lastActiveAt: string;
};

export type MentorConversationRow = {
  role: "user" | "assistant" | "system";
  content: string;
  locale: string;
  termNumber: number | null;
  createdAt: string;
};

export type MentorMemoryRow = {
  id: string;
  category: MemoryCategory;
  content: string;
  importance: ImportanceLevel;
  createdAt: string;
};

export type MentorInsightRow = {
  id: string;
  insightType: string;
  content: string;
  generatedAt: string;
};

export type MentorContext = {
  profile: MentorProfile | null;
  recentConversations: MentorConversationRow[];
  memories: MentorMemoryRow[];
  termProgress: { termNumber: number; status: string; percent: number }[];
  tradingSignals: {
    avgRisk: number;
    avgDiscipline: number;
    riskFlags: number;
    recentEmotions: string[];
  } | null;
};

// ── Internal sanitizer ────────────────────────────────────────────────────────

function sanitize(value: unknown, max: number): string {
  return cleanText(value, max);
}

function safeLocale(locale: unknown): string {
  const s = sanitize(locale, 8).toLowerCase();
  return s === "en" ? "en" : "fa";
}

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * Upsert a mentor profile row for the student and touch last_active_at.
 * Returns null if the DB pool is not configured.
 */
export async function getOrCreateMentorProfile(
  studentId: string,
): Promise<MentorProfile | null> {
  const result = await withDb(async (client) => {
    await client.query(
      `INSERT INTO mentor_profiles (student_id)
       VALUES ($1::uuid)
       ON CONFLICT (student_id) DO UPDATE SET last_active_at = NOW(), updated_at = NOW()`,
      [studentId],
    );
    const res = await client.query(
      `SELECT id, student_id, level, risk_profile, primary_goal,
              weak_areas, strong_areas, confidence_score,
              discipline_score, learning_style, last_active_at
       FROM mentor_profiles WHERE student_id = $1::uuid`,
      [studentId],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      studentId: r.student_id,
      level: r.level,
      riskProfile: r.risk_profile,
      primaryGoal: r.primary_goal,
      weakAreas: Array.isArray(r.weak_areas) ? r.weak_areas : [],
      strongAreas: Array.isArray(r.strong_areas) ? r.strong_areas : [],
      confidenceScore: Number(r.confidence_score),
      disciplineScore: Number(r.discipline_score ?? 0),
      learningStyle: String(r.learning_style ?? "mixed"),
      lastActiveAt: r.last_active_at ? new Date(r.last_active_at).toISOString() : new Date().toISOString(),
    } as MentorProfile;
  });
  return result.enabled ? result.value : null;
}

// ── Conversations ─────────────────────────────────────────────────────────────

/**
 * Persist a single conversation turn.
 * Fire-and-forget: errors are swallowed so the caller's response is never blocked.
 * Prunes the oldest turns to keep at most 200 rows per student.
 */
export async function saveMentorConversation(
  studentId: string,
  role: "user" | "assistant" | "system",
  content: string,
  locale: string,
  termNumber?: number,
): Promise<void> {
  const safe = sanitize(content, 4000);
  if (!safe) return;
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO mentor_conversations (student_id, role, content, locale, term_number)
       VALUES ($1::uuid, $2, $3, $4, $5)`,
      [studentId, role, safe, safeLocale(locale), termNumber ?? null],
    );
    // Keep the 200 most-recent turns per student; silently drop the rest.
    await client.query(
      `DELETE FROM mentor_conversations
       WHERE student_id = $1::uuid
         AND id NOT IN (
           SELECT id FROM mentor_conversations
           WHERE student_id = $1::uuid
           ORDER BY created_at DESC
           LIMIT 200
         )`,
      [studentId],
    );
  }).catch(() => {
    // Intentional: conversation persistence failure must not surface to the user.
  });
}

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * Fetch everything the AI mentor needs to produce a personalized response:
 * - the student's mentor profile
 * - last 12 conversation turns (chronological order)
 * - top 20 memories by importance
 * - full academy term progress
 * - last 20 trading-arena trades (aggregated into signals)
 *
 * Returns an empty context when the DB pool is not configured.
 */
export async function getMentorContext(studentId: string): Promise<MentorContext> {
  const empty: MentorContext = {
    profile: null,
    recentConversations: [],
    memories: [],
    termProgress: [],
    tradingSignals: null,
  };

  const result = await withDb(async (client) => {
    const [profileRes, convRes, memRes, termRes, tradeRes] = await Promise.all([
      client.query(
        `SELECT id, student_id, level, risk_profile, primary_goal,
                weak_areas, strong_areas, confidence_score,
                discipline_score, learning_style, last_active_at
         FROM mentor_profiles WHERE student_id = $1::uuid`,
        [studentId],
      ),
      client.query(
        `SELECT role, content, locale, term_number, created_at
         FROM mentor_conversations WHERE student_id = $1::uuid
         ORDER BY created_at DESC LIMIT 12`,
        [studentId],
      ),
      client.query(
        `SELECT id, category, content, importance, created_at
         FROM mentor_memories WHERE student_id = $1::uuid
         ORDER BY importance DESC, created_at DESC LIMIT 20`,
        [studentId],
      ),
      client.query(
        `SELECT term_number, status, percent
         FROM academy_term_progress WHERE student_id = $1::uuid
         ORDER BY term_number ASC`,
        [studentId],
      ),
      client
        .query(
          `SELECT risk_percent, risk_flag, discipline_score, emotion
           FROM academy_trading_arena_trades
           WHERE student_id = $1::uuid ORDER BY created_at DESC LIMIT 20`,
          [studentId],
        )
        .catch(() => ({ rows: [] as any[] })),
    ]);

    const profile: MentorProfile | null = profileRes.rows[0]
      ? {
          id: profileRes.rows[0].id,
          studentId: profileRes.rows[0].student_id,
          level: profileRes.rows[0].level,
          riskProfile: profileRes.rows[0].risk_profile,
          primaryGoal: profileRes.rows[0].primary_goal,
          weakAreas: profileRes.rows[0].weak_areas ?? [],
          strongAreas: profileRes.rows[0].strong_areas ?? [],
          confidenceScore: Number(profileRes.rows[0].confidence_score),
          disciplineScore: Number(profileRes.rows[0].discipline_score ?? 0),
          learningStyle: String(profileRes.rows[0].learning_style ?? "mixed"),
          lastActiveAt: new Date(profileRes.rows[0].last_active_at).toISOString(),
        }
      : null;

    // Reverse so the array is chronological (oldest first).
    const recentConversations: MentorConversationRow[] = convRes.rows
      .reverse()
      .map((r) => ({
        role: r.role as "user" | "assistant" | "system",
        content: r.content,
        locale: r.locale,
        termNumber: r.term_number ?? null,
        createdAt: new Date(r.created_at).toISOString(),
      }));

    const memories: MentorMemoryRow[] = memRes.rows.map((r) => ({
      id: r.id,
      category: r.category as MemoryCategory,
      content: r.content,
      importance: Number(r.importance) as ImportanceLevel,
      createdAt: new Date(r.created_at).toISOString(),
    }));

    const termProgress = termRes.rows.map((r) => ({
      termNumber: Number(r.term_number),
      status: String(r.status),
      percent: Number(r.percent),
    }));

    let tradingSignals: MentorContext["tradingSignals"] = null;
    if (tradeRes.rows.length > 0) {
      const trades = tradeRes.rows;
      const count = trades.length;
      const avgRisk = Number(
        (trades.reduce((s: number, r: any) => s + Number(r.risk_percent || 0), 0) / count).toFixed(2),
      );
      const avgDiscipline = Math.round(
        trades.reduce((s: number, r: any) => s + Number(r.discipline_score || 0), 0) / count,
      );
      const riskFlags = trades.filter((r: any) => r.risk_flag).length;
      const recentEmotions = [
        ...new Set(trades.map((r: any) => String(r.emotion || "")).filter(Boolean)),
      ].slice(0, 5);
      tradingSignals = { avgRisk, avgDiscipline, riskFlags, recentEmotions };
    }

    return { profile, recentConversations, memories, termProgress, tradingSignals };
  });

  return result.enabled ? (result.value ?? empty) : empty;
}

// ── Memories ──────────────────────────────────────────────────────────────────

/**
 * Save a structured memory for a student.
 * importance: 1=minor, 5=normal, 10=important, 100=critical.
 */
export async function saveMentorMemory(
  studentId: string,
  category: MemoryCategory,
  content: string,
  importance: ImportanceLevel = 5,
): Promise<{ id: string } | null> {
  const safe = sanitize(content, 2000);
  if (!safe) return null;

  const result = await withDb(async (client) => {
    const res = await client.query(
      `INSERT INTO mentor_memories (student_id, category, content, importance)
       VALUES ($1::uuid, $2, $3, $4)
       RETURNING id`,
      [studentId, category, safe, importance],
    );
    return res.rows[0] ? { id: String(res.rows[0].id) } : null;
  });
  return result.enabled ? result.value : null;
}

// ── Insights ──────────────────────────────────────────────────────────────────

/**
 * Generate and persist a session insight snapshot from the student's memories.
 * Returns the insight text, or null when there is nothing to summarize.
 * This is intentionally a local aggregation — it does NOT call the AI API.
 */
export async function generateMentorInsights(studentId: string): Promise<string | null> {
  const result = await withDb(async (client) => {
    const [memRes, profileRes] = await Promise.all([
      client.query(
        `SELECT category, content, importance FROM mentor_memories
         WHERE student_id = $1::uuid ORDER BY importance DESC, created_at DESC LIMIT 30`,
        [studentId],
      ),
      client.query(
        `SELECT level, risk_profile, primary_goal, weak_areas, strong_areas, confidence_score
         FROM mentor_profiles WHERE student_id = $1::uuid`,
        [studentId],
      ),
    ]);

    if (!memRes.rows.length) return null;

    const prof = profileRes.rows[0];
    const memories: any[] = memRes.rows;

    const critical = memories.filter((r) => r.importance === 100).map((r) => r.content);
    const important = memories.filter((r) => r.importance === 10).map((r) => r.content);
    const grouped: Record<string, string[]> = {};
    for (const m of memories) {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category].push(m.content);
    }

    const lines: string[] = [
      `سطح: ${prof?.level ?? "نامشخص"}`,
      `پروفایل ریسک: ${prof?.risk_profile ?? "متوسط"}`,
      `هدف: ${prof?.primary_goal || "ورود امن"}`,
      `امتیاز اطمینان: ${prof?.confidence_score ?? 0}/100`,
    ];

    if (prof?.weak_areas?.length)
      lines.push(`نقاط ضعف: ${(prof.weak_areas as string[]).join("، ")}`);
    if (prof?.strong_areas?.length)
      lines.push(`نقاط قوت: ${(prof.strong_areas as string[]).join("، ")}`);

    if (critical.length)
      lines.push(`نکات حیاتی:\n${critical.map((c) => `  - ${c}`).join("\n")}`);
    if (important.length)
      lines.push(`نکات مهم:\n${important.map((c) => `  - ${c}`).join("\n")}`);

    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(`دسته ${cat}:\n${items.slice(0, 3).map((c) => `  - ${c}`).join("\n")}`);
    }

    const content = lines.join("\n\n");
    await client.query(
      `INSERT INTO mentor_insights (student_id, insight_type, content)
       VALUES ($1::uuid, 'session_summary', $2)`,
      [studentId, content],
    );
    return content;
  });

  return result.enabled ? result.value : null;
}

// ── Context → prompt string ───────────────────────────────────────────────────

/**
 * Serialize a MentorContext into a compact prompt block that can be injected
 * into the AI system instructions.  Returns an empty string when the context
 * carries no useful information.
 */
export function buildContextPrompt(ctx: MentorContext): string {
  const parts: string[] = [];

  if (ctx.profile) {
    const p = ctx.profile;
    parts.push(
      [
        `پروفایل منتور:`,
        `  سطح: ${p.level}`,
        `  پروفایل ریسک: ${p.riskProfile}`,
        `  هدف: ${p.primaryGoal || "ورود امن"}`,
        `  امتیاز اطمینان: ${p.confidenceScore}/100`,
        `  امتیاز انضباط: ${p.disciplineScore}/100`,
        `  سبک یادگیری: ${p.learningStyle}`,
        p.weakAreas.length ? `  نقاط ضعف: ${p.weakAreas.join("، ")}` : null,
        p.strongAreas.length ? `  نقاط قوت: ${p.strongAreas.join("، ")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (ctx.termProgress.length) {
    const passed = ctx.termProgress.filter((t) => t.status === "passed");
    const attempted = ctx.termProgress.filter((t) => t.status === "attempted");
    parts.push(
      [
        `پیشرفت آکادمی:`,
        passed.length ? `  ترم‌های تکمیل‌شده: ${passed.map((t) => `ترم ${t.termNumber} (${t.percent}%)`).join(" | ")}` : null,
        attempted.length ? `  ترم‌های در حال تلاش: ${attempted.map((t) => `ترم ${t.termNumber} (${t.percent}%)`).join(" | ")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (ctx.tradingSignals) {
    const s = ctx.tradingSignals;
    parts.push(
      [
        `سیگنال‌های معاملاتی:`,
        `  میانگین ریسک: ${s.avgRisk}%`,
        `  میانگین انضباط: ${s.avgDiscipline}/100`,
        `  تعداد Risk Flag: ${s.riskFlags}`,
        s.recentEmotions.length ? `  احساسات اخیر: ${s.recentEmotions.join("، ")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (ctx.memories.length) {
    const critical = ctx.memories.filter((m) => m.importance === 100);
    const rest = ctx.memories.filter((m) => m.importance < 100).slice(0, 8);
    const memLines: string[] = [];
    for (const m of critical) memLines.push(`  [CRITICAL/${m.category}] ${m.content}`);
    for (const m of rest) memLines.push(`  [${m.category}] ${m.content}`);
    if (memLines.length) parts.push(`خاطرات منتور:\n${memLines.join("\n")}`);
  }

  if (ctx.recentConversations.length) {
    const convLines = ctx.recentConversations
      .slice(-8)
      .map((c) => `${c.role}: ${c.content.slice(0, 300)}`);
    parts.push(`تاریخچه گفت‌وگوی اخیر (سرور):\n${convLines.join("\n")}`);
  }

  return parts.join("\n\n");
}
