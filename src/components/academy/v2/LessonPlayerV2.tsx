"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookMarked,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Flame,
  Info,
  Lightbulb,
  Lock,
  MessageSquare,
  Pencil,
  Shield,
  Sparkles,
  Star,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import { QuizEngineV2 } from "./QuizEngineV2";
import { FlashcardDeck } from "./FlashcardDeck";
import {
  loadProgress,
  onProgressChange,
  recordLessonComplete,
  xpForNextLevel,
  XP_TABLE,
} from "@/lib/academy-progress";
import type { Lesson } from "@/data/academy/term1Curriculum";

// ─── Sub-components ───────────────────────────────────────────────────────────

function LessonHeader({ lesson }: { lesson: Lesson }) {
  const difficultyLabel = { beginner: "مبتدی", intermediate: "میانی", advanced: "پیشرفته" }[lesson.difficulty];
  const difficultyColor = { beginner: "text-emerald-300", intermediate: "text-amber-300", advanced: "text-red-300" }[lesson.difficulty];

  return (
    <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-800/80 to-slate-900/80 p-6 lg:p-8">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-xs font-bold text-slate-500">
        <span>ترم {lesson.termNumber}</span>
        <ChevronRight className="h-3 w-3" />
        <span>درس {lesson.lessonIndex}</span>
      </div>

      <h1 className="text-2xl font-black leading-tight lg:text-3xl">{lesson.title}</h1>
      <p className="mt-2 font-bold text-slate-400">{lesson.subtitle}</p>

      {/* Meta row */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-black text-slate-300">
          <Clock className="h-3.5 w-3.5" />
          {lesson.estimatedMinutes} دقیقه
        </div>
        <div className={`flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-black ${difficultyColor}`}>
          <Target className="h-3.5 w-3.5" />
          {difficultyLabel}
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-black text-cyan-300">
          <Zap className="h-3.5 w-3.5" />
          {XP_TABLE.LESSON_COMPLETE} XP
        </div>
      </div>

      {/* Learning objectives */}
      <div className="mt-5">
        <p className="mb-3 text-xs font-black text-slate-500 uppercase tracking-widest">اهداف یادگیری</p>
        <ul className="space-y-2">
          {lesson.objectives.map((obj, i) => (
            <li key={i} className="flex items-start gap-2 text-sm font-bold text-slate-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              {obj}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type CalloutType = "warning" | "tip" | "important" | "responsible";

function Callout({ type, text }: { type: CalloutType; text: string }) {
  const config: Record<CalloutType, { icon: React.ReactNode; color: string; label: string }> = {
    warning: { icon: <AlertTriangle className="h-4 w-4" />, color: "border-red-400/40 bg-red-400/10 text-red-200", label: "هشدار" },
    tip: { icon: <Lightbulb className="h-4 w-4" />, color: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200", label: "نکته" },
    important: { icon: <Info className="h-4 w-4" />, color: "border-violet-400/40 bg-violet-400/10 text-violet-200", label: "مهم" },
    responsible: { icon: <Shield className="h-4 w-4" />, color: "border-amber-400/40 bg-amber-400/10 text-amber-200", label: "معامله مسئولانه" },
  };
  const { icon, color, label } = config[type];
  return (
    <div className={`flex gap-3 rounded-2xl border p-4 ${color}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs font-black uppercase tracking-wider opacity-60 mb-1">{label}</p>
        <p className="text-sm font-bold leading-7">{text}</p>
      </div>
    </div>
  );
}

function SectionContent({ section }: { section: Lesson["sections"][0] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-black">{section.heading}</h2>
      <p className="leading-8 font-bold text-slate-300">{section.body}</p>
      {section.callout && (
        <Callout type={section.callout.type} text={section.callout.text} />
      )}
    </div>
  );
}

function KeyTakeaways({ items }: { items: string[] }) {
  return (
    <div className="rounded-[24px] border border-emerald-400/30 bg-emerald-400/5 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Star className="h-5 w-5 text-emerald-300" />
        <h3 className="font-black text-emerald-200">نکات کلیدی</h3>
      </div>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm font-bold text-slate-200">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MentorNote({ note }: { note: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[24px] border border-violet-400/30 bg-violet-400/5 p-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded-xl"
        aria-expanded={open}
        aria-controls="mentor-note-body"
      >
        <Brain className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
        <div className="flex-1 text-right">
          <p className="font-black text-violet-200">یادداشت مربی</p>
          {!open && <p className="mt-1 line-clamp-1 text-xs font-bold text-slate-500">{note}</p>}
        </div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-violet-300 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p id="mentor-note-body" className="mt-4 text-sm font-bold leading-8 text-slate-300 border-t border-violet-400/20 pt-4">
          {note}
        </p>
      )}
    </div>
  );
}

function PracticeExercisePanel({ exercise }: { exercise: Lesson["practiceExercise"] }) {
  const [checks, setChecks] = useState<Record<number, boolean>>({});
  const allChecked = exercise.type === "checklist" && (exercise.items ?? []).every((_, i) => checks[i]);

  return (
    <div className="rounded-[24px] border border-amber-400/30 bg-amber-400/5 p-6">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-amber-300" />
        <h3 className="font-black text-amber-200">{exercise.title}</h3>
      </div>
      <p className="mb-4 text-sm font-bold leading-7 text-slate-300">{exercise.prompt}</p>

      {exercise.type === "checklist" && exercise.items && (
        <div className="space-y-3">
          {exercise.items.map((item, i) => (
            <label
              key={i}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 hover:bg-white/[0.08] transition-colors"
            >
              <input
                type="checkbox"
                checked={!!checks[i]}
                onChange={(e) => setChecks((prev) => ({ ...prev, [i]: e.target.checked }))}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
                aria-label={item}
              />
              <span className="text-sm font-bold text-slate-300">{item}</span>
            </label>
          ))}
        </div>
      )}

      {exercise.type === "reflection" && (
        <textarea
          placeholder="پاسخ خود را اینجا بنویسید..."
          rows={4}
          className="w-full rounded-xl border border-white/10 bg-slate-800/60 p-4 text-sm font-bold text-slate-200 placeholder-slate-600 focus:border-amber-300/50 focus:outline-none focus:ring-2 focus:ring-amber-300/30 resize-none"
          aria-label="پاسخ تمرین"
        />
      )}

      {allChecked && (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3">
          <p className="text-sm font-bold text-emerald-300">{exercise.expectedInsight}</p>
        </div>
      )}
    </div>
  );
}

function ReflectionPrompt({ prompt, lessonId }: { prompt: string; lessonId: string }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!text.trim()) return;
    try {
      const key = `tecpey-reflection-${lessonId}`;
      localStorage.setItem(key, JSON.stringify({ text, savedAt: Date.now() }));
      setSaved(true);
    } catch {
      // quota exceeded
    }
  };

  return (
    <div className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/5 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Pencil className="h-5 w-5 text-cyan-300" />
        <h3 className="font-black text-cyan-200">بازتاب یادگیری</h3>
      </div>
      <p className="mb-4 text-sm font-bold leading-7 text-slate-300">{prompt}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="افکار خود را بنویسید — فقط برای شما ذخیره می‌شود..."
        rows={3}
        className="w-full rounded-xl border border-white/10 bg-slate-800/60 p-4 text-sm font-bold text-slate-200 placeholder-slate-600 focus:border-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/30 resize-none"
        aria-label="بازتاب یادگیری"
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-600">{text.length} کاراکتر</span>
        {saved ? (
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> ذخیره شد
          </span>
        ) : (
          <button
            onClick={handleSave}
            disabled={!text.trim()}
            className="rounded-xl bg-cyan-400/20 px-4 py-1.5 text-xs font-black text-cyan-300 hover:bg-cyan-400/30 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            aria-label="ذخیره بازتاب"
          >
            ذخیره
          </button>
        )}
      </div>
    </div>
  );
}

function ResponsibleTradingCard({ text }: { text: string }) {
  return (
    <div className="rounded-[24px] border border-rose-400/30 bg-rose-400/5 p-5">
      <div className="flex items-start gap-3">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
        <div>
          <p className="text-xs font-black text-rose-300 uppercase tracking-wider mb-2">معامله مسئولانه</p>
          <p className="text-sm font-bold leading-7 text-slate-300">{text}</p>
        </div>
      </div>
    </div>
  );
}

function XPProgressWidget() {
  const [xpInfo, setXpInfo] = useState({ current: 0, needed: 200, level: 1 });

  useEffect(() => {
    const update = () => {
      const p = loadProgress();
      setXpInfo(xpForNextLevel(p.xp));
    };
    update();
    return onProgressChange(update);
  }, []);

  const pct = Math.min(100, Math.round((xpInfo.current / xpInfo.needed) * 100));

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-800/60 px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400/20 text-xs font-black text-cyan-300">
        {xpInfo.level}
      </div>
      <div className="flex-1">
        <div className="mb-1 flex justify-between text-xs font-black">
          <span className="text-slate-400">سطح {xpInfo.level}</span>
          <span className="text-cyan-300">{xpInfo.current}/{xpInfo.needed} XP</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <Flame className="h-5 w-5 text-orange-300" />
    </div>
  );
}

type Phase = "reading" | "knowledge-check" | "flashcards" | "quiz" | "complete";

// ─── Main LessonPlayerV2 ──────────────────────────────────────────────────────

type LessonPlayerV2Props = {
  lesson: Lesson;
  onComplete?: (score: number) => void;
  onNext?: () => void;
};

export function LessonPlayerV2({ lesson, onComplete, onNext }: LessonPlayerV2Props) {
  const [phase, setPhase] = useState<Phase>("reading");
  const [readProgress, setReadProgress] = useState(0);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = loadProgress();
    const completed = p.completedLessons[lesson.id];
    setAlreadyCompleted(!!completed);
  }, [lesson.id]);

  // Track reading scroll progress
  useEffect(() => {
    if (phase !== "reading") return;
    const el = contentRef.current;
    if (!el) return;
    const handleScroll = () => {
      const total = el.scrollHeight - el.clientHeight;
      if (total <= 0) { setReadProgress(100); return; }
      setReadProgress(Math.min(100, Math.round((el.scrollTop / total) * 100)));
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [phase]);

  const handleKnowledgeCheckPass = useCallback(() => {
    setPhase("flashcards");
  }, []);

  const handleFlashcardsClose = useCallback(() => {
    setPhase("quiz");
  }, []);

  const handleQuizPass = useCallback(
    (score: number) => {
      recordLessonComplete(lesson.id, score, lesson.termNumber);
      setAlreadyCompleted(true);
      setPhase("complete");
      onComplete?.(score);
    },
    [lesson.id, lesson.termNumber, onComplete],
  );

  const handleQuizFail = useCallback((_score: number) => {
    setPhase("reading");
  }, []);

  // ── Phase: reading ──
  if (phase === "reading") {
    return (
      <div className="space-y-6" dir="rtl">
        <XPProgressWidget />
        <LessonHeader lesson={lesson} />

        {/* Reading progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-1 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-200"
              style={{ width: `${readProgress}%` }}
            />
          </div>
          <span className="text-xs font-black text-slate-500 tabular-nums">{readProgress}٪</span>
        </div>

        {/* Scrollable content */}
        <div
          ref={contentRef}
          className="max-h-[60vh] space-y-8 overflow-y-auto rounded-[28px] border border-white/10 bg-slate-900/60 p-6 lg:p-8 scroll-smooth"
          aria-label="محتوای درس"
        >
          {lesson.sections.map((section, i) => (
            <SectionContent key={i} section={section} />
          ))}

          <KeyTakeaways items={lesson.keyTakeaways} />
          <MentorNote note={lesson.mentorNote} />
          <ResponsibleTradingCard text={lesson.responsibleTradingInsert} />
          <PracticeExercisePanel exercise={lesson.practiceExercise} />
          <ReflectionPrompt prompt={lesson.reflection} lessonId={lesson.id} />
        </div>

        {/* CTA */}
        <div className="space-y-3">
          {!alreadyCompleted ? (
            <button
              onClick={() => setPhase("knowledge-check")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-500 py-4 font-black text-white shadow-lg shadow-cyan-500/20 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-cyan-400 active:scale-95 transition-all"
              aria-label="شروع سؤالات درک مطلب"
            >
              <CheckCircle2 className="h-5 w-5" />
              سؤالات درک مطلب
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-center">
              <div className="flex items-center justify-center gap-2 font-black text-emerald-300">
                <Trophy className="h-5 w-5" />
                این درس قبلاً تکمیل شده
              </div>
              {onNext && (
                <button
                  onClick={onNext}
                  className="mt-3 w-full rounded-xl bg-slate-800 py-3 text-sm font-black text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  aria-label="درس بعدی"
                >
                  درس بعدی →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Phase: knowledge-check ──
  if (phase === "knowledge-check") {
    return (
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-800/60 p-4">
          <BookMarked className="h-5 w-5 text-cyan-300" />
          <div>
            <p className="font-black">سؤالات درک مطلب</p>
            <p className="text-xs font-bold text-slate-400">برای رفتن به کارت‌ها باید {80}٪ بگیری</p>
          </div>
        </div>
        <QuizEngineV2
          questions={lesson.knowledgeChecks}
          mode="knowledge-check"
          passThreshold={80}
          title={`درس ${lesson.lessonIndex} — درک مطلب`}
          onPass={handleKnowledgeCheckPass}
          onFail={() => setPhase("reading")}
          onReviewRequested={() => setPhase("reading")}
        />
      </div>
    );
  }

  // ── Phase: flashcards ──
  if (phase === "flashcards") {
    return (
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-800/60 p-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-violet-300" />
            <div>
              <p className="font-black">مرور فلش‌کارت‌ها</p>
              <p className="text-xs font-bold text-slate-400">حافظه بلندمدت با تکرار فاصله‌دار</p>
            </div>
          </div>
          <button
            onClick={handleFlashcardsClose}
            className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-black text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
            aria-label="رفتن به آزمون"
          >
            رفتن به آزمون →
          </button>
        </div>
        <FlashcardDeck
          flashcards={lesson.flashcards}
          dueOnly={false}
          onClose={handleFlashcardsClose}
        />
      </div>
    );
  }

  // ── Phase: quiz (mastery gate) ──
  if (phase === "quiz") {
    return (
      <div className="space-y-6" dir="rtl">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-amber-300" />
            <div>
              <p className="font-black text-amber-200">دروازه تسلط</p>
              <p className="text-xs font-bold text-slate-400">برای ادامه باید {80}٪ یا بیشتر بگیری</p>
            </div>
          </div>
        </div>
        <QuizEngineV2
          questions={lesson.knowledgeChecks}
          mode="knowledge-check"
          passThreshold={80}
          retakeCooldownHours={0}
          title={`آزمون درس ${lesson.lessonIndex}`}
          onPass={handleQuizPass}
          onFail={handleQuizFail}
          onReviewRequested={() => setPhase("reading")}
        />
      </div>
    );
  }

  // ── Phase: complete ──
  return (
    <div className="space-y-5" dir="rtl">
      <div className="rounded-[32px] border border-emerald-400/30 bg-emerald-400/5 p-8 text-center">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-400/10">
          <Trophy className="h-12 w-12 text-emerald-300" />
        </div>
        <h2 className="text-2xl font-black text-emerald-200">درس تکمیل شد!</h2>
        <p className="mt-3 text-sm font-bold text-slate-400">
          {lesson.nextLessonTeaser}
        </p>

        {/* XP earned */}
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-slate-800 p-3">
          <Zap className="h-5 w-5 text-amber-300" />
          <span className="font-black text-amber-200">+{XP_TABLE.LESSON_COMPLETE} XP کسب شد</span>
        </div>

        {/* Action buttons */}
        <div className="mt-6 grid gap-3">
          <button
            onClick={() => setPhase("flashcards")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-400/30 bg-violet-400/10 py-3 font-black text-violet-200 hover:bg-violet-400/20 focus:outline-none focus:ring-2 focus:ring-violet-400"
            aria-label="مرور فلش‌کارت‌ها"
          >
            <Brain className="h-4 w-4" />
            مرور فلش‌کارت‌ها
          </button>
          {onNext && (
            <button
              onClick={onNext}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-500 py-4 font-black text-white shadow-lg shadow-cyan-500/20 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-cyan-400 active:scale-95"
              aria-label="درس بعدی"
            >
              درس بعدی
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Responsible trading reminder at end of every lesson */}
      <ResponsibleTradingCard text={lesson.responsibleTradingInsert} />

      {/* Discussion prompt */}
      <div className="rounded-2xl border border-white/10 bg-slate-800/40 p-5">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="h-4 w-4 text-slate-400" />
          <p className="font-black text-slate-300">سؤال برای تأمل</p>
        </div>
        <p className="text-sm font-bold leading-7 text-slate-400">{lesson.reflection}</p>
      </div>
    </div>
  );
}
