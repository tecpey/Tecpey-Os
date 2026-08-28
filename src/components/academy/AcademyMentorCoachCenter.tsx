"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, Compass, GraduationCap, ShieldCheck, Sparkles, Target, UserRoundCheck } from "lucide-react";
import { mentorProfiles, mentorRoadmapSteps, mentorWeaknessRules } from "@/data/academyMentorIntelligence";
import { useAcademyPathProgress } from "@/hooks/useAcademyPathProgress";

type Locale = "fa" | "en";
type ProgressItem = { term: number; progress: number; xp: number; passed: boolean; quizPercent: number | null };

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
  const officialProgress = useAcademyPathProgress(locale);
  const [memory, setMemory] = useState({ weakAreas: [] as string[], questions: [] as string[], confidence: 0 });

  const progress = useMemo<ProgressItem[]>(() => Array.from({ length: 7 }, (_, index) => {
    const term = index + 1;
    const item = officialProgress.termProgress[`term-${term}`];
    return {
      term,
      progress: item?.progress ?? 0,
      xp: 0,
      passed: item?.completed ?? false,
      quizPercent: item?.completed ? 100 : item?.progress ?? null,
    };
  }), [officialProgress.termProgress]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/academy/mentor-memory", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/mentor-conversations?limit=12", { cache: "no-store" }).then((response) => response.json()),
    ])
      .then(([memoryData, conversationData]) => {
        if (!active) return;
        const memorySnapshot = memoryData?.ok ? memoryData.memory : null;
        const conversations = conversationData?.ok && Array.isArray(conversationData.conversations)
          ? conversationData.conversations
          : [];
        setMemory({
          weakAreas: Array.isArray(memorySnapshot?.weakAreas) ? memorySnapshot.weakAreas.slice(0, 6) : [],
          questions: conversations
            .filter((item: { role?: unknown; content?: unknown }) => item.role === "user" && typeof item.content === "string")
            .map((item: { content: string }) => item.content)
            .slice(0, 5),
          confidence: Math.max(0, Math.min(100, Number(memorySnapshot?.confidence ?? 0))),
        });
      })
      .catch(() => null);
    return () => { active = false; };
  }, [locale]);

  const totalXp = officialProgress.totalXp;
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
                <p className="text-sm font-black text-cyan-300">{isFa ? "مربی شخصی آکادمی" : "Personal academy coach"}</p>
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
                  <Link key={rule.id} href={isFa ? rule.hrefFa : rule.hrefEn} className="group rounded-[26px] border border-slate-200 bg-white p-5 transition hover:-translate-y-1 hover:border-cyan-300/60 hover:bg-cyan-50 dark:border-white/10 dark:bg-slate-950/40 dark:hover:bg-cyan-700/10">
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
              <section className="rounded-[34px] border border-cyan-300/20 bg-cyan-500/10 p-6">
                <BrainCircuit className="h-8 w-8 text-cyan-300" />
                <h2 className="mt-4 text-2xl font-black text-white">{isFa ? profile.titleFa : profile.titleEn}</h2>
                <p className="mt-3 text-sm font-bold leading-8 text-slate-300">{isFa ? profile.toneFa : profile.toneEn}</p>
                <div className="mt-4 grid gap-2">
                  {(isFa ? profile.bestForFa : profile.bestForEn).map((item) => (
                    <div key={item} className="flex gap-2 rounded-2xl bg-white/10 p-3 text-sm font-bold leading-7 text-slate-200">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-200" />
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
                <p className="mt-4 rounded-2xl border border-emerald-200/20 bg-slate-950/35 p-3 text-xs font-bold leading-6 text-emerald-50">
                  {isFa
                    ? "پیشرفت، سؤال‌های اخیر و حافظهٔ آموزشی از APIها و رکوردهای سرور خوانده می‌شوند؛ مرورگر فقط این نما را نمایش می‌دهد و منبع حقیقت نیست."
                    : "Progress, recent questions and learning memory come from authenticated server records; the browser only renders this view and is not the source of truth."}
                </p>
              </section>
            </aside>
          </div>

          <section className="mt-8 rounded-[34px] border border-slate-200 bg-white/90 p-6 dark:border-white/10 dark:bg-white/[0.055]">
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">{isFa ? "چرخه پاسخ‌گویی مربی" : "Mentor response plan"}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              {mentorRoadmapSteps.map((step, index) => (
                <div key={step.id} className="rounded-[26px] border border-cyan-300/20 bg-cyan-800/10 p-5">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-800 text-sm font-black text-white">{index + 1}</div>
                  <h3 className="mt-4 font-black text-slate-950 dark:text-white">{isFa ? step.titleFa : step.titleEn}</h3>
                  <p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{isFa ? step.textFa : step.textEn}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={isFa ? "/academy/ai-guide" : "/en/academy/ai-guide"} className="rounded-2xl bg-cyan-800 px-5 py-3 text-sm font-black text-white">
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
