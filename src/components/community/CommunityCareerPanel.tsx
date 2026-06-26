"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Award, BadgeCheck, BriefcaseBusiness, Crown, Eye, Lock, Medal, ShieldCheck, Sparkles, Target, Trophy, UserRound } from "lucide-react";

type Profile = {
  publicStudentId: string;
  displayName: string;
  username: string;
  avatar: string;
  level: string;
  currentTerm: number;
  xp: number;
  streak: number;
  achievementsCount: number;
  certificatesCount: number;
  mentorScore: number;
  arenaScore: number;
  careerScore: number;
  tradingStyle: string;
  visibility: "public" | "private";
  strengths: string[];
  growthAreas: string[];
};

type Career = {
  displayName: string;
  tradingStyle: string;
  discipline: number;
  riskControl: number;
  psychology: number;
  consistency: number;
  recommendedTrack: string;
  nextActions: string[];
  mentorEndorsement: string;
  eligibility: "learning" | "ready_for_challenge" | "advanced_review";
};

type Challenge = { id: string; title: string; description: string; status: "locked" | "available" | "in_progress" | "completed"; requirements: string[]; reward: string; progress: number };

async function loadJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-black text-[color:var(--tp-muted)]"><span>{label}</span><span>{value}/100</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
    </div>
  );
}

export function CommunityCareerPanel({ mode }: { mode: "community" | "career" | "challenges" }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [career, setCareer] = useState<Career | null>(null);
  const [hall, setHall] = useState<Profile[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      loadJson<{ profile: Profile | null }>("/api/community/profile"),
      loadJson<{ career: Career | null }>("/api/career"),
      loadJson<{ learners: Profile[] }>("/api/community/hall-of-fame"),
      loadJson<{ challenges: Challenge[] }>("/api/challenges"),
    ]).then(([p, c, h, ch]) => {
      if (!mounted) return;
      setProfile(p?.profile || null);
      setCareer(c?.career || null);
      setHall(h?.learners || []);
      setChallenges(ch?.challenges || []);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const title = useMemo(() => {
    if (mode === "career") return "مسیر حرفه‌ای هوشمند";
    if (mode === "challenges") return "چالش‌های حرفه‌ای";
    return "جامعه و هویت عمومی آکادمی";
  }, [mode]);

  if (loading) {
    return <div className="rounded-[32px] border border-slate-200 bg-white/90 p-8 text-sm font-black dark:border-white/10 dark:bg-white/[0.06]">در حال آماده‌سازی اطلاعات آکادمی...</div>;
  }

  if (!profile && mode !== "community") {
    return (
      <section className="rounded-[40px] border border-cyan-300/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,.20),transparent_34%),linear-gradient(145deg,#07111f,#111827)] p-8 text-white">
        <Lock className="h-12 w-12 text-cyan-200" />
        <h1 className="mt-5 text-3xl font-black">ابتدا پروفایل آکادمی را فعال کن</h1>
        <p className="mt-3 text-sm font-bold leading-8 text-slate-300">مسیر حرفه‌ای، چالش‌ها و پروفایل عمومی فقط برای دانشجویان فعال آکادمی ساخته می‌شود.</p>
        <Link href="/academy/onboarding" className="mt-5 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">ساخت پروفایل آکادمی</Link>
      </section>
    );
  }

  return (
    <div className="space-y-7">
      <section className="rounded-[42px] border border-cyan-300/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,.22),transparent_38%),linear-gradient(145deg,#07111f,#111827)] p-8 text-white shadow-[0_35px_110px_rgba(34,211,238,.12)]">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100"><Sparkles className="h-4 w-4" /> TecPey Learning Identity</div>
        <h1 className="mt-5 text-4xl font-black leading-tight sm:text-6xl">{title}</h1>
        <p className="mt-4 max-w-4xl text-sm font-bold leading-8 text-slate-300">این بخش برای ساخت هویت حرفه‌ای، انگیزه بازگشت، رتبه قابل دفاع و مسیر رشد مسئولانه طراحی شده است؛ بدون سیگنال‌فروشی، بدون وعده سود و با تکیه بر داده رسمی آکادمی.</p>
      </section>

      {profile ? (
        <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <article className="rounded-[34px] border border-slate-200 bg-white/95 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-500/10 text-3xl">{profile.avatar}</div>
              <div>
                <p className="text-xs font-black text-cyan-500">@{profile.username}</p>
                <h2 className="text-3xl font-black">سلام {profile.displayName} 👋</h2>
                <p className="mt-1 text-xs font-bold text-[color:var(--tp-muted)]">{profile.publicStudentId} · {profile.level}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[{label:"XP",value:profile.xp,icon:Trophy},{label:"Streak",value:profile.streak,icon:Award},{label:"Career",value:profile.careerScore,icon:BriefcaseBusiness}].map((item)=>{const Icon=item.icon;return <div key={item.label} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]"><Icon className="h-5 w-5 text-cyan-500"/><p className="mt-3 text-xs font-bold text-[color:var(--tp-muted)]">{item.label}</p><p className="mt-1 text-2xl font-black">{item.value}</p></div>})}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-5"><p className="text-sm font-black">نقاط قوت</p><ul className="mt-3 space-y-2 text-xs font-bold text-[color:var(--tp-muted)]">{profile.strengths.map((x)=><li key={x}>✓ {x}</li>)}</ul></div>
              <div className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-5"><p className="text-sm font-black">تمرکز بعدی</p><ul className="mt-3 space-y-2 text-xs font-bold text-[color:var(--tp-muted)]">{profile.growthAreas.map((x)=><li key={x}>• {x}</li>)}</ul></div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`/student/${profile.username || profile.publicStudentId}`} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/30 px-4 py-2 text-xs font-black"><Eye className="h-4 w-4" /> پروفایل عمومی</Link>
              <Link href="/academy/challenges" className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2 text-xs font-black text-white"><Target className="h-4 w-4" /> چالش‌ها</Link>
            </div>
          </article>
          <article className="rounded-[34px] border border-slate-200 bg-white/95 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
            <h2 className="text-2xl font-black">Career Snapshot</h2>
            {career ? <div className="mt-5 space-y-4"><ScoreBar label="انضباط" value={career.discipline}/><ScoreBar label="مدیریت ریسک" value={career.riskControl}/><ScoreBar label="روانشناسی" value={career.psychology}/><ScoreBar label="استمرار" value={career.consistency}/><div className="rounded-3xl bg-cyan-500/10 p-4 text-sm font-black leading-8">{career.mentorEndorsement}</div></div> : <p className="mt-5 text-sm font-bold text-[color:var(--tp-muted)]">برای ساخت تحلیل حرفه‌ای، ابتدا پروفایل آکادمی را کامل کن.</p>}
          </article>
        </section>
      ) : null}

      {mode === "challenges" || mode === "career" ? (
        <section className="grid gap-5 lg:grid-cols-3">
          {challenges.map((challenge) => (
            <article key={challenge.id} className="rounded-[34px] border border-slate-200 bg-white/95 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
              <div className="flex items-center justify-between gap-3"><Medal className="h-7 w-7 text-amber-500"/><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black dark:bg-white/10">{challenge.status === "locked" ? "قفل" : "آماده"}</span></div>
              <h3 className="mt-4 text-xl font-black">{challenge.title}</h3>
              <p className="mt-3 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">{challenge.description}</p>
              <div className="mt-4"><ScoreBar label="آمادگی" value={challenge.progress}/></div>
              <ul className="mt-4 space-y-2 text-xs font-bold text-[color:var(--tp-muted)]">{challenge.requirements.map((r)=><li key={r}>• {r}</li>)}</ul>
              <p className="mt-4 rounded-2xl bg-amber-400/10 p-3 text-xs font-black text-amber-600">پاداش: {challenge.reward}</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="rounded-[34px] border border-slate-200 bg-white/95 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
        <div className="flex items-center gap-3"><Crown className="h-7 w-7 text-amber-500"/><h2 className="text-2xl font-black">تالار افتخار زنده</h2></div>
        {hall.length ? <div className="mt-5 grid gap-4 md:grid-cols-3">{hall.map((student,index)=><Link key={student.publicStudentId} href={`/student/${student.username || student.publicStudentId}`} className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-5"><p className="text-xs font-black text-amber-600">#{index+1}</p><p className="mt-2 text-xl font-black">{student.avatar} {student.displayName}</p><p className="mt-1 text-xs font-bold text-[color:var(--tp-muted)]">@{student.username} · {student.xp} XP</p></Link>)}</div> : <div className="mt-5 rounded-3xl bg-slate-50 p-6 text-center text-sm font-bold text-[color:var(--tp-muted)] dark:bg-white/[0.04]"><UserRound className="mx-auto h-10 w-10 text-cyan-500"/> هنوز داده عمومی کافی برای تالار افتخار وجود ندارد.</div>}
      </section>

      <section className="rounded-[34px] border border-cyan-300/20 bg-cyan-500/10 p-6"><div className="flex gap-3"><ShieldCheck className="h-6 w-6 text-cyan-500"/><p className="text-sm font-black leading-8">همه رتبه‌ها، مسیرها و چالش‌ها باید از داده آموزشی، ژورنال، آزمون و تمرین رسمی ساخته شوند؛ نه از ادعای کاربر و نه از وعده سود.</p></div></section>
    </div>
  );
}
