"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, Compass, GraduationCap, ShieldCheck, Sparkles, Target, UserRoundCheck } from "lucide-react";
import { mentorProfiles, mentorRoadmapSteps, mentorWeaknessRules } from "@/data/academyMentorIntelligence";

type Locale = "fa" | "en";
type ProgressItem = { term: number; progress: number; xp: number; passed: boolean; quizPercent: number | null };

function safeJson(value: string | null) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

function isOfficialPass(term: number) {
  const quizData = safeJson(window.localStorage.getItem(`tecpey-academy-term-${term}`));
  return Boolean(Number.isFinite(Number(quizData?.score)) && Number(quizData?.percent) === 100);
}

function readTermProgress(locale: Locale): ProgressItem[] {
  if (typeof window === "undefined") return [];
  return Array.from({ length: 7 }, (_, index) => {
    const term = index + 1;
    const unlocked = term === 1 || isOfficialPass(term - 1);
    const lessonKey = `tecpey-lesson-progress-${locale}-term-${term}`;
    const quizKey = `tecpey-academy-term-${term}`;
    const lessonData = safeJson(window.localStorage.getItem(lessonKey));
    const quizData = safeJson(window.localStorage.getItem(quizKey));
    const completedCount = lessonData?.completed ? Object.keys(lessonData.completed).filter((key) => lessonData.completed[key]).length : 0;
    const answerCount = lessonData?.answers ? Object.keys(lessonData.answers).filter((key) => lessonData.answers[key]).length : 0;
    const totalLessons = term === 7 ? 6 : 7;
    const lessonProgress = unlocked ? Math.min(99, Math.round((completedCount / totalLessons) * 100)) : 0;
    const quizPercent = typeof quizData?.percent === "number" ? quizData.percent : null;
    const hasOfficialQuiz = Number.isFinite(Number(quizData?.score));
    const progress = hasOfficialQuiz ? Math.max(0, Math.min(100, Number(quizPercent) || 0)) : lessonProgress;
    const passed = hasOfficialQuiz && quizPercent === 100;
    return { term, progress, xp: (unlocked ? completedCount * 10 + answerCount * 5 : 0) + (quizPercent || 0), passed, quizPercent };
  });
}

function readMentorMemory(locale: Locale) {
  if (typeof window === "undefined") return { weakAreas: [] as string[], questions: [] as string[], confidence: 0 };
  const raw = safeJson(window.localStorage.getItem("tecpey-ai-mentor-memory"));
  const history = safeJson(window.localStorage.getItem(`tecpey-ai-mentor-history-${locale}`));
  return {
    weakAreas: Array.isArray(raw?.weakAreas) ? raw.weakAreas.slice(0, 6) : [],
    questions: Array.isArray(history) ? history.slice(-5).map((item: { question?: string }) => item.question).filter((item: unknown): item is string => typeof item === "string" && item.length > 0) : [],
    confidence: Math.max(0, Math.min(100, Number(raw?.confidence || 0))),
  };
}

function recommendedProfile(progress: ProgressItem[], weakAreas: string[]) {
  const completed = progress.filter((item) => item.passed).length;
  const weakText = weakAreas.join(" ").toLowerCase();
  if (/ریسک|risk|ضرر|drawdown/.test(weakText)) return "risk";
  if (/روان|fomo|ترس|طمع|psychology/.test(weakText)) return "psychology";
  if (completed >= 5) return "professional";
  if (completed >= 2) return "intermediate";
  return "beginner";
}

export function AcademyMentorCoachCenter({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [memory, setMemory] = useState({ weakAreas: [] as string[], questions: [] as string[], confidence: 0 });

  useEffect(() => {
    setProgress(readTermProgress(locale));
    setMemory(readMentorMemory(locale));
    let active = true;
    fetch("/api/academy/mentor-memory", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!active || !data?.ok || !data.memory) return;
        const memorySnapshot = data.memory;
        setMemory((current) => ({
          weakAreas: Array.isArray(memorySnapshot.weakAreas) ? memorySnapshot.weakAreas : current.weakAreas,
          questions: current.questions,
          confidence: Number(memorySnapshot.confidence || current.confidence || 0),
        }));
      })
      .catch(() => null);
    return () => { active = false; };
  }, [locale]);

  const totalXp = useMemo(() => progress.reduce((sum, item) => sum + item.xp, 0), [progress]);
  const completedTerms = useMemo(() => progress.filter((item) => item.passed).length, [progress]);
  const weakRules = useMemo(() => {
    const text = [...memory.weakAreas, ...memory.questions].join(" ").toLowerCase();
    const matches = mentorWeaknessRules.filter((rule) => new RegExp(rule.pattern, "i").test(text));
    return (matches.length ? matches : mentorWeaknessRules.slice(0, 3)).slice(0, 4);
  }, [memory]);
  const profileId = recommendedProfile(progress, memory.weakAreas);
  const profile = mentorProfiles.find((item) => item.id === profileId) || mentorProfiles[0];
  const weakLabel = weakRules[0];

  return (
    <main className="min-h-screen bg-[color:var(--tp-bg)] text-[color:var(--tp-text)]">
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[40px] border border-cyan-300/15 bg-[#06111f] p-7 shadow-[0_34px_120px_rgba(34,211,238,.14)] lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
              <div>
                <p className="text-sm font-black text-cyan-300">{isFa ? "مربی شخصی آکادمی" : "مربی شخصی آکادمی"}</p>
                <h1 className="mt-4 text-balance text-4xl font-black leading-[1.15] text-white sm:text-5xl">
                  {isFa ? "مربی هوشمند شخصی‌سازی‌شده تک‌پی" : "TecPey personalized AI coach"}
                </h1>
                <p className="mt-5 max-w-4xl text-base font-bold leading-8 text-slate-300">
                  {isFa
                    ? "این مرکز با همان وضعیت رسمی آکادمی هماهنگ است: ترم‌ها فقط با آزمون ۱۰۰٪ کامل محسوب می‌شوند و مربی بر اساس مسیر واقعی شما پیشنهاد می‌دهد."
                    : "This center follows the official academy status: terms count as completed only after a 100% quiz score, and the mentor recommends based on your real path."}
                </p>
              </div>
              <div className="rounded-[32px] border border-white/10 bg-white/8 p-5">
                <UserRoundCheck className="h-9 w-9 text-cyan-300" />
                <p className="mt-4 text-sm font-black text-slate-400">{isFa ? "حالت پیشنهادی مربی" : "Recommended mentor mode"}</p>
                <h2 className="mt-2 text-2xl font-black text-white">{isFa ? profile.titleFa : profile.titleEn}</h2>
                <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{isFa ? profile.roleFa : profile.roleEn}</p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-4">
            {[
              [isFa ? "ترم‌های تکمیل‌شده" : "Completed terms", `${completedTerms}/7`, GraduationCap],
              ["XP", String(totalXp), Sparkles],
              [isFa ? "اعتماد آموزشی" : "Mentor confidence", `${Math.min(100, memory.confidence + completedTerms * 8)}%`, BrainCircuit],
              [isFa ? "نقطه ضعف اصلی" : "Main weak point", weakLabel ? (isFa ? weakLabel.labelFa : weakLabel.labelEn) : "—", Target],
            ].map(([label, value, Icon]) => (
              <div key={String(label)} className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
                <Icon className="h-6 w-6 text-cyan-500" />
                <p className="mt-3 text-xs font-black text-[color:var(--tp-muted)]">{String(label)}</p>
                <p className="mt-1 text-2xl font-black">{String(value)}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="rounded-[34px] border border-cyan-300/20 bg-white/90 p-6 shadow-sm dark:bg-white/[0.055]">
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">{isFa ? "برنامه یادگیری شخصی" : "Personalized learning plan"}</h2>
              <div className="mt-6 grid gap-4">
                {weakRules.map((rule, index) => (
                  <Link key={rule.id} href={isFa ? rule.hrefFa : rule.hrefEn} className="group rounded-[26px] border border-slate-200 bg-white p-5 transition hover:-translate-y-1 hover:border-cyan-300/60 hover:bg-cyan-50 dark:border-white/10 dark:bg-slate-950/40 dark:hover:bg-cyan-400/10">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">{isFa ? `اولویت ${index + 1}` : `Priority ${index + 1}`}</p>
                        <h3 className="mt-2 text-xl font-black text-slate-950 dark:text-white">{isFa ? rule.labelFa : rule.labelEn}</h3>
                        <p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{isFa ? rule.recommendedFa : rule.recommendedEn}</p>
                      </div>
                      <Compass className="h-7 w-7 text-cyan-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <aside className="space-y-6">
              <section className="rounded-[34px] border border-violet-300/20 bg-violet-500/10 p-6">
                <BrainCircuit className="h-8 w-8 text-violet-300" />
                <h2 className="mt-4 text-2xl font-black text-white">{isFa ? profile.titleFa : profile.titleEn}</h2>
                <p className="mt-3 text-sm font-bold leading-8 text-slate-300">{isFa ? profile.toneFa : profile.toneEn}</p>
                <div className="mt-4 grid gap-2">
                  {(isFa ? profile.bestForFa : profile.bestForEn).map((item) => (
                    <div key={item} className="flex gap-2 rounded-2xl bg-white/10 p-3 text-sm font-bold leading-7 text-slate-200">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-violet-200" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[34px] border border-emerald-300/20 bg-emerald-500/10 p-6">
                <ShieldCheck className="h-8 w-8 text-emerald-300" />
                <h2 className="mt-4 text-2xl font-black text-white">{isFa ? "قواعد شخصی‌سازی امن" : "Safe personalization rules"}</h2>
                <p className="mt-3 text-sm font-bold leading-8 text-slate-300">
                  {isFa
                    ? "حافظه مربی فقط مسیر آموزشی، ضعف‌های مفهومی و سؤال‌های درسی را نگه می‌دارد؛ نه Seed Phrase، نه رمز، نه کلید خصوصی و نه اطلاعات محرمانه مالی."
                    : "Mentor memory stores only learning path, conceptual weaknesses and educational questions; never seed phrases, passwords, private keys or sensitive financial credentials."}
                </p>
              </section>
            </aside>
          </div>

          <section className="mt-8 rounded-[34px] border border-slate-200 bg-white/90 p-6 dark:border-white/10 dark:bg-white/[0.055]">
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">{isFa ? "چرخه پاسخ‌گویی مربی" : "Mentor response plan"}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              {mentorRoadmapSteps.map((step, index) => (
                <div key={step.id} className="rounded-[26px] border border-cyan-300/20 bg-cyan-500/10 p-5">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-500 text-sm font-black text-white">{index + 1}</div>
                  <h3 className="mt-4 font-black text-slate-950 dark:text-white">{isFa ? step.titleFa : step.titleEn}</h3>
                  <p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{isFa ? step.textFa : step.textEn}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={isFa ? "/academy/ai-guide" : "/en/academy/ai-guide"} className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">
              {isFa ? "رفتن به مربی آموزشی" : "Open mentor"}
            </Link>
            <Link href={isFa ? "/academy/practice-lab" : "/en/academy/practice-lab"} className="rounded-2xl border border-cyan-300/30 px-5 py-3 text-sm font-black text-cyan-300">
              {isFa ? "تمرین تصمیم‌گیری" : "Practice decisions"}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
