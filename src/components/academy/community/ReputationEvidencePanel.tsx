"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import {
  loadCommunityReputationEvidenceClient,
  type CommunityReputationEvidenceClientResult,
} from "@/lib/community-reputation-evidence-client";

function percent(basisPoints: number): string {
  return `${(basisPoints / 100).toLocaleString("fa-IR", {
    minimumFractionDigits: basisPoints % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}٪`;
}

function faNumber(value: number): string {
  return value.toLocaleString("fa-IR");
}

export function ReputationEvidencePanel() {
  const [result, setResult] = useState<CommunityReputationEvidenceClientResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const next = await loadCommunityReputationEvidenceClient();
    setResult(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section
        className="rounded-[24px] border border-cyan-300/15 bg-slate-900/60 p-5"
        aria-busy="true"
        aria-label="در حال بارگذاری شواهد اعتبار"
      >
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 animate-pulse text-cyan-300" />
          <p className="text-sm font-black text-slate-300">در حال دریافت Evidence رسمی از سرور…</p>
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
              <p className="font-black text-amber-100">Evidence اعتبار در دسترس نیست</p>
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-black text-amber-200">
                Fail Closed
              </span>
            </div>
            <p className="mt-2 text-xs font-bold leading-6 text-amber-100/70">
              تا بازیابی Authority سرور، هیچ امتیاز، رتبه، پاداش یا تصمیم Mentor نمایش داده نمی‌شود.
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

  const summary = result.summary;
  const hasEvidence = summary.finalizedCycles > 0;

  return (
    <section className="rounded-[24px] border border-cyan-300/20 bg-cyan-300/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10">
            <Trophy className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black text-white">شواهد اعتبار جامعه</p>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black text-emerald-200">
                Server Evidence
              </span>
            </div>
            <p className="mt-1 text-xs font-bold leading-6 text-slate-400">
              فقط از Finalizationهای تغییرناپذیر Challenge رسمی؛ بدون Score و Rank.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2.5 py-1 text-[10px] font-black text-slate-400">
          Evidence Only
        </span>
      </div>

      {hasEvidence ? (
        <>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3 text-center">
              <p className="text-lg font-black text-white">{faNumber(summary.finalizedCycles)}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-500">چرخه نهایی‌شده</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3 text-center">
              <p className="text-lg font-black text-emerald-200">{faNumber(summary.completedCycles)}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-500">تکمیل معتبر</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3 text-center">
              <p className="text-lg font-black text-cyan-200">
                {percent(summary.aggregateCoverageBasisPoints)}
              </p>
              <p className="mt-1 text-[10px] font-bold text-slate-500">پوشش Reflection</p>
            </div>
          </div>

          {summary.latest && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/5 bg-slate-950/40 p-4">
              <CheckCircle2
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  summary.latest.outcome === "completed"
                    ? "text-emerald-300"
                    : "text-slate-500"
                }`}
              />
              <div>
                <p className="text-xs font-black text-slate-200">
                  آخرین چرخه: {summary.latest.cycle.key} — {summary.latest.outcome === "completed" ? "تکمیل‌شده" : "تکمیل‌نشده"}
                </p>
                <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
                  {faNumber(summary.latest.validReflections)} Reflection معتبر از {faNumber(summary.latest.eligibleClosedTrades)} معامله واجد شرایط؛ منشأ Finalization: {summary.latest.finalizationSource === "worker" ? "Worker" : "Interactive"}.
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mt-4 rounded-2xl border border-white/5 bg-slate-950/40 p-4">
          <p className="text-xs font-black text-slate-300">هنوز چرخه نهایی‌شده‌ای ثبت نشده است.</p>
          <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
            پس از پایان یا تکمیل معتبر Challenge رسمی، Ledger سرور Evidence را به‌صورت Append-only ثبت می‌کند.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-violet-400/15 bg-violet-400/5 p-3">
        <p className="text-[11px] font-bold leading-5 text-violet-100/70">
          امتیاز، رتبه، Badge، بورسیه، پاداش مالی و تصمیم Mentor/Instructor در این نسخه عمداً غیرفعال‌اند.
        </p>
      </div>
    </section>
  );
}
