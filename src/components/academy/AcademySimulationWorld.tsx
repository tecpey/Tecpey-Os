"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { academySimulations, simulationKinds, type SimulationKind } from "@/data/academySimulationWorld";
import { Bot, CheckCircle2, ClipboardList, Flame, LineChart, ShieldAlert, Sparkles, WalletCards, Zap } from "lucide-react";

type Locale = "fa" | "en";
type SimState = { completed: Record<string, { score: number; choice: string; at: string }>; xp: number };
const STORAGE_KEY = "tecpey-academy-simulation-world-v1";

function readState(): SimState {
  if (typeof window === "undefined") return { completed: {}, xp: 0 };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return { completed: parsed?.completed || {}, xp: Number(parsed?.xp || 0) };
  } catch {
    return { completed: {}, xp: 0 };
  }
}

function writeState(state: SimState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function icon(kind: SimulationKind) {
  if (kind === "crash") return ShieldAlert;
  if (kind === "portfolio") return WalletCards;
  if (kind === "psychology") return Flame;
  if (kind === "risk") return Zap;
  return LineChart;
}

export function AcademySimulationWorld({ locale = "fa", focus }: { locale?: Locale; focus?: SimulationKind }) {
  const isFa = locale === "fa";
  const [state, setState] = useState<SimState>({ completed: {}, xp: 0 });
  const [selectedKind, setSelectedKind] = useState<SimulationKind>(focus || "trading");
  const [selectedChoice, setSelectedChoice] = useState<Record<string, string>>({});
  const [journal, setJournal] = useState<Record<string, { entryReason: string; emotionState: string; riskPlan: string }>>({});
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/academy-simulator-decision", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.ok && data?.ok) {
          const completed = data.completed || {};
          setState({ completed, xp: Number(data.totalXp || 0) });
          setSelectedChoice(Object.fromEntries(Object.entries(completed).map(([key, value]) => [key, (value as { choice?: string })?.choice || ""])));
          return;
        }
      } catch {}
      if (active) setState(readState());
    };
    void load();
    return () => { active = false; };
  }, []);

  const scenarios = useMemo(() => academySimulations.filter((item) => (focus ? item.kind === focus : item.kind === selectedKind)), [focus, selectedKind]);
  const completedCount = Object.keys(state.completed).length;
  const completedValues = Object.values(state.completed);
  const avgScore = completedCount ? Math.round(completedValues.reduce((sum, item) => sum + item.score, 0) / completedCount) : 0;
  const disciplineScore = Math.max(0, Math.min(100, Math.round(avgScore * 0.7 + Math.min(completedCount, 10) * 3)));
  const riskLabel = avgScore >= 80 ? (isFa ? "کنترل‌شده" : "Controlled") : avgScore >= 55 ? (isFa ? "نیازمند تمرین" : "Needs practice") : (isFa ? "پرریسک" : "High risk");

  const submit = async (scenarioId: string, choiceId: string, score: number, xp: number) => {
    setSyncMessage("");
    setSelectedChoice((prev) => ({ ...prev, [scenarioId]: choiceId }));
    const journalEntry = journal[scenarioId] || { entryReason: "", emotionState: "", riskPlan: "" };
    try {
      const response = await fetch("/api/academy-simulator-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, choiceId, locale, ...journalEntry }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.ok) {
        setState({ completed: data.completed || {}, xp: Number(data.totalXp || 0) });
        setSyncMessage(isFa ? "تصمیم شما در ژورنال تمرین ذخیره شد." : "Your decision was saved to the practice journal.");
        return;
      }
      if (data?.error === "complete_account_required") setSyncMessage(isFa ? "برای ذخیره رسمی تمرین، ابتدا حساب آکادمی را کامل کنید." : "Complete your academy account to save practice officially.");
      else setSyncMessage(isFa ? "ثبت رسمی تمرین در دسترس نیست؛ نتیجه فعلی فقط روی همین دستگاه نمایش داده می‌شود." : "Official save is unavailable; this result is shown on this device only.");
    } catch {
      setSyncMessage(isFa ? "ثبت رسمی تمرین در دسترس نیست؛ نتیجه فعلی فقط روی همین دستگاه نمایش داده می‌شود." : "Official save is unavailable; this result is shown on this device only.");
    }
    const current = readState();
    const already = Boolean(current.completed[scenarioId]);
    const next: SimState = {
      completed: { ...current.completed, [scenarioId]: { score, choice: choiceId, at: new Date().toISOString() } },
      xp: already ? current.xp : current.xp + xp,
    };
    writeState(next);
    setState(next);
  };

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="overflow-hidden rounded-[38px] border border-cyan-300/20 bg-slate-950 p-6 shadow-[0_35px_120px_rgba(34,211,238,.14)] lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
                <Sparkles className="h-4 w-4" /> {isFa ? "تمرین تصمیم‌گیری بازار" : "Market decision practice"}
              </div>
              <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-5xl">
                {isFa ? "تمرین تصمیم‌گیری بازار، بدون پول واقعی" : "Practice market decisions without real money"}
              </h1>
              <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-300">
                {isFa
                  ? "اینجا با سناریوهای آموزشی بازار تمرین می‌کنید: تصمیم می‌گیرید، بازخورد می‌گیرید و پیش از ورود با پول واقعی، خطاهای رایج را در محیط امن یاد می‌گیرید. این بخش توصیه مالی یا سیگنال خرید و فروش نیست."
                  : "Practice with educational market scenarios: make decisions, get feedback and learn common mistakes in a safe environment before using real money. This is not financial advice or a buy/sell signal."}
              </p>
            </div>
            <aside className="rounded-[30px] border border-white/10 bg-white/[0.055] p-5">
              <p className="text-xs font-black text-cyan-200">{isFa ? "وضعیت تمرین" : "Practice status"}</p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-cyan-400/10 p-3 text-center"><p className="text-2xl font-black text-white">{completedCount}</p><p className="text-[11px] font-black text-slate-400">{isFa ? "سناریو" : "Scenarios"}</p></div>
                <div className="rounded-2xl bg-emerald-400/10 p-3 text-center"><p className="text-2xl font-black text-white">{avgScore}</p><p className="text-[11px] font-black text-slate-400">{isFa ? "میانگین" : "Avg"}</p></div>
                <div className="rounded-2xl bg-amber-400/10 p-3 text-center"><p className="text-2xl font-black text-white">{state.xp}</p><p className="text-[11px] font-black text-slate-400">XP</p></div>
              </div>
              <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs font-bold leading-6 text-amber-100">
                {isFa ? "هدف: تصمیم‌گیری مسئولانه، نه پیش‌بینی قیمت." : "Goal: responsible decision-making, not price prediction."}
              </p>
            </aside>
          </div>

          {syncMessage && <div className="mt-6 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 p-4 text-sm font-black leading-7 text-cyan-100">{syncMessage}</div>}

          <div className="mt-7 grid gap-4 lg:grid-cols-4">
            {[
              [isFa ? "کیف تمرینی" : "Practice wallet", "$100,000", isFa ? "سرمایه فرضی برای تمرین، نه پول واقعی" : "Virtual balance for practice, not real money"],
              [isFa ? "کیفیت تصمیم" : "Decision quality", `${avgScore}/100`, isFa ? "میانگین امتیاز سناریوها" : "Average scenario score"],
              [isFa ? "انضباط ریسک" : "Risk discipline", `${disciplineScore}/100`, isFa ? "ترکیب امتیاز و استمرار تمرین" : "Score and practice consistency"],
              [isFa ? "پروفایل ریسک" : "Risk profile", riskLabel, isFa ? "برای بازخورد مربی استفاده می‌شود" : "Used for mentor feedback"],
            ].map(([title, value, text]) => (
              <div key={String(title)} className="rounded-[26px] border border-white/10 bg-white/[0.055] p-5">
                <p className="text-xs font-black text-cyan-200">{String(title)}</p>
                <p className="mt-2 text-2xl font-black text-white">{String(value)}</p>
                <p className="mt-2 text-xs font-bold leading-6 text-slate-400">{String(text)}</p>
              </div>
            ))}
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-3">
            {[
              { title: isFa ? "داده بازار" : "Market data", text: isFa ? "قیمت‌ها و درصد رشد/ریزش با داده‌های مارکت‌برد تک‌پی هماهنگ می‌شوند تا تمرین‌ها به فضای واقعی بازار نزدیک باشند، بدون اینکه توصیه خرید یا فروش ایجاد کنند." : "Prices and gain/loss percentages align with TecPey market-board data so practice stays close to real market conditions without creating buy/sell advice." },
              { title: isFa ? "کیف تمرینی" : "Practice wallet", text: isFa ? "این تمرین‌ها با موجودی فرضی، تاریخچه تصمیم‌ها، سود و زیان آموزشی و ژورنال یادگیری، رفتار تصمیم‌گیری شما را قابل بررسی می‌کنند." : "These exercises use virtual balance, decision history, educational P/L and a learning journal to make decision behavior measurable." },
              { title: isFa ? "بازخورد مربی" : "Mentor feedback", text: isFa ? "نتیجه تمرین‌ها به بازخورد آموزشی تبدیل می‌شود تا نقاطی مثل تصمیم هیجانی، ریسک زیاد یا خروج بی‌برنامه بهتر شناخته شوند." : "Practice results become learning feedback to highlight emotional decisions, excess risk or unplanned exits." },
            ].map((item) => (
              <article key={item.title} className="rounded-[26px] border border-cyan-300/15 bg-white/[0.055] p-5">
                <p className="text-lg font-black text-white">{item.title}</p>
                <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{item.text}</p>
              </article>
            ))}
          </div>

          {!focus ? (
            <div className="mt-7 grid gap-3 md:grid-cols-5">
              {simulationKinds.map((item) => {
                const active = selectedKind === item.kind;
                const Icon = icon(item.kind);
                return (
                  <button key={item.kind} onClick={() => setSelectedKind(item.kind)} className={`rounded-2xl border p-4 text-start transition ${active ? "border-cyan-300/50 bg-cyan-400/15" : "border-white/10 bg-white/[0.045] hover:bg-white/[0.08]"}`} type="button">
                    <Icon className="h-5 w-5 text-cyan-200" />
                    <p className="mt-3 text-sm font-black text-white">{isFa ? item.titleFa : item.titleEn}</p>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <section className="mt-8 rounded-[34px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">{isFa ? "ژورنال تمرین و گزارش مربی" : "Practice journal and mentor report"}</h2>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">
                {isFa ? "هر تصمیم در پرونده تمرین ذخیره می‌شود تا مربی بتواند الگوی رفتاری، ریسک‌پذیری و نقاط ضعف را دقیق‌تر تشخیص دهد." : "Each decision is kept in the practice record so the mentor can identify behavior patterns, risk style and weak points more precisely."}
              </p>
            </div>
            <Link href={isFa ? "/academy/mentor-coach" : "/en/academy/mentor-coach"} className="rounded-2xl bg-violet-500 px-5 py-3 text-sm font-black text-white">
              {isFa ? "تحلیل مربی" : "Mentor analysis"}
            </Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[isFa ? "تکرار تصمیم‌های هیجانی" : "Emotional decision pattern", isFa ? "رعایت حد ابطال" : "Invalidation discipline", isFa ? "نیاز به مرور درس مرتبط" : "Related lesson review"].map((item, index) => (
              <div key={item} className="rounded-[24px] border border-cyan-300/15 bg-cyan-500/10 p-4">
                <p className="text-sm font-black text-slate-950 dark:text-white">{item}</p>
                <p className="mt-2 text-xs font-bold leading-6 text-[color:var(--tp-muted)]">
                  {index === 0 ? (isFa ? "از روی انتخاب‌های پرریسک تشخیص داده می‌شود." : "Detected from high-risk choices.") : index === 1 ? (isFa ? "با سناریوهای ریسک و خروج سنجیده می‌شود." : "Measured through risk and exit scenarios.") : (isFa ? "بعد از هر پاسخ، مسیر مرور پیشنهاد می‌شود." : "A review path is suggested after each answer.")}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 grid gap-5">
          {scenarios.map((scenario) => {
            const stored = state.completed[scenario.id];
            const choiceId = selectedChoice[scenario.id] || stored?.choice;
            const selected = scenario.choices.find((item) => item.id === choiceId);
            const Icon = icon(scenario.kind);
            return (
              <article key={scenario.id} className="overflow-hidden rounded-[34px] border border-slate-200 bg-white/92 shadow-[0_18px_70px_rgba(15,23,42,.10)] dark:border-white/10 dark:bg-white/[0.055]">
                <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="p-6 lg:p-7">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-700 dark:text-cyan-200"><Icon className="h-4 w-4" /> {isFa ? `ترم ${scenario.term}` : `Term ${scenario.term}`}</span>
                      <span className="rounded-full bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-700 dark:text-amber-200">+{scenario.xp} XP</span>
                    </div>
                    <h2 className="mt-4 text-2xl font-black leading-9 text-slate-950 dark:text-white">{isFa ? scenario.titleFa : scenario.titleEn}</h2>
                    <p className="mt-3 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">{isFa ? scenario.subtitleFa : scenario.subtitleEn}</p>
                    <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/40">
                      <p className="text-sm font-black text-slate-950 dark:text-white">{isFa ? "وضعیت بازار" : "Market state"}</p>
                      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {(isFa ? scenario.marketFa : scenario.marketEn).map((item) => <li key={item} className="flex gap-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-500" />{item}</li>)}
                      </ul>
                    </div>
                    <p className="mt-4 rounded-2xl border border-violet-300/20 bg-violet-500/10 p-4 text-sm font-black leading-7 text-violet-700 dark:text-violet-100">{isFa ? scenario.objectiveFa : scenario.objectiveEn}</p>
                  </div>

                  <div className="border-t border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-slate-950/40 lg:border-s lg:border-t-0">
                    <p className="text-sm font-black text-slate-950 dark:text-white">{isFa ? "ژورنال قبل از تصمیم" : "Pre-decision journal"}</p>
                    <div className="mt-3 grid gap-3">
                      <input
                        value={journal[scenario.id]?.emotionState || ""}
                        onChange={(event) => setJournal((prev) => ({ ...prev, [scenario.id]: { entryReason: prev[scenario.id]?.entryReason || "", riskPlan: prev[scenario.id]?.riskPlan || "", emotionState: event.target.value } }))}
                        placeholder={isFa ? "الان حس غالب من چیست؟ ترس، طمع، عجله یا آرامش؟" : "What is my dominant emotion: fear, greed, urgency or calm?"}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-cyan-400 dark:border-white/10 dark:bg-white/[0.04]"
                      />
                      <textarea
                        value={journal[scenario.id]?.entryReason || ""}
                        onChange={(event) => setJournal((prev) => ({ ...prev, [scenario.id]: { emotionState: prev[scenario.id]?.emotionState || "", riskPlan: prev[scenario.id]?.riskPlan || "", entryReason: event.target.value } }))}
                        placeholder={isFa ? "دلیل تصمیم را قبل از انتخاب بنویس؛ نه بعد از دیدن نتیجه." : "Write the reason before choosing, not after seeing the result."}
                        className="min-h-20 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold leading-7 outline-none transition focus:border-cyan-400 dark:border-white/10 dark:bg-white/[0.04]"
                      />
                      <textarea
                        value={journal[scenario.id]?.riskPlan || ""}
                        onChange={(event) => setJournal((prev) => ({ ...prev, [scenario.id]: { emotionState: prev[scenario.id]?.emotionState || "", entryReason: prev[scenario.id]?.entryReason || "", riskPlan: event.target.value } }))}
                        placeholder={isFa ? "اگر اشتباه کنم، برنامه کنترل ریسک من چیست؟" : "If I am wrong, what is my risk-control plan?"}
                        className="min-h-20 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold leading-7 outline-none transition focus:border-cyan-400 dark:border-white/10 dark:bg-white/[0.04]"
                      />
                    </div>
                    <p className="mt-5 text-sm font-black text-slate-950 dark:text-white">{isFa ? "تصمیم شما" : "Your decision"}</p>
                    <div className="mt-4 space-y-3">
                      {scenario.choices.map((choice) => (
                        <button key={choice.id} onClick={() => submit(scenario.id, choice.id, choice.score, scenario.xp)} type="button" className={`w-full rounded-2xl border p-4 text-start text-sm font-black leading-7 transition ${choiceId === choice.id ? "border-cyan-400 bg-cyan-500/10 text-cyan-700 dark:text-cyan-100" : "border-slate-200 bg-white text-slate-700 hover:border-cyan-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200"}`}>
                          {isFa ? choice.labelFa : choice.labelEn}
                        </button>
                      ))}
                    </div>
                    {selected ? (
                      <div className="mt-5 rounded-[24px] border border-emerald-300/25 bg-emerald-500/10 p-4">
                        <div className="flex items-center justify-between gap-3"><p className="font-black text-emerald-700 dark:text-emerald-100">{isFa ? "بازخورد Mentor" : "Mentor feedback"}</p><span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-black text-white">{selected.score}/100</span></div>
                        <p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-200">{isFa ? selected.feedbackFa : selected.feedbackEn}</p>
                        <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-3 text-xs font-bold leading-6 text-cyan-900 dark:text-cyan-100">
                          {isFa
                            ? `ثبت ژورنال: احساس «${journal[scenario.id]?.emotionState || "ثبت نشده"}»؛ برنامه ریسک ${journal[scenario.id]?.riskPlan ? "نوشته شد" : "نیاز به تکمیل دارد"}.`
                            : `Journal: emotion “${journal[scenario.id]?.emotionState || "not recorded"}”; risk plan ${journal[scenario.id]?.riskPlan ? "written" : "needs completion"}.`}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link href={isFa ? scenario.lessonFa : scenario.lessonEn} className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-black text-white">{isFa ? "مرور درس مرتبط" : "Review related lesson"}</Link>
                          <Link href={isFa ? "/academy/ai-guide" : "/en/academy/ai-guide"} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-3 py-2 text-xs font-black text-white"><Bot className="h-4 w-4" /> {isFa ? "پرسش از Mentor" : "Ask Mentor"}</Link>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4 text-sm font-bold leading-7 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                        <ClipboardList className="mb-2 h-5 w-5 text-cyan-500" />
                        {isFa ? "یک تصمیم انتخاب کن تا بازخورد آموزشی، امتیاز و مسیر مرور دریافت کنی." : "Choose a decision to receive feedback, score and a review path."}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
