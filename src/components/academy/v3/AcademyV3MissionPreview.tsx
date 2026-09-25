"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, RotateCcw } from "lucide-react";
import type { AcademyV3ReferenceMission } from "@/data/academyV3ReferenceMissions";

type Locale = "fa" | "en";

export function AcademyV3MissionPreview({
  mission,
  locale,
}: {
  mission: AcademyV3ReferenceMission;
  locale: Locale;
}) {
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const isFa = locale === "fa";
  const selected = useMemo(
    () => mission.scenario.choices.find((choice) => choice.id === choiceId) ?? null,
    [choiceId, mission.scenario.choices],
  );
  const correct = submitted && choiceId === mission.scenario.correctChoiceId;

  const reset = () => {
    setChoiceId(null);
    setSubmitted(false);
  };

  return (
    <article
      dir={isFa ? "rtl" : "ltr"}
      className="rounded-[32px] border border-white/10 bg-slate-950/90 p-5 text-slate-100 shadow-2xl shadow-black/20 sm:p-7"
      aria-labelledby={`${mission.id}-title`}
    >
      <header>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
          {isFa ? "ماموریت تصمیم‌گیری" : "Decision mission"}
        </p>
        <h1 id={`${mission.id}-title`} className="mt-2 text-2xl font-black leading-tight sm:text-3xl">
          {mission.title[locale]}
        </h1>
        <p className="mt-4 text-sm font-bold leading-7 text-slate-300">{mission.mentalModel[locale]}</p>
      </header>

      <section className="mt-7 rounded-3xl border border-cyan-300/15 bg-cyan-300/[0.06] p-5" aria-labelledby={`${mission.id}-scenario`}>
        <h2 id={`${mission.id}-scenario`} className="text-sm font-black text-cyan-200">
          {isFa ? "سناریو" : "Scenario"}
        </h2>
        <p className="mt-2 text-sm font-bold leading-7 text-slate-200">{mission.scenario.context[locale]}</p>
      </section>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
          <h2 className="text-sm font-black">{isFa ? "چیزهایی که می‌دانیم" : "What we know"}</h2>
          <ul className="mt-3 space-y-2 text-sm font-bold leading-6 text-slate-300">
            {mission.scenario.knownEvidence.map((item) => <li key={item.en}>• {item[locale]}</li>)}
          </ul>
        </section>
        <section className="rounded-3xl border border-amber-300/15 bg-amber-300/[0.04] p-5">
          <h2 className="text-sm font-black text-amber-100">{isFa ? "چیزهایی که هنوز نمی‌دانیم" : "What remains uncertain"}</h2>
          <ul className="mt-3 space-y-2 text-sm font-bold leading-6 text-slate-300">
            {mission.scenario.uncertainty.map((item) => <li key={item.en}>• {item[locale]}</li>)}
          </ul>
        </section>
      </div>

      <fieldset className="mt-7" disabled={submitted}>
        <legend className="text-base font-black">{isFa ? "تصمیم شما چیست؟" : "What is your decision?"}</legend>
        <div className="mt-3 space-y-3">
          {mission.scenario.choices.map((choice) => {
            const checked = choice.id === choiceId;
            return (
              <label
                key={choice.id}
                className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm font-bold leading-6 transition-[border-color,background-color] focus-within:ring-2 focus-within:ring-cyan-300 ${
                  checked ? "border-cyan-300/60 bg-cyan-300/10" : "border-white/10 bg-white/[0.035]"
                }`}
              >
                <input
                  type="radio"
                  name={mission.id}
                  checked={checked}
                  onChange={() => setChoiceId(choice.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-cyan-300"
                />
                <span>{choice.text[locale]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {!submitted ? (
        <button
          type="button"
          disabled={!choiceId}
          onClick={() => setSubmitted(true)}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition-opacity disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          {isFa ? "ثبت تصمیم و دیدن بازخورد" : "Submit decision and see feedback"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <section
          className={`mt-6 rounded-3xl border p-5 ${correct ? "border-emerald-300/25 bg-emerald-300/[0.07]" : "border-amber-300/25 bg-amber-300/[0.07]"}`}
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            {correct ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />}
            <div>
              <h2 className="font-black">
                {correct
                  ? (isFa ? "فرآیند تصمیم قابل دفاع است" : "The decision process is defensible")
                  : (isFa ? "این انتخاب نیاز به بازبینی دارد" : "This choice needs review")}
              </h2>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{mission.scenario.rationale[locale]}</p>
              {!correct && selected?.misconceptionId && (
                <p className="mt-3 text-xs font-black text-amber-200">
                  {isFa ? "الگوی خطای مرتبط: " : "Related reasoning pattern: "}{selected.misconceptionId}
                </p>
              )}
            </div>
          </div>
          <div className="mt-5 border-t border-white/10 pt-4">
            <h3 className="text-sm font-black">{isFa ? "چه چیزی می‌تواند تصمیم را تغییر دهد؟" : "What could change the decision?"}</h3>
            <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{mission.scenario.evidenceThatCouldChangeDecision[locale]}</p>
          </div>
          <button type="button" onClick={reset} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-xs font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {isFa ? "مرور دوباره" : "Review again"}
          </button>
        </section>
      )}

      <footer className="mt-6 text-xs font-bold leading-6 text-slate-500">
        {isFa
          ? "این پیش‌نمایش آموزشی امتیاز، mastery، رتبه لیگ یا مجوز مالی ایجاد نمی‌کند."
          : "This learning preview creates no score, mastery, league rank, or financial entitlement."}
      </footer>
    </article>
  );
}
