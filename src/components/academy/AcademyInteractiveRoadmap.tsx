"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, ClipboardCheck, GraduationCap, Lock, Route, Trophy } from "lucide-react";

const terms = [
  { slug: "term-1", title: "مبانی بازار", badge: "Crypto Explorer", mentor: "مربی مفاهیم پایه", focus: "فهم بازار قبل از خرید" },
  { slug: "term-2", title: "امنیت دارایی", badge: "Security Guardian", mentor: "مربی امنیت", focus: "جلوگیری از خطاهای برگشت‌ناپذیر" },
  { slug: "term-3", title: "صرافی و اسپات", badge: "Exchange Starter", mentor: "مربی اجرای معامله", focus: "سفارش، کارمزد، برداشت" },
  { slug: "term-4", title: "تحلیل پروژه", badge: "Project Researcher", mentor: "مربی فاندامنتال", focus: "Tokenomics، FDV، Red Flag" },
  { slug: "term-5", title: "تحلیل تکنیکال", badge: "Chart Reader", mentor: "مربی نمودار", focus: "روند، RSI، حجم، ابطال" },
  { slug: "term-6", title: "مدیریت ریسک", badge: "Risk Controller", mentor: "مربی مدیریت سرمایه", focus: "Position Size و Drawdown" },
  { slug: "term-7", title: "روانشناسی و آمادگی", badge: "Ready Learner", mentor: "مربی تصمیم‌گیری", focus: "FOMO، ژورنال، آمادگی نهایی" },
];

type Progress = Record<string, { progress: number; completed: boolean; xp: number; locked: boolean }>;

function safeParse(value: string | null) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

function isOfficiallyPassed(termNumber: number) {
  if (typeof window === "undefined") return termNumber <= 0;
  const parsed = safeParse(window.localStorage.getItem(`tecpey-academy-term-${termNumber}`));
  // Only the real end-of-term quiz writes a numeric score. Reading progress is intentionally ignored for unlocking.
  return Boolean(Number.isFinite(Number(parsed?.score)) && Number(parsed?.percent) === 100);
}

function readTermProgress(termNumber: number, slug: string, unlocked: boolean) {
  const official = safeParse(window.localStorage.getItem(`tecpey-academy-term-${termNumber}`));
  if (Number.isFinite(Number(official?.score))) return Math.max(0, Math.min(100, Number(official?.percent) || 0));
  if (!unlocked) return 0;

  const reading = safeParse(window.localStorage.getItem(`tecpey-academy-reading-term-${termNumber}`));
  if (Number.isFinite(Number(reading?.percent))) return Math.max(0, Math.min(99, Number(reading?.percent) || 0));

  const lesson = safeParse(window.localStorage.getItem(`tecpey-lesson-progress-fa-${slug}`));
  const completedCount = lesson?.completed ? Object.keys(lesson.completed).filter((key) => lesson.completed[key]).length : 0;
  const answers = lesson?.answers ? Object.keys(lesson.answers).filter((key) => lesson.answers[key]).length : 0;
  const totalLessons = slug === "term-7" ? 6 : 7;
  const lessonPercent = Math.min(99, Math.round((completedCount / totalLessons) * 100));
  return Math.max(lessonPercent, Math.min(99, completedCount * 10 + answers * 3));
}

export function AcademyInteractiveRoadmap() {
  const [progress, setProgress] = useState<Progress>({});

  useEffect(() => {
    const read = () => {
      const next: Progress = {};
      for (const [index, term] of terms.entries()) {
        const unlocked = index === 0 || isOfficiallyPassed(index);
        const completed = isOfficiallyPassed(index + 1);
        const percent = completed ? 100 : readTermProgress(index + 1, term.slug, unlocked);
        next[term.slug] = { progress: unlocked ? percent : 0, completed, xp: Math.round((unlocked ? percent : 0) * 1.4), locked: !unlocked };
      }
      setProgress(next);
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("tecpey-academy-progress-updated", read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("tecpey-academy-progress-updated", read);
      window.removeEventListener("focus", read);
    };
  }, []);

  const completedTerms = terms.filter((term) => progress[term.slug]?.completed).length;
  const overall = useMemo(() => Math.round((terms.reduce((sum, term) => sum + (progress[term.slug]?.progress || 0), 0) / 700) * 100), [progress]);
  const nextTerm = terms.find((term) => !progress[term.slug]?.completed && !progress[term.slug]?.locked) || terms.find((term) => progress[term.slug]?.locked) || terms[terms.length - 1];

  return (
    <section className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[36px] border border-cyan-300/20 bg-slate-950 shadow-[0_30px_100px_rgba(34,211,238,.12)]">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_340px] lg:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
              <Route className="h-4 w-4" /> مسیر رسمی آکادمی
            </div>
            <h2 className="mt-4 text-3xl font-black leading-tight text-white">از صفر تا آمادگی مسئولانه؛ با قفل مرحله‌ای، آزمون و راهنمای آموزشی هر ترم</h2>
            <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-300">
              دسترسی هر ترم فقط بعد از گرفتن امتیاز ۱۰۰٪ در آزمون ترم قبلی باز می‌شود. مرور درس‌ها پیشرفت آموزشی را نشان می‌دهد، اما قفل مسیر فقط با آزمون رسمی باز می‌شود.
            </p>
            <div className="mt-6 h-4 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-cyan-400 transition-all duration-700" style={{ width: `${overall}%` }} />
            </div>
            <p className="mt-2 text-xs font-black text-cyan-100">پیشرفت کل مسیر: {overall}% — ترم‌های کامل‌شده: {completedTerms}/7</p>
          </div>
          <aside className="rounded-[28px] border border-amber-300/20 bg-amber-400/10 p-5 text-center">
            <Trophy className="mx-auto h-10 w-10 text-amber-300" />
            <p className="mt-3 text-xs font-black text-amber-100">قدم پیشنهادی بعدی</p>
            <h3 className="mt-2 text-2xl font-black text-white">{nextTerm.title}</h3>
            <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{nextTerm.focus}</p>
            <Link href={`/academy/${nextTerm.slug}`} className="mt-4 inline-flex rounded-2xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950">ادامه مسیر</Link>
          </aside>
        </div>

        <div className="grid gap-4 p-6 pt-0 md:grid-cols-2 xl:grid-cols-7 lg:p-8 lg:pt-0">
          {terms.map((term, index) => {
            const item = progress[term.slug] || { progress: 0, completed: false, xp: 0, locked: index > 0 };
            const locked = item.locked;
            return (
              <Link
                key={term.slug}
                href={locked ? "/academy" : `/academy/${term.slug}`}
                aria-disabled={locked}
                className={`group rounded-[28px] border p-4 transition duration-300 ${locked ? "border-white/10 bg-white/[0.035] opacity-65" : "border-cyan-300/20 bg-white/[0.07] hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-cyan-300/10"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-100">{locked ? <Lock className="h-5 w-5" /> : item.completed ? <CheckCircle2 className="h-5 w-5" /> : index + 1}</span>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black text-slate-200">{locked ? "قفل" : `${item.progress}%`}</span>
                </div>
                <h3 className="mt-4 text-base font-black leading-7 text-white">{term.title}</h3>
                <p className="mt-2 text-xs font-bold leading-6 text-slate-400">{locked ? `برای باز شدن، ترم ${index} را با ۱۰۰٪ کامل کنید.` : term.focus}</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${item.progress}%` }} /></div>
                <div className="mt-3 rounded-2xl border border-violet-300/15 bg-violet-400/10 p-3">
                  <p className="flex items-center gap-2 text-[11px] font-black text-violet-100"><Bot className="h-3.5 w-3.5" />{term.mentor}</p>
                  <p className="mt-1 text-[10px] font-bold leading-5 text-slate-400">نشان: {term.badge}</p>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="border-t border-white/10 p-6 lg:p-8">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              [ClipboardCheck, "آزمون و تسلط", "هر ترم فقط با آزمون ۱۰۰٪ ترم قبلی باز می‌شود؛ این ساختار کمک می‌کند یادگیری مرحله‌به‌مرحله و قابل سنجش باقی بماند."],
              [Bot, "مربی متناسب با مرحله", "مربی هوشمند سؤال کاربر را به ترم، درس، ضعف احتمالی و چک‌لیست عملی وصل می‌کند."],
              [GraduationCap, "ارزیابی نهایی", "پایان مسیر، آمادگی واقعی دانشجو را در امنیت، تحلیل، ریسک و روانشناسی نشان می‌دهد."],
            ].map(([Icon, title, text]) => (
              <div key={String(title)} className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5">
                <Icon className="h-6 w-6 text-cyan-300" />
                <h3 className="mt-3 font-black text-white">{String(title)}</h3>
                <p className="mt-2 text-xs font-bold leading-6 text-slate-400">{String(text)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
