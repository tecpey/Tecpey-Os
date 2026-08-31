"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Play, ShieldAlert } from "lucide-react";
import type { AcademyMasteryLocale, AcademyMasterySeasonState } from "@/lib/academy-mastery-seasons-authority";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; state: AcademyMasterySeasonState }
  | { status: "login" }
  | { status: "unavailable" };

export function AcademyMasterySeasonsClientStatus({ locale = "fa" }: { locale?: AcademyMasteryLocale }) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [activatingSeason, setActivatingSeason] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
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

  async function activateSeason(seasonId: string) {
    if (activatingSeason) return;
    setActivatingSeason(seasonId);
    setActionMessage(null);
    try {
      const response = await fetch("/api/academy-mastery-seasons/activate", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `mastery-activate-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ locale, seasonId }),
      });
      const payload = await response.json() as {
        state?: AcademyMasterySeasonState;
        error?: string;
      };
      if (!response.ok || !payload.state) {
        if (payload.error === "mastery_core_terms_incomplete") {
          setActionMessage(isFa
            ? "فعال‌سازی ترم رشد بی‌نهایت فقط پس از ثبت قبولی هر ۷ ترم اصلی ممکن است."
            : "Infinite Growth activates only after all 7 core terms are recorded as passed.");
        } else if (payload.error === "mastery_ranking_consent_required") {
          setActionMessage(isFa
            ? "برای ورود به لیگ یادگیری، ابتدا رضایت نمایش رتبه را در پروفایل فعال کنید."
            : "Enable ranking visibility consent in your profile before joining the learning league.");
        } else {
          setActionMessage(isFa
            ? "فعال‌سازی انجام نشد. وضعیت حساب و اتصال را بررسی و دوباره تلاش کنید."
            : "Activation did not complete. Check your account and connection, then try again.");
        }
        return;
      }
      setLoadState({ status: "ready", state: payload.state });
      setActionMessage(isFa
        ? "Season فعال شد و چرخهٔ رشد شما اکنون از منبع سرور ثبت می‌شود."
        : "Season activated. Your growth cycle is now recorded by the server authority.");
    } catch {
      setActionMessage(isFa
        ? "سرویس فعال‌سازی فعلاً در دسترس نیست؛ هیچ پیشرفتی از دست نرفته است."
        : "Activation is temporarily unavailable; no progress was lost.");
    } finally {
      setActivatingSeason(null);
    }
  }

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
        {loadState.status === "ready" ? (
          <div className="mt-5 grid gap-3">
            {loadState.state.recommendations.slice(0, 3).map((recommendation) => {
              const status = recommendation.assignment?.status ?? null;
              const coreReady = loadState.state.completedTerms === 7;
              const consentReady = recommendation.season.kind !== "cohort-league" || loadState.state.rankingConsent;
              const active = status === "active";
              const completed = status === "completed";
              const busy = activatingSeason === recommendation.season.id;
              const disabled = !coreReady || !consentReady || !recommendation.eligible || active || completed || Boolean(activatingSeason);
              return (
                <section
                  key={recommendation.season.id}
                  className="rounded-2xl border border-cyan-300/20 bg-white/75 p-4 dark:bg-slate-950/45"
                  aria-labelledby={`mastery-season-${recommendation.season.id}`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 id={`mastery-season-${recommendation.season.id}`} className="font-black text-slate-950 dark:text-white">
                        {isFa ? recommendation.season.titleFa : recommendation.season.titleEn}
                      </h3>
                      <p className="mt-1 text-xs font-bold leading-6 text-slate-600 dark:text-slate-300">
                        {isFa ? recommendation.season.cadenceFa : recommendation.season.cadenceEn}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void activateSeason(recommendation.season.id)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-white transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-80 dark:focus-visible:ring-offset-slate-950"
                    >
                      {busy ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : active || completed ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                      {busy
                        ? (isFa ? "در حال فعال‌سازی…" : "Activating…")
                        : completed
                          ? (isFa ? "تکمیل‌شده" : "Completed")
                          : active
                            ? (isFa ? "فعال" : "Active")
                            : !coreReady
                              ? (isFa ? "پس از تکمیل ۷ ترم" : "After all 7 terms")
                              : !consentReady
                                ? (isFa ? "ابتدا رضایت نمایش رتبه" : "Enable ranking consent")
                                : (isFa ? "شروع Season" : "Start season")}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        ) : null}
        <div aria-live="polite" aria-atomic="true" className="mt-4 min-h-6">
          {actionMessage ? (
            <p className="inline-flex items-start gap-2 text-sm font-bold leading-6 text-slate-700 dark:text-slate-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" aria-hidden="true" />
              {actionMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
