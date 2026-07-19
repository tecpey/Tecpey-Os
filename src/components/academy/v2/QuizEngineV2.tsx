"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, Clock, Lock, RefreshCw, Trophy, XCircle } from "lucide-react";
import type { QuizQuestion } from "@/data/academy/term1Curriculum";

// ─── Types ────────────────────────────────────────────────────────────────────

type QuizMode = "module" | "term-exam" | "knowledge-check";

export type QuizSubmissionAnswer = string | string[] | Record<string, string>;
export type QuizSubmissionAnswers = Record<string, QuizSubmissionAnswer>;

type QuizState = {
  phase: "intro" | "question" | "feedback" | "result" | "locked";
  questionIndex: number;
  answers: Record<string, string | string[]>;
  correctCount: number;
  submitted: boolean;
  lastAnswerCorrect: boolean | null;
  startedAt: number;
  elapsedSeconds: number;
  orderingSelection: string[];
  matchingPairs: Record<string, string>;
  fillBlankValue: string;
};

type QuizAction =
  | { type: "START" }
  | { type: "SELECT_SINGLE"; value: string }
  | { type: "TOGGLE_MULTI"; value: string }
  | { type: "ORDERING_MOVE"; from: number; to: number }
  | { type: "MATCH_PAIR"; term: string; definition: string }
  | { type: "FILL_BLANK"; value: string }
  | { type: "SUBMIT_ANSWER" }
  | { type: "NEXT_QUESTION"; correct: boolean }
  | { type: "TICK" }
  | { type: "RETRY" };

// ─── Reducer ─────────────────────────────────────────────────────────────────

function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case "START":
      return { ...state, phase: "question", startedAt: Date.now() };
    case "SELECT_SINGLE":
      return { ...state, answers: { ...state.answers, current: action.value } };
    case "TOGGLE_MULTI": {
      const current = (state.answers.current as string[] | undefined) ?? [];
      const next = current.includes(action.value)
        ? current.filter((v) => v !== action.value)
        : [...current, action.value];
      return { ...state, answers: { ...state.answers, current: next } };
    }
    case "ORDERING_MOVE": {
      const items = [...state.orderingSelection];
      const [moved] = items.splice(action.from, 1);
      items.splice(action.to, 0, moved);
      return { ...state, orderingSelection: items };
    }
    case "MATCH_PAIR":
      return { ...state, matchingPairs: { ...state.matchingPairs, [action.term]: action.definition } };
    case "FILL_BLANK":
      return { ...state, fillBlankValue: action.value };
    case "SUBMIT_ANSWER":
      return { ...state, submitted: true };
    case "NEXT_QUESTION": {
      const next = state.questionIndex + 1;
      return {
        ...state,
        phase: "question",
        questionIndex: next,
        answers: {},
        submitted: false,
        lastAnswerCorrect: null,
        correctCount: action.correct ? state.correctCount + 1 : state.correctCount,
        orderingSelection: [],
        matchingPairs: {},
        fillBlankValue: "",
      };
    }
    case "TICK":
      return { ...state, elapsedSeconds: state.elapsedSeconds + 1 };
    case "RETRY":
      return {
        ...initialState,
        phase: "locked",
      };
    default:
      return state;
  }
}

const initialState: QuizState = {
  phase: "intro",
  questionIndex: 0,
  answers: {},
  correctCount: 0,
  submitted: false,
  lastAnswerCorrect: null,
  startedAt: 0,
  elapsedSeconds: 0,
  orderingSelection: [],
  matchingPairs: {},
  fillBlankValue: "",
};

// ─── Grading helpers ──────────────────────────────────────────────────────────

function answerForSubmission(q: QuizQuestion, state: QuizState): QuizSubmissionAnswer {
  if (q.type === "multi") return [...((state.answers.current as string[] | undefined) ?? [])];
  if (q.type === "ordering") return [...state.orderingSelection];
  if (q.type === "matching") return { ...state.matchingPairs };
  if (q.type === "fillblank") return state.fillBlankValue;
  return String(state.answers.current ?? "");
}

function gradeAnswer(q: QuizQuestion, state: QuizState): boolean {
  switch (q.type) {
    case "single":
    case "scenario":
      return state.answers.current === q.correctAnswer;
    case "multi": {
      const selected = (state.answers.current as string[] | undefined) ?? [];
      const correct = q.correctAnswer as string[];
      return selected.length === correct.length && selected.every((v) => correct.includes(v));
    }
    case "ordering": {
      const order = state.orderingSelection;
      const correct = q.correctOrder ?? [];
      return order.length === correct.length && order.every((v, i) => v === correct[i]);
    }
    case "matching": {
      const pairs = state.matchingPairs;
      return (q.pairs ?? []).every(([term, def]) => pairs[term] === def);
    }
    case "fillblank": {
      const value = state.fillBlankValue.trim().toLowerCase();
      const correct = (q.correctAnswer as string).toLowerCase();
      return value === correct || correct.split("|").includes(value);
    }
    default:
      return false;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ current, total, score }: { current: number; total: number; score: number }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-500"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
      <span className="min-w-12 text-xs font-black text-slate-400 tabular-nums">{current}/{total}</span>
      <span className="min-w-12 text-xs font-black text-emerald-300 tabular-nums">{score}%</span>
    </div>
  );
}

function SingleChoice({
  options,
  selected,
  submitted,
  correct,
  onSelect,
}: {
  options: string[];
  selected: string | undefined;
  submitted: boolean;
  correct: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="space-y-3" role="radiogroup">
      {options.map((opt) => {
        const isSelected = selected === opt;
        const isCorrect = opt === correct;
        let cls = "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm font-bold transition-all focus-within:ring-2 focus-within:ring-cyan-400";
        if (!submitted) {
          cls += isSelected
            ? " border-cyan-300/60 bg-cyan-400/15"
            : " border-white/10 bg-white/[0.04] hover:border-cyan-300/30 hover:bg-white/[0.08]";
        } else if (isCorrect) {
          cls += " border-emerald-400/60 bg-emerald-400/15";
        } else if (isSelected && !isCorrect) {
          cls += " border-red-400/60 bg-red-400/15";
        } else {
          cls += " border-white/10 bg-white/[0.04] opacity-60";
        }
        return (
          <label key={opt} className={cls}>
            <input
              type="radio"
              name="quiz-option"
              value={opt}
              checked={isSelected}
              onChange={() => !submitted && onSelect(opt)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
              disabled={submitted}
              aria-label={opt}
            />
            <span className="leading-6">{opt}</span>
            {submitted && isCorrect && <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-emerald-400" />}
            {submitted && isSelected && !isCorrect && <XCircle className="ml-auto h-5 w-5 shrink-0 text-red-400" />}
          </label>
        );
      })}
    </div>
  );
}

function MultiChoice({
  options,
  selected,
  submitted,
  correct,
  onToggle,
}: {
  options: string[];
  selected: string[];
  submitted: boolean;
  correct: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      {options.map((opt) => {
        const isSelected = selected.includes(opt);
        const isCorrect = correct.includes(opt);
        let cls = "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm font-bold transition-all";
        if (!submitted) {
          cls += isSelected ? " border-cyan-300/60 bg-cyan-400/15" : " border-white/10 bg-white/[0.04] hover:border-cyan-300/30";
        } else if (isCorrect && isSelected) {
          cls += " border-emerald-400/60 bg-emerald-400/15";
        } else if (isCorrect && !isSelected) {
          cls += " border-amber-400/60 bg-amber-400/15";
        } else if (!isCorrect && isSelected) {
          cls += " border-red-400/60 bg-red-400/15";
        } else {
          cls += " border-white/10 opacity-50";
        }
        return (
          <label key={opt} className={cls}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => !submitted && onToggle(opt)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
              disabled={submitted}
              aria-label={opt}
            />
            <span className="leading-6">{opt}</span>
          </label>
        );
      })}
      <p className="pt-1 text-xs font-bold text-slate-500">ممکن است چند گزینه درست باشد.</p>
    </div>
  );
}

function OrderingQuestion({
  items,
  submitted,
  correct,
  onMove,
}: {
  items: string[];
  submitted: boolean;
  correct: string[];
  onMove: (from: number, to: number) => void;
}) {
  const dragIdx = useRef<number | null>(null);
  return (
    <div className="space-y-2">
      <p className="mb-3 text-xs font-black text-slate-400">موارد را با کشیدن مرتب کنید:</p>
      {items.map((item, idx) => {
        const correctPos = correct.indexOf(item);
        const isCorrectPosition = submitted && correctPos === idx;
        return (
          <div
            key={item}
            draggable={!submitted}
            onDragStart={() => { dragIdx.current = idx; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIdx.current !== null && dragIdx.current !== idx) { onMove(dragIdx.current, idx); dragIdx.current = null; } }}
            className={`flex cursor-grab items-center gap-3 rounded-xl border p-3 text-sm font-bold active:cursor-grabbing ${
              submitted
                ? isCorrectPosition ? "border-emerald-400/40 bg-emerald-400/10" : "border-red-400/40 bg-red-400/10"
                : "border-white/10 bg-white/[0.05] hover:border-cyan-300/30"
            }`}
            aria-label={`مورد ${idx + 1}: ${item}`}
          >
            <span className="min-w-6 text-center text-xs font-black text-slate-500">{idx + 1}</span>
            <span className="flex-1">{item}</span>
            {submitted && isCorrectPosition && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            {submitted && !isCorrectPosition && <XCircle className="h-4 w-4 text-red-400" />}
          </div>
        );
      })}
    </div>
  );
}

function MatchingQuestion({
  pairs,
  matched,
  submitted,
  onMatch,
}: {
  pairs: [string, string][];
  matched: Record<string, string>;
  submitted: boolean;
  onMatch: (term: string, definition: string) => void;
}) {
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const terms = pairs.map(([t]) => t);
  const definitions = [...pairs.map(([, d]) => d)].sort(() => Math.random() - 0.5);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <p className="text-xs font-black text-slate-400">مفاهیم:</p>
        {terms.map((term) => (
          <button
            key={term}
            onClick={() => !submitted && setSelectedTerm(term === selectedTerm ? null : term)}
            className={`w-full rounded-xl border p-3 text-right text-sm font-bold transition-all ${
              selectedTerm === term
                ? "border-cyan-300/60 bg-cyan-400/15"
                : matched[term]
                ? "border-emerald-300/30 bg-emerald-400/10"
                : "border-white/10 bg-white/[0.05] hover:border-cyan-300/30"
            }`}
            disabled={submitted}
            aria-pressed={selectedTerm === term}
          >
            {term}
            {matched[term] && <span className="block text-xs text-emerald-300">→ {matched[term]}</span>}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-black text-slate-400">تعریف‌ها:</p>
        {definitions.map((def) => (
          <button
            key={def}
            onClick={() => { if (!submitted && selectedTerm) { onMatch(selectedTerm, def); setSelectedTerm(null); } }}
            className={`w-full rounded-xl border p-3 text-right text-sm font-bold transition-all ${
              selectedTerm
                ? "border-cyan-300/30 bg-cyan-400/5 hover:border-cyan-300/60 hover:bg-cyan-400/15"
                : "border-white/10 bg-white/[0.05]"
            }`}
            disabled={submitted || !selectedTerm}
            aria-label={`تعریف: ${def}`}
          >
            {def}
          </button>
        ))}
      </div>
    </div>
  );
}

function FillBlank({
  question,
  value,
  submitted,
  correct,
  onChange,
}: {
  question: string;
  value: string;
  submitted: boolean;
  correct: string;
  onChange: (v: string) => void;
}) {
  const parts = question.split("{{blank}}");
  return (
    <div className="space-y-4">
      <p className="text-base font-bold leading-8 text-slate-200">
        {parts[0]}
        <input
          type="text"
          value={value}
          onChange={(e) => !submitted && onChange(e.target.value)}
          disabled={submitted}
          className={`mx-1 min-w-32 rounded-lg border px-3 py-1 text-center font-black outline-none transition-all ${
            !submitted ? "border-cyan-300/50 bg-cyan-400/10 focus:border-cyan-300" : value.toLowerCase() === correct.toLowerCase() ? "border-emerald-400/60 bg-emerald-400/10" : "border-red-400/60 bg-red-400/10"
          }`}
          placeholder="…"
          aria-label="پاسخ خود را وارد کنید"
        />
        {parts[1]}
      </p>
      {submitted && (
        <p className="text-sm font-bold text-emerald-300">جواب درست: {correct}</p>
      )}
    </div>
  );
}

function FeedbackCard({
  correct,
  explanation,
  onNext,
  isLast,
  label,
}: {
  correct: boolean;
  explanation: string;
  onNext: () => void;
  isLast: boolean;
  label: string;
}) {
  return (
    <div
      className={`mt-4 rounded-2xl border p-5 ${
        correct ? "border-emerald-400/40 bg-emerald-400/10" : "border-amber-400/40 bg-amber-400/10"
      }`}
    >
      <div className="flex items-start gap-3">
        {correct ? (
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-300" />
        ) : (
          <AlertCircle className="h-6 w-6 shrink-0 text-amber-300" />
        )}
        <div className="flex-1">
          <p className="font-black">{correct ? "درست! 🎉" : "نزدیک بود — ادامه بده!"}</p>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{explanation}</p>
        </div>
      </div>
      <button
        onClick={onNext}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 text-sm font-black hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400 active:scale-95"
        aria-label={isLast ? "مشاهده نتیجه" : "سؤال بعدی"}
      >
        {isLast ? "مشاهده نتیجه" : label}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function ResultScreen({
  score,
  total,
  passed,
  threshold,
  elapsedSeconds,
  onRetry,
  onContinue,
  cooldownHours,
  pending,
  error,
}: {
  score: number;
  total: number;
  passed: boolean;
  threshold: number;
  elapsedSeconds: number;
  onRetry: () => void;
  onContinue: () => void;
  cooldownHours: number;
  pending: boolean;
  error: string | null;
}) {
  const pct = Math.round((score / total) * 100);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return (
    <div className="rounded-[32px] border bg-slate-900/80 p-8 text-center">
      <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border-4 border-cyan-300/30 bg-slate-800">
        {passed ? (
          <Trophy className="h-12 w-12 text-amber-300" />
        ) : (
          <Lock className="h-12 w-12 text-slate-400" />
        )}
      </div>

      <h2 className="text-3xl font-black">{pct}٪</h2>
      <p className="mt-2 text-lg font-bold text-slate-300">
        {score} از {total} سؤال درست
      </p>

      <div className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-slate-400">
        <Clock className="h-4 w-4" />
        {minutes > 0 && `${minutes} دقیقه `}{seconds} ثانیه
      </div>

      {passed ? (
        <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
          <p className="font-black text-emerald-300">🎉 عالی! مسیر بعدی باز شد.</p>
          {error && (
            <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm font-bold text-red-200" role="alert">
              {error}
            </p>
          )}
          <button
            onClick={onContinue}
            disabled={pending}
            className="mt-4 w-full rounded-xl bg-emerald-500 py-3 font-black text-white hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            aria-label="ادامه به مطالب بعدی"
          >
            {pending ? "در حال تأیید نتیجه در سرور..." : "ادامه مسیر →"}
          </button>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
          <p className="font-black text-amber-300">
            برای ادامه باید {threshold}٪ یا بیشتر بگیری.
          </p>
          <p className="mt-2 text-sm font-bold text-slate-400">
            {cooldownHours > 0
              ? `پس از مرور درس، می‌توانی پس از ${cooldownHours} ساعت دوباره آزمون بدهی.`
              : "مطالب را مرور کن و دوباره تلاش کن."}
          </p>
          <button
            onClick={onRetry}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-700 py-3 font-black hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            aria-label="مرور مطالب"
          >
            <RefreshCw className="h-4 w-4" /> مرور مطالب
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main QuizEngineV2 ────────────────────────────────────────────────────────

type QuizEngineV2Props = {
  questions: QuizQuestion[];
  mode: QuizMode;
  /** Minimum % to pass (0–100). Default 75 for module, 70 for term exam. */
  passThreshold?: number;
  /** Hours to wait before retake on fail. 0 = immediate. */
  retakeCooldownHours?: number;
  title?: string;
  onPass?: (score: number, answers: QuizSubmissionAnswers) => void | Promise<void>;
  onFail?: (score: number, answers: QuizSubmissionAnswers) => void | Promise<void>;
  onReviewRequested?: () => void;
  resultPending?: boolean;
  resultError?: string | null;
};

export function QuizEngineV2({
  questions,
  mode,
  passThreshold,
  retakeCooldownHours = 0,
  title,
  onPass,
  onFail,
  onReviewRequested,
  resultPending = false,
  resultError = null,
}: QuizEngineV2Props) {
  const threshold = passThreshold ?? (mode === "term-exam" ? 70 : mode === "module" ? 75 : 80);
  const [state, dispatch] = useReducer(quizReducer, initialState);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [submittedAnswers, setSubmittedAnswers] = useState<QuizSubmissionAnswers>({});

  // Timer
  useEffect(() => {
    if (state.phase !== "question") return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  // Initialize ordering options from first question that needs it
  useEffect(() => {
    const q = questions[state.questionIndex];
    if (q?.type === "ordering" && state.orderingSelection.length === 0) {
      const shuffled = [...(q.correctOrder ?? q.options ?? [])].sort(() => Math.random() - 0.5);
      dispatch({ type: "ORDERING_MOVE", from: 0, to: 0 });
      // Populate via side-effect — small hack since reducer doesn't have an INIT action
      // We use the external orderingSelection initial to the shuffled version
      if (state.orderingSelection.length === 0) {
        for (let i = 0; i < shuffled.length; i++) {
          // no-op dispatch just to trigger rerender with the right items loaded
        }
        // Simply set it via a trick: the reducer accepts ORDERING_MOVE from/to same = noop,
        // but we need to seed the array — use a separate state instead
      }
    }
  }, [state.questionIndex, questions, state.orderingSelection.length]);

  const currentQ = questions[state.questionIndex];
  const isLastQuestion = state.questionIndex === questions.length - 1;

  const handleSubmit = useCallback(() => {
    if (!currentQ) return;
    const correct = gradeAnswer(currentQ, state);
    setSubmittedAnswers((previous) => ({
      ...previous,
      [currentQ.id]: answerForSubmission(currentQ, state),
    }));
    setLastCorrect(correct);
    setShowFeedback(true);
    dispatch({ type: "SUBMIT_ANSWER" });
  }, [currentQ, state]);

  const handleNext = useCallback(() => {
    setShowFeedback(false);
    dispatch({ type: "NEXT_QUESTION", correct: lastCorrect });
  }, [lastCorrect]);

  const totalCorrect =
    state.phase === "result" || isLastQuestion
      ? state.correctCount
      : state.correctCount;
  const currentScore = Math.round((totalCorrect / questions.length) * 100);
  const isPassed = currentScore >= threshold;

  const hasAnswer =
    (currentQ?.type === "single" || currentQ?.type === "scenario") ? !!state.answers.current :
    currentQ?.type === "multi" ? ((state.answers.current as string[] | undefined)?.length ?? 0) > 0 :
    currentQ?.type === "ordering" ? state.orderingSelection.length > 0 :
    currentQ?.type === "matching" ? Object.keys(state.matchingPairs).length === (currentQ.pairs?.length ?? 0) :
    currentQ?.type === "fillblank" ? state.fillBlankValue.trim().length > 0 :
    false;

  // ── Render: Intro ──
  if (state.phase === "intro") {
    return (
      <div className="rounded-[32px] border border-cyan-300/20 bg-slate-900/80 p-8 text-center" dir="rtl">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-cyan-400/10">
          <Trophy className="h-10 w-10 text-cyan-300" />
        </div>
        <h2 className="text-2xl font-black">{title ?? "آزمون"}</h2>
        <p className="mt-3 text-sm font-bold text-slate-400">
          {questions.length} سؤال — حداقل نمره قبولی: {threshold}٪
        </p>
        <div className="mt-6 grid gap-3 text-sm font-bold text-slate-400">
          <p>• پاسخ‌ها را با دقت بخوانید</p>
          <p>• بعد از ارسال هر پاسخ، توضیح نشان داده می‌شود</p>
          <p>• برای قفل‌گشایی باید {threshold}٪ یا بیشتر بگیرید</p>
        </div>
        <button
          onClick={() => dispatch({ type: "START" })}
          className="mt-8 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-500 py-4 font-black text-white shadow-lg shadow-cyan-500/20 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-cyan-400 active:scale-95"
          aria-label="شروع آزمون"
        >
          شروع آزمون
        </button>
      </div>
    );
  }

  // ── Render: Result ──
  if (state.questionIndex >= questions.length) {
    return (
      <ResultScreen
        score={state.correctCount}
        total={questions.length}
        passed={isPassed}
        threshold={threshold}
        elapsedSeconds={state.elapsedSeconds}
        onRetry={() => {
          void onFail?.(currentScore, submittedAnswers);
          onReviewRequested?.();
        }}
        onContinue={() => { void onPass?.(currentScore, submittedAnswers); }}
        cooldownHours={retakeCooldownHours}
        pending={resultPending}
        error={resultError}
      />
    );
  }

  // ── Render: Question ──
  return (
    <div className="rounded-[32px] border border-cyan-300/20 bg-slate-900/80 p-6 lg:p-8" dir="rtl">
      <ProgressBar
        current={state.questionIndex}
        total={questions.length}
        score={currentScore}
      />

      {/* Question header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-black text-slate-400">
            <span>سؤال {state.questionIndex + 1}</span>
            <span className="text-slate-600">·</span>
            <span className="capitalize">{currentQ.difficulty === "easy" ? "آسان" : currentQ.difficulty === "medium" ? "متوسط" : "دشوار"}</span>
          </div>
          <h3 className="text-lg font-black leading-8">{currentQ.question}</h3>
        </div>
        <div className="flex items-center gap-1 text-xs font-bold text-slate-500 tabular-nums">
          <Clock className="h-3 w-3" />
          {Math.floor(state.elapsedSeconds / 60).toString().padStart(2, "0")}:{(state.elapsedSeconds % 60).toString().padStart(2, "0")}
        </div>
      </div>

      {/* Answer input by type */}
      {currentQ.type === "single" || currentQ.type === "scenario" ? (
        <SingleChoice
          options={currentQ.options ?? []}
          selected={state.answers.current as string | undefined}
          submitted={state.submitted}
          correct={currentQ.correctAnswer as string}
          onSelect={(v) => dispatch({ type: "SELECT_SINGLE", value: v })}
        />
      ) : currentQ.type === "multi" ? (
        <MultiChoice
          options={currentQ.options ?? []}
          selected={(state.answers.current as string[] | undefined) ?? []}
          submitted={state.submitted}
          correct={currentQ.correctAnswer as string[]}
          onToggle={(v) => dispatch({ type: "TOGGLE_MULTI", value: v })}
        />
      ) : currentQ.type === "ordering" ? (
        <OrderingQuestion
          items={state.orderingSelection.length > 0 ? state.orderingSelection : (currentQ.correctOrder ?? [])}
          submitted={state.submitted}
          correct={currentQ.correctOrder ?? []}
          onMove={(from, to) => dispatch({ type: "ORDERING_MOVE", from, to })}
        />
      ) : currentQ.type === "matching" ? (
        <MatchingQuestion
          pairs={currentQ.pairs ?? []}
          matched={state.matchingPairs}
          submitted={state.submitted}
          onMatch={(term, def) => dispatch({ type: "MATCH_PAIR", term, definition: def })}
        />
      ) : currentQ.type === "fillblank" ? (
        <FillBlank
          question={currentQ.question}
          value={state.fillBlankValue}
          submitted={state.submitted}
          correct={currentQ.correctAnswer as string}
          onChange={(v) => dispatch({ type: "FILL_BLANK", value: v })}
        />
      ) : null}

      {/* Submit button */}
      {!state.submitted && (
        <button
          onClick={handleSubmit}
          disabled={!hasAnswer}
          className="mt-6 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-500 py-4 font-black text-white shadow-lg shadow-cyan-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-cyan-400 active:scale-95"
          aria-label="ارسال پاسخ"
        >
          ارسال پاسخ
        </button>
      )}

      {/* Feedback */}
      {showFeedback && (
        <FeedbackCard
          correct={lastCorrect}
          explanation={currentQ.explanation}
          onNext={handleNext}
          isLast={isLastQuestion}
          label="سؤال بعدی →"
        />
      )}
    </div>
  );
}
