"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Brain,
  ChevronRight,
  Flame,
  Layers,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  computeBehavioralSnapshot,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  type BehavioralSnapshot,
  type BehavioralDimension,
} from "@/lib/behavioral-engine";
import { generateCoachingReport, type CoachingCard, type CoachingWarning } from "@/lib/coaching-engine";
import { buildSmartReviewQueue, type ReviewQueueItem } from "@/lib/smart-review";
import { loadDeck, getDueCards } from "@/lib/spaced-repetition";

// ─── Coach card ───────────────────────────────────────────────────────────────

function CoachCard({ card }: { card: CoachingCard }) {
  const [expanded, setExpanded] = useState(false);
  const toneColors = {
    celebrate: "border-emerald-400/30 bg-emerald-400/5",
    encourage: "border-cyan-300/20 bg-cyan-400/5",
    challenge: "border-violet-400/20 bg-violet-400/5",
    warn: "border-amber-400/30 bg-amber-400/5",
  };
  const toneIcons = {
    celebrate: <Trophy className="h-5 w-5 text-emerald-300" />,
    encourage: <Sparkles className="h-5 w-5 text-cyan-300" />,
    challenge: <Target className="h-5 w-5 text-violet-300" />,
    warn: <AlertTriangle className="h-5 w-5 text-amber-300" />,
  };
  return (
    <div className={`rounded-[24px] border p-5 ${toneColors[card.tone]}`}>
      <div className="flex items-start gap-3">
        {toneIcons[card.tone]}
        <div className="flex-1">
          <p className="font-black">{card.headline}</p>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{card.body}</p>
          {expanded && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-slate-800/60 p-3">
                <p className="text-xs font-black text-slate-400 mb-1">چرا؟</p>
                <p className="text-sm font-bold text-slate-300">{card.why}</p>
              </div>
              <div className="rounded-xl bg-slate-800/60 p-3">
                <p className="text-xs font-black text-slate-400 mb-1">مدرک:</p>
                <p className="text-sm font-bold text-slate-300">{card.evidence}</p>
              </div>
              <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/5 p-3">
                <p className="text-xs font-black text-cyan-300 mb-1">اقدام پیشنهادی:</p>
                <p className="text-sm font-bold text-cyan-200">{card.suggestedAction}</p>
              </div>
              <div className="rounded-xl bg-slate-800/60 p-3">
                <p className="text-xs font-black text-slate-400 mb-1">بهبود مورد انتظار:</p>
                <p className="text-sm font-bold text-slate-300">{card.expectedImprovement}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 flex items-center gap-1 text-xs font-black text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded-lg px-1 py-0.5"
            aria-expanded={expanded}
          >
            {expanded ? "بستن" : "جزئیات بیشتر"}
            <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Behavioral score pill ────────────────────────────────────────────────────

function ScorePill({ dimension, score, trend }: { dimension: BehavioralDimension; score: number; trend: string }) {
  const color = score >= 70 ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/5"
    : score >= 45 ? "text-amber-300 border-amber-400/30 bg-amber-400/5"
    : "text-red-300 border-red-400/30 bg-red-400/5";
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null;

  return (
    <div className={`flex flex-col items-center rounded-2xl border p-3 ${color}`} aria-label={`${DIMENSION_LABELS[dimension]}: ${score}`}>
      {TrendIcon && <TrendIcon className="mb-1 h-3.5 w-3.5" />}
      <span className="text-lg font-black">{score}</span>
      <span className="text-center text-[10px] font-bold leading-4 opacity-70">{DIMENSION_LABELS[dimension]}</span>
    </div>
  );
}

// ─── Warning card ─────────────────────────────────────────────────────────────

function WarningCard({ warning }: { warning: CoachingWarning }) {
  return (
    <div className={`flex gap-3 rounded-2xl border p-4 ${
      warning.urgency === "critical" ? "border-red-400/40 bg-red-400/10" : "border-amber-400/30 bg-amber-400/5"
    }`}>
      <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${warning.urgency === "critical" ? "text-red-300" : "text-amber-300"}`} />
      <div>
        <p className="text-xs font-black text-slate-400 mb-0.5">{warning.label}</p>
        <p className="text-sm font-bold leading-6 text-slate-300">{warning.message}</p>
      </div>
    </div>
  );
}

// ─── Review queue item ────────────────────────────────────────────────────────

function ReviewItem({ item }: { item: ReviewQueueItem }) {
  const icons: Record<string, React.ReactNode> = {
    flashcard: <Brain className="h-4 w-4 text-violet-300" />,
    "lesson-review": <BookOpen className="h-4 w-4 text-cyan-300" />,
    "concept-prereq": <Layers className="h-4 w-4 text-amber-300" />,
    "quiz-retry": <RefreshCw className="h-4 w-4 text-orange-300" />,
    reflection: <Lightbulb className="h-4 w-4 text-slate-400" />,
  };
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-cyan-300/30 hover:bg-white/[0.06] transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800">
        {icons[item.type]}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black line-clamp-1">{item.title}</p>
        <p className="text-xs font-bold text-slate-500 line-clamp-1">{item.description}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-bold text-slate-600">{item.estimatedMinutes} دقیقه</p>
        {item.urgent && <p className="text-[10px] font-black text-red-300">فوری</p>}
      </div>
    </Link>
  );
}

// ─── Ask Mentor ───────────────────────────────────────────────────────────────

function AskMentor({ snapshot }: { snapshot: BehavioralSnapshot }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setAnswer("");
    setError("");

    const weakest = snapshot.weakestDimension;
    const strongest = snapshot.strongestDimension;

    try {
      const res = await fetch("/api/ai-mentor-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          locale: "fa",
          behavioralContext: {
            overallScore: snapshot.overallScore,
            weakestDimension: weakest ? DIMENSION_LABELS[weakest] : null,
            strongestDimension: strongest ? DIMENSION_LABELS[strongest] : null,
            learningVelocity: snapshot.learningVelocity,
            preferredStyle: snapshot.preferredLearningStyle,
            topWarnings: snapshot.dimensions
              .filter((d) => d.score < 50)
              .slice(0, 2)
              .map((d) => ({ dimension: DIMENSION_LABELS[d.dimension], message: d.explanation })),
          },
        }),
      });
      const json = (await res.json()) as { ok: boolean; answer?: string; error?: string };
      if (json.ok && json.answer) {
        setAnswer(json.answer);
      } else {
        setError("منتور در حال حاضر در دسترس نیست.");
      }
    } catch {
      setError("خطای شبکه. دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }, [question, loading, snapshot]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="rounded-[24px] border border-violet-400/20 bg-violet-400/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-violet-300" />
        <h3 className="font-black text-violet-200">از منتور بپرس</h3>
      </div>
      <p className="mb-4 text-xs font-bold text-slate-400">
        منتور پروفایل رفتاری شما را می‌داند و پاسخ شخصی‌سازی‌شده می‌دهد.
      </p>

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="سؤال رفتاری یا آموزشی بپرسید..."
          rows={3}
          maxLength={800}
          className="w-full resize-none rounded-2xl border border-white/10 bg-slate-800/60 p-4 pb-10 text-sm font-bold text-slate-200 placeholder-slate-600 focus:border-violet-300/50 focus:outline-none focus:ring-2 focus:ring-violet-300/30"
          aria-label="سؤال از منتور"
          disabled={loading}
        />
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-600">{question.length}/800</span>
          <button
            onClick={handleSubmit}
            disabled={!question.trim() || loading}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-violet-300"
            aria-label="ارسال سؤال"
          >
            {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {answer && (
        <div className="mt-4 rounded-2xl border border-violet-400/20 bg-slate-900/60 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-300" />
            <p className="text-xs font-black text-violet-300">پاسخ منتور:</p>
          </div>
          <p className="text-sm font-bold leading-8 text-slate-200 whitespace-pre-line">{answer}</p>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 p-3">
          <p className="text-xs font-bold text-red-300">{error}</p>
        </div>
      )}

      <div className="mt-3 rounded-xl bg-slate-800/40 p-3">
        <p className="text-[10px] font-bold text-slate-500">
          <Shield className="inline h-3 w-3 mr-1" />
          منتور توصیه مالی شخصی یا سیگنال خرید/فروش نمی‌دهد.
        </p>
      </div>
    </div>
  );
}

// ─── Main MentorV2 ────────────────────────────────────────────────────────────

type MentorV2Tab = "daily" | "weekly" | "monthly";

export function MentorV2() {
  const [snapshot, setSnapshot] = useState<BehavioralSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<MentorV2Tab>("daily");
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [dueFlashcards, setDueFlashcards] = useState(0);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const snap = computeBehavioralSnapshot();
    const queue = buildSmartReviewQueue();
    const deck = loadDeck();
    setSnapshot(snap);
    setReviewQueue(queue.items.slice(0, 5));
    setDueFlashcards(getDueCards(deck).length);
  }, []);

  if (!snapshot) {
    return (
      <div className="flex h-64 items-center justify-center text-sm font-bold text-slate-500">
        در حال بارگذاری...
      </div>
    );
  }

  const coaching = generateCoachingReport(snapshot, dueFlashcards);
  const activeCard = coaching[activeTab];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black">مربی رفتاری</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">
            کوچینگ بلندمدت بر اساس رفتار یادگیری و معاملاتی
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dueFlashcards > 0 && (
            <Link href="/academy/flashcards" className="flex items-center gap-1.5 rounded-full bg-violet-400/20 px-3 py-1.5 text-xs font-black text-violet-300 hover:bg-violet-400/30 focus:outline-none focus:ring-2 focus:ring-violet-400">
              <Brain className="h-3.5 w-3.5" />
              {dueFlashcards} کارت امروز
            </Link>
          )}
        </div>
      </div>

      {/* Overall score */}
      <div className="flex items-center gap-4 rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10">
          <span className="text-2xl font-black text-cyan-300">{snapshot.overallScore}</span>
        </div>
        <div className="flex-1">
          <p className="font-black">امتیاز رفتار یادگیری</p>
          <p className="mt-1 text-sm font-bold text-slate-400">
            {snapshot.dataQuality === "sparse" ? "داده کم — با ادامه یادگیری دقیق‌تر می‌شود" :
             snapshot.dataQuality === "moderate" ? "داده متوسط" : "داده کافی برای تحلیل دقیق"}
          </p>
          <div className="mt-2 flex items-center gap-3 text-xs font-bold text-slate-500">
            {snapshot.strongestDimension && (
              <span className="flex items-center gap-1 text-emerald-300">
                <TrendingUp className="h-3 w-3" />
                {DIMENSION_LABELS[snapshot.strongestDimension]}
              </span>
            )}
            {snapshot.weakestDimension && (
              <span className="flex items-center gap-1 text-amber-300">
                <TrendingDown className="h-3 w-3" />
                {DIMENSION_LABELS[snapshot.weakestDimension]}
              </span>
            )}
          </div>
        </div>
        <Link
          href="/academy/insights"
          className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
          aria-label="مشاهده داشبورد کامل"
        >
          <Flame className="h-3.5 w-3.5" />
          داشبورد
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Review reminder */}
      {coaching.reviewReminder && (
        <div className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-300 shrink-0" />
            <p className="text-sm font-bold text-violet-200">{coaching.reviewReminder}</p>
          </div>
        </div>
      )}

      {/* Coaching tabs */}
      <div>
        <div className="mb-4 flex rounded-2xl border border-white/10 bg-slate-800/40 p-1">
          {(["daily", "weekly", "monthly"] as MentorV2Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-xl py-2 text-xs font-black transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                activeTab === tab ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
              }`}
              aria-pressed={activeTab === tab}
              aria-label={tab === "daily" ? "کوچینگ روزانه" : tab === "weekly" ? "کوچینگ هفتگی" : "کوچینگ ماهانه"}
            >
              {tab === "daily" ? "روزانه" : tab === "weekly" ? "هفتگی" : "ماهانه"}
            </button>
          ))}
        </div>
        <CoachCard card={activeCard} />
      </div>

      {/* Behavioral scores grid */}
      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">ابعاد رفتاری</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {snapshot.dimensions.map((d) => (
            <ScorePill key={d.dimension} dimension={d.dimension} score={d.score} trend={d.trend} />
          ))}
        </div>
        {/* Weakest dimension focus */}
        {snapshot.weakestDimension && (
          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="text-xs font-black text-amber-300 mb-1">
              تمرکز: {DIMENSION_LABELS[snapshot.weakestDimension]}
            </p>
            <p className="text-sm font-bold text-slate-300">
              {DIMENSION_DESCRIPTIONS[snapshot.weakestDimension]}
            </p>
            <p className="mt-2 text-sm font-bold text-amber-200">
              {snapshot.dimensions.find((d) => d.dimension === snapshot.weakestDimension)?.actionSuggestion}
            </p>
          </div>
        )}
      </div>

      {/* Warnings */}
      {coaching.warnings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">هشدارهای رفتاری</p>
          {coaching.warnings.map((w, i) => (
            <WarningCard key={i} warning={w} />
          ))}
        </div>
      )}

      {/* Smart review queue */}
      {reviewQueue.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">صف مرور شخصی‌سازی‌شده</p>
          <div className="space-y-2">
            {reviewQueue.map((item) => (
              <ReviewItem key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Encouragements */}
      {coaching.encouragements.length > 0 && (
        <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-400/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="h-5 w-5 text-emerald-300" />
            <p className="font-black text-emerald-200">دستاوردهای این هفته</p>
          </div>
          {coaching.encouragements.map((msg, i) => (
            <p key={i} className="mt-2 text-sm font-bold leading-7 text-slate-300">{msg}</p>
          ))}
        </div>
      )}

      {/* Ask mentor */}
      <AskMentor snapshot={snapshot} />
    </div>
  );
}
