"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Award, BrainCircuit, CheckCircle2, Crown, Flame, GraduationCap, Loader2, Lock, Orbit, ShieldCheck, Sparkles, TrendingUp, Trophy, UserRoundCheck } from "lucide-react";
import { academyPathTerms } from "@/data/academyPath";
import { academyPathTermsEn } from "@/data/academyPathEn";
import { AcademyProfileUnavailableState } from "@/components/academy/AcademyProfileUnavailableState";
import { LivingMentorAvatar } from "@/components/mentor/LivingMentorAvatar";
import { isAcademyProfileEstablished, resolveAcademyProfileReadState } from "@/lib/academy-profile-read-state";
import { ACADEMY_CORE_TERM_COUNT } from "@/lib/academy-infinite-growth-policy";
import {
  observedMentorSignals,
  resolveLivingProfileMentorPresentation,
  type LivingProfileMentorInsight,
  type LivingProfileMentorProfile,
  type MentorEvidenceState,
} from "@/lib/living-profile-intelligence";

type Locale = "fa" | "en";
type Profile = {
  public_student_id?: string | null;
  display_name?: string | null;
  username?: string | null;
  avatar?: string | null;
  photo_url?: string | null;
  learning_goal?: string | null;
  streak_days?: number | null;
  total_xp?: number | null;
  completed_terms?: number | null;
  overall_progress?: number | null;
  identity_score?: number | null;
  retention_score?: number | null;
  community_score?: number | null;
  progress?: Record<string, unknown> | null;
};
type TermProgress = { term_number?: number; status?: string; percent?: number; score?: number };
type Achievement = {
  code: string;
  title: string;
  description: string;
  category: string;
  earned: boolean;
  earnedAt?: string | null;
};
type GovernedCredential = {
  id: string;
  code: string;
  credential_type: string;
  title_fa: string;
  title_en: string;
  description_fa: string;
  description_en: string;
  lifecycle_state: string;
  issued_at: string;
  expires_at?: string | null;
  rank?: number | null;
};
type CabinetItem = {
  key: string;
  code: string;
  title: string;
  description: string;
  category: string;
  earnedAt?: string | null;
  rank?: number | null;
};

const achievementEnglishCopy: Record<string, { title: string; description: string }> = {
  "first-lesson": { title: "First lesson", description: "You completed your first verified Academy learning step." },
  "first-quiz": { title: "First assessment", description: "Your first official Academy assessment was recorded." },
  "seven-day-streak": { title: "Seven-day consistency", description: "You returned to your learning path for seven consecutive days." },
  "first-certificate": { title: "First certificate", description: "You earned your first verifiable Academy certificate." },
  "risk-master": { title: "Risk mastery", description: "You demonstrated strong risk-management discipline in governed challenges." },
  "simulator-journalist": { title: "Trading journal discipline", description: "You recorded a practice decision with reasoning, emotion and a risk plan." },
  "community-rising": { title: "Rising contributor", description: "Your governed Academy participation earned community recognition." },
};

const fa = {
  checking: "در حال آماده‌سازی داشبورد آکادمی…",
  needLogin: "اول وارد حساب اختصاصی آکادمی شو",
  needProfile: "پروفایل آکادمی هنوز کامل نشده",
  login: "ورود آکادمی",
  signup: "ثبت‌نام آکادمی",
  createProfile: "ساخت پروفایل آکادمی",
  hello: "سلام",
  welcome: "مسیر یادگیری تو آماده است. از ترم فعلی شروع کن و پیشرفتت را مرحله‌به‌مرحله جلو ببر.",
  currentTerm: "ترم فعلی",
  startTerm: "شروع ترم",
  continueTerm: "ادامه ترم",
  locked: "قفل",
  unlocked: "باز",
  passed: "قبول‌شده",
  progress: "پیشرفت",
  streak: "تداوم یادگیری",
  achievements: "نشان‌ها",
  mentor: "منتور",
  arena: "تریدینگ آرنا",
  certs: "مدارک",
  account: "حساب",
  terms: "مسیر ترم‌ها",
  tecpeyId: "شناسه داخلی تک‌پی",
  noIndex: "این داشبورد خصوصی است و برای کاربر عمومی یا موتور جستجو نمایش داده نمی‌شود.",
};
const en = {
  checking: "Preparing your academy dashboard…",
  needLogin: "Log in to your dedicated academy account first",
  needProfile: "Your academy profile is not complete yet",
  login: "Academy login",
  signup: "Academy signup",
  createProfile: "Create academy profile",
  hello: "Hi",
  welcome: "Your learning path is ready. Start from your current term and move step by step.",
  currentTerm: "Current term",
  startTerm: "Start term",
  continueTerm: "Continue term",
  locked: "Locked",
  unlocked: "Unlocked",
  passed: "Passed",
  progress: "Progress",
  streak: "Streak",
  achievements: "Achievements",
  mentor: "Mentor",
  arena: "Trading Arena",
  certs: "Certificates",
  account: "Account",
  terms: "Term path",
  tecpeyId: "Internal TecPey ID",
  noIndex: "This dashboard is private and is not shown to public users or search engines.",
};

function numberOr(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function AcademyStudentDashboardV2({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const t = isFa ? fa : en;
  const terms = isFa ? academyPathTerms : academyPathTermsEn;
  const [loading, setLoading] = useState(true);
  const [profileStatus, setProfileStatus] = useState<
    "authenticated" | "unauthenticated" | "unavailable"
  >("unauthenticated");
  const [retryVersion, setRetryVersion] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progressRows, setProgressRows] = useState<TermProgress[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [credentials, setCredentials] = useState<GovernedCredential[]>([]);
  const [achievementsDegraded, setAchievementsDegraded] = useState(false);
  const [mentorInsights, setMentorInsights] = useState<LivingProfileMentorInsight[]>([]);
  const [mentorProfile, setMentorProfile] = useState<LivingProfileMentorProfile | null>(null);
  const [mentorAuthorityUnavailable, setMentorAuthorityUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [profileResult, progressData, achievementData, mentorData] = await Promise.all([
          fetch("/api/academy-student-profile", {
            cache: "no-store",
            credentials: "include",
          })
            .then(async (response) => ({
              response,
              data: await response.json().catch(() => null),
            }))
            .catch(() => ({ response: null, data: null })),
          fetch(`/api/academy-term-progress?locale=${locale}`, {
            cache: "no-store",
            credentials: "include",
          })
            .then(async (response) =>
              response.ok ? response.json().catch(() => null) : null,
            )
            .catch(() => null),
          fetch(`/api/achievements?locale=${locale}`, {
            cache: "no-store",
            credentials: "include",
          })
            .then(async (response) =>
              response.ok ? response.json().catch(() => null) : null,
            )
            .catch(() => null),
          fetch("/api/mentor-insights", {
            cache: "no-store",
            credentials: "include",
          })
            .then(async (response) =>
              response.ok ? response.json().catch(() => null) : null,
            )
            .catch(() => null),
        ]);
        if (!active) return;

        const profileState = resolveAcademyProfileReadState<Profile>(
          profileResult.response,
          profileResult.data,
        );
        if (profileState.status === "unavailable") {
          setProfileStatus("unavailable");
          return;
        }

        setProfileStatus(profileState.status);
        setProfile(profileState.profile);
        setProgressRows(Array.isArray(progressData?.terms) ? progressData.terms : []);
        const achievementAuthorityAvailable = achievementData?.authenticated === true && achievementData?.degraded !== true;
        setAchievements(achievementAuthorityAvailable && Array.isArray(achievementData?.achievements) ? achievementData.achievements.filter((item: Achievement) => item.earned) : []);
        setCredentials(achievementAuthorityAvailable && Array.isArray(achievementData?.credentials)
          ? achievementData.credentials.filter((item: GovernedCredential) =>
            (item.lifecycle_state === "issued" || item.lifecycle_state === "reinstated") &&
            (!item.expires_at || Date.parse(item.expires_at) > Date.now()))
          : []);
        setAchievementsDegraded(!achievementAuthorityAvailable);
        const mentorUnavailable = mentorData?.ok === true && mentorData?.storage === "unavailable";
        setMentorAuthorityUnavailable(Boolean(mentorUnavailable));
        setMentorInsights(
          mentorData?.ok === true && !mentorUnavailable && Array.isArray(mentorData?.insights)
            ? mentorData.insights
            : [],
        );
        setMentorProfile(
          mentorData?.ok === true && !mentorUnavailable && mentorData?.profile
            ? mentorData.profile as LivingProfileMentorProfile
            : null,
        );
      } catch {
        if (active) setProfileStatus("unavailable");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const reload = () => void load();
    window.addEventListener("tecpey-academy-progress-updated", reload);
    window.addEventListener("tecpey-academy-profile-ready", reload);
    window.addEventListener("focus", reload);
    return () => {
      active = false;
      window.removeEventListener("tecpey-academy-progress-updated", reload);
      window.removeEventListener("tecpey-academy-profile-ready", reload);
      window.removeEventListener("focus", reload);
    };
  }, [locale, retryVersion]);

  const passedTerms = useMemo(() => new Set(progressRows.filter((p) => p.status === "passed").map((p) => Number(p.term_number))), [progressRows]);
  const completedTerms = Math.max(numberOr(profile?.completed_terms), passedTerms.size);
  const completedCoreTerms = Math.min(ACADEMY_CORE_TERM_COUNT, completedTerms);
  const coreComplete = completedCoreTerms === ACADEMY_CORE_TERM_COUNT;
  const currentTermNumber = coreComplete ? 8 : Math.min(ACADEMY_CORE_TERM_COUNT, completedCoreTerms + 1);
  const currentTerm = terms.find((term) => term.number === currentTermNumber) || null;
  const currentTermProgressRow = progressRows.find((row) => Number(row.term_number) === currentTermNumber);
  const currentTermPercent = currentTermProgressRow?.percent == null ? null : Math.min(100, Math.max(0, numberOr(currentTermProgressRow.percent)));
  const overall = Math.min(100, Math.max(numberOr(profile?.overall_progress), Math.round((completedCoreTerms / ACADEMY_CORE_TERM_COUNT) * 100)));
  const displayName = profile?.display_name || (isFa ? "دانشجوی تک‌پی" : "TecPey learner");
  const username = profile?.username ? `@${profile.username}` : "";
  const avatar = profile?.avatar || "🎓";
  const streakDays = profile?.streak_days == null
    ? null
    : Math.max(0, numberOr(profile.streak_days));
  const termBase = isFa ? "/academy" : "/en/academy";
  const latestMentorInsight = mentorInsights[0] ?? null;
  const mentorPresentation = resolveLivingProfileMentorPresentation({
    authorityUnavailable: mentorAuthorityUnavailable,
    latestInsight: latestMentorInsight,
    coreComplete,
    streakDays,
    currentTermPercent,
  });
  const mentorSignals = observedMentorSignals(mentorProfile);
  const verifiedRecordCount = achievementsDegraded ? null : achievements.length + credentials.length;

  if (loading) {
    return <main className="min-h-screen bg-slate-950 px-4 py-16 text-white"><div className="mx-auto max-w-3xl rounded-[32px] border border-cyan-300/20 bg-white/[0.06] p-8 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" /><p className="mt-4 font-black">{t.checking}</p></div></main>;
  }

  if (profileStatus === "unavailable") {
    return (
      <AcademyProfileUnavailableState
        locale={locale}
        onRetry={() => setRetryVersion((version) => version + 1)}
      />
    );
  }

  if (profileStatus === "unauthenticated") {
    return <Gate title={t.needLogin} description={isFa ? "داشبورد، ترم‌ها، منتور و Trading Arena فقط به حساب اختصاصی آکادمی وصل هستند." : "Dashboard, terms, mentor and Trading Arena belong to your dedicated academy account."} primary={{ href: isFa ? "/academy/login" : "/en/academy/login", label: t.login }} secondary={{ href: isFa ? "/academy/signup" : "/en/academy/signup", label: t.signup }} />;
  }

  if (!isAcademyProfileEstablished(profile)) {
    return <Gate title={t.needProfile} description={isFa ? "برای شروع ترم‌ها، اول نام نمایشی، username و هویت آموزشی خودت را بساز." : "Before starting terms, create your display name, username and learning identity."} primary={{ href: isFa ? "/academy/onboarding" : "/en/academy/onboarding", label: t.createProfile }} />;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-32 pt-8 text-white sm:px-6 lg:px-8 lg:pb-12" dir={isFa ? "rtl" : "ltr"}>
      <section className="mx-auto max-w-7xl">
        <p className="mb-6 text-sm font-medium text-cyan-200">{isFa ? "آکادمی تک‌پی / مسیر من" : "TecPey Academy / My journey"}</p>
        <section className="relative mb-8 overflow-hidden rounded-[40px] border border-cyan-300/20 bg-[radial-gradient(circle_at_85%_10%,rgba(34,211,238,.16),transparent_32%),linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.025))] p-6 shadow-2xl shadow-cyan-950/20 sm:p-8" aria-labelledby="living-profile-title">
          <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden="true"><div className="absolute -end-20 -top-24 h-64 w-64 rounded-full border border-cyan-300/10"/><div className="absolute -end-5 top-4 h-36 w-36 rounded-full border border-violet-300/10"/></div>
          <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
            <div>
              <div className="flex items-center gap-4">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[26px] border border-cyan-200/25 bg-cyan-300/10 text-4xl shadow-lg shadow-cyan-950/20">{profile?.photo_url ? <Image src={profile.photo_url} alt="" width={80} height={80} unoptimized className="h-full w-full object-cover" /> : avatar}</div>
                <div className="min-w-0"><p className="text-xs font-semibold tracking-wide text-cyan-200">{isFa ? "پروفایل زنده تک‌پی" : "TECPey Living Profile"}</p><h1 id="living-profile-title" className="mt-1 break-words text-3xl font-bold leading-relaxed sm:text-4xl">{t.hello} <bdi>{displayName}</bdi></h1><p className="mt-1 text-sm text-slate-400"><bdi>{username}</bdi></p></div>
              </div>
              <p className="mt-5 max-w-3xl text-sm font-medium leading-8 text-slate-300">{isFa ? "اینجا فقط یک صفحه حساب نیست؛ نمای زنده‌ای از مسیر یادگیری، تداوم، دستاوردهای تأییدشده و قدم بعدی توست." : "This is more than an account page: it is a live view of your learning journey, consistency, verified achievements and next step."}</p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-2 text-cyan-100">{isFa ? `ترم فعلی: ${coreComplete ? "۸ · ∞" : currentTermNumber}` : `Current term: ${coreComplete ? "8 · ∞" : currentTermNumber}`}</span>
                {currentTermPercent !== null ? <span className="rounded-full border border-cyan-200/15 bg-cyan-300/[.06] px-3 py-2 text-cyan-50">{isFa ? `پیشرفت همین ترم: ${currentTermPercent.toLocaleString("fa-IR")}٪` : `Current term: ${currentTermPercent}%`}</span> : null}
                <span className="rounded-full border border-white/10 bg-white/[.045] px-3 py-2 text-slate-200">{isFa ? `پیشرفت هسته: ${overall.toLocaleString("fa-IR")}٪` : `Core progress: ${overall}%`}</span>
                {streakDays !== null ? <span className="rounded-full border border-orange-200/15 bg-orange-300/[.08] px-3 py-2 text-orange-100">{isFa ? `${streakDays.toLocaleString("fa-IR")} روز تداوم` : `${streakDays} day streak`}</span> : null}
              </div>
            </div>
            <div className="relative mx-auto grid h-56 w-56 place-items-center">
              <div className="absolute inset-0 rounded-full border border-cyan-200/15" aria-hidden="true"/><div className="absolute inset-5 rounded-full border border-dashed border-violet-200/15" aria-hidden="true"/><div className="absolute inset-10 rounded-full bg-cyan-300/[.06] blur-xl" aria-hidden="true"/>
              <div className="relative text-center"><Orbit className="mx-auto h-7 w-7 text-cyan-200" aria-hidden="true"/><p className="mt-2 text-4xl font-semibold tabular-nums"><bdi dir="ltr">{overall}%</bdi></p><p className="mt-1 text-xs font-medium text-slate-400">{isFa ? "رشد هسته آکادمی" : "Academy core growth"}</p></div>
              <span className="absolute start-0 top-1/2 rounded-full border border-white/10 bg-slate-950/90 px-3 py-1.5 text-[11px] font-semibold">{isFa ? "یادگیری" : "Learn"}</span><span className="absolute end-1 top-8 rounded-full border border-white/10 bg-slate-950/90 px-3 py-1.5 text-[11px] font-semibold">{isFa ? "تمرین" : "Practice"}</span><span className="absolute bottom-2 end-8 rounded-full border border-white/10 bg-slate-950/90 px-3 py-1.5 text-[11px] font-semibold">{isFa ? "تداوم" : "Consistency"}</span>
            </div>
          </div>
        </section>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={<GraduationCap />} label={t.currentTerm} value={coreComplete ? "8 · ∞" : `${currentTermNumber} / 7`} note={coreComplete ? (isFa ? "ترم رشد بی‌نهایت" : "Infinite Growth") : (currentTerm?.title || "Term")} />
              <Metric icon={<TrendingUp />} label={t.progress} value={`${overall}%`} note={`${completedCoreTerms} / 7 ${isFa ? "ترم هسته تکمیل‌شده" : "core terms completed"}`} />
              <Metric icon={<Flame />} label={t.streak} value={streakDays === null ? "—" : String(streakDays)} note={isFa ? "روز فعال" : "active days"} />
              <Metric icon={<Award />} label={t.achievements} value={achievementsDegraded ? "—" : `${achievements.length + credentials.length}`} note={isFa ? "نشان رسمی صادرشده" : "official issued badges"} />
            </div>

            <div className="mt-7 rounded-[32px] border border-cyan-300/25 bg-[linear-gradient(145deg,rgba(8,47,73,.55),rgba(15,23,42,.9))] p-6 shadow-xl shadow-cyan-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-cyan-200">{isFa ? "قدم بعدی تو" : "Your next step"}</p>
                  <h2 className="mt-3 text-2xl font-bold leading-relaxed">{coreComplete ? (isFa ? "ترم ۸؛ ترم رشد بی‌نهایت" : "Term 8: Infinite Growth") : currentTerm?.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-slate-300">{coreComplete ? (isFa ? "ارزیابی، برنامه‌ریزی، تمرین، بازتاب و اعتبارسنجی در چرخه‌ای شخصی‌سازی‌شده؛ بدون وعده مالی یا دسترسی ویژه خودکار." : "A personalized assess, plan, practice, reflect and verify cycle—with no automatic financial or privileged entitlement.") : currentTerm?.subtitle}</p>
                </div>
                <Link href={`${termBase}/term-${currentTermNumber}`} className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-cyan-300 px-6 py-4 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-slate-900 sm:w-auto">
                  {completedCoreTerms === 0 ? t.startTerm : t.continueTerm}<ArrowUpRight className="ms-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[32px] border border-white/10 bg-white/[0.055] p-5">
              <p className="text-xs font-black text-slate-400">{t.tecpeyId}</p>
              <p className="mt-2 break-all font-mono text-lg font-semibold text-cyan-200"><bdi>{profile?.public_student_id || "—"}</bdi></p>
              <p className="mt-3 text-xs font-bold leading-6 text-slate-400">{t.noIndex}</p>
            </div>
            <Quick href={`${termBase}/ai-guide`} icon={<LivingMentorAvatar act="idle_attentive" decorative locale={locale} size="header" />} title={t.mentor} text={isFa ? "گفت‌وگو درباره مسیر یادگیری و تمرین بعدی" : "Talk through your learning journey and next practice"} />
            <Quick href={`${termBase}/trading-arena`} icon={<TrendingUp />} title={t.arena} text={isFa ? "تمرین تصمیم‌گیری با سرمایه مجازی" : "Practice decisions with virtual capital"} />
            <Quick href={isFa ? "/academy/certificates" : "/en/academy/certificates"} icon={<ShieldCheck />} title={t.certs} text={isFa ? "مشاهده مدارک قابل استعلام" : "View verifiable certificates"} />
            <Quick href={`${termBase}/account#pro`} icon={<Crown />} title="TecPey Pro" text={isFa ? "پیش‌نمایش قابلیت‌های هوشمند پیشرفته؛ خرید هنوز فعال نیست" : "Preview advanced intelligence capabilities; purchasing is not active yet"} />
          </aside>
        </div>

        <section className="mt-8 grid gap-4 xl:grid-cols-[1.1fr_.9fr]" aria-label={isFa ? "بینش منتور و DNA یادگیری" : "Mentor insight and learning DNA"}>
          <article className="relative overflow-hidden rounded-[34px] border border-violet-300/20 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.15),transparent_45%),rgba(255,255,255,.035)] p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <LivingMentorAvatar act={mentorPresentation.act} locale={locale} size="stage" decorative />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-violet-200">{isFa ? "بینش منتور · مبتنی بر شواهد" : "Mentor insight · evidence grounded"}</p>
                <h2 className="mt-2 text-xl font-bold leading-8">
                  {mentorPresentation.mode === "authority_unavailable"
                    ? (isFa ? "مرجع بینش منتور موقتاً در دسترس نیست" : "Mentor insight authority is temporarily unavailable")
                    : mentorPresentation.mode === "evidence_insight"
                      ? (isFa ? "آخرین بینش ثبت‌شده برای مسیر تو" : "Your latest recorded learning insight")
                      : mentorPresentation.mode === "core_complete"
                        ? (isFa ? "هفت ترم هسته را پشت سر گذاشتی؛ حالا رشد پیوسته مهم است" : "You completed the seven core terms; continuous growth comes next")
                        : mentorPresentation.mode === "consistency"
                          ? (isFa ? "تداوم تو قابل مشاهده است؛ قدم بعدی را کوچک و مشخص نگه دار" : "Your consistency is visible; keep the next step small and specific")
                          : mentorPresentation.mode === "continue_term"
                            ? (isFa ? "مسیر فعلی را ادامه بده؛ هنوز برای نتیجه‌گیری عجله نمی‌کنیم" : "Continue the current path; there is no need to over-interpret early evidence")
                            : (isFa ? "اولین شواهد مسیرت را بساز" : "Build the first evidence in your learning journey")}
                </h2>
                <p className="mt-3 text-sm font-medium leading-7 text-slate-300">
                  {mentorPresentation.insight?.content
                    || (mentorPresentation.mode === "authority_unavailable"
                      ? (isFa ? "تا بازگشت مرجع داده، تک‌پی هیچ پروفایل یا توصیه شخصی ساختگی نمایش نمی‌دهد." : "Until the authority recovers, TecPey does not invent a personal profile or recommendation.")
                      : (isFa ? "منتور فقط از پیشرفت ثبت‌شده، ارزیابی معتبر و فعالیت‌های مجاز برای شخصی‌سازی استفاده می‌کند؛ یادداشت یا پاسخ خوداظهاری به‌تنهایی «تسلط» نیست." : "Mentor personalizes only from recorded progress, governed assessments and permitted activity; a private note or self-report alone is not mastery."))}
                </p>
                {mentorPresentation.insight?.generatedAt ? <p className="mt-3 text-xs font-medium text-slate-500">{isFa ? "به‌روزرسانی بینش: " : "Insight updated: "}<time dateTime={mentorPresentation.insight.generatedAt}>{formatProfileTime(mentorPresentation.insight.generatedAt, locale)}</time></p> : null}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`${termBase}/ai-guide`} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-violet-200/25 bg-violet-300/10 px-5 py-3 text-sm font-semibold text-violet-100 transition-colors motion-reduce:transition-none hover:bg-violet-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{isFa ? "گفت‌وگو با منتور" : "Talk to Mentor"}<ArrowUpRight className="h-4 w-4" aria-hidden="true"/></Link>
              <Link href={`${termBase}/account#mentor-privacy`} className="inline-flex min-h-11 items-center rounded-2xl px-4 py-3 text-sm font-semibold text-slate-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{isFa ? "کنترل حریم خصوصی منتور" : "Mentor privacy controls"}</Link>
            </div>
          </article>

          <article className="rounded-[34px] border border-white/10 bg-white/[.035] p-6 sm:p-7" aria-labelledby="learning-dna-title">
            <div className="flex items-center gap-3 text-cyan-200"><BrainCircuit className="h-5 w-5" aria-hidden="true"/><p className="text-xs font-semibold">{isFa ? "Learning DNA" : "Learning DNA"}</p></div>
            <h2 id="learning-dna-title" className="mt-2 text-xl font-bold leading-8">{isFa ? "تصویری که فقط با شواهد کافی کامل می‌شود" : "A profile that only fills in when evidence is sufficient"}</h2>
            {mentorAuthorityUnavailable ? (
              <p role="status" className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm font-medium leading-7 text-amber-100">{isFa ? "مرجع Mentor Profile موقتاً در دسترس نیست؛ داده قبلی به‌عنوان حقیقت نمایش داده نمی‌شود." : "Mentor Profile authority is temporarily unavailable; stale values are not presented as facts."}</p>
            ) : mentorProfile ? (
              <>
                {mentorProfile.primaryGoal ? <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4"><p className="text-[11px] font-semibold text-slate-500">{isFa ? "هدف ثبت‌شده توسط تو" : "Your recorded goal"}</p><p className="mt-2 text-sm font-semibold leading-7 text-slate-200">{mentorProfile.primaryGoal}</p></div> : null}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {mentorSignals.length ? mentorSignals.map((signal) => <div key={signal.key} className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[.055] p-3"><p className="text-[11px] font-semibold text-emerald-200">{mentorSignalLabel(signal.key, isFa)}</p><p className="mt-1 text-sm font-bold text-white"><bdi>{mentorSignalValue(signal.key, signal.value, isFa)}</bdi></p></div>) : <p className="sm:col-span-2 rounded-2xl border border-dashed border-white/15 p-4 text-sm font-medium leading-7 text-slate-400">{isFa ? "هنوز هیچ ویژگی رفتاری با سطح «مشاهده‌شده» نداریم؛ این یک نبودِ داده است، نه ضعف کاربر." : "No behavioural attribute has reached observed evidence yet; this is missing evidence, not a learner weakness."}</p>}
                </div>
                {(mentorProfile.strongAreas.length || mentorProfile.weakAreas.length) ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <EvidenceList title={isFa ? "نقاط قوت ثبت‌شده" : "Recorded strengths"} items={mentorProfile.strongAreas} empty={isFa ? "هنوز شواهد کافی نیست" : "Not enough evidence yet"} />
                  <EvidenceList title={isFa ? "نیازمند تمرین بیشتر" : "Needs more practice"} items={mentorProfile.weakAreas} empty={isFa ? "هنوز شواهد کافی نیست" : "Not enough evidence yet"} />
                </div> : null}
                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-3">
                  <EvidenceState label={isFa ? "سطح" : "Level"} state={mentorProfile.levelEvidenceState} isFa={isFa} />
                  <EvidenceState label={isFa ? "ریسک" : "Risk"} state={mentorProfile.riskEvidenceState} isFa={isFa} />
                  <EvidenceState label={isFa ? "انضباط" : "Discipline"} state={mentorProfile.disciplineEvidenceState} isFa={isFa} />
                </div>
                {mentorProfile.updatedAt ? <p className="mt-4 text-xs text-slate-500">{isFa ? "آخرین بازسازی پروفایل: " : "Profile last recomputed: "}<time dateTime={mentorProfile.updatedAt}>{formatProfileTime(mentorProfile.updatedAt, locale)}</time></p> : null}
              </>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-white/15 p-4 text-sm font-medium leading-7 text-slate-400">{isFa ? "با تکمیل درس‌ها، ارزیابی‌ها و تمرین‌های معتبر، DNA یادگیری به‌تدریج شکل می‌گیرد." : "Learning DNA gradually forms from completed lessons, governed assessments and valid practice."}</p>
            )}
          </article>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={isFa ? "سیگنال‌های رشد معتبر" : "Governed growth signals"}>
          <GrowthSignal label={isFa ? "هسته آکادمی" : "Academy core"} value={`${overall}%`} note={isFa ? "از پیشرفت ترم‌های ثبت‌شده" : "From recorded term progress"} />
          <GrowthSignal label={isFa ? "ترم جاری" : "Current term"} value={currentTermPercent === null ? "—" : `${currentTermPercent}%`} note={currentTermPercent === null ? (isFa ? "هنوز داده پیشرفت ثبت نشده" : "No recorded progress yet") : (isFa ? "پیشرفت همین ترم" : "Progress in this term")} />
          <GrowthSignal label={isFa ? "تداوم" : "Consistency"} value={streakDays === null ? "—" : (isFa ? `${streakDays.toLocaleString("fa-IR")} روز` : `${streakDays} days`)} note={isFa ? "روزهای فعال ثبت‌شده" : "Recorded active days"} />
          <GrowthSignal label={isFa ? "سابقه تأییدشده" : "Verified record"} value={verifiedRecordCount === null ? "—" : String(verifiedRecordCount)} note={verifiedRecordCount === null ? (isFa ? "مرجع صدور در دسترس نیست" : "Issuing authority unavailable") : (isFa ? "مدرک و نشان رسمی" : "Official credentials and achievements")} />
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2" aria-label={isFa ? "هوشمندی تمرین و حریم خصوصی" : "Practice intelligence and privacy"}>
          <article className="rounded-[30px] border border-cyan-300/15 bg-[linear-gradient(145deg,rgba(8,47,73,.38),rgba(255,255,255,.025))] p-6">
            <div className="flex items-center gap-3 text-cyan-200"><TrendingUp className="h-5 w-5" aria-hidden="true"/><p className="text-xs font-semibold">{isFa ? "Arena Practice Intelligence" : "Arena Practice Intelligence"}</p></div>
            <h2 className="mt-2 text-xl font-bold">{isFa ? "تمرین را به شواهد تصمیم‌گیری وصل کن" : "Connect practice to decision evidence"}</h2>
            {mentorProfile?.riskEvidenceState === "observed" || mentorProfile?.disciplineEvidenceState === "observed" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <p className="text-[11px] font-semibold text-slate-500">{isFa ? "پروفایل ریسک آموزشی" : "Learning risk profile"}</p>
                  <p className="mt-2 text-sm font-bold text-white">{mentorProfile?.riskEvidenceState === "observed" && mentorProfile.riskProfile ? mentorSignalValue("risk", mentorProfile.riskProfile, isFa) : (isFa ? "شواهد ناکافی" : "Insufficient evidence")}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <p className="text-[11px] font-semibold text-slate-500">{isFa ? "انضباط تمرین" : "Practice discipline"}</p>
                  <p className="mt-2 text-sm font-bold text-white">{mentorProfile?.disciplineEvidenceState === "observed" && mentorProfile.disciplineScore !== null ? mentorSignalValue("discipline", mentorProfile.disciplineScore, isFa) : (isFa ? "شواهد ناکافی" : "Insufficient evidence")}</p>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-white/15 p-4 text-sm font-medium leading-7 text-slate-400">{isFa ? "هنوز نمونه کافی از تمرین معتبر آرنا برای نمایش الگوی ریسک یا انضباط نداریم. تک‌پی از چند معامله محدود نتیجه‌گیری شخصیتی نمی‌کند." : "There are not enough governed Arena practice samples to show a risk or discipline pattern yet. TecPey does not infer a learner trait from a few trades."}</p>
            )}
            <p className="mt-4 text-xs font-medium leading-6 text-slate-500">{isFa ? "این داده برای coaching آموزشی است؛ وضعیت ریسک به معنی سیگنال بازار، توصیه سرمایه‌گذاری یا پیش‌بینی قیمت نیست." : "This evidence is for learning coaching; a risk profile is not a market signal, investment recommendation or price forecast."}</p>
            <Link href={`${termBase}/trading-arena`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-cyan-200 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{isFa ? "تمرین در آرنا" : "Practice in Arena"}<ArrowUpRight className="h-4 w-4" aria-hidden="true"/></Link>
          </article>

          <article className="rounded-[30px] border border-violet-300/15 bg-[linear-gradient(145deg,rgba(76,29,149,.2),rgba(255,255,255,.025))] p-6">
            <div className="flex items-center gap-3 text-violet-200"><Crown className="h-5 w-5" aria-hidden="true"/><p className="text-xs font-semibold">{isFa ? "Research & Pro boundary" : "Research & Pro boundary"}</p></div>
            <h2 className="mt-2 text-xl font-bold">{isFa ? "هوش بیشتر، فقط با مجوز واقعی" : "More intelligence, only with real authority"}</h2>
            <p className="mt-3 text-sm font-medium leading-7 text-slate-300">{isFa ? "پژوهش عمومی چندمنبعی و هوشمندی خبر/X در معماری تک‌پی وجود دارد، اما اجرای Premium تا entitlement معتبر سمت سرور قفل می‌ماند. پروفایل یا مرورگر نمی‌تواند این مرز را دور بزند." : "Multi-source public research and news/X intelligence exist in TecPey's architecture, but premium execution stays locked until a valid server-side entitlement exists. Profile or browser state cannot bypass that boundary."}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`${termBase}/market-intelligence`} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-violet-200 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{isFa ? "Market Intelligence" : "Market Intelligence"}<ArrowUpRight className="h-4 w-4" aria-hidden="true"/></Link>
              <Link href={`${termBase}/account#pro`} className="inline-flex min-h-11 items-center rounded-xl px-1 text-sm font-semibold text-slate-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{isFa ? "نقشه قابلیت‌های Pro" : "Pro capability map"}</Link>
            </div>
          </article>
        </section>

                <MedalCabinet locale={locale} achievements={achievements} credentials={credentials} degraded={achievementsDegraded} />

        <section className="mt-10 border-t border-white/10 pt-8" aria-labelledby="academy-term-path-title">
          <h2 id="academy-term-path-title" className="text-2xl font-bold">{t.terms}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {terms.map((term) => {
              const passed = passedTerms.has(term.number);
              const unlocked = term.number === 1 || passedTerms.has(term.number - 1);
              return (
                <Link key={term.slug} href={`${termBase}/term-${term.number}`} className={`rounded-3xl border p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${passed ? "border-emerald-300/30 bg-emerald-400/10" : unlocked ? "border-cyan-300/25 bg-slate-900 hover:border-cyan-200" : "border-white/10 bg-slate-950 hover:border-slate-500"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold">{isFa ? "ترم" : "Term"} {term.number.toLocaleString(isFa ? "fa-IR" : "en-US")}</span>
                    {passed ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : unlocked ? <Sparkles className="h-5 w-5 text-cyan-300" /> : <Lock className="h-5 w-5 text-slate-500" />}
                  </div>
                  <h3 className="mt-4 text-lg font-black leading-8">{term.title}</h3>
                  <p className="mt-2 text-xs font-medium leading-6 text-slate-300">{passed ? t.passed : unlocked ? t.unlocked : isFa ? `پس از قبولی ترم ${(term.number - 1).toLocaleString("fa-IR")} باز می‌شود` : `Unlocks after passing term ${term.number - 1}`}</p>
                </Link>
              );
            })}
            <Link
              href={`${termBase}/term-8`}
              className={`rounded-[28px] border p-5 transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${coreComplete ? "border-violet-300/30 bg-gradient-to-br from-violet-400/15 to-cyan-400/10 hover:-translate-y-1 motion-reduce:hover:translate-y-0" : "border-white/10 bg-white/[0.035] opacity-70"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black">
                  {isFa ? "ترم ۸ · ∞" : "Term 8 · ∞"}
                </span>
                {coreComplete ? <Sparkles className="h-5 w-5 text-violet-300" /> : <Lock className="h-5 w-5 text-slate-500" />}
              </div>
              <h3 className="mt-4 text-lg font-black leading-8">
                {isFa ? "ترم رشد بی‌نهایت" : "Infinite Growth"}
              </h3>
              <p className="mt-2 text-xs font-bold leading-6 text-slate-300">
                {coreComplete
                  ? (isFa ? "چرخه شخصی تو آماده است" : "Your personal cycle is ready")
                  : (isFa ? "پس از قبولی هر ۷ ترم هسته باز می‌شود" : "Unlocks after passing all 7 core terms")}
              </p>
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}

function MedalCabinet({ locale, achievements, credentials, degraded }: {
  locale: Locale;
  achievements: Achievement[];
  credentials: GovernedCredential[];
  degraded: boolean;
}) {
  const isFa = locale === "fa";
  const href = isFa ? "/academy/achievements" : "/en/academy/achievements";
  const items: CabinetItem[] = [
    ...credentials.map((item) => ({
      key: `credential:${item.id}`,
      code: item.code,
      title: isFa ? item.title_fa : item.title_en,
      description: isFa ? item.description_fa : item.description_en,
      category: item.credential_type,
      earnedAt: item.issued_at,
      rank: item.rank,
    })),
    ...achievements.map((item) => ({ ...item, key: `achievement:${item.code}` })),
  ];
  const featured = items
    .sort((left, right) => new Date(right.earnedAt || 0).getTime() - new Date(left.earnedAt || 0).getTime())
    .slice(0, 4);
  return (
    <section className="mt-8 rounded-[38px] border border-amber-300/20 bg-[linear-gradient(145deg,rgba(251,191,36,.1),rgba(255,255,255,.035))] p-6 lg:p-8" aria-labelledby="academy-medal-cabinet-title">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 text-amber-200"><Trophy className="h-6 w-6" aria-hidden="true" /><p className="text-xs font-semibold">{isFa ? "دستاوردهای تأییدشده" : "Verified achievements"}</p></div>
          <h2 id="academy-medal-cabinet-title" className="mt-3 text-2xl font-black sm:text-3xl">{isFa ? "ویترین مدارک و مدال‌های من" : "My credentials and medals"}</h2>
          <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{isFa ? "فقط افتخاراتی نمایش داده می‌شوند که از شواهد رسمی آکادمی، لیگ یا مسابقه صادر شده باشند." : "Only honors issued from official Academy, league or competition evidence appear here."}</p>
        </div>
        <Link href={href} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-amber-200/30 bg-amber-300/10 px-5 py-3 text-sm font-black text-amber-100 transition-[transform,border-color,background-color] duration-150 ease-out hover:border-amber-200/60 hover:bg-amber-300/15 active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />{isFa ? "مشاهده سابقه کامل" : "View full record"}
        </Link>
      </div>
      {degraded ? (
        <p role="status" className="mt-5 rounded-2xl border border-amber-300/25 bg-slate-950/45 p-4 text-sm font-bold leading-7 text-amber-100">{isFa ? "مرجع صدور موقتاً در دسترس نیست؛ برای جلوگیری از نمایش سابقه نادرست، مدال‌ها پنهان شده‌اند." : "The issuing authority is temporarily unavailable; medals are hidden to avoid showing an inaccurate record."}</p>
      ) : featured.length ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {featured.map((item) => {
            const competitive = /league|competition|tournament|arena/i.test(`${item.category}:${item.code}`);
            const Icon = competitive ? Trophy : Award;
            const localized = !isFa ? achievementEnglishCopy[item.code] : null;
            return <article key={item.key} className="rounded-[26px] border border-white/10 bg-slate-950/45 p-4">
              <div className="flex items-center justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200/20 bg-amber-300/10 text-amber-200"><Icon className="h-5 w-5" aria-hidden="true" /></span><span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-black text-slate-300">{competitive ? (isFa ? "رقابتی" : "Competition") : (isFa ? "آموزشی" : "Learning")}</span></div>
              <h3 className="mt-4 text-base font-black leading-7">{localized?.title || item.title}</h3>
              <p className="mt-2 line-clamp-2 text-xs font-bold leading-6 text-slate-400">{localized?.description || item.description}</p>
              {item.rank ? <p className="mt-3 text-xs font-black text-amber-200">{isFa ? `رتبه ${item.rank}` : `Rank ${item.rank}`}</p> : null}
            </article>;
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-[26px] border border-dashed border-white/15 bg-slate-950/35 p-6 text-center"><Award className="mx-auto h-7 w-7 text-slate-500" aria-hidden="true" /><p className="mt-3 text-sm font-black text-slate-300">{isFa ? "هنوز مدال رسمی صادر نشده؛ اولین هدف پیشنهادی در مرکز دستاوردها آماده است." : "No official medal has been issued yet; your first suggested goal is ready in the Achievement Center."}</p></div>
      )}
    </section>
  );
}

function formatProfileTime(value: string, locale: Locale) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return locale === "fa" ? "نامشخص" : "Unknown";
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

function mentorSignalLabel(key: "level" | "risk" | "confidence" | "discipline" | "learningStyle", isFa: boolean) {
  const labels = {
    level: isFa ? "سطح یادگیری" : "Learning level",
    risk: isFa ? "پروفایل ریسک آموزشی" : "Learning risk profile",
    confidence: isFa ? "اعتماد در تصمیم" : "Decision confidence",
    discipline: isFa ? "انضباط تمرین" : "Practice discipline",
    learningStyle: isFa ? "سبک یادگیری" : "Learning style",
  };
  return labels[key];
}

function mentorSignalValue(key: "level" | "risk" | "confidence" | "discipline" | "learningStyle", value: string | number, isFa: boolean) {
  if (typeof value === "number") return isFa ? `${value.toLocaleString("fa-IR")} از ۱۰۰` : `${value}/100`;
  if (!isFa) return value;
  const localized: Record<string, string> = {
    beginner: "مقدماتی",
    intermediate: "میانی",
    advanced: "پیشرفته",
    low: "کم",
    medium: "متوسط",
    high: "بالا",
    mixed: "ترکیبی",
  };
  return localized[value] || value;
}

function evidenceStateCopy(state: MentorEvidenceState, isFa: boolean) {
  if (state === "observed") return isFa ? "مشاهده‌شده" : "Observed";
  if (state === "provisional") return isFa ? "در حال شکل‌گیری" : "Provisional";
  return isFa ? "شواهد ناکافی" : "Insufficient evidence";
}

function EvidenceState({ label, state, isFa }: { label: string; state: MentorEvidenceState; isFa: boolean }) {
  return <div className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2"><span>{label}</span><p className="mt-1 font-semibold text-slate-200">{evidenceStateCopy(state, isFa)}</p></div>;
}

function EvidenceList({ title, items, empty }: { title: string; items: readonly string[]; empty: string }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4"><p className="text-[11px] font-semibold text-slate-500">{title}</p>{items.length ? <ul className="mt-2 space-y-1 text-sm font-medium leading-6 text-slate-200">{items.slice(0, 3).map((item) => <li key={item} className="before:me-2 before:text-cyan-300 before:content-['•']">{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">{empty}</p>}</div>;
}

function GrowthSignal({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="rounded-[24px] border border-white/10 bg-white/[.03] p-4"><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="mt-2 text-xl font-bold tabular-nums text-white"><bdi dir="ltr">{value}</bdi></p><p className="mt-1 text-xs leading-5 text-slate-400">{note}</p></article>;
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="min-w-0 border-s border-white/15 ps-4"><div className="flex items-center gap-2 text-cyan-200 [&_svg]:h-4 [&_svg]:w-4">{icon}<span className="text-xs font-medium text-slate-300">{label}</span></div><p className="mt-3 text-2xl font-semibold tabular-nums"><bdi dir="ltr">{value}</bdi></p><p className="mt-2 text-xs leading-6 text-slate-400">{note}</p></div>;
}
function Quick({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return <Link href={href} className="block rounded-[30px] border border-white/10 bg-white/[0.055] p-5 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1 [@media(hover:hover)_and_(pointer:fine)]:hover:border-cyan-300/30"><div className="flex items-center gap-3 text-cyan-200 [&_svg]:h-5 [&_svg]:w-5">{icon}<h3 className="font-black text-white">{title}</h3></div><p className="mt-3 text-sm font-bold leading-7 text-slate-300">{text}</p></Link>;
}
function Gate({ title, description, primary, secondary }: { title: string; description: string; primary: { href: string; label: string }; secondary?: { href: string; label: string } }) {
  return <main className="min-h-screen bg-slate-950 px-4 py-16 text-white"><section className="mx-auto max-w-3xl rounded-[38px] border border-cyan-300/20 bg-white/[0.06] p-8 text-center"><UserRoundCheck className="mx-auto h-12 w-12 text-cyan-200" /><h1 className="mt-4 text-3xl font-black">{title}</h1><p className="mt-4 text-sm font-bold leading-8 text-slate-300">{description}</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><Link href={primary.href} className="rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white">{primary.label}</Link>{secondary ? <Link href={secondary.href} className="rounded-2xl border border-cyan-300/25 bg-white/5 px-6 py-4 text-sm font-black text-cyan-100">{secondary.label}</Link> : null}</div></section></main>;
}
