"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Award, CheckCircle2, Crown, Flame, GraduationCap, Loader2, Lock, Orbit, ShieldCheck, Sparkles, TrendingUp, Trophy, UserRoundCheck } from "lucide-react";
import { academyPathTerms } from "@/data/academyPath";
import { academyPathTermsEn } from "@/data/academyPathEn";
import { AcademyProfileUnavailableState } from "@/components/academy/AcademyProfileUnavailableState";
import { LivingMentorAvatar } from "@/components/mentor/LivingMentorAvatar";
import { isAcademyProfileEstablished, resolveAcademyProfileReadState } from "@/lib/academy-profile-read-state";
import { ACADEMY_CORE_TERM_COUNT } from "@/lib/academy-infinite-growth-policy";

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

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [profileResult, progressData, achievementData] = await Promise.all([
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

        <section className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_.85fr]" aria-label={isFa ? "بینش منتور و مسیر هوشمند" : "Mentor insight and intelligent path"}>
          <article className="relative overflow-hidden rounded-[34px] border border-violet-300/20 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.15),transparent_45%),rgba(255,255,255,.035)] p-6">
            <div className="flex items-start gap-4"><LivingMentorAvatar act={streakDays !== null && streakDays >= 7 ? "celebrate_effort" : "idle_attentive"} locale={locale} size="stage" decorative /><div className="min-w-0"><p className="text-xs font-semibold text-violet-200">{isFa ? "بینش منتور" : "Mentor insight"}</p><h2 className="mt-2 text-xl font-bold leading-8">{isFa ? "قدم بعدی باید از شواهد واقعی مسیر تو بیاید" : "Your next step should come from real journey evidence"}</h2><p className="mt-2 text-sm font-medium leading-7 text-slate-300">{isFa ? "منتور فقط از پیشرفت ثبت‌شده، ارزیابی‌های معتبر و فعالیت‌های مجاز برای پیشنهاد مسیر استفاده می‌کند؛ یادداشت شخصی یا پاسخ خوداظهاری به‌تنهایی به «تسلط» تبدیل نمی‌شود." : "Mentor uses recorded progress, governed assessments and permitted activity to guide the journey; private notes or self-reported answers never become mastery on their own."}</p></div></div>
            <Link href={`${termBase}/ai-guide`} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl border border-violet-200/25 bg-violet-300/10 px-5 py-3 text-sm font-semibold text-violet-100 transition-colors hover:bg-violet-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{isFa ? "گفت‌وگو با منتور" : "Talk to Mentor"}<ArrowUpRight className="h-4 w-4" aria-hidden="true"/></Link>
          </article>
          <article className="rounded-[34px] border border-white/10 bg-white/[.035] p-6">
            <p className="text-xs font-semibold text-cyan-200">{isFa ? "امروز چه چیزی مهم است؟" : "What matters today?"}</p><h2 className="mt-2 text-xl font-bold leading-8">{coreComplete ? (isFa ? "چرخه رشد بی‌نهایت را ادامه بده" : "Continue your Infinite Growth cycle") : (currentTerm?.title || t.currentTerm)}</h2><p className="mt-3 text-sm font-medium leading-7 text-slate-300">{coreComplete ? (isFa ? "یک چرخه کوتاه ارزیابی، تمرین و بازتاب را کامل کن؛ کیفیت تصمیم مهم‌تر از سرعت است." : "Complete a short assess, practice and reflect cycle; decision quality matters more than speed.") : (isFa ? "به‌جای پراکندگی، یک قدم معتبر در ترم فعلی بردار. پیشرفت این صفحه فقط از وضعیت ثبت‌شده به‌روزرسانی می‌شود." : "Instead of scattering attention, take one governed step in the current term. This profile updates only from recorded state.")}</p>
            <div className="mt-5 flex items-center gap-2 text-xs font-medium text-slate-400"><ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true"/>{isFa ? "بدون امتیاز یا تسلط ساختگی" : "No fabricated score or mastery"}</div>
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

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="min-w-0 border-s border-white/15 ps-4"><div className="flex items-center gap-2 text-cyan-200 [&_svg]:h-4 [&_svg]:w-4">{icon}<span className="text-xs font-medium text-slate-300">{label}</span></div><p className="mt-3 text-2xl font-semibold tabular-nums"><bdi dir="ltr">{value}</bdi></p><p className="mt-2 text-xs leading-6 text-slate-400">{note}</p></div>;
}
function Quick({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return <Link href={href} className="block rounded-[30px] border border-white/10 bg-white/[0.055] p-5 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1 [@media(hover:hover)_and_(pointer:fine)]:hover:border-cyan-300/30"><div className="flex items-center gap-3 text-cyan-200 [&_svg]:h-5 [&_svg]:w-5">{icon}<h3 className="font-black text-white">{title}</h3></div><p className="mt-3 text-sm font-bold leading-7 text-slate-300">{text}</p></Link>;
}
function Gate({ title, description, primary, secondary }: { title: string; description: string; primary: { href: string; label: string }; secondary?: { href: string; label: string } }) {
  return <main className="min-h-screen bg-slate-950 px-4 py-16 text-white"><section className="mx-auto max-w-3xl rounded-[38px] border border-cyan-300/20 bg-white/[0.06] p-8 text-center"><UserRoundCheck className="mx-auto h-12 w-12 text-cyan-200" /><h1 className="mt-4 text-3xl font-black">{title}</h1><p className="mt-4 text-sm font-bold leading-8 text-slate-300">{description}</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><Link href={primary.href} className="rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white">{primary.label}</Link>{secondary ? <Link href={secondary.href} className="rounded-2xl border border-cyan-300/25 bg-white/5 px-6 py-4 text-sm font-black text-cyan-100">{secondary.label}</Link> : null}</div></section></main>;
}
