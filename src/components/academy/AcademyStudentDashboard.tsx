"use client";

import Link from "next/link";
import {
  Award,
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Flame,
  Lock,
  Medal,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UserRoundCheck,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAcademyPathProgress } from "@/hooks/useAcademyPathProgress";

type Locale = "fa" | "en";
type ProgressItem = { progress: number; xp: number; completed: boolean; answered: number; locked: boolean };
type CloudProfile = {
  public_student_id?: string;
  streak_days?: number;
  identity_score?: number;
  retention_score?: number;
  community_score?: number;
  total_xp?: number;
  completed_terms?: number;
  overall_progress?: number;
  earned_badges?: string[];
  display_name?: string;
  username?: string;
  avatar?: string;
};

const terms = [
  { slug: "term-1", fa: "ورود امن به رمزارز", en: "Safe crypto entry", badge: "Crypto Explorer", icon: "🧭", outcomeFa: "مفهوم بازار، ریسک و تفاوت آموزش با معامله واقعی را می‌شناسی.", outcomeEn: "Understand the market, risk and the difference between learning and real trading." },
  { slug: "term-2", fa: "امنیت دارایی و کیف پول", en: "Wallet and asset security", badge: "Security Guardian", icon: "🛡️", outcomeFa: "می‌دانی Seed Phrase، شبکه انتقال و خطاهای امنیتی را چطور مدیریت کنی.", outcomeEn: "Know how to handle seed phrases, networks and common security mistakes." },
  { slug: "term-3", fa: "صرافی، سفارش و بازار اسپات", en: "Spot exchange and orders", badge: "Exchange Starter", icon: "🔁", outcomeFa: "با انواع سفارش، کارمزد، عمق بازار و رفتار قیمت آشنا می‌شوی.", outcomeEn: "Learn orders, fees, order books and price behavior." },
  { slug: "term-4", fa: "بررسی پروژه و اعتبارسنجی", en: "Project research", badge: "Project Researcher", icon: "🔎", outcomeFa: "ادعاهای پروژه، توکنومیک، ریسک و منابع معتبر را بهتر تشخیص می‌دهی.", outcomeEn: "Evaluate claims, tokenomics, risks and reliable sources." },
  { slug: "term-5", fa: "نمودارخوانی و تحلیل پایه", en: "Chart reading", badge: "Chart Reader", icon: "📈", outcomeFa: "نمودار را می‌خوانی، اما سیگنال‌زدگی را با تحلیل مسئولانه جایگزین می‌کنی.", outcomeEn: "Read charts while replacing signal-chasing with responsible analysis." },
  { slug: "term-6", fa: "مدیریت سرمایه و ریسک", en: "Capital and risk management", badge: "Risk Controller", icon: "⚖️", outcomeFa: "اندازه موقعیت، حد خطا، زیان قابل تحمل و انضباط تصمیم را تمرین می‌کنی.", outcomeEn: "Practice position sizing, invalidation, tolerable loss and discipline." },
  { slug: "term-7", fa: "ارزیابی نهایی و آمادگی", en: "Final readiness", badge: "Ready Learner", icon: "🧠", outcomeFa: "آمادگی آموزشی خود را می‌سنجی و مسیر بعدی را روشن می‌کنی.", outcomeEn: "Measure learning readiness and clarify the next path." },
];

function levelFromXp(xp: number) {
  if (xp >= 650) return { level: 7, titleFa: "آماده مسیر تخصصی", titleEn: "Specialized Path Ready" };
  if (xp >= 500) return { level: 6, titleFa: "یادگیرنده مسئول", titleEn: "Responsible Learner" };
  if (xp >= 360) return { level: 5, titleFa: "مدیریت ریسک پایه", titleEn: "Risk-Aware Learner" };
  if (xp >= 240) return { level: 4, titleFa: "نمودارخوان پایه", titleEn: "Chart Apprentice" };
  if (xp >= 140) return { level: 3, titleFa: "امنیت‌محور", titleEn: "Security Aware" };
  if (xp >= 60) return { level: 2, titleFa: "کاوشگر رمزارز", titleEn: "Crypto Explorer" };
  return { level: 1, titleFa: "شروع مسیر", titleEn: "Getting Started" };
}

function rankFromProgress(overallProgress: number, completedTerms: number) {
  const score = Math.max(1, 100 - overallProgress + (7 - completedTerms) * 4);
  return Math.min(99, score);
}

export function AcademyStudentDashboard({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const { loaded, termProgress } = useAcademyPathProgress(locale);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "device" | "paused">("idle");
  const [cloudProfile, setCloudProfile] = useState<CloudProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/academy-student-profile", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        setCloudProfile(data?.profile || null);
      })
      .catch(() => {})
      .finally(() => { if (active) setProfileChecked(true); });
    return () => { active = false; };
  }, [saveState]);

  const progressItems = useMemo(() => Object.values(termProgress) as ProgressItem[], [termProgress]);
  const totalXp = useMemo(() => progressItems.reduce((sum, item) => sum + item.xp, 0), [progressItems]);
  const completedTerms = useMemo(() => progressItems.filter((item) => item.completed).length, [progressItems]);
  const overallProgress = Math.round((progressItems.reduce((sum, item) => sum + item.progress, 0) / (terms.length * 100)) * 100) || 0;
  const level = levelFromXp(totalXp);
  const earnedBadges = terms.filter((term) => termProgress[term.slug]?.completed);
  const nextTerm = terms.find((term) => !termProgress[term.slug]?.completed);
  const activeTermIndex = terms.findIndex((term) => term.slug === nextTerm?.slug);
  const activeTermNumber = activeTermIndex >= 0 ? activeTermIndex + 1 : 7;
  const estimatedRank = rankFromProgress(overallProgress, completedTerms);
  const displayName = cloudProfile?.display_name || (isFa ? "دانشجوی تک‌پی" : "TecPey learner");
  const username = cloudProfile?.username ? `@${cloudProfile.username}` : "";
  const avatar = cloudProfile?.avatar || "🎓";
  const officialTecPeyId = cloudProfile?.public_student_id || (isFa ? "پس از تکمیل حساب صادر می‌شود" : "Issued after account completion");
  const officialStreak = Math.max(0, Number(cloudProfile?.streak_days || 0));
  const identityScore = Math.max(0, Math.min(100, Number(cloudProfile?.identity_score || 25 + completedTerms * 8)));
  const retentionScore = Math.max(0, Math.min(100, Number(cloudProfile?.retention_score || officialStreak * 10)));
  const _communityScore = Math.max(0, Math.min(100, Number(cloudProfile?.community_score || completedTerms * 10)));

  useEffect(() => {
    if (!loaded) return;
    const controller = new AbortController();
    const payload = {
      locale,
      progress: termProgress,
      totalXp,
      completedTerms,
      overallProgress,
      earnedBadges: earnedBadges.map((term) => ({ slug: term.slug, badge: term.badge })),
      mentorSnapshot: { recommendedTerm: nextTerm?.slug || "specialized-program", updatedAt: new Date().toISOString() },
      simulatorSnapshot: { completedScenarios: 0 },
      source: "academy-dashboard",
    };

    fetch("/api/academy-student-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((data) => setSaveState(data?.storage === "cloud" ? "saved" : "device"))
      .catch(() => {
        if (!controller.signal.aborted) setSaveState("paused");
      });

    return () => controller.abort();
  }, [completedTerms, earnedBadges, loaded, locale, nextTerm?.slug, overallProgress, termProgress, totalXp]);

  if (profileChecked && !cloudProfile?.display_name) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-12 text-white" dir={isFa ? "rtl" : "ltr"}>
        <section className="mx-auto max-w-3xl rounded-[38px] border border-amber-300/25 bg-amber-400/10 p-8 text-center">
          <UserRoundCheck className="mx-auto h-12 w-12 text-amber-200" />
          <h1 className="mt-4 text-3xl font-black">{isFa ? "برای داشبورد، اول پروفایل آکادمی را بساز" : "Create academy profile before dashboard"}</h1>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-200">{isFa ? "داشبورد، منتور، ترم‌ها، شبیه‌ساز و مدارک باید به نام نمایشی و پروفایل آموزشی تو متصل باشند." : "Dashboard, mentor, terms, simulator and certificates must be connected to your display name and learning profile."}</p>
          <Link href={isFa ? "/academy/onboarding" : "/en/academy/onboarding"} className="mt-6 inline-flex rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-black text-white">{isFa ? "ساخت پروفایل آکادمی" : "Create academy profile"}</Link>
        </section>
      </main>
    );
  }

  const statusText = saveState === "saved"
    ? (isFa ? "پرونده یادگیری شما به‌روز شد." : "Your learning record is up to date.")
    : saveState === "device"
      ? (isFa ? "پیشرفت شما محفوظ است و پس از ورود کامل، به پرونده آموزشی متصل می‌شود." : "Your progress is preserved and will connect to your learning record after sign-in.")
      : saveState === "paused"
        ? (isFa ? "ثبت آنلاین موقتاً کند است؛ مسیر یادگیری شما حفظ شده است." : "Online saving is temporarily slow; your learning path is preserved.")
        : (isFa ? "در حال بررسی پرونده یادگیری شما..." : "Checking your learning record...");

  return (
    <main className="min-h-screen bg-[color:var(--tp-bg)] text-[color:var(--tp-text)]">
      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="overflow-hidden rounded-[36px] border border-cyan-300/15 bg-slate-950 p-6 text-white shadow-[0_30px_90px_rgba(34,211,238,.14)] lg:p-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
                  <GraduationCap className="h-4 w-4" /> {isFa ? "پرونده آموزشی تک‌پی" : "TecPey learning record"}
                </div>
                <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">
                  {isFa ? `سلام ${displayName} 👋` : `Hi ${displayName} 👋`}
                </h1>
                <div className="mt-4 inline-flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.055] px-4 py-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-400/15 text-2xl">{avatar}</span><div><p className="text-sm font-black text-white">{displayName}</p>{username ? <p className="text-xs font-bold text-cyan-100/80">{username}</p> : null}</div></div>
                <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-300 sm:text-base">
                  {isFa
                    ? `این داشبورد برای ${displayName} ساخته شده است. مرکز هوشمند، ترم فعلی، آزمون‌ها، نشان‌ها، پیشنهاد منتور و قدم بعدی یک‌جا مدیریت می‌شوند.`
                    : `This dashboard is built for ${displayName}. Smart Center, current term, quizzes, badges, mentor suggestions and the next step are managed in one place.`}
                </p>
              </div>
              <div className="rounded-[30px] border border-amber-300/25 bg-amber-400/10 p-5 text-center">
                <Trophy className="mx-auto h-10 w-10 text-amber-300" />
                <p className="mt-3 text-xs font-black text-amber-100/80">{isFa ? "سطح فعلی" : "Current level"}</p>
                <p className="mt-1 text-2xl font-black">{isFa ? level.titleFa : level.titleEn}</p>
                <p className="mt-2 rounded-full bg-slate-950/50 px-3 py-2 text-sm font-black text-amber-200">Level {level.level}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {[
                [isFa ? "پیشرفت کل" : "Overall progress", `${overallProgress}%`, BookOpenCheck],
                [isFa ? "امتیاز یادگیری" : "Learning XP", `${totalXp}`, Zap],
                [isFa ? "ترم‌های کامل" : "Completed terms", `${completedTerms}/7`, CheckCircle2],
                [isFa ? "رتبه تخمینی" : "Estimated rank", `#${estimatedRank}`, Trophy],
              ].map(([label, value, Icon]) => (
                <div key={String(label)} className="rounded-[26px] border border-white/10 bg-white/[0.055] p-5">
                  <Icon className="h-6 w-6 text-cyan-300" />
                  <p className="mt-3 text-xs font-black text-slate-400">{String(label)}</p>
                  <p className="mt-1 text-3xl font-black text-white">{String(value)}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 h-4 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-cyan-400 transition-all duration-700" style={{ width: `${overallProgress}%` }} />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              {[
                [isFa ? "TecPey ID" : "TecPey ID", officialTecPeyId, UserRoundCheck],
                [isFa ? "استمرار" : "Streak", officialStreak ? `${officialStreak} ${isFa ? "روز" : "days"}` : (isFa ? "شروع امروز" : "Start today"), Flame],
                [isFa ? "امتیاز هویت" : "Identity score", `${identityScore}/100`, ShieldCheck],
                [isFa ? "بازگشت‌پذیری" : "Retention score", `${retentionScore}/100`, Clock3],
              ].map(([label, value, Icon]) => (
                <div key={String(label)} className="rounded-[26px] border border-cyan-300/15 bg-cyan-400/10 p-5">
                  <Icon className="h-6 w-6 text-cyan-200" />
                  <p className="mt-3 text-xs font-black text-cyan-100/80">{String(label)}</p>
                  <p className="mt-1 break-words text-xl font-black text-white">{String(value)}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-400/10 p-4">
                <p className="text-xs font-black text-emerald-100/80">{isFa ? "وضعیت پرونده" : "Record status"}</p>
                <p className="mt-2 text-lg font-black text-white">{isFa ? "مسیر یادگیری فعال" : "Active learning path"}</p>
                <p className="mt-2 text-xs font-bold leading-6 text-slate-300">{isFa ? "پیشرفت، آزمون‌ها و نشان‌ها در یک پرونده واحد جمع می‌شوند تا مسیر آموزشی پراکنده نشود." : "Progress, quizzes and badges are kept together as one learning record."}</p>
              </div>
              <div className="rounded-[24px] border border-violet-300/20 bg-violet-400/10 p-4">
                <p className="text-xs font-black text-violet-100/80">{isFa ? "تمرکز مربی" : "Mentor focus"}</p>
                <p className="mt-2 text-lg font-black text-white">{nextTerm ? (isFa ? nextTerm.fa : nextTerm.en) : (isFa ? "آمادگی تخصصی" : "Specialized readiness")}</p>
                <p className="mt-2 text-xs font-bold leading-6 text-slate-300">{isFa ? "مربی، قدم بعدی را بر اساس ترم فعال، آزمون‌ها و رفتار تمرینی پیشنهاد می‌کند." : "The mentor recommends the next step from active term, quizzes and practice behavior."}</p>
              </div>
              <div className="rounded-[24px] border border-amber-300/20 bg-amber-400/10 p-4">
                <p className="text-xs font-black text-amber-100/80">{isFa ? "مسیر حرفه‌ای" : "Professional path"}</p>
                <p className="mt-2 text-lg font-black text-white">{completedTerms === 7 ? (isFa ? "آماده بررسی" : "Ready for review") : (isFa ? "در حال ساخت آمادگی" : "Building readiness")}</p>
                <p className="mt-2 text-xs font-bold leading-6 text-slate-300">{isFa ? "دعوت به برنامه تخصصی فقط بر اساس ارزیابی، ظرفیت و کیفیت عملکرد انجام می‌شود." : "Specialized invitations depend on assessment, capacity and performance quality."}</p>
              </div>
            </div>
          </div>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-[34px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black">{isFa ? "قدم بعدی شخصی‌سازی‌شده" : "Personalized next step"}</h2>
                  <p className="mt-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{statusText}</p>
                </div>
                <Link href={nextTerm ? (isFa ? `/academy/${nextTerm.slug}` : `/en/academy/${nextTerm.slug}`) : (isFa ? "/academy/specialized-program" : "/en/academy/specialized-program")} className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">
                  {nextTerm ? (isFa ? "ادامه یادگیری" : "Continue learning") : (isFa ? "بررسی مسیر تخصصی" : "Specialized review")}
                </Link>
              </div>
              <div className="mt-6 rounded-[28px] border border-cyan-300/20 bg-cyan-500/10 p-5">
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-500 text-2xl text-white">{nextTerm?.icon || "🎓"}</div>
                  <div>
                    <p className="text-xs font-black text-cyan-700 dark:text-cyan-200">{isFa ? `ترم ${activeTermNumber}` : `Term ${activeTermNumber}`}</p>
                    <h3 className="mt-1 text-xl font-black">{nextTerm ? (isFa ? nextTerm.fa : nextTerm.en) : (isFa ? "مسیر پایه کامل شد" : "Foundation path completed")}</h3>
                    <p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                      {nextTerm ? (isFa ? nextTerm.outcomeFa : nextTerm.outcomeEn) : (isFa ? "پس از تکمیل مسیر، امکان ثبت درخواست بررسی برای برنامه تخصصی آنلاین یا حضوری فراهم است. دعوت به این برنامه‌ها بر اساس ارزیابی، عملکرد و ظرفیت انجام می‌شود." : "After completion, you can request a review for specialized online or in-person programs. Invitations depend on assessment, performance and capacity.")}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <aside className="rounded-[34px] border border-emerald-300/20 bg-emerald-500/10 p-6">
              <UserRoundCheck className="h-7 w-7 text-emerald-500" />
              <h2 className="mt-3 text-2xl font-black">{isFa ? "هویت آموزشی" : "Learning identity"}</h2>
              <p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                {isFa ? "پرونده تو می‌تواند با ایمیل، Google، Apple ID یا موبایل به حساب واحد تک‌پی متصل شود تا مسیر آموزش، ارزیابی و برنامه‌های تخصصی پراکنده نشود." : "Your record can connect through email, Google, Apple ID or phone so learning, assessment and specialized programs stay unified."}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-black">
                {[isFa ? "Email" : "Email", "Google", "Apple ID", isFa ? "موبایل" : "Phone"].map((item) => <span key={item} className="rounded-2xl border border-emerald-300/20 bg-white/50 px-3 py-3 text-center dark:bg-white/5">{item}</span>)}
              </div>
            </aside>
          </section>

          <section className="rounded-[34px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">{isFa ? "کارتکس حرفه‌ای دانشجو" : "Student professional portfolio"}</h2>
                <p className="mt-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                  {isFa ? "این بخش، خروجی قابل دفاع آکادمی است: وضعیت آموزشی، کیفیت تصمیم، نشان‌ها، آمادگی تخصصی و مسیر بعدی در یک نمای کامل دیده می‌شود." : "This is the academy's defensible output: learning status, decision quality, badges, readiness and next path in one complete view."}
                </p>
              </div>
              <Link href={isFa ? "/academy/final-assessment" : "/en/academy/final-assessment"} className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-5 py-3 text-sm font-black text-emerald-700 dark:text-emerald-100">
                {isFa ? "ارزیابی نهایی" : "Final assessment"}
              </Link>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              {[
                [isFa ? "هویت آموزشی" : "Learning identity", isFa ? "فعال" : "Active", ShieldCheck],
                [isFa ? "گواهی مسیر" : "Certificate path", completedTerms === 7 ? (isFa ? "قابل بررسی" : "Reviewable") : `${completedTerms}/7`, Medal],
                [isFa ? "کیفیت تصمیم" : "Decision quality", overallProgress >= 70 ? (isFa ? "رو به رشد" : "Improving") : (isFa ? "در حال شکل‌گیری" : "Forming"), Target],
                [isFa ? "دعوت تخصصی" : "Specialized invitation", completedTerms === 7 ? (isFa ? "مشروط" : "Conditional") : (isFa ? "پس از تکمیل" : "After completion"), BadgeCheck],
              ].map(([label, value, Icon]) => (
                <div key={String(label)} className="rounded-[24px] border border-cyan-300/15 bg-cyan-500/10 p-4">
                  <Icon className="h-5 w-5 text-cyan-500" />
                  <p className="mt-3 text-xs font-black text-[color:var(--tp-muted)]">{String(label)}</p>
                  <p className="mt-1 text-lg font-black">{String(value)}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-[34px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-2xl font-black">{isFa ? "نقشه پیشرفت ۷ ترمی" : "7-term progress map"}</h2>
                <Link href={isFa ? "/academy" : "/en/academy"} className="rounded-2xl border border-cyan-300/30 px-4 py-3 text-xs font-black text-cyan-600 dark:text-cyan-200">
                  {isFa ? "صفحه آکادمی" : "Academy page"}
                </Link>
              </div>
              <div className="mt-6 space-y-4">
                {terms.map((term, index) => {
                  const item = termProgress[term.slug] || { progress: 0, xp: 0, completed: false, answered: 0, locked: index > 0 };
                  const locked = item.locked;
                  return (
                    <article key={term.slug} className={`rounded-[26px] border p-4 transition ${item.completed ? "border-emerald-300/35 bg-emerald-500/10" : locked ? "border-slate-200 bg-slate-50 opacity-75 dark:border-white/10 dark:bg-white/5" : "border-cyan-300/30 bg-cyan-500/10"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 gap-3">
                          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-2xl shadow-sm dark:bg-slate-950/60">{term.icon}</div>
                          <div>
                            <p className="text-xs font-black text-[color:var(--tp-muted)]">{isFa ? `ترم ${index + 1}` : `Term ${index + 1}`}</p>
                            <h3 className="mt-1 font-black">{isFa ? term.fa : term.en}</h3>
                            <p className="mt-2 text-xs font-bold leading-6 text-[color:var(--tp-muted)]">{isFa ? term.outcomeFa : term.outcomeEn}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-700 dark:text-cyan-200">{item.progress}%</span>
                          <span className="rounded-full bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-700 dark:text-amber-200">{item.xp} XP</span>
                        </div>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${item.progress}%` }} /></div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs font-black text-[color:var(--tp-muted)]">
                          {item.completed ? (isFa ? "کامل شده و در پرونده ثبت شده" : "Completed and recorded") : locked ? (isFa ? "پس از تکمیل ترم قبلی باز می‌شود" : "Unlocks after the previous term") : (isFa ? "در حال یادگیری" : "In progress")}
                        </p>
                        <Link href={isFa ? `/academy/${term.slug}` : `/en/academy/${term.slug}`} className={`rounded-2xl px-4 py-3 text-xs font-black ${locked ? "pointer-events-none bg-slate-200 text-slate-400 dark:bg-white/10" : "bg-slate-950 text-white dark:bg-white dark:text-slate-950"}`}>
                          {locked ? <Lock className="inline h-4 w-4" /> : isFa ? "ورود به ترم" : "Open term"}
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className="space-y-6">
              <section className="rounded-[34px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
                <h2 className="flex items-center gap-2 text-2xl font-black"><Award className="h-6 w-6 text-amber-500" /> {isFa ? "نشان‌های مسیر" : "Path badges"}</h2>
                <div className="mt-5 grid gap-3">
                  {terms.map((term) => {
                    const earned = termProgress[term.slug]?.completed;
                    return (
                      <div key={term.slug} className={`rounded-2xl border p-3 ${earned ? "border-amber-300/40 bg-amber-500/10" : "border-slate-200 bg-slate-50 opacity-70 dark:border-white/10 dark:bg-white/5"}`}>
                        <p className="font-black">{term.icon} {term.badge}</p>
                        <p className="mt-1 text-xs font-bold text-[color:var(--tp-muted)]">{earned ? (isFa ? "دریافت شد" : "Earned") : (isFa ? "با تکمیل این ترم دریافت می‌شود" : "Earned by completing this term")}</p>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[34px] border border-violet-300/20 bg-violet-500/10 p-6">
                <Sparkles className="h-7 w-7 text-violet-500" />
                <h2 className="mt-3 text-2xl font-black">{isFa ? "مربی هوشمند" : "AI mentor"}</h2>
                <p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                  {isFa ? "مربی بر اساس مسیر یادگیری، ضعف‌ها و ترم فعلی کمک می‌کند سؤال‌های آموزشی را روشن‌تر بفهمی؛ بدون سیگنال، بدون وعده سود." : "The mentor uses your learning path, weak areas and current term to clarify educational questions; no signals, no profit promises."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("tecpey:open-ai-mentor", { detail: { question: isFa ? "قدم بعدی من در آکادمی چیست؟" : "What is my next academy step?" } }));
                  }}
                  className="mt-4 w-full rounded-2xl bg-violet-500 px-5 py-3 text-sm font-black text-white"
                >
                  {isFa ? "پرسیدن از مربی" : "Ask mentor"}
                </button>
              </section>

              <section className="rounded-[34px] border border-cyan-300/20 bg-cyan-500/10 p-6">
                <Target className="h-7 w-7 text-cyan-500" />
                <h2 className="mt-3 text-2xl font-black">{isFa ? "تمرین تصمیم بازار" : "Market decision practice"}</h2>
                <p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                  {isFa ? "سناریوهای آموزشی کمک می‌کنند قبل از پول واقعی، رفتار خودت را در مدیریت ریسک، هیجان و تصمیم‌گیری بسنجی." : "Educational scenarios help assess your risk, emotion and decision behavior before real money."}
                </p>
                <Link href={isFa ? "/academy/simulator" : "/en/academy/simulator"} className="mt-4 inline-flex w-full justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">
                  {isFa ? "شروع تمرین" : "Start practice"}
                </Link>
              </section>

              <section className="rounded-[34px] border border-emerald-300/20 bg-emerald-500/10 p-6">
                <BadgeCheck className="h-7 w-7 text-emerald-500" />
                <h2 className="mt-3 text-2xl font-black">{isFa ? "گواهی و مسیر تخصصی" : "Certificate and specialized path"}</h2>
                <p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                  {isFa ? "پس از تکمیل مسیر پایه و ارزیابی نهایی، امکان بررسی برای برنامه‌های تخصصی آنلاین یا حضوری وجود دارد. دعوت به فرصت‌های همکاری یا سرمایه تمرینی فقط برای افراد واجد شرایط و بر اساس ارزیابی انجام می‌شود." : "After the foundation path and final assessment, learners can request review for specialized online or in-person programs. Collaboration opportunities or practice capital are invitation-based and depend on qualification."}
                </p>
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-300/20 bg-white/50 p-3 text-xs font-black text-emerald-800 dark:bg-white/5 dark:text-emerald-100">
                  <Clock3 className="h-4 w-4" /> {completedTerms === 7 ? (isFa ? "آماده ثبت درخواست بررسی" : "Ready to request review") : (isFa ? `${7 - completedTerms} ترم تا تکمیل مسیر پایه` : `${7 - completedTerms} terms to complete the foundation path`)}
                </div>
                <div className="mt-3 grid gap-2">
                  <Link href={isFa ? "/academy/certificates" : "/en/academy/certificates"} className="rounded-2xl bg-emerald-500 px-5 py-3 text-center text-sm font-black text-white">
                    {isFa ? "مدارک قابل استعلام من" : "My verified certificates"}
                  </Link>
                  <Link href={isFa ? "/academy/hall-of-fame" : "/en/academy/hall-of-fame"} className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-5 py-3 text-center text-sm font-black text-amber-800 dark:text-amber-100">
                    {isFa ? "تالار افتخار آکادمی" : "Academy Hall of Fame"}
                  </Link>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
