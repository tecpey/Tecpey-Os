"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, BookOpenCheck, CheckCircle2, Loader2, Send, ShieldAlert, Sparkles, BrainCircuit, Target } from "lucide-react";
import {
  MENTOR_QUICK_QUESTIONS,
  detectMentorMode,
  toLocalReply,
  type MentorMode,
  type MentorReply,
} from "@/lib/academy-ai-mentor-core";

type MentorProgress = { completedTerms: number[]; weakAreas: string[]; lastMode?: MentorMode; confidence: number };

// The mentor's deterministic brain now lives in academy-ai-mentor-core (shared
// with the news-quiz board). This component keeps only the browser-side pieces:
// disposable browser-cache practice hints and the live /api/ai-mentor call,
// with the core's toLocalReply as the fail-closed fallback.
const quickQuestions = MENTOR_QUICK_QUESTIONS.fa;

function readMentorProgress(): MentorProgress {
  if (typeof window === "undefined") return { completedTerms: [], weakAreas: [], confidence: 0 };
  const completedTerms: number[] = [];
  for (let i = 1; i <= 7; i += 1) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(`tecpey-lesson-progress-fa-term-${i}`) || "null");
      const completedCount = parsed?.completed ? Object.keys(parsed.completed).filter((key) => parsed.completed[key]).length : 0;
      const total = i === 7 ? 6 : 7;
      if (completedCount >= total) completedTerms.push(i);
    } catch {}
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem("tecpey-ai-mentor-memory") || "null");
    return {
      completedTerms,
      weakAreas: Array.isArray(stored?.weakAreas) ? stored.weakAreas.slice(0, 5) : [],
      lastMode: stored?.lastMode,
      confidence: Math.min(100, Math.max(0, Number(stored?.confidence || completedTerms.length * 12))),
    };
  } catch {
    return { completedTerms, weakAreas: [], confidence: completedTerms.length * 12 };
  }
}

function updateMentorMemory(mode: MentorMode, question: string) {
  if (typeof window === "undefined") return;
  const labels: Record<MentorMode, string> = {
    concept: "مبانی و مفهوم", security: "امنیت دارایی", risk: "مدیریت ریسک", trading: "تحلیل تکنیکال", project: "تحلیل پروژه", psychology: "روانشناسی بازار",
  };
  const current = readMentorProgress();
  const weakAreas = [labels[mode], ...current.weakAreas.filter((item) => item !== labels[mode])].slice(0, 5);
  const confidence = Math.min(100, current.confidence + (question.length > 20 ? 4 : 2));
  const memoryPayload = { lastMode: mode, weakAreas, confidence, updatedAt: Date.now() };
  window.localStorage.setItem("tecpey-ai-mentor-memory", JSON.stringify(memoryPayload));
  const locale = document.documentElement.lang?.startsWith("en") || location.pathname.startsWith("/en") ? "en" : "fa";
  const historyKey = `tecpey-ai-mentor-history-${locale}`;
  try {
    const previous = JSON.parse(window.localStorage.getItem(historyKey) || "[]");
    const next = [...(Array.isArray(previous) ? previous : []), { question, mode, askedAt: Date.now() }].slice(-12);
    window.localStorage.setItem(historyKey, JSON.stringify(next));
  } catch {
    window.localStorage.setItem(historyKey, JSON.stringify([{ question, mode, askedAt: Date.now() }]));
  }
}

export function AiMentorExperience() {
  const [question, setQuestion] = useState(quickQuestions[0]);
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [reply, setReply] = useState<MentorReply>(() => toLocalReply(quickQuestions[0]));
  const [loading, setLoading] = useState(false);
  const [lastQuestion, setLastQuestion] = useState(quickQuestions[0]);
  const [mentorProgress, setMentorProgress] = useState<MentorProgress>({ completedTerms: [], weakAreas: [], confidence: 0 });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMentorProgress(readMentorProgress());
  }, []);

  const fillQuestion = (text: string) => {
    setQuestion(text);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const ask = async (text = question) => {
    const clean = text.trim();
    if (!clean || loading) return;
    setQuestion(clean);
    setLastQuestion(clean);
    setLoading(true);
    const currentMode = detectMentorMode(clean);
    updateMentorMemory(currentMode, clean);
    const progressSnapshot = readMentorProgress();
    setMentorProgress(progressSnapshot);

    const local = toLocalReply(clean);
    try {
      const response = await fetch("/api/ai-mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: clean, locale: "fa", history: history.slice(-6), progress: progressSnapshot, mentorMode: currentMode }),
      });
      const data = (await response.json()) as MentorReply;
      const nextReply = data?.ok ? data : local;
      setReply(nextReply);
      setHistory((prev) => [...prev.slice(-6), { role: "user", content: clean }, { role: "assistant", content: nextReply.answer }]);
    } catch {
      setReply(local);
      setHistory((prev) => [...prev.slice(-6), { role: "user", content: clean }, { role: "assistant", content: local.answer }]);
    } finally {
      setLoading(false);
    }
  };

  const paragraphs = reply.answer.split("\n").filter(Boolean);
  return (
    <div className="rounded-[34px] border border-cyan-300/20 bg-slate-950 p-5 shadow-[0_30px_100px_rgba(34,211,238,.12)]">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-200"><Bot className="h-6 w-6" /></div>
        <div>
          <h2 className="text-xl font-black text-white">مربی هوشمند آکادمی تک‌پی</h2>
          <p className="text-xs font-bold text-slate-400">اینجا می‌توانی سؤال آموزشی، امنیتی و مدیریت ریسک بپرسی. مربی هوشمند پاسخ را به درس‌های آکادمی، چک‌لیست عملی و قدم بعدی یادگیری وصل می‌کند.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-3xl bg-white/[0.055] p-4">
          <div className="rounded-2xl bg-cyan-500/15 p-4 text-sm font-bold leading-8 text-cyan-50">کاربر: {lastQuestion}</div>
          <div className="mt-4 rounded-2xl bg-white/10 p-4 text-sm font-bold leading-8 text-slate-200">
            <div className="mb-3 flex items-center gap-2 text-cyan-200">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              <strong>{loading ? "در حال آماده‌سازی پاسخ آموزشی..." : "پاسخ مربی آکادمی"}</strong>
            </div>
            {paragraphs.map((p) => <p key={p} className="mt-2 whitespace-pre-line">{p}</p>)}
            {reply.checklist?.length ? (
              <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3">
                <p className="font-black text-emerald-100">چک‌لیست پیشنهادی:</p>
                <ul className="mt-2 space-y-2">
                  {reply.checklist.map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />{item}</li>)}
                </ul>
              </div>
            ) : null}
            {reply.sourceLessons?.length ? (
              <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3">
                <p className="font-black text-cyan-100">منابع مرتبط از آکادمی:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {reply.sourceLessons.slice(0, 3).map((source) => (
                    <Link key={source.href} href={source.href} className="rounded-xl bg-cyan-500/15 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-500/25">{source.title}</Link>
                  ))}
                </div>
              </div>
            ) : null}
            {reply.relatedTerm?.href ? (
              <Link href={reply.relatedTerm.href} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-400"><BookOpenCheck className="h-4 w-4" />مرور ترم مرتبط</Link>
            ) : null}
            {reply.suggestedQuestions?.length ? (
              <div className="mt-4 rounded-2xl border border-violet-300/20 bg-violet-400/10 p-3">
                <p className="font-black text-violet-100">سؤال بعدی پیشنهادی:</p>
                <div className="mt-2 grid gap-2">
                  {reply.suggestedQuestions.slice(0, 3).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => fillQuestion(item)}
                      className="rounded-xl border border-violet-200/20 bg-white/5 px-3 py-3 text-right text-xs font-black leading-6 text-slate-100 transition hover:bg-violet-400/15"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm font-bold leading-7 text-amber-50">
            <div className="mb-2 flex items-center gap-2 font-black"><ShieldAlert className="h-5 w-5" />مرزهای ایمنی مربی</div>
            این مربی برای آموزش، امنیت و مدیریت ریسک است؛ قیمت آینده، سیگنال خرید/فروش، سود تضمینی یا درخواست اطلاعات محرمانه ارائه نمی‌کند.
          </div>
          <div className="rounded-3xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm font-bold leading-7 text-cyan-50">
            <div className="mb-2 flex items-center gap-2 font-black"><BrainCircuit className="h-5 w-5" />حافظه مسیر یادگیری</div>
            <p className="mb-3 rounded-2xl border border-cyan-200/20 bg-slate-950/35 p-3 text-xs leading-6 text-cyan-100">
              این snapshot فقط برای شخصی‌سازی آموزشی همین تجربه است و از cache مرورگر می‌آید؛ مدرک، قبولی ترم و وضعیت رسمی آکادمی فقط با داده سرور معتبر است.
            </p>
            <p>ترم‌های کامل‌شده: <span className="font-black text-white">{mentorProgress.completedTerms.length}/7</span></p>
            <p>اعتماد به مسیر: <span className="font-black text-white">{mentorProgress.confidence}%</span></p>
            {mentorProgress.weakAreas.length ? <p>حوزه‌های نیازمند مرور: <span className="font-black text-white">{mentorProgress.weakAreas.join("، ")}</span></p> : <p>با پرسیدن سؤال، مربی نقاط نیازمند مرور را تشخیص می‌دهد.</p>}
          </div>
          <div className="rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm font-bold leading-7 text-emerald-50">
            <div className="mb-2 flex items-center gap-2 font-black"><Target className="h-5 w-5" />پاسخ‌های متصل به مسیر شما</div>
            پاسخ‌ها با توجه به مرحله یادگیری شما، درس مرتبط، خطاهای رایج، چک‌لیست عملی و سؤال بعدی پیشنهادی ارائه می‌شوند.
          </div>
          <div className="grid gap-2">
            {quickQuestions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => fillQuestion(item)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.055] p-3 text-right text-xs font-black leading-6 text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10"
              >
                {item}
              </button>
            ))}
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-3">
            <textarea ref={textareaRef} value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-sm font-bold leading-7 text-white outline-none focus:border-cyan-300" />
            <button onClick={() => ask()} disabled={loading} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}پرسیدن سؤال آموزشی</button>
          </div>
        </div>
      </div>
    </div>
  );
}
