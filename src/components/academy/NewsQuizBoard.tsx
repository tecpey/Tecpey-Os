"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toSafeNewsQuizBank, type SafeNewsQuizQuestion } from "@/lib/academy-news-quiz-view";

type Locale = "fa" | "en";

type SafeQuestion = SafeNewsQuizQuestion;

const COPY: Record<Locale, {
  eyebrow: string;
  title: string;
  intro: string;
  loading: string;
  empty: string;
  retry: string;
  scoreLabel: (correct: number, total: number) => string;
  difficulty: Record<SafeQuestion["difficulty"], string>;
  correct: string;
  incorrect: string;
  why: string;
  answered: string;
  riskNote: string;
  mentorCta: string;
  mentorHref: string;
  newsHref: string;
  newsCta: string;
}> = {
  fa: {
    eyebrow: "کوییز هوشمند خبری",
    title: "خبرِ امروزِ بازار را به یک تمرینِ ریسک‌محور تبدیل کن",
    intro:
      "هر سؤال از خبرهای واقعیِ امروز ساخته شده و پاسخِ درست همیشه مسئولانه‌ترین گام است، نه دنبال‌کردنِ هیجان. وعده‌ی سود و پیش‌بینیِ قیمت به‌صورت خودکار حذف می‌شود.",
    loading: "در حال ساختِ کوییز از خبرهای امروز…",
    empty: "فعلاً کوییزی از خبرها ساخته نشد. کمی بعد دوباره امتحان کن.",
    retry: "تلاش دوباره",
    scoreLabel: (correct, total) => `امتیاز شما: ${correct} از ${total}`,
    difficulty: { easy: "آسان", medium: "متوسط", hard: "دشوار" },
    correct: "درست",
    incorrect: "نادرست",
    why: "چرا؟",
    answered: "پاسخ ثبت شد",
    riskNote: "خبر، زمینه است نه دستورِ معامله؛ قبل از هر اقدام، ریسک و امنیت را بسنج.",
    mentorCta: "این خبر را از مربی هوشمند بپرس",
    mentorHref: "/academy/ai-guide",
    newsHref: "/crypto-news",
    newsCta: "مشاهده مرکز خبر",
  },
  en: {
    eyebrow: "Smart news quiz",
    title: "Turn today’s market news into a risk-first exercise",
    intro:
      "Every question is built from today’s real headlines, and the correct answer is always the most responsible next step — never chasing hype. Profit promises and price predictions are filtered out automatically.",
    loading: "Building a quiz from today’s news…",
    empty: "No quiz could be built from the news yet. Try again in a moment.",
    retry: "Try again",
    scoreLabel: (correct, total) => `Your score: ${correct} of ${total}`,
    difficulty: { easy: "Easy", medium: "Medium", hard: "Hard" },
    correct: "Correct",
    incorrect: "Not quite",
    why: "Why?",
    answered: "Answer recorded",
    riskNote: "News is context, not a trade instruction — weigh risk and security before acting.",
    mentorCta: "Ask the AI Mentor about this news",
    mentorHref: "/en/academy/ai-guide",
    newsHref: "/en/crypto-news",
    newsCta: "Open the News Center",
  },
};

function QuestionCard({
  question,
  index,
  locale,
  onGraded,
}: {
  question: SafeQuestion;
  index: number;
  locale: Locale;
  onGraded: (id: string, correct: boolean) => void;
}) {
  const copy = COPY[locale];
  const isFa = locale === "fa";
  const [picked, setPicked] = useState<string | null>(null);
  const answered = picked !== null;
  const isCorrect = answered && picked === question.correctAnswer;

  const choose = useCallback(
    (option: string) => {
      if (picked !== null) return; // lock after the first answer
      setPicked(option);
      onGraded(question.id, option === question.correctAnswer);
    },
    [onGraded, picked, question.correctAnswer, question.id],
  );

  return (
    <div className="rounded-[28px] border border-cyan-300/15 bg-white/80 p-5 shadow-xl shadow-cyan-500/5 dark:bg-slate-950/45 lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-black text-cyan-700 dark:text-cyan-100">
          <Newspaper className="h-3.5 w-3.5" />
          {isFa ? `پرسش ${index + 1}` : `Question ${index + 1}`}
        </span>
        <span className="rounded-full border border-slate-300/30 bg-slate-500/10 px-3 py-1 text-[11px] font-black text-slate-600 dark:text-slate-300">
          {copy.difficulty[question.difficulty]}
        </span>
      </div>

      <h3 className="mt-4 text-lg font-black leading-8 text-slate-950 dark:text-white">{question.question}</h3>

      <div className="mt-4 grid gap-2">
        {question.options.map((option) => {
          const isChosen = picked === option;
          const isAnswer = option === question.correctAnswer;
          // Before answering: neutral. After: highlight the correct option, and
          // mark the learner's wrong pick. Only the exact correctAnswer string
          // is treated as right — the same membership check the graders enforce.
          const state = !answered
            ? "idle"
            : isAnswer
              ? "answer"
              : isChosen
                ? "wrong"
                : "muted";
          const classes = {
            idle: "border-cyan-300/20 bg-cyan-500/[0.04] text-slate-700 hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-cyan-500/10 dark:text-slate-200",
            answer: "border-emerald-300/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
            wrong: "border-rose-300/40 bg-rose-500/15 text-rose-800 dark:text-rose-200",
            muted: "border-slate-300/20 bg-slate-500/5 text-slate-500 dark:text-slate-400",
          }[state];
          return (
            <button
              key={option}
              type="button"
              onClick={() => choose(option)}
              disabled={answered}
              aria-pressed={isChosen}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-start text-sm font-bold leading-7 transition ${classes} ${answered ? "cursor-default" : "cursor-pointer"}`}
            >
              <span>{option}</span>
              {answered && isAnswer && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />}
              {answered && isChosen && !isAnswer && <XCircle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-300" />}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="mt-4 space-y-3">
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${isCorrect ? "border border-emerald-300/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border border-rose-300/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}
          >
            {isCorrect ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {isCorrect ? copy.correct : copy.incorrect}
          </div>
          {question.explanation && (
            <p className="rounded-2xl border border-cyan-300/15 bg-cyan-500/5 p-3 text-sm font-bold leading-7 text-slate-700 dark:text-slate-200">
              <span className="font-black text-cyan-700 dark:text-cyan-200">{copy.why} </span>
              {question.explanation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function NewsQuizBoard({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const isFa = locale === "fa";
  // SSR-safe deterministic initial state: no network, no live Date, so the
  // server render and first client render match (avoids a React #418 hydration
  // mismatch). The effect fills the real quiz client-side.
  const [questions, setQuestions] = useState<SafeQuestion[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">("loading");
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // No synchronous setState here: the effect only writes terminal state from
    // its async callbacks. The initial "loading" state covers the first render
    // (and a locale switch remounts this component, since fa/en are separate
    // routes); the retry button resets state in its own handler before bumping
    // reloadKey. This keeps the effect free of cascading synchronous renders.
    let active = true;
    fetch(`/api/crypto-news?locale=${locale}&quiz=1`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("news-quiz failed"))))
      .then((data: { newsQuiz?: unknown }) => {
        if (!active) return;
        const safe = toSafeNewsQuizBank(data.newsQuiz);
        setQuestions(safe);
        setStatus(safe.length > 0 ? "ready" : "empty");
      })
      .catch(() => {
        if (!active) return;
        setQuestions([]);
        setStatus("empty");
      });
    return () => {
      active = false;
    };
  }, [locale, reloadKey]);

  const onGraded = useCallback((id: string, correct: boolean) => {
    setResults((prev) => (id in prev ? prev : { ...prev, [id]: correct }));
  }, []);

  const { answered, correct } = useMemo(() => {
    const values = Object.values(results);
    return { answered: values.length, correct: values.filter(Boolean).length };
  }, [results]);

  return (
    <section className="bg-[color:var(--tp-bg)] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-[36px] border border-cyan-300/20 bg-white/80 p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl dark:bg-white/[0.055] lg:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-4 py-2 text-xs font-black text-cyan-700 dark:text-cyan-100">
          <Sparkles className="h-4 w-4" />
          {copy.eyebrow}
        </div>
        <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-4xl">{copy.title}</h2>
        <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-600 dark:text-slate-300 sm:text-base">{copy.intro}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            {copy.riskNote}
          </span>
          {answered > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-black text-cyan-700 dark:text-cyan-100">
              {copy.scoreLabel(correct, answered)}
            </span>
          )}
        </div>

        {status === "loading" && (
          <div className="mt-8 flex items-center gap-3 rounded-[28px] border border-cyan-300/15 bg-cyan-500/5 p-6 text-sm font-black text-cyan-700 dark:text-cyan-100">
            <RefreshCw className="h-5 w-5 animate-spin" />
            {copy.loading}
          </div>
        )}

        {status === "empty" && (
          <div className="mt-8 flex flex-col items-start gap-4 rounded-[28px] border border-cyan-300/15 bg-cyan-500/5 p-6">
            <p className="text-sm font-black text-slate-700 dark:text-slate-200">{copy.empty}</p>
            <button
              type="button"
              onClick={() => {
                setStatus("loading");
                setResults({});
                setReloadKey((key) => key + 1);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-cyan-700 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-800 dark:bg-cyan-500 dark:hover:bg-cyan-400"
            >
              <RefreshCw className="h-4 w-4" />
              {copy.retry}
            </button>
          </div>
        )}

        {status === "ready" && (
          <div className="mt-8 grid gap-4">
            {questions.map((question, index) => (
              <QuestionCard key={question.id} question={question} index={index} locale={locale} onGraded={onGraded} />
            ))}
          </div>
        )}

        <div className="mt-7 flex flex-col items-center justify-between gap-4 rounded-[28px] border border-cyan-300/20 bg-cyan-500/10 p-5 md:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500 text-white">
              <Brain className="h-7 w-7" />
            </div>
            <p className="text-sm font-black leading-7 text-slate-800 dark:text-cyan-50">{copy.mentorCta}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Link
              href={copy.mentorHref}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-800 dark:bg-cyan-500 dark:hover:bg-cyan-400"
            >
              {copy.mentorCta}
              {isFa ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Link>
            <Link
              href={copy.newsHref}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-white/10 px-5 py-3 text-sm font-black text-cyan-700 transition hover:bg-cyan-500/10 dark:text-cyan-100"
            >
              {copy.newsCta}
              {isFa ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
