"use client";

import Link from "next/link";
import {
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  Flame,
  GraduationCap,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trophy,
  UserRoundCheck,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAcademyPathProgress } from "@/hooks/useAcademyPathProgress";

type Locale = "fa" | "en";
type CloudProfile = {
  public_student_id?: string;
  display_name?: string;
  username?: string;
  avatar?: string;
  identity_score?: number;
  retention_score?: number;
};

const terms = [
  { slug: "term-1", fa: "ورود امن به رمزارز", en: "Safe crypto entry", icon: "🧭" },
  { slug: "term-2", fa: "امنیت دارایی و کیف پول", en: "Wallet and asset security", icon: "🛡️" },
  { slug: "term-3", fa: "صرافی، سفارش و بازار اسپات", en: "Spot exchange and orders", icon: "🔁" },
  { slug: "term-4", fa: "بررسی پروژه و اعتبارسنجی", en: "Project research", icon: "🔎" },
  { slug: "term-5", fa: "نمودارخوانی و تحلیل پایه", en: "Chart reading", icon: "📈" },
  { slug: "term-6", fa: "مدیریت سرمایه و ریسک", en: "Capital and risk management", icon: "⚖️" },
  { slug: "term-7", fa: "ارزیابی نهایی و آمادگی", en: "Final readiness", icon: "🧠" },
] as const;

function levelFromXp(xp: number) {
  if (xp >= 650) return { level: 7, fa: "آماده مسیر تخصصی", en: "Specialized Path Ready" };
  if (xp >= 500) return { level: 6, fa: "یادگیرنده مسئول", en: "Responsible Learner" };
  if (xp >= 360) return { level: 5, fa: "مدیریت ریسک پایه", en: "Risk-Aware Learner" };
  if (xp >= 240) return { level: 4, fa: "نمودارخوان پایه", en: "Chart Apprentice" };
  if (xp >= 140) return { level: 3, fa: "امنیت‌محور", en: "Security Aware" };
  if (xp >= 60) return { level: 2, fa: "کاوشگر رمزارز", en: "Crypto Explorer" };
  return { level: 1, fa: "شروع مسیر", en: "Getting Started" };
}

export function AcademyStudentDashboard({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const {
    loaded,
    error,
    refresh,
    termProgress,
    totalXp,
    streak,
    earnedBadges,
  } = useAcademyPathProgress(locale);
  const [profile, setProfile] = useState<CloudProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/academy-student-profile", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error ?? `profile_load_failed:${response.status}`);
        return body?.profile as CloudProfile | null;
      })
      .then((nextProfile) => {
        if (!active) return;
        setProfile(nextProfile);
        setProfileStatus(nextProfile?.display_name ? "ready" : "missing");
      })
      .catch(() => {
        if (active) setProfileStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const completedTerms = useMemo(
    () => terms.filter((term) => termProgress[term.slug]?.completed).length,
    [termProgress],
  );
  const overallProgress = useMemo(
    () => Math.round(
      terms.reduce((sum, term) => sum + (termProgress[term.slug]?.progress ?? 0), 0) / terms.length,
    ),
    [termProgress],
  );
  const nextTerm = terms.find((term) => !termProgress[term.slug]?.completed);
  const level = levelFromXp(totalXp);
  const displayName = profile?.display_name || (isFa ? "دانشجوی تک‌پی" : "TecPey learner");
  const username = profile?.username ? `@${profile.username}` : "";
  const avatar = profile?.avatar || "🎓";
  const publicId = profile?.public_student_id || (isFa ? "پس از تکمیل حساب صادر می‌شود" : "Issued after account completion");
  const identityScore = Math.max(0, Math.min(100, Number(profile?.identity_score ?? 0)));
  const retentionScore = Math.max(0, Math.min(100, Number(profile?.retention_score ?? 0)));

  if (profileStatus === "missing") {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-12 text-white" dir={isFa ? "rtl" : "ltr"}>
        <section className="mx-auto max-w-3xl rounded-[38px] border border-amber-300/25 bg-amber-400/10 p-8 text-center">
          <UserRoundCheck className="mx-auto h-12 w-12 text-amber-200" />
          <h1 className="mt-4 text-3xl font-black">
            {isFa ? "برای داشبورد، اول پروفایل آکادمی را بساز" : "Create your Academy profile first"}
          </h1>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-200">
            {isFa
              ? "داشبورد، منتور، آزمون‌ها و مدارک باید به هویت آموزشی واحد شما متصل باشند."
              : "Dashboard, mentor, assessments, and certificates must be connected to one learning identity."}
          </p>
          <Link href={isFa ? "/academy/onboarding" : "/en/academy/onboarding"} className="mt-6 inline-flex rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-black text-white">
            {isFa ? "ساخت پروفایل آکادمی" : "Create Academy profile"}
          </Link>
        </section>
      </main>
    );
  }

  const unavailable = profileStatus === "error" || Boolean(error);
  const recordStatus = unavailable
    ? isFa ? "بازیابی پرونده کامل نشد؛ هیچ پیشرفت محلی جایگزین داده سرور نشده است." : "The record could not be fully loaded; no local progress replaced server data."
    : !loaded || profileStatus === "loading"
      ? isFa ? "در حال بازیابی پرونده رسمی از سرور تک‌پی…" : "Loading the official TecPey record…"
      : isFa ? "این نمایش فقط از ارزیابی‌ها و پاداش‌های ثبت‌شده در سرور ساخته شده است." : "This view is built only from server-recorded assessments and rewards.";

  return (
    <main className="min-h-screen bg-[color:var(--tp-bg)] text-[color:var(--tp-text)]" dir={isFa ? "rtl" : "ltr"}>
      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <section className="overflow-hidden rounded-[36px] border border-cyan-300/15 bg-slate-950 p-6 text-white shadow-[0_30px_90px_rgba(34,211,238,.14)] lg:p-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
                  <ShieldCheck className="h-4 w-4" />
                  {isFa ? "پرونده آموزشی سرورمحور" : "Server-authoritative learning record"}
                </div>
                <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">
                  {isFa ? `سلام ${displayName} 👋` : `Hi ${displayName} 👋`}
                </h1>
                <div className="mt-4 inline-flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.055] px-4 py-3">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-400/15 text-2xl">{avatar}</span>
                  <div>
                    <p className="text-sm font-black text-white">{displayName}</p>
                    {username ? <p className="text-xs font-bold text-cyan-100/80">{username}</p> : null}
                  </div>
                </div>
                <p className={`mt-5 max-w-3xl rounded-2xl border p-4 text-sm font-bold leading-7 ${
                  unavailable
                    ? "border-red-300/20 bg-red-400/10 text-red-100"
                    : "border-white/10 bg-white/[0.05] text-slate-300"
                }`}>
                  {recordStatus}
                </p>
                {unavailable && (
                  <button type="button" onClick={() => void refresh()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-red-300/30 bg-red-300/10 px-4 py-2 text-xs font-black text-red-100">
                    <RefreshCw className="h-4 w-4" /> {isFa ? "تلاش دوباره" : "Retry"}
                  </button>
                )}
              </div>

              <div className="rounded-[30px] border border-amber-300/25 bg-amber-400/10 p-5 text-center">
                <Trophy className="mx-auto h-10 w-10 text-amber-300" />
                <p className="mt-3 text-xs font-black text-amber-100/80">{isFa ? "سطح رسمی" : "Official level"}</p>
                <p className="mt-1 text-2xl font-black">{isFa ? level.fa : level.en}</p>
                <p className="mt-2 rounded-full bg-slate-950/50 px-3 py-2 text-sm font-black text-amber-200">Level {level.level}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [isFa ? "پیشرفت رسمی" : "Official progress", `${overallProgress}%`, BookOpenCheck],
                [isFa ? "XP رسمی" : "Official XP", `${totalXp}`, Zap],
                [isFa ? "ترم‌های قبول‌شده" : "Passed terms", `${completedTerms}/7`, CheckCircle2],
                [isFa ? "استمرار رسمی" : "Official streak", `${streak} ${isFa ? "روز" : "days"}`, Flame],
              ].map(([label, value, Icon]) => (
                <div key={String(label)} className="rounded-[26px] border border-white/10 bg-white/[0.055] p-5">
                  <Icon className="h-6 w-6 text-cyan-300" />
                  <p className="mt-3 text-xs font-black text-slate-400">{String(label)}</p>
                  <p className="mt-1 text-3xl font-black text-white">{String(value)}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-cyan-400 transition-all duration-700" style={{ width: `${overallProgress}%` }} />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                ["TecPey ID", publicId, UserRoundCheck],
                [isFa ? "امتیاز هویت" : "Identity score", `${identityScore}/100`, ShieldCheck],
                [isFa ? "بازگشت‌پذیری" : "Retention score", `${retentionScore}/100`, GraduationCap],
              ].map(([label, value, Icon]) => (
                <div key={String(label)} className="rounded-[24px] border border-cyan-300/15 bg-cyan-400/10 p-5">
                  <Icon className="h-6 w-6 text-cyan-200" />
                  <p className="mt-3 text-xs font-black text-cyan-100/80">{String(label)}</p>
                  <p className="mt-1 break-words text-xl font-black text-white">{String(value)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="rounded-[34px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">{isFa ? "قدم بعدی" : "Next step"}</p>
                  <h2 className="mt-2 text-2xl font-black">
                    {nextTerm ? (isFa ? nextTerm.fa : nextTerm.en) : (isFa ? "مسیر پایه کامل شد" : "Foundation path completed")}
                  </h2>
                </div>
                <Link
                  href={nextTerm
                    ? (isFa ? `/academy/${nextTerm.slug}` : `/en/academy/${nextTerm.slug}`)
                    : (isFa ? "/academy/specialized-program" : "/en/academy/specialized-program")}
                  className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white"
                >
                  {nextTerm ? (isFa ? "ادامه مسیر" : "Continue") : (isFa ? "بررسی مسیر تخصصی" : "Specialized review")}
                </Link>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {terms.map((term, index) => {
                  const item = termProgress[term.slug];
                  const locked = item?.locked ?? index > 0;
                  return (
                    <div key={term.slug} className={`rounded-2xl border p-4 ${
                      locked
                        ? "border-slate-200 bg-slate-100/70 opacity-65 dark:border-white/10 dark:bg-white/[0.03]"
                        : "border-cyan-300/25 bg-cyan-500/10"
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-2xl">{term.icon}</span>
                        {locked ? <Lock className="h-4 w-4" /> : item?.completed ? <BadgeCheck className="h-5 w-5 text-emerald-500" /> : <span className="text-xs font-black">{item?.progress ?? 0}%</span>}
                      </div>
                      <p className="mt-3 text-sm font-black">{isFa ? term.fa : term.en}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <aside className="rounded-[34px] border border-violet-300/20 bg-violet-500/10 p-6">
              <BadgeCheck className="h-7 w-7 text-violet-500" />
              <h2 className="mt-3 text-2xl font-black">{isFa ? "نشان‌های ثبت‌شده" : "Recorded badges"}</h2>
              <p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                {isFa
                  ? "فقط نشان‌هایی نمایش داده می‌شوند که از دفتر پاداش سرور صادر شده‌اند."
                  : "Only badges issued by the server reward ledger are shown."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {earnedBadges.length > 0
                  ? earnedBadges.map((badge) => (
                    <span key={badge} className="rounded-full border border-violet-300/30 bg-white/60 px-3 py-2 text-xs font-black dark:bg-white/5">{badge}</span>
                  ))
                  : <span className="text-xs font-bold text-[color:var(--tp-muted)]">{isFa ? "هنوز نشانی صادر نشده است." : "No badge has been issued yet."}</span>}
              </div>
            </aside>
          </section>
        </div>
      </section>
    </main>
  );
}
