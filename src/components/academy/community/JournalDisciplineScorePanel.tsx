"use client";

import { useCallback, useEffect, useState } from "react";
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

function percent(basisPoints: number): string {
  return `${(basisPoints / 100).toLocaleString("fa-IR", {
    minimumFractionDigits: basisPoints % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}٪`;
}

function number(value: number): string {
  return value.toLocaleString("fa-IR");
}

export function JournalDisciplineScorePanel() {
  const [result, setResult] =
    useState<JournalDisciplineScoreClientResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setResult(await loadJournalDisciplineScoreClient());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section
        className="rounded-[24px] border border-violet-300/15 bg-slate-900/60 p-5"
        aria-busy="true"
        aria-label="در حال بررسی دسترسی امتیاز خصوصی انضباط ژورنال"
      >
        <div className="flex items-center gap-3">
          <BookCheck className="h-5 w-5 animate-pulse text-violet-300" />
          <p className="text-sm font-black text-slate-300">
            در حال بررسی Consent و Evidence سرور…
          </p>
        </div>
      </section>
    );
  }

  if (result?.consentRequired) {
    return (
      <section className="rounded-[24px] border border-cyan-300/20 bg-cyan-300/5 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black text-cyan-50">
                محاسبه امتیاز خصوصی به رضایت صریح شما نیاز دارد
              </p>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-black text-cyan-100">
                Default Off
              </span>
            </div>
            <p className="mt-2 text-xs font-bold leading-6 text-cyan-100/70">
              تک‌پی بدون فعال‌سازی آگاهانه شما هیچ Score شخصی محاسبه نمی‌کند. این
              رضایت از نمایش عمومی پروفایل و Leaderboard کاملاً مستقل است.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!result?.available) {
    return (
      <section className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black text-amber-100">
                امتیاز خصوصی انضباط ژورنال در دسترس نیست
              </p>
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-black text-amber-200">
                Fail Closed
              </span>
            </div>
            <p className="mt-2 text-xs font-bold leading-6 text-amber-100/70">
              تا بازیابی Authority، هیچ Score تخمینی یا Browser fallback نمایش
              داده نمی‌شود.
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              تلاش دوباره
            </button>
          </div>
        </div>
      </section>
    );
  }

  const score = result.score;
  const available =
    score.status === "available" && score.scoreBasisPoints !== null;

  return (
    <section className="rounded-[24px] border border-violet-300/20 bg-violet-300/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-300/10">
            <BookCheck className="h-5 w-5 text-violet-200" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black text-white">
                امتیاز خصوصی انضباط ژورنال
              </p>
              <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2 py-0.5 text-[10px] font-black text-violet-200">
                Policy v1
              </span>
            </div>
            <p className="mt-1 text-xs font-bold leading-6 text-slate-400">
              فقط کیفیت و ثبات ثبت Reflection در Challenge رسمی؛ نه مهارت معامله
              یا سودآوری.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2.5 py-1 text-[10px] font-black text-slate-400">
          Private Only
        </span>
      </div>

      {available ? (
        <>
          <div className="mt-5 flex items-end justify-between gap-4 rounded-2xl border border-white/5 bg-slate-950/40 p-4">
            <div>
              <p className="text-[11px] font-bold text-slate-500">
                Journal Discipline Score
              </p>
              <p className="mt-1 text-3xl font-black text-violet-100">
                {percent(score.scoreBasisPoints!)}
              </p>
            </div>
            <TrendingUp className="h-7 w-7 text-violet-300" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3 text-center">
              <p className="text-base font-black text-white">
                {number(score.evaluatedCycles)}
              </p>
              <p className="mt-1 text-[10px] font-bold text-slate-500">
                چرخه ارزیابی‌شده
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3 text-center">
              <p className="text-base font-black text-emerald-200">
                {percent(score.completionConsistencyBasisPoints)}
              </p>
              <p className="mt-1 text-[10px] font-bold text-slate-500">
                ثبات تکمیل · ۶۰٪
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3 text-center">
              <p className="text-base font-black text-cyan-200">
                {percent(score.meanCoverageBasisPoints)}
              </p>
              <p className="mt-1 text-[10px] font-bold text-slate-500">
                میانگین پوشش · ۴۰٪
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-2xl border border-white/5 bg-slate-950/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black text-slate-300">
              Evidence هنوز کافی نیست
            </p>
            <span className="text-xs font-black text-violet-200">
              {number(score.evaluatedCycles)} از {number(score.minimumCycles)} چرخه
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
            برای جلوگیری از قضاوت زودهنگام، پیش از چهار چرخه نهایی‌شده هیچ Score
            نمایش داده نمی‌شود.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3">
        <p className="text-[11px] font-bold leading-5 text-cyan-100/65">
          این Score خصوصی است و هیچ Rank، Percentile، Reward، XP، Badge، بورسیه
          یا تصمیم Mentor/Instructor ایجاد نمی‌کند.
        </p>
      </div>
    </section>
  );
}
