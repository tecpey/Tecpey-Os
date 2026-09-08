"use client";

import { Brain, CheckCircle2, Clock3, RefreshCw, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Locale = "fa" | "en";
type Question = {
  id: string;
  term_number: number;
  lesson_slug: string;
  topic: string;
  cognitive_skill: string;
  difficulty: number;
  question: string;
  options: Record<string, string>;
};

const optionKeys = ["A", "B", "C", "D"];

export function MentorChallengeBox({ locale = "fa", termNumber = 1, lessonSlug = "safe-entry", topic = "risk-awareness" }: { locale?: Locale; termNumber?: number; lessonSlug?: string; topic?: string }) {
  const isFa = locale === "fa";
  const [question, setQuestion] = useState<Question | null>(null);
  const [selected, setSelected] = useState("");
  const [confidence, setConfidence] = useState("medium");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("loading");
  const [result, setResult] = useState<{ isCorrect?: boolean; attemptNumber?: number; explanation?: string | null } | null>(null);
  const [degraded, setDegraded] = useState(false);
  const startTime = useRef(0);

  const load = () => {
    setStatus("loading");
    setDegraded(false);
    setQuestion(null);
    setSelected("");
    setResult(null);
    startTime.current = Date.now();
    fetch(`/api/mentor-challenge?locale=${locale}&termNumber=${termNumber}&lessonSlug=${encodeURIComponent(lessonSlug)}&topic=${encodeURIComponent(topic)}`, { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "mentor_challenge_unavailable");
        const isDegraded = data?.degraded === true;
        setDegraded(isDegraded);
        // The API's emergency fallback is intentionally informational only. It
        // does not exist in the governed bank, so rendering it as answerable
        // would guarantee a question_not_found on submit.
        setQuestion(isDegraded ? null : data?.question || null);
        setStatus(isDegraded ? "error" : "idle");
      })
      .catch(() => {
        setQuestion(null);
        setDegraded(true);
        setStatus("error");
      });
  };

  useEffect(() => {
    void Promise.resolve().then(load);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- #162: the persisted challenge snapshot is intentionally hydrated once on mount.
  }, [locale, termNumber, lessonSlug, topic]);

  const entries = useMemo(() => optionKeys.map((key) => [key, question?.options?.[key]] as const).filter(([, value]) => Boolean(value)), [question]);

  const submit = () => {
    if (!question || !selected || degraded) return;
    setStatus("loading");
    fetch("/api/mentor-challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ questionId: question.id, selectedOption: selected, responseTimeMs: Date.now() - startTime.current, confidence, locale }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.result) throw new Error(data?.error || "mentor_challenge_submit_failed");
        setResult(data.result);
        setStatus("sent");
      })
      .catch(() => setStatus("error"));
  };

  return (
    <section className="mt-10 rounded-[30px] border border-violet-300/25 bg-violet-500/10 p-5 md:p-6" dir={isFa ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-white/80 px-3 py-1 text-xs font-black text-violet-700 dark:bg-white/10 dark:text-violet-100">
            <Brain className="h-4 w-4" /> {isFa ? "چالش اختصاصی منتور" : "Personal mentor challenge"}
          </p>
          <h3 className="mt-3 text-xl font-black text-slate-950 dark:text-white">
            {isFa ? "یک سوال چالشی متناسب با سطح تو" : "A challenge matched to your level"}
          </h3>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">
            {isFa ? "پاسخ درست فوراً لو نمی‌رود؛ هر انتخاب برای تحلیل رفتار یادگیری تو ثبت می‌شود." : "The correct answer is not revealed instantly; every choice improves your learning profile."}
          </p>
          {degraded && (
            <div role="status" className="mt-3 rounded-2xl border border-amber-300/40 bg-amber-400/15 px-4 py-3 text-xs font-black leading-6 text-amber-900 dark:text-amber-100">
              <p>
                {isFa
                  ? "بانک سؤال در حال بازیابی است. برای اینکه پاسخ غیرقابل‌ثبت یا ساختگی به پرونده آموزشی تو اضافه نشود، چالش موقت نمایش داده نمی‌شود."
                  : "The governed question bank is recovering. A temporary, non-recordable challenge is not shown as if it were official."}
              </p>
              <button type="button" onClick={load} disabled={status === "loading"} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-current px-3 py-2 text-xs font-black disabled:cursor-wait disabled:opacity-60">
                <RefreshCw className={`h-3.5 w-3.5 ${status === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />
                {isFa ? "تلاش دوباره" : "Try again"}
              </button>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/80 px-4 py-3 text-xs font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">
          {isFa ? "سطح سختی" : "Difficulty"}: {question?.difficulty || "—"}/5
        </div>
      </div>

      {status === "loading" && !question && !degraded && <div className="mt-5 rounded-2xl bg-white/70 p-4 text-sm font-bold text-slate-700 dark:bg-white/10 dark:text-slate-200">{isFa ? "در حال آماده‌سازی چالش..." : "Preparing challenge..."}</div>}
      {question && (
        <div className="mt-5 rounded-3xl border border-white/15 bg-white/90 p-5 shadow-sm dark:bg-slate-950/40">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-1 h-5 w-5 shrink-0 text-violet-500" />
            <p className="text-base font-black leading-8 text-slate-950 dark:text-white">{question.question}</p>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {entries.map(([key, value]) => (
              <button
                key={key}
                type="button"
                disabled={status === "sent" || status === "loading"}
                onClick={() => setSelected(key)}
                className={`rounded-2xl border p-4 text-start text-sm font-black leading-7 transition disabled:cursor-not-allowed ${selected === key ? "border-violet-400 bg-violet-500/15 text-violet-800 dark:text-violet-100" : "border-slate-200 bg-white text-slate-800 hover:border-violet-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"}`}
              >
                <span className="me-2 inline-grid h-7 w-7 place-items-center rounded-xl bg-slate-950 text-xs text-white dark:bg-white dark:text-slate-950">{key}</span>
                {value}
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className="text-xs font-black text-slate-600 dark:text-slate-300">{isFa ? "اعتماد به پاسخ" : "Confidence"}</label>
            {[
              ["low", isFa ? "کم" : "Low"],
              ["medium", isFa ? "متوسط" : "Medium"],
              ["high", isFa ? "زیاد" : "High"],
            ].map(([value, label]) => (
              <button key={value} type="button" disabled={status === "loading" || status === "sent"} onClick={() => setConfidence(value)} className={`rounded-xl px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-60 ${confidence === value ? "bg-violet-500 text-white" : "border border-slate-200 text-slate-700 dark:border-white/10 dark:text-slate-300"}`}>{label}</button>
            ))}
            <button type="button" disabled={!selected || status === "loading" || status === "sent"} onClick={submit} className="ms-auto inline-flex items-center gap-2 rounded-2xl bg-violet-500 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" /> {status === "loading" && selected ? (isFa ? "در حال ثبت..." : "Saving...") : (isFa ? "ثبت پاسخ" : "Submit")}
            </button>
          </div>
          {status === "error" && !degraded && (
            <div role="alert" className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-xs font-black leading-6 text-amber-800 dark:text-amber-100">
              {isFa ? "ثبت پاسخ کامل نشد. انتخابت حفظ شده؛ دوباره «ثبت پاسخ» را بزن." : "Your answer was not saved. Your selection is preserved; submit it again."}
            </div>
          )}
          {result && (
            <div className={`mt-5 rounded-2xl border p-4 text-sm font-black leading-7 ${result.isCorrect ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-800 dark:text-emerald-100" : "border-amber-300/30 bg-amber-400/10 text-amber-800 dark:text-amber-100"}`}>
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {result.isCorrect ? (isFa ? "پاسخ ثبت شد؛ عملکردت به پروفایل یادگیری اضافه شد." : "Answer saved; your learning profile was updated.") : (isFa ? "پاسخ ثبت شد؛ منتور از این اشتباه برای تحلیل بهتر استفاده می‌کند." : "Answer saved; your mentor uses this mistake for better analysis.")}</div>
              <div className="mt-1 flex items-center gap-2 text-xs"><Clock3 className="h-3.5 w-3.5" /> {isFa ? `تلاش شماره ${result.attemptNumber || 1}` : `Attempt ${result.attemptNumber || 1}`}</div>
              {result.explanation && <p className="mt-2 text-xs font-bold opacity-90">{result.explanation}</p>}
              <button type="button" onClick={load} className="mt-3 rounded-xl border border-current px-3 py-2 text-xs font-black opacity-90">{isFa ? "چالش بعدی" : "Next challenge"}</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
