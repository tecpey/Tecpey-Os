"use client";

import { useEffect, useMemo, useState } from "react";
import type { AcademyMasteryLocale, AcademyMasterySeasonState } from "@/lib/academy-mastery-seasons-authority";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; state: AcademyMasterySeasonState }
  | { status: "login" }
  | { status: "unavailable" };

export function AcademyMasterySeasonsClientStatus({ locale = "fa" }: { locale?: AcademyMasteryLocale }) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const isFa = locale === "fa";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/academy-mastery-seasons", {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (response.status === 401) {
          setLoadState({ status: "login" });
          return;
        }
        if (!response.ok) {
          setLoadState({ status: "unavailable" });
          return;
        }
        const payload = await response.json() as {
          state?: AcademyMasterySeasonState;
          states?: Partial<Record<AcademyMasteryLocale, AcademyMasterySeasonState>>;
        };
        const state = payload.states?.[locale] ?? payload.state;
        if (state) setLoadState({ status: "ready", state });
        else setLoadState({ status: "unavailable" });
      } catch {
        if (!cancelled) setLoadState({ status: "unavailable" });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const content = useMemo(() => {
    if (loadState.status === "loading") {
      return isFa ? "در حال بررسی مسیر اختصاصی شما..." : "Checking your personalized path...";
    }
    if (loadState.status === "login") {
      return isFa
        ? "برای دیدن Seasonهای اختصاصی، ابتدا وارد حساب آکادمی شوید."
        : "Sign in to Academy to see your personalized seasons.";
    }
    if (loadState.status === "unavailable") {
      return isFa
        ? "سرویس Seasonهای اختصاصی فعلاً آماده نمایش نیست."
        : "Personalized seasons are temporarily unavailable.";
    }
    const first = loadState.state.recommendations[0];
    if (!first) {
      return isFa
        ? "بعد از ثبت سیگنال‌های یادگیری، پیشنهاد اختصاصی ساخته می‌شود."
        : "Personalized recommendations appear after learning signals are recorded.";
    }
    return isFa
      ? `پیشنهاد فعلی: ${first.season.titleFa}، سطح Progress Core شما ${loadState.state.progressCoreLevel} از ۱۰۰ است.`
      : `Current recommendation: ${first.season.titleEn}. Your Progress Core is ${loadState.state.progressCoreLevel}/100.`;
  }, [isFa, loadState]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
      <div className="rounded-[30px] border border-cyan-300/25 bg-cyan-300/10 p-5">
        <p className="text-xs font-black text-cyan-700 dark:text-cyan-200">
          {isFa ? "وضعیت سرورمحور Mastery Seasons" : "Server-backed Mastery Seasons"}
        </p>
        <p className="mt-3 text-sm font-bold leading-7 text-slate-700 dark:text-slate-200">{content}</p>
      </div>
    </div>
  );
}
