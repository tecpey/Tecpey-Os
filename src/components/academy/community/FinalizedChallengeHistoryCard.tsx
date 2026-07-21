"use client";

import { CheckCircle2, Clock3, History, LoaderCircle, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import {
  parseOfficialJournalChallengeHistoryPayload,
  type OfficialJournalChallengeFinalizedResultClient,
} from "@/lib/community-journal-challenge-history-client";

function faDateTime(value: string): string {
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function FinalizedChallengeHistoryCard() {
  const [result, setResult] = useState<OfficialJournalChallengeFinalizedResultClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/community/challenge-history", {
          credentials: "include",
          cache: "no-store",
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!active) return;
        const parsed = parseOfficialJournalChallengeHistoryPayload(payload);
        if (!response.ok || parsed === undefined) {
          setUnavailable(true);
          return;
        }
        setResult(parsed);
      } catch {
        if (active) setUnavailable(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <section className="flex items-center justify-center gap-2 rounded-[24px] border border-white/10 bg-white/[0.02] p-5 text-xs font-bold text-slate-500">
        <LoaderCircle className="h-4 w-4 animate-spin" /> دریافت نتیجه نهایی چرخه قبلی
      </section>
    );
  }

  if (unavailable) {
    return (
      <section className="flex items-start gap-3 rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-5">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div>
          <p className="text-sm font-black text-amber-100">تاریخچه رسمی موقتاً در دسترس نیست</p>
          <p className="mt-1 text-xs font-bold leading-6 text-amber-100/70">
            هیچ نتیجه محلی یا نمایشی جایگزین نمی‌شود. وضعیت پس از بازگشت Authority سرور دوباره دریافت خواهد شد.
          </p>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="flex items-start gap-3 rounded-[24px] border border-white/10 bg-white/[0.02] p-5">
        <History className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
        <div>
          <p className="text-sm font-black text-slate-300">هنوز چرخه نهایی‌شده‌ای وجود ندارد</p>
          <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
            پس از پایان اولین چرخه‌ای که در آن عضو شده‌اید، Worker سرور نتیجه قطعی را اینجا نمایش می‌دهد.
          </p>
        </div>
      </section>
    );
  }

  const completed = result.status === "completed";
  const coverage = Math.round(result.progress.coverageRate * 100);
  return (
    <section className={`rounded-[24px] border p-5 ${completed
      ? "border-emerald-400/25 bg-emerald-400/5"
      : "border-slate-500/20 bg-slate-500/5"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-slate-500">نتیجه قطعی چرخه {result.cycle.key}</span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${completed
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
              : "border-slate-500/20 bg-slate-500/10 text-slate-300"}`}>
              {completed ? "تکمیل‌شده" : "تکمیل‌نشده"}
            </span>
          </div>
          <p className="mt-3 text-sm font-black text-white">چالش بازتاب ژورنال</p>
          <p className="mt-2 text-xs font-bold leading-6 text-slate-400">
            {result.progress.validReflections} Reflection معتبر از {result.progress.eligibleClosedTrades} معامله واجد شرایط؛ پوشش {coverage}٪.
          </p>
        </div>
        {completed
          ? <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-300" />
          : <Clock3 className="h-6 w-6 shrink-0 text-slate-500" />}
      </div>
      <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/25 p-3 text-xs font-bold leading-6 text-slate-500">
        پایان چرخه: {faDateTime(result.cycle.endsAt)} · نهایی‌سازی سرور: {faDateTime(result.finalizedAt)}
      </div>
      <p className="mt-3 text-[10px] font-bold leading-5 text-amber-200/70">
        XP = ۰، Badge = ندارد و پاداش مالی = ندارد. این نتیجه فقط Completion رسمی همان چرخه است.
      </p>
    </section>
  );
}
