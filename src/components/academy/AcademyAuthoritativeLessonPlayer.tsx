"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Video,
  Zap,
} from "lucide-react";

type Section = { heading: string; body: readonly string[] };
type Locale = "fa" | "en";
type AuthorityStatus = "loading" | "ready" | "auth" | "error";

type Checkpoint = {
  questionId: string;
  questionVersion: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
};

type LessonRecord = {
  sectionKey: string;
  completed: boolean;
  selectedOptionId: string | null;
  lastAnswerCorrect: boolean | null;
  bestScore: number;
  attemptCount: number;
  completedAt: string | null;
  authority: "server_checkpoint_v1";
};

type TermSummary = {
  totalSections: number;
  completedSections: number;
  answeredSections: number;
  percent: number;
  xp: number;
};

type ProgressResponse = {
  records: LessonRecord[];
  summary: TermSummary;
  checkpoints: Array<{ sectionKey: string; checkpoint: Checkpoint }>;
  revision: number;
  authority: "server_checkpoint_v1";
};

type SubmitResponse = {
  correct: boolean;
  completed: boolean;
  record: LessonRecord;
  summary: TermSummary;
  checkpoint: Checkpoint;
  revision: number;
  replayed?: boolean;
};

type ApiEnvelope<T> = Partial<T> & {
  ok?: boolean;
  error?: string;
  details?: { checkpoint?: Checkpoint };
};

const TERM_VIDEO_REFERENCES: Record<number, readonly string[]> = {
  1: ["41-v10uRlsA", "Gc2en3nHxA4", "SSo_EIwHSd4", "SQyg9pyJ1Ac"],
  2: ["d0wW-3l-2ps", "cC-jh1PJeHw", "AcrEEnDLm58"],
  3: ["Aq3a-_O2NcI", "p2yLJtGb6LE", "bBC-nXj3Ng4"],
  4: ["SSo_EIwHSd4", "KQp2N57F2eI", "Yn8WGaO__ak"],
  5: ["n0JjFj7tY7A", "KQp2N57F2eI", "1pG3pdjFGzU"],
  6: ["dD_jq8vWJf4", "KQp2N57F2eI", "1pG3pdjFGzU"],
  7: ["1pG3pdjFGzU", "KQp2N57F2eI", "6S8qytwWjag"],
};

function termNumberFromSlug(slug: string): number {
  const value = Number(slug.match(/term-(\d+)/)?.[1] ?? 1);
  return Number.isInteger(value) && value >= 1 && value <= 7 ? value : 1;
}

function isLearningSection(section: Section): boolean {
  const heading = section.heading.toLowerCase();
  return !heading.includes("منابع")
    && !heading.includes("resources")
    && !heading.includes("پایان ترم")
    && !heading.includes("end of term");
}

function videoIdFor(termNumber: number, lessonIndex: number): string {
  const ids = TERM_VIDEO_REFERENCES[termNumber] ?? TERM_VIDEO_REFERENCES[1];
  return ids[lessonIndex % ids.length];
}

function safeUuid(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AcademyAuthoritativeLessonPlayer({
  slug,
  sections,
  locale = "fa",
}: {
  slug: string;
  sections: Section[];
  locale?: Locale;
}) {
  const isFa = locale === "fa";
  const learningSections = useMemo(() => sections.filter(isLearningSection), [sections]);
  const [records, setRecords] = useState<Record<string, LessonRecord>>({});
  const [checkpoints, setCheckpoints] = useState<Record<string, Checkpoint>>({});
  const [summary, setSummary] = useState<TermSummary>({
    totalSections: learningSections.length,
    completedSections: 0,
    answeredSections: 0,
    percent: 0,
    xp: 0,
  });
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, "correct" | "wrong">>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthorityStatus>("loading");
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");

  const loadProgress = useCallback(async () => {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch(
        `/api/academy-lesson-progress?locale=${encodeURIComponent(locale)}&termSlug=${encodeURIComponent(slug)}`,
        { credentials: "include", cache: "no-store" },
      );
      const body = await response.json().catch(() => ({})) as ApiEnvelope<ProgressResponse>;
      if (response.status === 401) {
        setStatus("auth");
        return;
      }
      if (
        !response.ok
        || body.authority !== "server_checkpoint_v1"
        || !Array.isArray(body.records)
        || !Array.isArray(body.checkpoints)
        || !body.summary
      ) {
        throw new Error(body.error ?? "academy_progress_load_failed");
      }
      setRecords(Object.fromEntries(body.records.map((record) => [record.sectionKey, record])));
      setCheckpoints(Object.fromEntries(body.checkpoints.map((item) => [item.sectionKey, item.checkpoint])));
      setSummary(body.summary);
      setRevision(Number(body.revision ?? 0));
      setStatus("ready");
    } catch {
      setStatus("error");
      setMessage(
        isFa
          ? "ارتباط با مرجع رسمی پیشرفت آکادمی برقرار نشد. محتوای رایگان در دسترس است، اما هیچ پیشرفت یا XP محلی ثبت نمی‌شود."
          : "The Academy progress authority is unavailable. Free content remains available, but no local progress or XP is recorded.",
      );
    }
  }, [isFa, locale, slug]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const submitCheckpoint = useCallback(async (sectionKey: string) => {
    const checkpoint = checkpoints[sectionKey];
    const selectedOptionId = selected[sectionKey];
    if (status !== "ready" || !checkpoint || !selectedOptionId || saving) return;
    setSaving(sectionKey);
    setMessage("");
    const idempotencyKey = safeUuid(`academy-${slug}-${sectionKey}`);
    try {
      const response = await fetch("/api/academy-lesson-progress", {
        method: "PUT",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          locale,
          termSlug: slug,
          sectionKey,
          questionVersion: checkpoint.questionVersion,
          selectedOptionId,
        }),
      });
      const body = await response.json().catch(() => ({})) as ApiEnvelope<SubmitResponse>;
      if (response.status === 401) {
        setStatus("auth");
        throw new Error("academy_auth_required");
      }
      if (response.status === 409 && body.details?.checkpoint) {
        setCheckpoints((current) => ({ ...current, [sectionKey]: body.details!.checkpoint! }));
        setSelected((current) => ({ ...current, [sectionKey]: "" }));
        setFeedback((current) => {
          const next = { ...current };
          delete next[sectionKey];
          return next;
        });
        throw new Error("question_version_conflict");
      }
      if (!response.ok || !body.record || !body.summary) {
        throw new Error(body.error ?? "checkpoint_submit_failed");
      }
      setRecords((current) => ({ ...current, [sectionKey]: body.record! }));
      setSummary(body.summary);
      setRevision(Number(body.revision ?? revision));
      setFeedback((current) => ({
        ...current,
        [sectionKey]: body.correct ? "correct" : "wrong",
      }));
      if (body.correct) window.dispatchEvent(new Event("tecpey-academy-progress-updated"));
    } catch (error) {
      const code = error instanceof Error ? error.message : "checkpoint_submit_failed";
      setMessage(
        code === "question_version_conflict"
          ? isFa
            ? "نسخه سؤال به‌روزرسانی شد. پاسخ جدید را انتخاب و دوباره ثبت کنید."
            : "The question version changed. Select an answer and submit again."
          : code === "academy_auth_required"
            ? isFa
              ? "نشست حساب منقضی شده است. برای ادامه ثبت رسمی دوباره وارد شوید."
              : "Your session expired. Sign in again to continue official progress."
            : isFa
              ? "ثبت رسمی پاسخ انجام نشد. دوباره تلاش کنید؛ پیشرفت محلی یا موفقیت کاذب ثبت نشده است."
              : "The official answer was not saved. Retry; no local or false completion was recorded.",
      );
    } finally {
      setSaving(null);
    }
  }, [checkpoints, isFa, locale, revision, saving, selected, slug, status]);

  const termNumber = termNumberFromSlug(slug);
  const authorityReady = status === "ready";

  return (
    <div className="mt-10">
      <div className="sticky top-20 z-20 mb-6 rounded-[28px] border border-cyan-300/20 bg-white/95 p-4 shadow-xl shadow-cyan-500/10 backdrop-blur dark:bg-slate-950/95">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black text-emerald-700 dark:text-emerald-300">
              {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {status === "loading"
                ? isFa ? "در حال اتصال به پرونده رسمی…" : "Connecting to your official record…"
                : authorityReady
                  ? isFa ? "مرجع رسمی: سرور آکادمی تک‌پی" : "Official authority: TecPey Academy server"
                  : isFa ? "مطالعه رایگان فعال؛ ثبت رسمی نیازمند حساب است" : "Free learning available; an account is required to save progress"}
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">
              {isFa ? "یادگیری مرحله‌ای با پیشرفت قابل بازیابی در همه دستگاه‌ها" : "Structured learning with cross-device progress"}
            </h2>
          </div>
          <div className="flex gap-2 text-xs font-black">
            <span className="rounded-full bg-cyan-500/10 px-3 py-2 text-cyan-700 dark:text-cyan-200">{summary.percent}%</span>
            <span className="rounded-full bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-200">
              <Zap className="mr-1 inline h-3 w-3" />{summary.xp} XP
            </span>
            {authorityReady ? (
              <span className="rounded-full bg-slate-500/10 px-3 py-2 text-slate-600 dark:text-slate-300">r{revision}</span>
            ) : null}
          </div>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div className="h-full rounded-full bg-cyan-500 transition-all duration-500" style={{ width: `${summary.percent}%` }} />
        </div>
      </div>

      {status === "auth" ? (
        <div className="mb-6 rounded-[28px] border border-amber-300/30 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3">
            <Lock className="mt-1 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
            <div>
              <h3 className="font-black text-slate-950 dark:text-white">
                {isFa ? "محتوا رایگان است؛ برای ثبت پیشرفت وارد شوید" : "Content is free; sign in to save progress"}
              </h3>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">
                {isFa
                  ? "می‌توانید همه درس‌ها و ویدیوها را بخوانید. پاسخ، XP و بازشدن مراحل فقط در حساب سروری ثبت می‌شود."
                  : "You can read every lesson and watch the references. Answers, XP, and unlocks are saved only in your server account."}
              </p>
              <Link
                href={`/academy/login?next=${encodeURIComponent(`/academy/${slug}`)}`}
                className="mt-3 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 text-xs font-black text-white"
              >
                {isFa ? "ورود به حساب آکادمی" : "Sign in to Academy"}
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-red-300/30 bg-red-500/10 p-5">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-1 h-5 w-5 shrink-0 text-red-500" />
            <p className="max-w-3xl text-sm font-black leading-7 text-red-700 dark:text-red-200">{message}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadProgress()}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black text-white dark:bg-white dark:text-slate-950"
          >
            <RefreshCw className="h-4 w-4" />
            {isFa ? "تلاش دوباره" : "Retry"}
          </button>
        </div>
      ) : null}

      {message && status !== "error" ? (
        <div className="mb-5 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-black leading-7 text-amber-800 dark:text-amber-100" role="alert">
          {message}
        </div>
      ) : null}

      <div className="space-y-6">
        {sections.map((section, index) => {
          const learningIndex = learningSections.findIndex((item) => item.heading === section.heading);
          const isLesson = learningIndex >= 0;
          const sectionKey = isLesson ? `lesson-${learningIndex + 1}` : `support-${index + 1}`;
          const record = records[sectionKey];
          const checkpoint = checkpoints[sectionKey];
          const completed = Boolean(record?.completed);
          const sectionFeedback = feedback[sectionKey];
          const selectedOption = selected[sectionKey] ?? "";
          const videoId = videoIdFor(termNumber, Math.max(0, learningIndex));

          return (
            <section key={`${section.heading}-${index}`} className="rounded-[30px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-cyan-300/10 dark:bg-white/[0.04]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${completed ? "bg-emerald-500 text-white" : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-200"}`}>
                    {completed ? <CheckCircle2 className="h-5 w-5" /> : isLesson ? learningIndex + 1 : index + 1}
                  </div>
                  <div>
                    <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">
                      {isLesson
                        ? isFa ? `درس ${learningIndex + 1}` : `Lesson ${learningIndex + 1}`
                        : isFa ? "بخش تکمیلی" : "Support section"}
                    </p>
                    <h2 className="mt-1 text-2xl font-black leading-10 text-slate-950 dark:text-white">{section.heading}</h2>
                  </div>
                </div>
                {completed ? (
                  <span className="rounded-full bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-700 dark:text-emerald-300">
                    {isFa ? "تأییدشده توسط سرور" : "Server verified"}
                  </span>
                ) : null}
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-4">
                  {section.body.map((paragraph, paragraphIndex) => (
                    <p key={`${sectionKey}-${paragraphIndex}`} className="text-base font-bold leading-9 text-slate-700 dark:text-slate-300">{paragraph}</p>
                  ))}
                </div>

                {isLesson ? (
                  <aside className="space-y-4">
                    <div className="overflow-hidden rounded-3xl border border-cyan-300/20 bg-cyan-500/10">
                      <div className="aspect-video bg-slate-950">
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                          title={`${section.heading} — curated learning reference`}
                          className="h-full w-full"
                          loading="lazy"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                      </div>
                      <a
                        href={`https://www.youtube.com/watch?v=${videoId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 p-3 text-xs font-black text-cyan-700 dark:text-cyan-200"
                      >
                        <Video className="h-4 w-4" />
                        {isFa ? "مرجع ویدیویی منتخب" : "Curated video reference"}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    {authorityReady && checkpoint ? (
                      <div className="rounded-3xl border border-amber-300/20 bg-amber-500/10 p-4">
                        <h3 className="text-sm font-black text-slate-950 dark:text-white">
                          {isFa ? "سنجش رسمی یادگیری" : "Official learning checkpoint"}
                        </h3>
                        <p className="mt-2 text-xs font-bold leading-6 text-slate-700 dark:text-slate-300">{checkpoint.prompt}</p>
                        <div className="mt-3 grid gap-2">
                          {checkpoint.options.map((option) => {
                            const chosen = selectedOption === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                disabled={completed || saving === sectionKey}
                                onClick={() => {
                                  setSelected((current) => ({ ...current, [sectionKey]: option.id }));
                                  setFeedback((current) => {
                                    const next = { ...current };
                                    delete next[sectionKey];
                                    return next;
                                  });
                                }}
                                className={`rounded-2xl border px-3 py-3 text-right text-xs font-black leading-6 transition disabled:cursor-not-allowed ${chosen ? "border-cyan-400 bg-cyan-50 text-cyan-900 dark:bg-cyan-400/15 dark:text-cyan-100" : "border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"}`}
                              >
                                {option.text}
                              </button>
                            );
                          })}
                        </div>
                        {!completed ? (
                          <button
                            type="button"
                            disabled={!selectedOption || saving === sectionKey}
                            onClick={() => void submitCheckpoint(sectionKey)}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {saving === sectionKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                            {isFa ? "ثبت و ارزیابی در سرور" : "Submit for server grading"}
                          </button>
                        ) : null}
                        {sectionFeedback === "wrong" ? (
                          <p className="mt-3 rounded-2xl bg-red-500/10 p-3 text-xs font-black leading-6 text-red-700 dark:text-red-200">
                            {isFa ? "این پاسخ درست نبود؛ درس را مرور کنید و دوباره پاسخ دهید. هیچ XP یا قبولی ثبت نشد." : "That answer was incorrect. Review and retry; no XP or completion was granted."}
                          </p>
                        ) : null}
                        {(sectionFeedback === "correct" || completed) ? (
                          <p className="mt-3 rounded-2xl bg-emerald-500/10 p-3 text-xs font-black leading-6 text-emerald-700 dark:text-emerald-200">
                            {isFa ? "پاسخ درست بود و تکمیل درس با شواهد سرور ثبت شد." : "Correct. Completion was recorded with server evidence."}
                          </p>
                        ) : null}
                        {record?.attemptCount ? (
                          <p className="mt-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            {isFa ? `تعداد تلاش ثبت‌شده: ${record.attemptCount}` : `Recorded attempts: ${record.attemptCount}`}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-slate-300/20 bg-slate-500/10 p-4 text-xs font-black leading-6 text-slate-700 dark:text-slate-200">
                        {status === "loading"
                          ? isFa ? "در حال دریافت سؤال رسمی این درس…" : "Loading the official checkpoint…"
                          : status === "auth"
                            ? isFa ? "برای پاسخ رسمی، XP و ذخیره پیشرفت وارد حساب آکادمی شوید." : "Sign in for official grading, XP, and saved progress."
                            : isFa ? "مرجع رسمی موقتاً در دسترس نیست؛ تکمیل و XP غیرفعال است." : "The official authority is temporarily unavailable; completion and XP are disabled."}
                      </div>
                    )}
                  </aside>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {authorityReady && summary.percent === 100 ? (
        <div className="mt-6 rounded-[28px] border border-emerald-300/30 bg-emerald-500/10 p-5 text-center">
          <Trophy className="mx-auto h-8 w-8 text-emerald-500" />
          <h3 className="mt-3 text-xl font-black text-slate-950 dark:text-white">
            {isFa ? "همه درس‌های این ترم با ارزیابی سرور کامل شد" : "All term lessons are server verified"}
          </h3>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">
            {isFa ? "اکنون آزمون نهایی ترم را انجام دهید؛ بازشدن مرحله بعد فقط از پروجکشن رسمی حساب شما انجام می‌شود." : "Take the final term assessment. The next stage unlocks only from your official account projection."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
