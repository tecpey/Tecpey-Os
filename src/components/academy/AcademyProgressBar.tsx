"use client";
import Link from "next/link";
import { useAcademyPathProgress } from "@/hooks/useAcademyPathProgress";

export function AcademyProgressBar({ locale }: { locale: "fa" | "en" }) {
  const { totalXp, streak, termProgress, loaded, error, refresh } = useAcademyPathProgress(locale);
  const isFa = locale === "fa";
  const format = new Intl.NumberFormat(isFa ? "fa-IR" : "en");
  const passed = Object.values(termProgress).filter(term => term.completed).length;
  return <div className="border-t border-fg/5 bg-cyan-500/5 px-4 py-1.5 text-xs" aria-label={isFa ? "پیشرفت آکادمی" : "Academy progress"}>
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
      {!loaded ? <p role="status">{isFa ? "در حال دریافت امتیاز…" : "Loading progress…"}</p> : error ? <button type="button" onClick={() => void refresh()} className="min-h-11 underline">{isFa ? "امتیاز دریافت نشد؛ تلاش دوباره" : "Progress unavailable; retry"}</button> : <>
        <span>{format.format(totalXp)} <abbr title={isFa ? "امتیاز تجربه ثبت‌شده" : "Recorded experience points"} className="no-underline">XP</abbr></span>
        <span>{format.format(streak)} {isFa ? "روز تداوم" : "day streak"}</span>
        <Link href={isFa ? "/academy/profile" : "/en/academy/profile"} className="inline-flex min-h-11 items-center rounded-lg px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">{format.format(passed)}/{format.format(7)} {isFa ? "ترم تکمیل‌شده" : "terms complete"}</Link>
      </>}
    </div>
  </div>;
}
