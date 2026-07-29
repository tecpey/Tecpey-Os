"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Award,
  BookOpen,
  Brain,
  Calendar,
  ChevronRight,
  Flame,
  Layers,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import {
  DIMENSION_LABELS,
  type BehavioralSnapshot,
} from "@/lib/behavioral-engine";
import { fetchBehavioralSnapshot } from "@/lib/behavioral-client";
import { generateCoachingReport } from "@/lib/coaching-engine";
import { buildSmartReviewQueue } from "@/lib/smart-review";
import { hydrateProgress } from "@/lib/academy-progress";
import { hydrateDeck, getDueCards } from "@/lib/spaced-repetition";
import { CONCEPT_NODES } from "@/lib/knowledge-graph";
import type { SmartReviewQueue } from "@/lib/smart-review";

// ─── Radar Chart (SVG) ────────────────────────────────────────────────────────

function RadarChart({ snapshot }: { snapshot: BehavioralSnapshot }) {
  const dims = snapshot.dimensions.slice(0, 8); // show 8 dimensions in radar
  const cx = 100; const cy = 100; const r = 70;
  const n = dims.length;
  const toPoint = (idx: number, value: number) => {
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    const dist = (value / 100) * r;
    return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
  };
  const toLabel = (idx: number) => {
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    return { x: cx + Math.cos(angle) * (r + 20), y: cy + Math.sin(angle) * (r + 20) };
  };

  const gridLevels = [25, 50, 75, 100];

  const polygon = dims
    .map((d, i) => {
      const p = toPoint(i, d.score);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 200 200" className="h-48 w-48" aria-label="نمودار رادار ابعاد رفتاری" role="img">
      {/* Grid circles */}
      {gridLevels.map((level) => {
        const pts = Array.from({ length: n }, (_, i) => {
          const p = toPoint(i, level);
          return `${p.x},${p.y}`;
        }).join(" ");
        return (
          <polygon
            key={level}
            points={pts}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
        );
      })}

      {/* Axis lines */}
      {dims.map((_, i) => {
        const outer = toPoint(i, 100);
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={outer.x} y2={outer.y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={polygon}
        fill="rgba(34,211,238,0.15)"
        stroke="rgba(34,211,238,0.6)"
        strokeWidth="1.5"
      />

      {/* Data points */}
      {dims.map((d, i) => {
        const p = toPoint(i, d.score);
        return (
          <circle
            key={i}
            cx={p.x} cy={p.y} r="3"
            fill={d.score >= 70 ? "#22d3ee" : d.score >= 45 ? "#f59e0b" : "#ef4444"}
          />
        );
      })}

      {/* Labels */}
      {dims.map((d, i) => {
        const lp = toLabel(i);
        return (
          <text
            key={i}
            x={lp.x} y={lp.y}
            fontSize="7"
            fill="rgba(255,255,255,0.5)"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {DIMENSION_LABELS[d.dimension].slice(0, 8)}
          </text>
        );
      })}
    </svg>
  );
}

// ─── XP Progress Chart (SVG) ──────────────────────────────────────────────────

function XpProgressBar({ xp, level }: { xp: number; level: number }) {
  const LEVEL_THRESHOLDS = [0, 200, 700, 1500, 2700, 4500, 7000, 10500, 15000, 21000, 29000, 39000];
  const current = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[level] ?? 39000;
  const pct = Math.min(100, Math.round(((xp - current) / (next - current)) * 100));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-black">
        <span className="text-slate-400">سطح {level}</span>
        <span className="text-cyan-300">{xp} XP</span>
        <span className="text-slate-500">سطح {Math.min(12, level + 1)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`پیشرفت سطح ${pct}٪`}
        />
      </div>
      <div className="mt-1 text-center text-xs font-bold text-slate-500">{pct}٪ تا سطح بعدی</div>
    </div>
  );
}

// ─── Study Calendar (30-day heatmap) ─────────────────────────────────────────

function StudyCalendar({ completedAt }: { completedAt: number[] }) {
  const days = useMemo(() => {
    const result: { date: string; active: boolean }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const active = completedAt.some((t) => new Date(t).toISOString().slice(0, 10) === iso);
      result.push({ date: iso, active });
    }
    return result;
  }, [completedAt]);

  return (
    <div>
      <p className="mb-3 text-xs font-black text-slate-500 uppercase tracking-widest">تقویم مطالعه — ۳۰ روز گذشته</p>
      <div className="grid grid-cols-10 gap-1" aria-label="تقویم مطالعه">
        {days.map((d) => (
          <div
            key={d.date}
            title={d.date}
            className={`h-5 w-full rounded-sm ${d.active ? "bg-cyan-500" : "bg-slate-800"}`}
            aria-label={`${d.date}: ${d.active ? "فعال" : "غیرفعال"}`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs font-bold text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-slate-800" /> بدون فعالیت</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-cyan-500" /> روز فعال</span>
      </div>
    </div>
  );
}

// ─── Knowledge Map (static node graph) ───────────────────────────────────────

function KnowledgeMapViz({ masteredIds, weakIds }: { masteredIds: string[]; weakIds: string[] }) {
  const masteredSet = new Set(masteredIds);
  const weakSet = new Set(weakIds);

  // Simple layout: group by lesson index
  const byLesson: Record<number, typeof CONCEPT_NODES> = {};
  for (const node of CONCEPT_NODES) {
    if (!byLesson[node.lessonIndex]) byLesson[node.lessonIndex] = [];
    byLesson[node.lessonIndex].push(node);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">نقشه دانش — ترم ۱</p>
      {Object.entries(byLesson).map(([lessonIdx, nodes]) => (
        <div key={lessonIdx}>
          <p className="mb-2 text-xs font-bold text-slate-500">درس {lessonIdx}</p>
          <div className="flex flex-wrap gap-2">
            {nodes.map((node) => {
              const isMastered = masteredSet.has(node.id);
              const isWeak = weakSet.has(node.id);
              return (
                <span
                  key={node.id}
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    isMastered
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                      : isWeak
                      ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                      : "border-white/10 bg-white/[0.04] text-slate-500"
                  }`}
                  aria-label={`${node.label}: ${isMastered ? "تسلط" : isWeak ? "ضعف" : "در انتظار"}`}
                >
                  {node.label}
                </span>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3 pt-2 text-xs font-bold text-slate-500">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" /> تسلط یافته</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> نیاز به تقویت</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-600 inline-block" /> در انتظار</span>
      </div>
    </div>
  );
}

// ─── Projection Card ──────────────────────────────────────────────────────────

function ProjectionCard({ snapshot, completedLessons }: { snapshot: BehavioralSnapshot; completedLessons: number }) {
  const totalLessons = 3; // Term 1 has 3 authored lessons
  const completionPct = Math.min(100, Math.round((completedLessons / totalLessons) * 100));
  const disciplineScore = snapshot.dimensions.find((d) => d.dimension === "discipline")?.score ?? 0;
  const scholarshipProb = Math.round(
    Math.min(95, snapshot.overallScore * 0.5 + disciplineScore * 0.3 + completionPct * 0.2),
  );
  const propProb = Math.round(
    Math.min(80, snapshot.overallScore * 0.4 + disciplineScore * 0.4 + completionPct * 0.2),
  );
  const weeksToGrad = snapshot.learningVelocity > 0
    ? Math.ceil((totalLessons - completedLessons) / snapshot.learningVelocity)
    : null;

  return (
    <div className="space-y-4">
      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">پیش‌بینی پیشرفت</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4 text-center">
          <p className="text-2xl font-black text-cyan-300">{completionPct}٪</p>
          <p className="text-xs font-bold text-slate-400">پیشرفت ترم ۱</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-center">
          <p className="text-2xl font-black text-slate-200">
            {weeksToGrad !== null ? `${weeksToGrad} هفته` : "—"}
          </p>
          <p className="text-xs font-bold text-slate-400">تا فارغ‌التحصیلی</p>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-center">
          <p className="text-2xl font-black text-amber-300">{scholarshipProb}٪</p>
          <p className="text-xs font-bold text-slate-400">احتمال بورسیه</p>
        </div>
        <div className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4 text-center">
          <p className="text-2xl font-black text-violet-300">{propProb}٪</p>
          <p className="text-xs font-bold text-slate-400">احتمال Prop</p>
        </div>
      </div>

      <p className="text-xs font-bold text-slate-600 text-center">
        * بر اساس رفتار یادگیری فعلی — با بهبود انضباط، احتمال‌ها بالا می‌روند
      </p>
    </div>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function DimensionBar({ label, score, trend }: { label: string; score: number; trend: string }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-red-500";
  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  const trendColor = trend === "up" ? "text-emerald-300" : trend === "down" ? "text-red-300" : "text-slate-400";
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs font-bold text-slate-400 text-right">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-slate-800 h-2">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-black text-slate-300 tabular-nums">{score}</span>
      <span className={`w-4 text-xs font-black ${trendColor}`}>{trendIcon}</span>
    </div>
  );
}

// ─── Review Queue Widget ───────────────────────────────────────────────────────

function ReviewQueueWidget({ queue }: { queue: SmartReviewQueue }) {
  if (queue.items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-800/40 p-5 text-center">
        <p className="font-black text-slate-400">صف مرور خالی است</p>
        <p className="mt-1 text-xs font-bold text-slate-600">درس‌های بیشتری تکمیل کنید تا توصیه‌های شخصی‌سازی‌شده ببینید.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {queue.items.slice(0, 4).map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:border-cyan-300/30 hover:bg-white/[0.06] transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400"
          aria-label={item.title}
        >
          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${
            item.type === "flashcard" ? "bg-violet-400/20" :
            item.type === "quiz-retry" ? "bg-amber-400/20" :
            item.type === "concept-prereq" ? "bg-cyan-400/20" :
            "bg-slate-700"
          }`}>
            {item.type === "flashcard" ? <Brain className="h-4 w-4 text-violet-300" /> :
             item.type === "quiz-retry" ? <BookOpen className="h-4 w-4 text-amber-300" /> :
             item.type === "concept-prereq" ? <Layers className="h-4 w-4 text-cyan-300" /> :
             <ChevronRight className="h-4 w-4 text-slate-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black line-clamp-1">{item.title}</p>
            <p className="text-xs font-bold text-slate-500 line-clamp-1">{item.description}</p>
          </div>
          <div className="shrink-0 text-right">
            <span className="text-xs font-bold text-slate-600">{item.estimatedMinutes} دقیقه</span>
            {item.urgent && <span className="mr-2 text-xs font-black text-red-300">فوری</span>}
          </div>
        </Link>
      ))}
      <p className="pt-1 text-center text-xs font-bold text-slate-600">
        {queue.totalMinutes} دقیقه برای امروز · {queue.items.length} آیتم
      </p>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export function LearningInsightsDashboard() {
  const [snapshot, setSnapshot] = useState<BehavioralSnapshot | null>(null);
  const [reviewQueue, setReviewQueue] = useState<SmartReviewQueue | null>(null);
  const [progress, setProgress] = useState({ xp: 0, level: 1, streak: 0 });
  const [completedAt, setCompletedAt] = useState<number[]>([]);
  const [masteredIds, setMasteredIds] = useState<string[]>([]);
  const [weakIds, setWeakIds] = useState<string[]>([]);
  const [dueFlashcards, setDueFlashcards] = useState(0);
  const [completedLessons, setCompletedLessons] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);

    void Promise.all([
      fetchBehavioralSnapshot("fa", controller.signal),
      hydrateProgress("fa"),
      hydrateDeck("fa"),
    ]).then(([snap, prog, deck]) => {
      if (controller.signal.aborted) return;
      const queue = buildSmartReviewQueue();
      setSnapshot(snap);
      setReviewQueue(queue);
      setProgress({ xp: prog.xp, level: prog.level, streak: prog.streak });
      setDueFlashcards(getDueCards(deck).length);
      setCompletedLessons(Object.keys(prog.completedLessons).length);

      const timestamps = Object.values(prog.completedLessons).map((lesson) => lesson.completedAt);
      setCompletedAt(timestamps);

      const mastered: string[] = [];
      const weak: string[] = [];
      for (const node of CONCEPT_NODES) {
        const lessonScore = Object.values(prog.moduleScores)[node.lessonIndex - 1] ?? 0;
        const lessonCompleted = Object.values(prog.completedLessons)
          .some((lesson) => lesson.lessonId.includes(`l${node.lessonIndex}`));
        if (lessonCompleted) {
          if (lessonScore >= 80) mastered.push(node.id);
          else weak.push(node.id);
        }
      }
      setMasteredIds(mastered);
      setWeakIds(weak);
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError(true);
    });

    return () => controller.abort();
  }, [reloadToken]);

  if (!snapshot) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm font-bold text-slate-500" aria-label="در حال بارگذاری">
        {loadError ? (
          <>
            <span className="text-amber-300">دریافت داشبورد از سرور انجام نشد.</span>
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              className="rounded-xl border border-cyan-300/30 px-4 py-2 text-xs font-black text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              تلاش دوباره
            </button>
          </>
        ) : "در حال بارگذاری داشبورد امن سرور..."}
      </div>
    );
  }

  const coaching = generateCoachingReport(snapshot, dueFlashcards);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">داشبورد یادگیری</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">تحلیل رفتار و پیشرفت شخصی‌سازی‌شده</p>
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10">
          <Activity className="h-7 w-7 text-cyan-300" />
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Zap className="h-4 w-4 text-amber-300" />
            <p className="text-xl font-black text-amber-300">{progress.xp}</p>
          </div>
          <p className="text-xs font-bold text-slate-400">XP کل</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Flame className="h-4 w-4 text-orange-300" />
            <p className="text-xl font-black text-orange-300">{progress.streak}</p>
          </div>
          <p className="text-xs font-bold text-slate-400">streak روز</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Trophy className="h-4 w-4 text-violet-300" />
            <p className="text-xl font-black text-violet-300">{snapshot.overallScore}</p>
          </div>
          <p className="text-xs font-bold text-slate-400">امتیاز رفتاری</p>
        </div>
      </div>

      {/* XP bar */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        <XpProgressBar xp={progress.xp} level={progress.level} />
      </div>

      {/* Daily coaching */}
      <div className={`rounded-[24px] border p-5 ${
        coaching.daily.tone === "celebrate" ? "border-emerald-400/30 bg-emerald-400/5" :
        coaching.daily.tone === "warn" ? "border-red-400/30 bg-red-400/5" :
        coaching.daily.tone === "encourage" ? "border-cyan-300/20 bg-cyan-400/5" :
        "border-violet-400/20 bg-violet-400/5"
      }`}>
        <div className="flex items-start gap-3">
          <Brain className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">مربی امروز</p>
            <p className="font-black">{coaching.daily.headline}</p>
            <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{coaching.daily.body}</p>
            <div className="mt-3 rounded-xl bg-slate-800/60 p-3">
              <p className="text-xs font-black text-slate-400 mb-1">اقدام امروز:</p>
              <p className="text-sm font-bold text-cyan-200">{coaching.daily.suggestedAction}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Radar + Behavioral scores */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-cyan-300" />
          <h2 className="font-black">ابعاد رفتاری</h2>
        </div>
        <div className="flex flex-col items-center gap-6 lg:flex-row">
          <RadarChart snapshot={snapshot} />
          <div className="flex-1 w-full space-y-2">
            {snapshot.dimensions.map((d) => (
              <DimensionBar
                key={d.dimension}
                label={DIMENSION_LABELS[d.dimension]}
                score={d.score}
                trend={d.trend}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Review queue */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-violet-300" />
            <h2 className="font-black">صف مرور هوشمند</h2>
          </div>
          {dueFlashcards > 0 && (
            <span className="rounded-full bg-violet-400/20 px-3 py-1 text-xs font-black text-violet-300">
              {dueFlashcards} فلش‌کارت امروز
            </span>
          )}
        </div>
        {reviewQueue && <ReviewQueueWidget queue={reviewQueue} />}
      </div>

      {/* Knowledge map */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        <KnowledgeMapViz masteredIds={masteredIds} weakIds={weakIds} />
      </div>

      {/* Study calendar */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        <StudyCalendar completedAt={completedAt} />
      </div>

      {/* Projections */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        <ProjectionCard snapshot={snapshot} completedLessons={completedLessons} />
      </div>

      {/* Warnings */}
      {coaching.warnings.length > 0 && (
        <div className="space-y-2">
          {coaching.warnings.map((w, i) => (
            <div
              key={i}
              className={`rounded-2xl border p-4 ${
                w.urgency === "critical" ? "border-red-400/40 bg-red-400/10" :
                w.urgency === "important" ? "border-amber-400/40 bg-amber-400/10" :
                "border-slate-600/40 bg-slate-800/40"
              }`}
            >
              <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">{w.label}</p>
              <p className="text-sm font-bold text-slate-300">{w.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Encouragements */}
      {coaching.encouragements.length > 0 && (
        <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-400/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Award className="h-5 w-5 text-emerald-300" />
            <h3 className="font-black text-emerald-200">دستاوردهای شما</h3>
          </div>
          {coaching.encouragements.map((msg, i) => (
            <p key={i} className="mt-2 text-sm font-bold leading-7 text-slate-300">{msg}</p>
          ))}
        </div>
      )}
    </div>
  );
}
