"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Cloud, LoaderCircle, RefreshCw } from "lucide-react";
import { acceptProgressProjection } from "@/lib/academy-progress";
import type {
  AcademyLocale,
  LessonProgressRecord,
  TermLearningSummary,
} from "@/lib/academy-lesson-progress";

type ProgressPayload = {
  records: LessonProgressRecord[];
  terms: TermLearningSummary[];
};

type ControlStatus = "loading" | "idle" | "saving" | "saved" | "error" | "account" | "blocked";

const payloadCache = new Map<string, ProgressPayload>();
const requestCache = new Map<string, Promise<ProgressPayload>>();

function cacheKey(locale: AcademyLocale, termSlug: string): string {
  return `${locale}:${termSlug}`;
}

async function loadTermProgress(locale: AcademyLocale, termSlug: string): Promise<ProgressPayload> {
  const key = cacheKey(locale, termSlug);
  const cached = payloadCache.get(key);
  if (cached) return cached;
  const pending = requestCache.get(key);
  if (pending) return pending;

  const request = fetch(
    `/api/academy-lesson-progress?locale=${locale}&termSlug=${encodeURIComponent(termSlug)}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    },
  )
    .then(async (response) => {
      const body = await response.json().catch(() => ({})) as Partial<ProgressPayload> & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `lesson_progress_load_failed:${response.status}`);
      const payload: ProgressPayload = {
        records: Array.isArray(body.records) ? body.records : [],
        terms: Array.isArray(body.terms) ? body.terms : [],
      };
      payloadCache.set(key, payload);
      return payload;
    })
    .finally(() => requestCache.delete(key));

  requestCache.set(key, request);
  return request;
}

function updateCachedRecord(
  locale: AcademyLocale,
  termSlug: string,
  record: LessonProgressRecord,
  summary: TermLearningSummary,
): void {
  const key = cacheKey(locale, termSlug);
  const current = payloadCache.get(key) ?? { records: [], terms: [] };
  const records = current.records.filter((item) => item.sectionKey !== record.sectionKey);
  const terms = current.terms.filter((item) => item.termSlug !== summary.termSlug);
  payloadCache.set(key, {
    records: [...records, record],
    terms: [...terms, summary],
  });
}

export function AcademyLessonCompletionControl({
  locale,
  termSlug,
  sectionKey,
}: {
  locale: AcademyLocale;
  termSlug: string;
  sectionKey: string;
}) {
  const isFa = locale === "fa";
  const [completed, setCompleted] = useState(false);
  const [status, setStatus] = useState<ControlStatus>("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    loadTermProgress(locale, termSlug)
      .then((payload) => {
        if (!active) return;
        const record = payload.records.find((item) => item.sectionKey === sectionKey);
        setCompleted(Boolean(record?.completed));
        setStatus(record?.completed ? "saved" : "idle");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [locale, sectionKey, termSlug]);

  const save = async () => {
    if (completed || status === "saving") return;
    setStatus("saving");
    try {
      const response = await fetch("/api/academy-lesson-progress", {
        method: "PUT",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ locale, termSlug, sectionKey, action: "complete" }),
      });
      const body = await response.json().catch(() => ({})) as {
        error?: string;
        record?: LessonProgressRecord;
        summary?: TermLearningSummary;
        state?: unknown;
      };

      if (response.status === 401) {
        setStatus("account");
        return;
      }
      if (response.status === 403 && body.error === "previous_term_required") {
        setStatus("blocked");
        return;
      }
      if (!response.ok || !body.record || !body.summary) {
        throw new Error(body.error ?? `lesson_progress_write_failed:${response.status}`);
      }

      updateCachedRecord(locale, termSlug, body.record, body.summary);
      acceptProgressProjection(body.state, locale);
      setCompleted(body.record.completed);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  if (status === "loading") {
    return (
      <div className="mt-5 flex items-center gap-2 text-xs font-black text-slate-500" aria-live="polite">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {isFa ? "در حال بازیابی پیشرفت درس..." : "Loading lesson progress..."}
      </div>
    );
  }

  if (completed || status === "saved") {
    return (
      <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3" aria-live="polite">
        <span className="flex items-center gap-2 text-sm font-black text-emerald-700 dark:text-emerald-200">
          <CheckCircle2 className="h-5 w-5" />
          {isFa ? "این درس در پرونده آموزشی شما ثبت شد" : "Lesson saved to your learning record"}
        </span>
        <Cloud className="h-4 w-4 shrink-0 text-emerald-500" />
      </div>
    );
  }

  const message = status === "account"
    ? (isFa ? "برای ثبت پیشرفت، ابتدا وارد حساب آکادمی شوید." : "Sign in to save your progress.")
    : status === "blocked"
      ? (isFa ? "ابتدا ترم قبلی را با آزمون رسمی کامل کنید." : "Complete the previous term assessment first.")
      : status === "error"
        ? (isFa ? "ثبت پیشرفت انجام نشد؛ دوباره تلاش کنید." : "Progress was not saved. Try again.")
        : null;

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => void save()}
        disabled={status === "saving" || status === "blocked" || status === "account"}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
      >
        {status === "saving" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : status === "error" ? <RefreshCw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {status === "saving"
          ? (isFa ? "در حال ثبت..." : "Saving...")
          : (isFa ? "درس را کامل کردم · ثبت در حساب" : "Mark lesson complete · Save to account")}
      </button>
      {message && <p className="mt-2 text-xs font-bold text-amber-600 dark:text-amber-300" role="status">{message}</p>}
    </div>
  );
}
