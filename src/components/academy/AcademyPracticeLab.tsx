"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, CheckCircle2, FlaskConical, ShieldAlert, Sparkles, Target, Trophy } from "lucide-react";
import { academyScenarioChallenges } from "@/data/academyScenarioChallenges";

type Locale = "fa" | "en";

export function AcademyPracticeLab({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const [active, setActive] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const scenario = academyScenarioChallenges[active];
  const choices = isFa ? scenario.choicesFa : scenario.choicesEn;
  const selected = choice === null ? null : choices[choice];
  const average = useMemo(() => {
    if (choice === null) return null;
    return Math.round((choices[choice].score + 74) / 2);
  }, [choice, choices]);

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[38px] border border-cyan-300/20 bg-slate-950 shadow-[0_35px_120px_rgba(34,211,238,.14)]">
        <div className="grid gap-8 p-6 lg:grid-cols-[380px_1fr] lg:p-8">
          <aside className="rounded-[30px] border border-white/10 bg-white/[0.055] p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
              <FlaskConical className="h-4 w-4" /> {isFa ? "Practice Lab" : "Practice Lab"}
            </div>
            <h2 className="mt-4 text-3xl font-black leading-tight text-white">
              {isFa ? "تمرین تصمیم‌گیری قبل از معامله واقعی" : "Practice decisions before real market action"}
            </h2>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-300">
              {isFa
                ? "این آزمایشگاه برای تبدیل آموزش به رفتار طراحی شده است. کاربر فقط تعریف نمی‌خواند؛ در موقعیت واقعی‌تر تصمیم می‌گیرد، بازخورد می‌گیرد و سپس به درس مرتبط برمی‌گردد."
                : "This lab turns learning into behavior. Users do not just read definitions; they make scenario decisions, get feedback, then return to the relevant lesson."}
            </p>
            <div className="mt-5 grid gap-3">
              {academyScenarioChallenges.map((item, index) => (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => { setActive(index); setChoice(null); }}
                  className={`rounded-2xl border p-4 text-left transition ${active === index ? "border-cyan-300/50 bg-cyan-300/15" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.075]"}`}
                >
                  <p className="text-xs font-black text-cyan-200">{isFa ? `ترم ${item.term}` : `Term ${item.term}`}</p>
                  <p className="mt-1 text-sm font-black leading-6 text-white">{isFa ? item.titleFa : item.titleEn}</p>
                </button>
              ))}
            </div>
          </aside>

          <div className="space-y-5">
            <article className="rounded-[32px] border border-white/10 bg-white/[0.06] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-cyan-200">{isFa ? `سناریوی ترم ${scenario.term}` : `Term ${scenario.term} scenario`}</p>
                  <h1 className="mt-2 text-3xl font-black leading-tight text-white">{isFa ? scenario.titleFa : scenario.titleEn}</h1>
                </div>
                <Target className="h-9 w-9 text-cyan-300" />
              </div>
              <p className="mt-5 text-sm font-bold leading-8 text-slate-300">{isFa ? scenario.contextFa : scenario.contextEn}</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {(isFa ? scenario.marketStateFa : scenario.marketStateEn).map((item) => (
                  <div key={item} className="rounded-2xl border border-cyan-300/15 bg-cyan-300/10 p-4 text-sm font-bold leading-7 text-cyan-50">
                    <CheckCircle2 className="mr-2 inline h-4 w-4 text-cyan-300" />{item}
                  </div>
                ))}
              </div>
            </article>

            <div className="grid gap-4 lg:grid-cols-3">
              {choices.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setChoice(index)}
                  className={`rounded-[28px] border p-5 text-left transition hover:-translate-y-1 ${choice === index ? "border-emerald-300/60 bg-emerald-400/15" : "border-white/10 bg-white/[0.055] hover:border-cyan-300/35 hover:bg-cyan-300/10"}`}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10 text-sm font-black text-cyan-100">{index + 1}</span>
                  <p className="mt-4 text-sm font-black leading-7 text-white">{item.label}</p>
                </button>
              ))}
            </div>

            {selected ? (
              <section className="rounded-[32px] border border-emerald-300/25 bg-emerald-400/10 p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black text-emerald-100">{isFa ? "بازخورد تمرین" : "Practice feedback"}</p>
                    <h2 className="mt-2 text-2xl font-black text-white">{isFa ? "امتیاز تصمیم شما" : "Your decision score"}: {selected.score}/100</h2>
                  </div>
                  <Trophy className="h-10 w-10 text-amber-300" />
                </div>
                <p className="mt-4 text-sm font-bold leading-8 text-slate-200">{selected.feedback}</p>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <p className="text-xs font-black text-cyan-100">{isFa ? "آمادگی رفتاری" : "Behavioral readiness"}</p>
                    <p className="mt-2 text-2xl font-black text-white">{average}%</p>
                  </div>
                  <Link href={isFa ? scenario.lessonHrefFa : scenario.lessonHrefEn} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4 text-sm font-black leading-7 text-cyan-50 transition hover:bg-cyan-300/15">
                    {isFa ? "مرور درس مرتبط" : "Review related lesson"}
                  </Link>
                  <Link href={isFa ? `/academy/ai-guide?term=${scenario.term}` : `/en/academy/ai-guide?term=${scenario.term}`} className="rounded-2xl border border-violet-300/25 bg-violet-400/10 p-4 text-sm font-black leading-7 text-violet-50 transition hover:bg-violet-400/15">
                    <Bot className="mr-2 inline h-4 w-4" />{isFa ? "تحلیل با AI Mentor" : "Analyze with AI Mentor"}
                  </Link>
                </div>
              </section>
            ) : (
              <section className="rounded-[32px] border border-amber-300/25 bg-amber-400/10 p-6">
                <div className="flex items-center gap-3 text-amber-100"><ShieldAlert className="h-6 w-6" /><h2 className="text-xl font-black">{isFa ? "اول تصمیم بگیر، بعد بازخورد بگیر" : "Choose first, then get feedback"}</h2></div>
                <p className="mt-3 text-sm font-bold leading-8 text-slate-300">{isFa ? "هدف این بخش، شبیه‌سازی سود و ضرر واقعی نیست؛ هدف ساختن عادت تصمیم‌گیری با چک‌لیست است." : "This does not simulate real profit or loss; it builds checklist-based decision habits."}</p>
              </section>
            )}

            <section className="rounded-[32px] border border-violet-300/20 bg-violet-400/10 p-6">
              <div className="flex items-center gap-3 text-violet-100"><Sparkles className="h-6 w-6" /><h2 className="text-xl font-black">{isFa ? "پرامپت پیشنهادی مربی" : "Suggested mentor prompt"}</h2></div>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-300">{isFa ? scenario.mentorPromptFa : scenario.mentorPromptEn}</p>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
