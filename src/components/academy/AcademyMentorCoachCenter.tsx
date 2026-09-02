"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, Compass, GraduationCap, ShieldCheck, Sparkles, Target } from "lucide-react";
import { LivingMentorAvatar } from "@/components/mentor/LivingMentorAvatar";
import { mentorProfiles, mentorRoadmapSteps, mentorWeaknessRules } from "@/data/academyMentorIntelligence";
import { useAcademyPathProgress } from "@/hooks/useAcademyPathProgress";
import { useMentorInsights } from "@/hooks/useMentorInsights";
import { selectLivingMentorAct } from "@/lib/living-mentor-presentation";

type Locale = "fa" | "en";
type ProgressItem = { term: number; progress: number; xp: number; passed: boolean; quizPercent: number | null };
type MemoryState = {
  confidence: number | null;
  questions: string[];
  state: "loading" | "ready" | "unavailable";
  weakAreas: string[];
};

function recommendedProfile(progress: ProgressItem[], weakAreas: string[], evidenceReady: boolean) {
  if (!evidenceReady) return null;
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
  const { data: mentorInsights, loading: mentorInsightsLoading } = useMentorInsights();
  const [memory, setMemory] = useState<MemoryState>({
    weakAreas: [],
    questions: [],
    confidence: null,
    state: "loading",
  });

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
        const rawConfidence =
          memorySnapshot?.confidence === null || memorySnapshot?.confidence === undefined
            ? Number.NaN
            : Number(memorySnapshot.confidence);
        setMemory({
          weakAreas: Array.isArray(memorySnapshot?.weakAreas) ? memorySnapshot.weakAreas.slice(0, 6) : [],
          questions: conversations
            .filter((item: { role?: unknown; content?: unknown }) => item.role === "user" && typeof item.content === "string")
            .map((item: { content: string }) => item.content)
            .slice(0, 5),
          confidence: Number.isFinite(rawConfidence)
            ? Math.max(0, Math.min(100, rawConfidence))
            : null,
          state: memoryData?.ok || conversationData?.ok ? "ready" : "unavailable",
        });
      })
      .catch(() => {
        if (!active) return;
        setMemory({ weakAreas: [], questions: [], confidence: null, state: "unavailable" });
      });
    return () => { active = false; };
  }, [locale]);

  const totalXp = officialProgress.totalXp;
  const completedTerms = useMemo(() => progress.filter((item) => item.passed).length, [progress]);
  const weakRules = useMemo(() => {
    const text = [...memory.weakAreas, ...memory.questions].join(" ").toLowerCase();
    const matches = mentorWeaknessRules.filter((rule) => new RegExp(rule.pattern, "i").test(text));
    return matches.slice(0, 4);
  }, [memory]);
  const progressEvidenceReady = officialProgress.loaded && !officialProgress.error;
  const memoryEvidenceReady =
    memory.state === "ready" &&
    (memory.weakAreas.length > 0 || memory.questions.length > 0 || memory.confidence !== null);
  const evidenceReady = progressEvidenceReady || memoryEvidenceReady;
  const profileId = recommendedProfile(progress, memory.weakAreas, evidenceReady);
  const profile = profileId
    ? mentorProfiles.find((item) => item.id === profileId) ?? null
    : null;
  const weakLabel = weakRules[0];
  const mentorAct = selectLivingMentorAct({
    riskCaution: mentorInsights?.profile?.riskProfile === "high",
    isSpeaking: false,
    isThinking:
      mentorInsightsLoading || memory.state === "loading" || !officialProgress.loaded,
    isComposing: false,
  });

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
                <div className="flex items-center gap-4">
                  <LivingMentorAvatar act={mentorAct} locale={locale} size="stage" />
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-400">{isFa ? "حالت پیشنهادی منتور" : "Recommended mentor mode"}</p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                      {profile
                        ? isFa
                          ? profile.titleFa
                          : profile.titleEn
                        : isFa
                          ? "در انتظار شواهد یادگیری"
                          : "Waiting for learning evidence"}
                    </h2>
                  </div>
                </div>
                <p className="mt-4 text-sm font-bold leading-7 text-slate-300">
                  {profile
                    ? isFa
                      ? profile.roleFa
                      : profile.roleEn
                    : isFa
                      ? "منتور تا آماده‌شدن دادهٔ معتبر، سطح یا ضعف آموزشی تو را حدس نمی‌زند."
                      : "The mentor will not guess your level or weak areas before verified evidence is available."}
                </p>
                <p className="mt-3 inline-flex rounded-full border border-cyan-200/20 bg-slate-950/35 px-3 py-1 text-[11px] font-black text-cyan-100">
                  {evidenceReady
                    ? isFa
                      ? "متکی بر رکوردهای سرور"
                      : "Backed by server records"
                    : isFa
                      ? "داده در دسترس نیست"
                      : "Evidence unavailable"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-4">
            {[
              [isFa ? "ترم‌های تکمیل‌شده" : "Completed terms", progressEvidenceReady ? `${completedTerms}/7` : "—", GraduationCap],
              ["XP", progressEvidenceReady ? String(totalXp) : "—", Sparkles],
              [isFa ? "اعتماد آموزشی" : "Mentor confidence", memory.confidence === null ? "—" : `${Math.round(memory.confidence)}%`, BrainCircuit],
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
              {weakRules.length ? (
                <div className="mt-6 grid gap-4">
                  {weakRules.map((rule, index) => (
                  <Link key={rule.id} href={isFa ? rule.hrefFa : rule.hrefEn} className="group rounded-[26px] border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 bg-white p-5 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:border-white/10 dark:bg-slate-950/40 [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1 [@media(hover:hover)_and_(pointer:fine)]:hover:border-cyan-300/60 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-cyan-50 dark:[@media(hover:hover)_and_(pointer:fine)]:hover:bg-cyan-700/10">
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
              ) : (
                <div className="mt-6 rounded-[26px] border border-dashed border-cyan-300/25 bg-cyan-300/5 p-6 text-center">
                  <Target className="mx-auto h-7 w-7 text-cyan-400" />
                  <p className="mt-3 text-sm font-black text-slate-700 dark:text-slate-200">
                    {isFa
                      ? "هنوز نقطه‌ضعف تأییدشده‌ای برای ساخت برنامه شخصی ثبت نشده است."
                      : "No verified weak area is available for a personal plan yet."}
                  </p>
                  <p className="mt-2 text-xs font-bold leading-6 text-[color:var(--tp-muted)]">
                    {isFa
                      ? "با ادامه درس‌ها، آزمون‌ها و تمرین‌های ثبت‌شده، این بخش به‌صورت خودکار و بدون حدس به‌روز می‌شود."
                      : "This area updates from recorded lessons, assessments and practice—without guessing."}
                  </p>
                </div>
              )}
            </section>

            <aside className="space-y-6">
              <section className="rounded-[34px] border border-cyan-300/20 bg-cyan-500/10 p-6">
                <div className="flex items-center gap-3">
                  <LivingMentorAvatar act={mentorAct} decorative locale={locale} size="header" />
                  <BrainCircuit className="h-8 w-8 text-cyan-300" />
                </div>
                <h2 className="mt-4 text-2xl font-black text-white">
                  {profile
                    ? isFa
                      ? profile.titleFa
                      : profile.titleEn
                    : isFa
                      ? "شخصی‌سازی متوقف است"
                      : "Personalization is paused"}
                </h2>
                <p className="mt-3 text-sm font-bold leading-8 text-slate-300">
                  {profile
                    ? isFa
                      ? profile.toneFa
                      : profile.toneEn
                    : isFa
                      ? "به‌محض بازگشت مرجع داده، حالت مناسب منتور از شواهد واقعی انتخاب می‌شود."
                      : "The mentor mode will be selected from real evidence as soon as the data authority returns."}
                </p>
                {profile ? (
                  <div className="mt-4 grid gap-2">
                    {(isFa ? profile.bestForFa : profile.bestForEn).map((item) => (
                      <div key={item} className="flex gap-2 rounded-2xl bg-white/10 p-3 text-sm font-bold leading-7 text-slate-200">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-200" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
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
            <Link href={isFa ? "/academy/ai-guide" : "/en/academy/ai-guide"} className="rounded-2xl bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 px-5 py-3 text-sm font-black text-white">
              {isFa ? "رفتن به مربی آموزشی" : "Open mentor"}
            </Link>
            <Link href={isFa ? "/academy/practice-lab" : "/en/academy/practice-lab"} className="rounded-2xl border border-cyan-300/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 px-5 py-3 text-sm font-black text-cyan-300">
              {isFa ? "تمرین تصمیم‌گیری" : "Practice decisions"}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
