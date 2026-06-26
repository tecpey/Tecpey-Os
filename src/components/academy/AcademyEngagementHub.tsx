"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { academyAchievements, academyMissions, tecpeyLearningMethodEn, tecpeyLearningMethodFa } from "@/data/academyEngagement";
import { Award, CheckCircle2, Flame, Lock, PlayCircle, Sparkles, Target, Trophy } from "lucide-react";

type Locale = "fa" | "en";
type State = { xp: number; streak: number; completed: Record<string, boolean>; lastDay?: string };

const STORAGE_KEY = "tecpey-academy-engagement-v1";
const todayKey = () => new Date().toISOString().slice(0, 10);

function readState(): State {
  if (typeof window === "undefined") return { xp: 0, streak: 0, completed: {} };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return { xp: Number(parsed?.xp || 0), streak: Number(parsed?.streak || 0), completed: parsed?.completed || {}, lastDay: parsed?.lastDay };
  } catch {
    return { xp: 0, streak: 0, completed: {} };
  }
}

function writeState(state: State) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function levelFromXp(xp: number) {
  if (xp >= 1100) return { titleFa: "مسیر امن کامل", titleEn: "Safe Path Graduate", level: 7, next: 1100 };
  if (xp >= 760) return { titleFa: "آماده سناریو", titleEn: "Scenario Ready", level: 6, next: 1100 };
  if (xp >= 520) return { titleFa: "کنترل‌گر ریسک", titleEn: "Risk Controller", level: 5, next: 760 };
  if (xp >= 360) return { titleFa: "تحلیلگر در حال رشد", titleEn: "Growing Analyst", level: 4, next: 520 };
  if (xp >= 260) return { titleFa: "محافظ امنیت", titleEn: "Security Guardian", level: 3, next: 360 };
  if (xp >= 100) return { titleFa: "شروع امن", titleEn: "Safe Starter", level: 2, next: 260 };
  return { titleFa: "تازه‌وارد آگاه", titleEn: "Aware Beginner", level: 1, next: 100 };
}

export function AcademyEngagementHub({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const [state, setState] = useState<State>({ xp: 0, streak: 0, completed: {} });

  useEffect(() => setState(readState()), []);

  const level = useMemo(() => levelFromXp(state.xp), [state.xp]);
  const progress = Math.min(100, Math.round((state.xp / Math.max(level.next, 1)) * 100));
  const method = isFa ? tecpeyLearningMethodFa : tecpeyLearningMethodEn;
  const nextMission = academyMissions.find((mission) => !state.completed[mission.id]) || academyMissions[academyMissions.length - 1];

  const completeMission = (id: string, xp: number) => {
    const current = readState();
    const day = todayKey();
    const already = Boolean(current.completed[id]);
    const streak = current.lastDay === day ? current.streak : current.lastDay ? current.streak + 1 : 1;
    const next = { ...current, xp: already ? current.xp : current.xp + xp, streak, lastDay: day, completed: { ...current.completed, [id]: true } };
    writeState(next);
    setState(next);
  };

  return (
    <section className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[38px] border border-cyan-300/20 bg-slate-950 shadow-[0_35px_120px_rgba(34,211,238,.14)]">
        <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
              <Sparkles className="h-4 w-4" /> {isFa ? "TecPey Method" : "TecPey Method"}
            </div>
            <h2 className="mt-4 text-3xl font-black leading-tight text-white">
              {isFa ? "از خواندن درس تا ساختن عادت تصمیم‌گیری" : "From reading lessons to building decision habits"}
            </h2>
            <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-300">
              {isFa
                ? "برای اینکه آکادمی فقط مجموعه‌ای از صفحات نباشد، مسیر تک‌پی با XP، مأموریت روزانه، Badge، Practice Lab و Mentor Feedback کاربر را از فهم مفهوم تا تمرین و ارزیابی نهایی همراه می‌کند."
                : "To avoid being just a set of pages, the TecPey path uses XP, daily missions, badges, Practice Lab and Mentor feedback to move users from concepts to practice and readiness."}
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-5">
              {method.map((item, index) => (
                <div key={item.step} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/15 text-xs font-black text-cyan-100">{index + 1}</span>
                  <p className="mt-3 text-sm font-black text-white">{item.title}</p>
                  <p className="mt-2 text-xs font-bold leading-6 text-slate-400">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[30px] border border-emerald-300/20 bg-emerald-400/10 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-emerald-100">{isFa ? "مأموریت پیشنهادی بعدی" : "Next recommended mission"}</p>
                  <h3 className="mt-2 text-2xl font-black text-white">{isFa ? nextMission.titleFa : nextMission.titleEn}</h3>
                  <p className="mt-3 text-sm font-bold leading-8 text-slate-300">{isFa ? nextMission.descriptionFa : nextMission.descriptionEn}</p>
                </div>
                <div className="flex flex-col gap-3 sm:min-w-48">
                  <button onClick={() => completeMission(nextMission.id, nextMission.xp)} className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-400">
                    {isFa ? `ثبت تکمیل +${nextMission.xp} XP` : `Complete +${nextMission.xp} XP`}
                  </button>
                  <Link href={isFa ? nextMission.hrefFa : nextMission.hrefEn} className="rounded-2xl border border-emerald-300/25 bg-white/10 px-5 py-3 text-center text-sm font-black text-emerald-100 transition hover:bg-white/15">
                    {isFa ? "رفتن به مأموریت" : "Open mission"}
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-4 rounded-[32px] border border-white/10 bg-white/[0.055] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-cyan-200">{isFa ? "سطح فعلی" : "Current level"}</p>
                <h3 className="mt-1 text-2xl font-black text-white">{isFa ? level.titleFa : level.titleEn}</h3>
              </div>
              <Trophy className="h-10 w-10 text-amber-300" />
            </div>
            <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/10 p-4">
              <div className="flex justify-between text-xs font-black text-cyan-100"><span>{state.xp} XP</span><span>{progress}%</span></div>
              <div className="mt-3 h-3 rounded-full bg-slate-800"><div className="h-3 rounded-full bg-cyan-400" style={{ width: `${progress}%` }} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><Flame className="h-5 w-5 text-orange-300" /><p className="mt-2 text-xs font-black text-slate-400">{isFa ? "Streak" : "Streak"}</p><p className="text-xl font-black text-white">{state.streak}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><Target className="h-5 w-5 text-cyan-300" /><p className="mt-2 text-xs font-black text-slate-400">{isFa ? "Level" : "Level"}</p><p className="text-xl font-black text-white">{level.level}</p></div>
            </div>
            <div>
              <p className="text-sm font-black text-white">{isFa ? "Badgeها" : "Badges"}</p>
              <div className="mt-3 grid gap-2">
                {academyAchievements.map((badge) => {
                  const unlocked = state.xp >= badge.xp;
                  return (
                    <div key={badge.id} className={`flex items-start gap-3 rounded-2xl border p-3 ${unlocked ? "border-amber-300/25 bg-amber-300/10" : "border-white/10 bg-white/[0.035] opacity-75"}`}>
                      {unlocked ? <Award className="mt-1 h-5 w-5 text-amber-300" /> : <Lock className="mt-1 h-5 w-5 text-slate-500" />}
                      <div><p className="text-sm font-black text-white">{isFa ? badge.titleFa : badge.titleEn}</p><p className="text-xs font-bold leading-6 text-slate-400">{isFa ? badge.descriptionFa : badge.descriptionEn}</p></div>
                    </div>
                  );
                })}
              </div>
            </div>
            <Link href={isFa ? "/academy/final-assessment" : "/en/academy/final-assessment"} className="flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">
              <CheckCircle2 className="h-4 w-4" /> {isFa ? "ارزیابی آمادگی" : "Readiness check"}
            </Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
