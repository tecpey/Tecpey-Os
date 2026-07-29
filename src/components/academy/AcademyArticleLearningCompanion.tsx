"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

type Section = { heading: string; body: readonly string[] };

type Props = {
  slug: string;
  sections: Section[];
  locale?: "fa" | "en";
};

function termNumberFromSlug(slug: string): number | null {
  const match = /^term-([1-7])$/.exec(slug);
  return match ? Number(match[1]) : null;
}

function isLearningSection(section: Section): boolean {
  const heading = section.heading.toLowerCase();
  return !heading.includes("منابع")
    && !heading.includes("resources")
    && !heading.includes("پایان ترم")
    && !heading.includes("end of term");
}

function cleanParagraphs(body: readonly string[]): string[] {
  return body.filter((paragraph) => {
    const value = paragraph.trim();
    return !value.startsWith("تمرین کوتاه:")
      && !value.startsWith("سناریوی واقعی:")
      && !value.startsWith("نکته رفتاری:")
      && !value.startsWith("Short exercise:")
      && !value.startsWith("Real scenario:")
      && !value.startsWith("Behavioral note:");
  });
}

export function AcademyArticleLearningCompanion({
  slug,
  sections,
  locale = "fa",
}: Props) {
  const isFa = locale === "fa";
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const learningSections = useMemo(
    () => sections.filter(isLearningSection),
    [sections],
  );
  const reviewedCount = learningSections.filter((section) => reviewed[section.heading]).length;
  const termNumber = termNumberFromSlug(slug);
  const officialPath = termNumber === 1 ? "/academy/learn/term-1/1" : "/academy";

  return (
    <section className="mt-10 space-y-6" aria-labelledby="article-learning-title">
      <div className="rounded-[30px] border border-cyan-300/20 bg-[#06111f] p-5 text-white shadow-[0_24px_70px_rgba(34,211,238,.1)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-cyan-200">
              <ShieldCheck className="h-5 w-5" />
              <p className="text-xs font-black uppercase tracking-wider">
                {isFa ? "مطالعه بدون صدور امتیاز" : "Study companion — no reward authority"}
              </p>
            </div>
            <h2 id="article-learning-title" className="mt-3 text-2xl font-black">
              {isFa ? "مطالعه و مرور این محتوا" : "Read and review this content"}
            </h2>
            <p className="mt-3 text-sm font-bold leading-8 text-slate-300">
              {isFa
                ? "علامت‌های مرور این صفحه فقط تا زمانی که صفحه باز است نگه داشته می‌شوند و هیچ XP، قبولی، مدرک یا دسترسی جدیدی ایجاد نمی‌کنند. پیشرفت رسمی فقط پس از ورود به حساب و قبولی در ارزیابی سرورمحور آکادمی ثبت می‌شود."
                : "Review marks on this page live only for the current page session. They do not grant XP, completion, certificates, or access. Official progress is recorded only after authenticated, server-graded Academy assessments."}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-center">
            <p className="text-xs font-black text-slate-400">
              {isFa ? "مرور همین صفحه" : "Current-page review"}
            </p>
            <p className="mt-1 text-xl font-black text-cyan-200">
              {reviewedCount} / {learningSections.length}
            </p>
          </div>
        </div>

        <Link
          href={officialPath}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200"
        >
          <BookOpenCheck className="h-5 w-5" />
          {termNumber === 1
            ? isFa ? "ورود به مسیر رسمی ترم ۱" : "Open the official Term 1 path"
            : isFa ? "مشاهده مسیر رسمی آکادمی" : "Open the official Academy path"}
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      <div className="space-y-6">
        {sections.map((section, index) => {
          const learning = isLearningSection(section);
          const isReviewed = Boolean(reviewed[section.heading]);
          return (
            <article
              key={`${section.heading}-${index}`}
              className="rounded-[30px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-cyan-300/10 dark:bg-white/[0.04]"
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                  isReviewed
                    ? "bg-emerald-500 text-white"
                    : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-200"
                }`}>
                  {isReviewed
                    ? <CheckCircle2 className="h-5 w-5" />
                    : learning ? index + 1 : <CircleHelp className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">
                    {learning
                      ? isFa ? "بخش آموزشی" : "Learning section"
                      : isFa ? "بخش تکمیلی" : "Supporting section"}
                  </p>
                  <h3 className="mt-1 text-2xl font-black leading-10 text-slate-950 dark:text-white">
                    {section.heading}
                  </h3>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {cleanParagraphs(section.body).map((paragraph) => (
                  <p
                    key={paragraph}
                    className="text-base font-bold leading-9 text-slate-700 dark:text-slate-300"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>

              {learning && (
                <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4">
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {isFa
                      ? `آیا می‌توانی مفهوم «${section.heading}» را بدون نگاه‌کردن به متن، با یک مثال توضیح بدهی؟`
                      : `Can you explain “${section.heading}” with an example without looking at the text?`}
                  </p>
                  <button
                    type="button"
                    aria-pressed={isReviewed}
                    onClick={() => setReviewed((current) => ({
                      ...current,
                      [section.heading]: !current[section.heading],
                    }))}
                    className={`mt-3 rounded-xl px-4 py-2 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                      isReviewed
                        ? "bg-emerald-500 text-white"
                        : "border border-cyan-300/30 bg-white text-cyan-700 dark:bg-white/10 dark:text-cyan-100"
                    }`}
                  >
                    {isReviewed
                      ? isFa ? "مرور کردم — فقط در این صفحه" : "Reviewed — this page only"
                      : isFa ? "برای مرور شخصی علامت بزن" : "Mark for personal review"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
