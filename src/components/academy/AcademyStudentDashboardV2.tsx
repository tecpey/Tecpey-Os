"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import Link from "next/link";
import { Award, BrainCircuit, CheckCircle2, Flame, GraduationCap, Loader2, Lock, ShieldCheck, Sparkles, TrendingUp, UserRoundCheck } from "lucide-react";
import { academyPathTerms } from "@/data/academyPath";
import { academyPathTermsEn } from "@/data/academyPathEn";

type Locale = "fa" | "en";
type Profile = {
  public_student_id?: string | null;
  display_name?: string | null;
  username?: string | null;
  avatar?: string | null;
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
  streak: "استریک",
  achievements: "نشان‌ها",
  mentor: "منتور",
  arena: "Trading Arena",
  certs: "مدارک",
  smart: "مرکز هوشمند",
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
  smart: "Smart Center",
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
  const [authenticated, setAuthenticated] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progressRows, setProgressRows] = useState<TermProgress[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [profileRes, progressRes] = await Promise.all([
          fetch("/api/academy-student-profile", { cache: "no-store", credentials: "include" }),
          fetch(`/api/academy-term-progress?locale=${locale}`, { cache: "no-store", credentials: "include" }),
        ]);
        const profileData = await profileRes.json().catch(() => null);
        const progressData = await progressRes.json().catch(() => null);
        if (!active) return;
        setAuthenticated(Boolean(profileData?.authenticated));
        setProfile(profileData?.profile || null);
        setProgressRows(Array.isArray(progressData?.terms) ? progressData.terms : []);
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
  }, [locale]);

  const passedTerms = useMemo(() => new Set(progressRows.filter((p) => p.status === "passed").map((p) => Number(p.term_number))), [progressRows]);
  const completedTerms = Math.max(numberOr(profile?.completed_terms), passedTerms.size);
  const currentTermNumber = Math.min(7, completedTerms + 1);
  const currentTerm = terms.find((term) => term.number === currentTermNumber) || terms[0];
  const overall = Math.max(numberOr(profile?.overall_progress), Math.round((completedTerms / 7) * 100));
  const displayName = profile?.display_name || (isFa ? "دانشجوی تک‌پی" : "TecPey learner");
  const username = profile?.username ? `@${profile.username}` : "";
  const avatar = profile?.avatar || "🎓";
  const smartHref = isFa ? "/academy/notifications" : "/en/academy/notifications";
  const termBase = isFa ? "/academy" : "/en/academy";

  if (loading) {
    return <main className="min-h-screen bg-slate-950 px-4 py-16 text-white"><div className="mx-auto max-w-3xl rounded-[32px] border border-cyan-300/20 bg-white/[0.06] p-8 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" /><p className="mt-4 font-black">{t.checking}</p></div></main>;
  }

  if (!authenticated) {
    return <Gate title={t.needLogin} description={isFa ? "داشبورد، ترم‌ها، منتور و Trading Arena فقط به حساب اختصاصی آکادمی وصل هستند." : "Dashboard, terms, mentor and Trading Arena belong to your dedicated academy account."} primary={{ href: isFa ? "/academy/login" : "/en/academy/login", label: t.login }} secondary={{ href: isFa ? "/academy/signup" : "/en/academy/signup", label: t.signup }} />;
  }

  if (!profile?.display_name) {
    return <Gate title={t.needProfile} description={isFa ? "برای شروع ترم‌ها، اول نام نمایشی، username و هویت آموزشی خودت را بساز." : "Before starting terms, create your display name, username and learning identity."} primary={{ href: isFa ? "/academy/onboarding" : "/en/academy/onboarding", label: t.createProfile }} />;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,.16),transparent_35%),#020617] px-4 py-10 text-white sm:px-6 lg:px-8" dir={isFa ? "rtl" : "ltr"}>
      <section className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="rounded-[38px] border border-cyan-300/20 bg-white/[0.065] p-6 shadow-[0_30px_120px_rgba(34,211,238,.14)] lg:p-8">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-3xl border border-cyan-300/25 bg-cyan-300/10 text-3xl">{avatar}</div>
                <div>
                  <p className="text-sm font-black text-cyan-200">{username}</p>
                  <h1 className="mt-1 text-3xl font-black sm:text-4xl">{t.hello} {displayName} 👋</h1>
                </div>
              </div>
              <Link href={smartHref} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-cyan-500 to-violet-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-cyan-500/20">
                <BrainCircuit className="h-4 w-4" /> {t.smart}
              </Link>
            </div>
            <p className="mt-5 max-w-3xl text-sm font-bold leading-8 text-slate-300">{t.welcome}</p>

            <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={<GraduationCap />} label={t.currentTerm} value={`${currentTermNumber} / 7`} note={currentTerm?.title || "Term"} />
              <Metric icon={<TrendingUp />} label={t.progress} value={`${overall}%`} note={`${completedTerms} ${isFa ? "ترم تکمیل‌شده" : "terms completed"}`} />
              <Metric icon={<Flame />} label={t.streak} value={`${numberOr(profile.streak_days, 1)}`} note={isFa ? "روز فعال" : "active days"} />
              <Metric icon={<Award />} label={t.achievements} value={`${Math.max(1, completedTerms + 1)}`} note={isFa ? "نشان فعال" : "active badges"} />
            </div>

            <div className="mt-7 rounded-[30px] border border-cyan-300/15 bg-cyan-400/10 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-cyan-100">{t.currentTerm}</p>
                  <h2 className="mt-2 text-2xl font-black">{currentTerm?.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-slate-300">{currentTerm?.subtitle}</p>
                </div>
                <Link href={`${termBase}/term-${currentTermNumber}`} className="rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white">
                  {completedTerms === 0 ? t.startTerm : t.continueTerm}
                </Link>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[32px] border border-white/10 bg-white/[0.055] p-5">
              <p className="text-xs font-black text-slate-400">{t.tecpeyId}</p>
              <p className="mt-2 font-mono text-lg font-black text-cyan-200">{profile.public_student_id}</p>
              <p className="mt-3 text-xs font-bold leading-6 text-slate-400">{t.noIndex}</p>
            </div>
            <Quick href={isFa ? "/academy/mentor-coach" : "/en/academy/mentor-coach"} icon={<BrainCircuit />} title={t.mentor} text={isFa ? "تحلیل مسیر یادگیری و پیشنهاد تمرین بعدی" : "Learning insight and next practice recommendation"} />
            <Quick href={isFa ? "/academy/simulator" : "/en/academy/simulator"} icon={<TrendingUp />} title={t.arena} text={isFa ? "تمرین تصمیم‌گیری و ژورنال معامله آزمایشی" : "Demo decision practice and trading journal"} />
            <Quick href={isFa ? "/academy/certificates" : "/en/academy/certificates"} icon={<ShieldCheck />} title={t.certs} text={isFa ? "مشاهده مدارک قابل استعلام" : "View verifiable certificates"} />
          </aside>
        </div>

        <section className="mt-8 rounded-[38px] border border-cyan-300/15 bg-white/[0.055] p-6">
          <h2 className="text-2xl font-black">{t.terms}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {terms.map((term) => {
              const passed = passedTerms.has(term.number);
              const unlocked = term.number === 1 || passedTerms.has(term.number - 1);
              return (
                <Link key={term.slug} href={unlocked ? `${termBase}/term-${term.number}` : `${termBase}/term-${Math.max(1, term.number - 1)}`} className={`rounded-[28px] border p-5 transition ${passed ? "border-emerald-300/30 bg-emerald-400/10" : unlocked ? "border-cyan-300/25 bg-cyan-400/10 hover:-translate-y-1" : "border-white/10 bg-white/[0.035] opacity-70"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black">Term {term.number}</span>
                    {passed ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : unlocked ? <Sparkles className="h-5 w-5 text-cyan-300" /> : <Lock className="h-5 w-5 text-slate-500" />}
                  </div>
                  <h3 className="mt-4 text-lg font-black leading-8">{term.title}</h3>
                  <p className="mt-2 text-xs font-bold leading-6 text-slate-300">{passed ? t.passed : unlocked ? t.unlocked : t.locked}</p>
                </Link>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="rounded-[26px] border border-white/10 bg-slate-950/40 p-4"><div className="flex items-center gap-2 text-cyan-200 [&_svg]:h-5 [&_svg]:w-5">{icon}<span className="text-xs font-black text-slate-300">{label}</span></div><p className="mt-3 text-2xl font-black">{value}</p><p className="mt-1 text-xs font-bold text-slate-400">{note}</p></div>;
}
function Quick({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return <Link href={href} className="block rounded-[30px] border border-white/10 bg-white/[0.055] p-5 transition hover:-translate-y-1 hover:border-cyan-300/30"><div className="flex items-center gap-3 text-cyan-200 [&_svg]:h-5 [&_svg]:w-5">{icon}<h3 className="font-black text-white">{title}</h3></div><p className="mt-3 text-sm font-bold leading-7 text-slate-300">{text}</p></Link>;
}
function Gate({ title, description, primary, secondary }: { title: string; description: string; primary: { href: string; label: string }; secondary?: { href: string; label: string } }) {
  return <main className="min-h-screen bg-slate-950 px-4 py-16 text-white"><section className="mx-auto max-w-3xl rounded-[38px] border border-cyan-300/20 bg-white/[0.06] p-8 text-center"><UserRoundCheck className="mx-auto h-12 w-12 text-cyan-200" /><h1 className="mt-4 text-3xl font-black">{title}</h1><p className="mt-4 text-sm font-bold leading-8 text-slate-300">{description}</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><Link href={primary.href} className="rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white">{primary.label}</Link>{secondary ? <Link href={secondary.href} className="rounded-2xl border border-cyan-300/25 bg-white/5 px-6 py-4 text-sm font-black text-cyan-100">{secondary.label}</Link> : null}</div></section></main>;
}
