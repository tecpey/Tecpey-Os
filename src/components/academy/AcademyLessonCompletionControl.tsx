"use client";

import { BookOpenCheck, ShieldCheck } from "lucide-react";

/**
 * Reading a public term section is useful study activity, but it is not proof
 * of mastery. This control intentionally issues no mutation, completion, XP,
 * unlock, badge or certificate. Those outcomes are produced only by the
 * authenticated server-graded assessment routes.
 */
export function AcademyLessonCompletionControl({
  locale,
}: {
  locale: "fa" | "en";
  termSlug: string;
  sectionKey: string;
}) {
  const isFa = locale === "fa";

  return (
    <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-200">
          <BookOpenCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-black text-slate-950 dark:text-white">
            {isFa ? "مطالعه این بخش، آماده‌سازی برای آزمون رسمی است" : "This section prepares you for the official assessment"}
          </p>
          <p className="mt-2 text-xs font-bold leading-6 text-slate-600 dark:text-slate-300">
            {isFa
              ? "برای جلوگیری از پیشرفت صوری، دکمه «کامل کردم» وجود ندارد. XP، قبولی و بازشدن ترم بعد فقط پس از ارزیابی رسمی و ثبت‌شده در سرور تک‌پی صادر می‌شود."
              : "There is no self-issued “complete” button. XP, completion, and the next term are granted only by an authenticated, server-graded assessment recorded by TecPey."}
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black text-cyan-700 dark:text-cyan-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            {isFa ? "مرورگر مرجع پیشرفت آموزشی نیست" : "The browser is not the learning authority"}
          </p>
        </div>
      </div>
    </div>
  );
}
