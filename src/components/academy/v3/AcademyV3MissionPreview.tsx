"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
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
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    correct: boolean;
    reassessmentDueAfter: string;
    feedback: {
      locale: Locale;
      missionVersion: number;
      missionSha256: string;
      rationale: string;
      choiceFeedback: string;
      evidenceThatCouldChangeDecision: string;
    };
  } | null>(null);
  const [phase, setPhase] = useState<"idle" | "issuing" | "ready" | "submitting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const issueKeyRef = useRef<string | null>(null);
  const decisionKeyRef = useRef<{ choiceId: string; key: string } | null>(null);
  const feedbackRef = useRef<HTMLElement>(null);
  const isFa = locale === "fa";
  const submitted = decision !== null;
  const correct = decision?.correct === true;

  useEffect(() => {
    if (submitted) feedbackRef.current?.focus();
  }, [submitted]);

  const idempotencyKey = (kind: "issue" | "decision") => {
    const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `academy-v3:${kind}:${random}`;
  };

  const command = async <T,>(body: Record<string, string>, key: string): Promise<T> => {
    const response = await fetch("/api/academy-v3/missions", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as { data?: T; error?: string } | null;
    if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "academy_v3_request_failed");
    return payload.data;
  };

  const ensureAttempt = async () => {
    if (attemptId) return attemptId;
    const key = issueKeyRef.current ?? idempotencyKey("issue");
    issueKeyRef.current = key;
    setPhase("issuing");
    setErrorMessage(null);
    const payload = await command<{ attempt: { attemptId: string } }>({ action: "issue", locale, missionId: mission.id }, key);
    setAttemptId(payload.attempt.attemptId);
    setPhase("ready");
    return payload.attempt.attemptId;
  };

  const submitDecision = async () => {
    if (!choiceId || phase === "issuing" || phase === "submitting") return;
    try {
      const activeAttemptId = await ensureAttempt();
      setPhase("submitting");
      const existing = decisionKeyRef.current;
      const key = existing?.choiceId === choiceId ? existing.key : idempotencyKey("decision");
      decisionKeyRef.current = { choiceId, key };
      const payload = await command<{ decision: {
        correct: boolean;
        reassessmentDueAfter: string;
        feedback: {
          locale: Locale; missionVersion: number; missionSha256: string;
          rationale: string; choiceFeedback: string; evidenceThatCouldChangeDecision: string;
        };
      } }>(
        { action: "decide", attemptId: activeAttemptId, choiceId }, key,
      );
      setDecision(payload.decision);
      setPhase("ready");
      setErrorMessage(null);
    } catch {
      setPhase("error");
      setErrorMessage(isFa ? "ثبت تصمیم کامل نشد. دوباره تلاش کنید؛ تلاش مجدد نتیجه تکراری ایجاد نمی‌کند." : "Your decision was not confirmed. Try again; retrying will not create duplicate evidence.");
    }
  };

  const reset = () => {
    setChoiceId(null);
    setDecision(null);
    setPhase(attemptId ? "ready" : "idle");
    setErrorMessage(null);
    decisionKeyRef.current = null;
  };

  return (
    <article
      dir={isFa ? "rtl" : "ltr"}
      className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[#07101c]/95 p-5 text-slate-100 shadow-[0_28px_90px_rgba(0,0,0,0.36)] sm:p-8"
      aria-labelledby={`${mission.id}-title`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.14),transparent_68%)]" />
      <header className="relative max-w-2xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
          {isFa ? "ماموریت تصمیم‌گیری" : "Decision mission"}
        </p>
        <h1 id={`${mission.id}-title`} className="mt-5 text-3xl font-black leading-[1.25] tracking-[-0.025em] text-white sm:text-4xl">
          {mission.title[locale]}
        </h1>
        <p className="mt-4 text-[15px] font-semibold leading-8 text-slate-300">{mission.mentalModel[locale]}</p>
      </header>

      <section className="relative mt-8 rounded-[28px] border border-cyan-300/15 bg-gradient-to-b from-cyan-300/[0.08] to-white/[0.025] p-5 sm:p-6" aria-labelledby={`${mission.id}-scenario`}>
        <h2 id={`${mission.id}-scenario`} className="text-sm font-black text-cyan-200">
          {isFa ? "سناریو" : "Scenario"}
        </h2>
        <p className="mt-2 text-sm font-bold leading-7 text-slate-200">{mission.scenario.context[locale]}</p>
      </section>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
          <h2 className="text-sm font-black">{isFa ? "شواهد موجود" : "Known evidence"}</h2>
          <ul className="mt-3 space-y-2 text-sm font-bold leading-6 text-slate-300">
            {mission.scenario.knownEvidence.map((item, index) => <li key={`${mission.id}-evidence-${index}`}>• {item[locale]}</li>)}
          </ul>
        </section>
        <section className="rounded-3xl border border-amber-300/15 bg-amber-300/[0.04] p-5">
          <h2 className="text-sm font-black text-amber-100">{isFa ? "عدم‌قطعیت‌های مهم" : "Material uncertainty"}</h2>
          <ul className="mt-3 space-y-2 text-sm font-bold leading-6 text-slate-300">
            {mission.scenario.uncertainty.map((item, index) => <li key={`${mission.id}-uncertainty-${index}`}>• {item[locale]}</li>)}
          </ul>
        </section>
      </div>

      <fieldset className="mt-7" disabled={submitted || phase === "issuing" || phase === "submitting"}>
        <legend className="text-xl font-black text-white">{isFa ? "با اطلاعات فعلی چه تصمیمی می‌گیرید؟" : "What would you decide with the information available?"}</legend>
        <div className="mt-3 space-y-3">
          {mission.scenario.choices.map((choice) => {
            const checked = choice.id === choiceId;
            return (
              <label
                key={choice.id}
                className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-[22px] border p-4 text-sm font-bold leading-7 transition-[border-color,background-color,transform] duration-150 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cyan-200 sm:p-5 ${
                  checked ? "border-cyan-300/60 bg-cyan-300/10" : "border-white/10 bg-white/[0.035]"
                }`}
              >
                <input
                  type="radio"
                  name={mission.id}
                  checked={checked}
                  onChange={() => setChoiceId(choice.id)}
                  className="mt-1 h-5 w-5 shrink-0 accent-cyan-200"
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
          disabled={!choiceId || phase === "issuing" || phase === "submitting"}
          onClick={submitDecision}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-cyan-200 px-5 py-3.5 text-sm font-black text-[#06111e] shadow-[0_14px_34px_rgba(34,211,238,0.16)] transition-[transform,opacity,box-shadow] duration-150 hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07101c]"
        >
          {phase === "issuing" || phase === "submitting" ? (
            <><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{isFa ? "در حال ثبت امن…" : "Submitting securely…"}</>
          ) : (isFa ? "ثبت تصمیم" : "Submit decision")}
          <ArrowRight className={`h-4 w-4 ${isFa ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      ) : (
        <section
          ref={feedbackRef}
          tabIndex={-1}
          className={`mt-6 rounded-3xl border p-5 outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07101c] ${correct ? "border-emerald-300/25 bg-emerald-300/[0.07]" : "border-amber-300/25 bg-amber-300/[0.07]"}`}
          aria-labelledby={`${mission.id}-feedback-title`}
        >
          <div className="flex items-start gap-3">
            {correct ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />}
            <div>
              <h2 id={`${mission.id}-feedback-title`} className="font-black">
                {correct
                  ? (isFa ? "فرآیند تصمیم قابل دفاع است" : "The decision process is defensible")
                  : (isFa ? "این انتخاب نیاز به بازبینی دارد" : "This choice needs review")}
              </h2>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{correct ? decision.feedback.rationale : decision.feedback.choiceFeedback}</p>
            </div>
          </div>
          <div className="mt-5 border-t border-white/10 pt-4">
            <h3 className="text-sm font-black">{isFa ? "چه چیزی می‌تواند تصمیم را تغییر دهد؟" : "What could change the decision?"}</h3>
            <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{decision.feedback.evidenceThatCouldChangeDecision}</p>
          </div>
          <button type="button" onClick={reset} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-xs font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {isFa ? "مرور دوباره سناریو" : "Review the scenario again"}
          </button>
        </section>
      )}

      {errorMessage ? <p role="alert" className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4 text-sm font-bold leading-7 text-rose-100">{errorMessage}</p> : null}
      <p role="status" aria-live="polite" className="sr-only">{phase === "issuing" || phase === "submitting" ? (isFa ? "در حال ثبت تصمیم" : "Submitting decision") : ""}</p>

      <footer className="mt-7 flex items-start gap-2 border-t border-white/[0.07] pt-5 text-xs font-semibold leading-6 text-slate-500">
        {isFa
          ? "این پیش‌نمایش آموزشی امتیاز رسمی، تسلط تأییدشده، رتبه لیگ یا مجوز مالی ایجاد نمی‌کند."
          : "This learning preview creates no score, mastery, league rank, or financial entitlement."}
      </footer>
    </article>
  );
}
