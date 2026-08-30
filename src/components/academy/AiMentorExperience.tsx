"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, BookOpenCheck, CheckCircle2, Loader2, Send, ShieldAlert, Sparkles, BrainCircuit, Target, Globe2 } from "lucide-react";
import {
  MENTOR_QUICK_QUESTIONS,
  detectMentorMode,
  toLocalReply,
  type MentorMode,
  type MentorReply,
} from "@/lib/academy-ai-mentor-core";
import { useAcademyPathProgress } from "@/hooks/useAcademyPathProgress";
import { useMentorInsights } from "@/hooks/useMentorInsights";

type MentorProgress = { completedTerms: number[]; weakAreas: string[]; lastMode?: MentorMode; confidence: number };

// The deterministic safe fallback lives in academy-ai-mentor-core. Durable
// progress, Mentor profile, thread selection and conversation memory come only
// from authenticated server APIs; browser state is display-only.
const quickQuestions = MENTOR_QUICK_QUESTIONS.fa;

export function AiMentorExperience() {
  const [question, setQuestion] = useState(quickQuestions[0]);
  const [reply, setReply] = useState<MentorReply>(() => toLocalReply(quickQuestions[0]));
  const [loading, setLoading] = useState(false);
  const [publicResearch, setPublicResearch] = useState(false);
  const [lastQuestion, setLastQuestion] = useState(quickQuestions[0]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const officialProgress = useAcademyPathProgress("fa");
  const { data: mentorInsights } = useMentorInsights({ enabled: true });

  const mentorProgress = useMemo<MentorProgress>(() => {
    const completedTerms = Object.entries(officialProgress.termProgress)
      .filter(([, item]) => item.completed)
      .map(([slug]) => Number(slug.replace("term-", "")))
      .filter((term) => Number.isInteger(term));
    return {
      completedTerms,
      weakAreas: mentorInsights?.profile?.weakAreas?.slice(0, 5) ?? [],
      confidence: mentorInsights?.profile?.confidenceScore ?? Math.min(100, completedTerms.length * 12),
    };
  }, [mentorInsights, officialProgress.termProgress]);

  useEffect(() => {
    let active = true;
    fetch("/api/mentor-threads", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!active || !data?.ok || !Array.isArray(data.threads)) return;
        setThreadId(data.threads[0]?.id ?? null);
      })
      .catch(() => null);
    return () => { active = false; };
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

    const local = toLocalReply(clean);
    try {
      const response = await fetch("/api/ai-mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: clean,
          locale: "fa",
          mentorMode: currentMode,
          threadId,
          researchMode: publicResearch ? "public" : undefined,
        }),
      });
      const data = (await response.json()) as MentorReply;
      const nextReply = data?.ok ? data : local;
      if (data?.threadId) setThreadId(data.threadId);
      setReply(nextReply);
    } catch {
      setReply(local);
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
              <strong>{loading ? (publicResearch ? "در حال پژوهش عمومی منبع‌دار..." : "در حال آماده‌سازی پاسخ آموزشی...") : (reply.researchMode === "public" ? "پژوهش عمومی مربی" : "پاسخ مربی آکادمی")}</strong>
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
            {reply.sources?.length ? (
              <div className="mt-4 rounded-2xl border border-blue-300/20 bg-blue-400/10 p-3">
                <p className="font-black text-blue-100">منابع عمومی پاسخ:</p>
                <div className="mt-2 grid gap-2">
                  {reply.sources.slice(0, 8).map((source, index) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-blue-200/15 bg-slate-950/35 px-3 py-2 text-xs font-black text-blue-100 transition hover:bg-blue-400/15">
                      {source.title || `منبع ${index + 1}`}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
            {reply.relatedTerm?.href ? (
              <Link href={reply.relatedTerm.href} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-400"><BookOpenCheck className="h-4 w-4" />مرور ترم مرتبط</Link>
            ) : null}
            {reply.suggestedQuestions?.length ? (
              <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3">
                <p className="font-black text-cyan-100">سؤال بعدی پیشنهادی:</p>
                <div className="mt-2 grid gap-2">
                  {reply.suggestedQuestions.slice(0, 3).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => fillQuestion(item)}
                      className="rounded-xl border border-cyan-200/20 bg-white/5 px-3 py-3 text-right text-xs font-black leading-6 text-slate-100 transition hover:bg-cyan-400/15"
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
              این نمای آموزشی از پیشرفت رسمی، پروفایل Mentor و حافظهٔ سمت سرور ساخته می‌شود؛ مرورگر منبع حقیقت نیست.
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
            <button
              type="button"
              aria-pressed={publicResearch}
              onClick={() => setPublicResearch((value) => !value)}
              className={`mb-3 flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-right text-xs font-black transition ${publicResearch ? "border-blue-300/35 bg-blue-400/15 text-blue-50" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              <span className="flex items-center gap-2"><Globe2 className="h-4 w-4" />پژوهش زندهٔ عمومی درباره کوین، ابزار، خبر و X</span>
              <span className="rounded-full bg-slate-950/45 px-2 py-1 text-[10px]">{publicResearch ? "روشن" : "خاموش"}</span>
            </button>
            {publicResearch ? <p className="mb-3 text-xs font-bold leading-6 text-blue-100/85">فقط متن همین سؤال به ایجنت پژوهش می‌رود؛ تاریخچه، پروفایل، نقاط ضعف و اطلاعات مالی شخصی ارسال نمی‌شود. پاسخ بدون منبع معتبر پذیرفته نخواهد شد.</p> : null}
            <textarea ref={textareaRef} value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-sm font-bold leading-7 text-white outline-none focus:border-cyan-300" />
            <button onClick={() => ask()} disabled={loading} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-[#03101a] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{publicResearch ? "پژوهش منبع‌دار" : "پرسیدن سؤال آموزشی"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
