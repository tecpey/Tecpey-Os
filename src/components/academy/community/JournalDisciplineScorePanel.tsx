"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import {
  BookCheck,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import {
  loadJournalDisciplineScoreClient,
  type JournalDisciplineScoreClientResult,
} from "@/lib/community-journal-discipline-score-client";
import { ReputationScoringConsentControl } from "./ReputationScoringConsentControl";

type Copy = {
  loading: string;
  unavailableTitle: string;
  unavailableBody: string;
  retry: string;
  title: string;
  subtitle: string;
  policy: string;
  privateOnly: string;
  scoreLabel: string;
  cycles: string;
  completion: string;
  coverage: string;
  insufficient: string;
  ofCycles: (current: string, minimum: string) => string;
  insufficientBody: string;
  safety: string;
};

const COPY: Record<"fa" | "en", Copy> = {
  fa: {
    loading: "در حال بررسی Consent و Evidence سرور…",
    unavailableTitle: "امتیاز خصوصی انضباط ژورنال در دسترس نیست",
    unavailableBody:
      "تا بازیابی Authority، هیچ Score تخمینی یا Browser fallback نمایش داده نمی‌شود.",
    retry: "تلاش دوباره",
    title: "امتیاز خصوصی انضباط ژورنال",
    subtitle:
      "فقط ثبات ثبت Reflection در Challenge رسمی؛ نه مهارت معامله یا سودآوری.",
    policy: "Policy v1",
    privateOnly: "فقط خصوصی",
    scoreLabel: "Journal Discipline Score",
    cycles: "چرخه ارزیابی‌شده",
    completion: "ثبات تکمیل · ۶۰٪",
    coverage: "میانگین پوشش · ۴۰٪",
    insufficient: "Evidence هنوز کافی نیست",
    ofCycles: (current, minimum) => `${current} از ${minimum} چرخه`,
    insufficientBody:
      "برای جلوگیری از قضاوت زودهنگام، پیش از چهار چرخه نهایی‌شده هیچ Score نمایش داده نمی‌شود.",
    safety:
      "این Score خصوصی است و هیچ Rank، Percentile، Reward، XP، Badge، بورسیه یا تصمیم Mentor/Instructor ایجاد نمی‌کند.",
  },
  en: {
    loading: "Checking server consent and evidence…",
    unavailableTitle: "Private Journal Discipline Score is unavailable",
    unavailableBody:
      "No estimated score or browser fallback is shown while the authority is unavailable.",
    retry: "Try again",
    title: "Private Journal Discipline Score",
    subtitle:
      "Measures consistent Reflection coverage in official challenges—not trading skill or profitability.",
    policy: "Policy v1",
    privateOnly: "Private only",
    scoreLabel: "Journal Discipline Score",
    cycles: "Evaluated cycles",
    completion: "Completion consistency · 60%",
    coverage: "Mean coverage · 40%",
    insufficient: "Evidence is not sufficient yet",
    ofCycles: (current, minimum) => `${current} of ${minimum} cycles`,
    insufficientBody:
      "To prevent premature judgment, no score is displayed before four finalized cycles.",
    safety:
      "This private score creates no rank, percentile, reward, XP, badge, scholarship, Mentor decision, or Instructor decision.",
  },
};

export function JournalDisciplineScorePanel() {
  const locale = useLocale();
  const language = locale === "fa" ? "fa" : "en";
  const copy = COPY[language];
  const numberLocale = language === "fa" ? "fa-IR" : "en-GB";
  const [result, setResult] =
    useState<JournalDisciplineScoreClientResult | null>(null);
  const [loading, setLoading] = useState(true);

  const percent = useCallback(
    (basisPoints: number): string =>
      `${(basisPoints / 100).toLocaleString(numberLocale, {
        minimumFractionDigits: basisPoints % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      })}%`,
    [numberLocale],
  );

  const number = useCallback(
    (value: number): string => value.toLocaleString(numberLocale),
    [numberLocale],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setResult(await loadJournalDisciplineScoreClient());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  let scoreContent: React.ReactNode = null;

  if (loading) {
    scoreContent = (
      <section
        className="rounded-[24px] border border-violet-300/15 bg-slate-900/60 p-5"
        aria-busy="true"
        aria-label={copy.loading}
      >
        <div className="flex items-center gap-3">
          <BookCheck className="h-5 w-5 animate-pulse text-violet-300" aria-hidden="true" />
          <p className="text-sm font-black text-slate-300">{copy.loading}</p>
        </div>
      </section>
    );
  } else if (result?.consentRequired) {
    scoreContent = null;
  } else if (!result?.available) {
    scoreContent = (
      <section className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black text-amber-100">{copy.unavailableTitle}</p>
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-black text-amber-200">
                Fail Closed
              </span>
            </div>
            <p className="mt-2 text-xs font-bold leading-6 text-amber-100/70">
              {copy.unavailableBody}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs font-black text-amber-100 transition hover:bg-amber-300/15 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {copy.retry}
            </button>
          </div>
        </div>
      </section>
    );
  } else {
    const score = result.score;
    const available =
      score.status === "available" && score.scoreBasisPoints !== null;

    scoreContent = (
      <section className="rounded-[24px] border border-violet-300/20 bg-violet-300/[0.04] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-300/10">
              <BookCheck className="h-5 w-5 text-violet-200" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-black text-white">{copy.title}</p>
                <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2 py-0.5 text-[10px] font-black text-violet-200">
                  {copy.policy}
                </span>
              </div>
              <p className="mt-1 text-xs font-bold leading-6 text-slate-400">
                {copy.subtitle}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2.5 py-1 text-[10px] font-black text-slate-400">
            {copy.privateOnly}
          </span>
        </div>

        {available ? (
          <>
            <div className="mt-5 flex items-end justify-between gap-4 rounded-2xl border border-white/5 bg-slate-950/40 p-4">
              <div>
                <p className="text-[11px] font-bold text-slate-500">{copy.scoreLabel}</p>
                <p className="mt-1 text-3xl font-black text-violet-100">
                  {percent(score.scoreBasisPoints!)}
                </p>
              </div>
              <TrendingUp className="h-7 w-7 text-violet-300" aria-hidden="true" />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3 text-center">
                <p className="text-base font-black text-white">
                  {number(score.evaluatedCycles)}
                </p>
                <p className="mt-1 text-[10px] font-bold text-slate-500">{copy.cycles}</p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3 text-center">
                <p className="text-base font-black text-emerald-200">
                  {percent(score.completionConsistencyBasisPoints)}
                </p>
                <p className="mt-1 text-[10px] font-bold text-slate-500">{copy.completion}</p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3 text-center">
                <p className="text-base font-black text-cyan-200">
                  {percent(score.meanCoverageBasisPoints)}
                </p>
                <p className="mt-1 text-[10px] font-bold text-slate-500">{copy.coverage}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-2xl border border-white/5 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black text-slate-300">{copy.insufficient}</p>
              <span className="text-xs font-black text-violet-200">
                {copy.ofCycles(
                  number(score.evaluatedCycles),
                  number(score.minimumCycles),
                )}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-violet-400"
                style={{
                  width: `${Math.min(
                    100,
                    (score.evaluatedCycles / score.minimumCycles) * 100,
                  )}%`,
                }}
              />
            </div>
            <p className="mt-3 text-[11px] font-bold leading-5 text-slate-500">
              {copy.insufficientBody}
            </p>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3">
          <p className="text-[11px] font-bold leading-5 text-cyan-100/65">
            {copy.safety}
          </p>
        </div>
      </section>
    );
  }

  return (
    <div
      className="space-y-4"
      dir={language === "fa" ? "rtl" : "ltr"}
    >
      {scoreContent}
      <ReputationScoringConsentControl
        onConsentChanged={() => {
          void load();
        }}
      />
    </div>
  );
}
