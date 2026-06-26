"use client";

import Link from "next/link";
import { Award, CheckCircle2, Lock, Sparkles, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Locale = "fa" | "en";
type Achievement = {
  code: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  xp: number;
  earned: boolean;
  earnedAt?: string | null;
};

export function AchievementCenter({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const [items, setItems] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`/api/achievements?locale=${locale}`, { cache: "no-store", credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setItems(Array.isArray(data?.achievements) ? data.achievements : []);
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [locale]);

  const earned = useMemo(() => items.filter((item) => item.earned), [items]);
  const totalXp = earned.reduce((sum, item) => sum + Number(item.xp || 0), 0);
  const next = items.find((item) => !item.earned);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,.16),transparent_34%),#020617] px-4 py-10 text-white sm:px-6 lg:px-8" dir={isFa ? "rtl" : "ltr"}>
      <section className="mx-auto max-w-7xl space-y-7">
        <div className="rounded-[38px] border border-cyan-300/20 bg-white/[0.065] p-6 shadow-[0_30px_120px_rgba(34,211,238,.13)] lg:p-8">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100"><Trophy className="h-4 w-4" /> Achievement OS</div>
              <h1 className="mt-5 text-3xl font-black sm:text-5xl">{isFa ? "نشان‌ها و دستاوردهای آکادمی" : "Academy achievements"}</h1>
              <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-300">
                {isFa ? "هر نشان فقط وقتی معتبر است که از رویداد رسمی آکادمی، آزمون، منتور، شبیه‌ساز یا مدرک ثبت شود؛ نه از داده دستی کاربر." : "Every badge is valid only when it is issued from official academy, quiz, mentor, simulator or certificate events; never from user-submitted claims."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center sm:min-w-72">
              <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4"><p className="text-3xl font-black text-cyan-200">{loading ? "…" : earned.length}</p><p className="mt-2 text-xs font-bold text-slate-400">{isFa ? "نشان فعال" : "earned badges"}</p></div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4"><p className="text-3xl font-black text-amber-200">{loading ? "…" : totalXp}</p><p className="mt-2 text-xs font-bold text-slate-400">XP</p></div>
            </div>
          </div>
        </div>

        {next && (
          <section className="rounded-[34px] border border-emerald-300/20 bg-emerald-400/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black text-emerald-100">{isFa ? "نشان بعدی پیشنهادی" : "Next suggested badge"}</p>
                <h2 className="mt-2 text-2xl font-black">{next.icon} {next.title}</h2>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{next.description}</p>
              </div>
              <Link href="/academy/profile" className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white">{isFa ? "ادامه مسیر" : "Continue path"}</Link>
            </div>
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.code} className={`rounded-[30px] border p-5 transition ${item.earned ? "border-amber-300/30 bg-amber-300/10" : "border-white/10 bg-white/[0.045] opacity-85"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-2xl">{item.icon || "🏆"}</div>
                {item.earned ? <CheckCircle2 className="h-6 w-6 text-emerald-300" /> : <Lock className="h-6 w-6 text-slate-500" />}
              </div>
              <h3 className="mt-4 text-xl font-black">{item.title}</h3>
              <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{item.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-slate-300">{item.category}</span>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">+{item.xp} XP</span>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-[34px] border border-cyan-300/20 bg-cyan-400/10 p-6">
          <div className="flex gap-3"><Sparkles className="h-6 w-6 text-cyan-200" /><p className="text-sm font-black leading-8 text-slate-200">{isFa ? "در نسخه موبایل، همین نشان‌ها به اعلان هوشمند، پروفایل عمومی و مسیر حرفه‌ای وصل می‌شوند." : "In the mobile version, these badges connect to smart notifications, public profile and career path."}</p></div>
        </section>
      </section>
    </main>
  );
}
