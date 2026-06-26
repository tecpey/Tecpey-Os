"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Question = {
  q: string;
  options: string[];
  answer?: string;
};

function stableShuffle(options: string[], seed: string) {
  const items = [...options];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = items.length - 1; i > 0; i -= 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    const j = hash % (i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function TermQuizClient({
  title,
  questions,
  locale = "fa",
  storageKey,
  termNumber = 1,
}: {
  title: string;
  questions: Question[];
  locale?: "fa" | "en";
  storageKey?: string;
  termNumber?: number;
}) {
  const isFa = locale === "fa";
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [answerAttempts, setAnswerAttempts] = useState<Record<number, string[]>>({});
  const [lead, setLead] = useState({ name: "", phone: "" });
  const [leadSaved, setLeadSaved] = useState(termNumber > 1);
  const [leadError, setLeadError] = useState("");
  const [canAccess, setCanAccess] = useState(termNumber <= 1);
  const [officialMessage, setOfficialMessage] = useState("");

  const shuffledQuestions = useMemo(
    () =>
      questions.map((q, index) => ({
        ...q,
        options: stableShuffle(q.options, `${storageKey || title}-${index}-${q.q}`),
      })),
    [questions, storageKey, title],
  );

  useEffect(() => {
    let active = true;
    const checkAccess = async () => {
      try {
        const savedLead = window.localStorage.getItem("tecpey-academy-lead");
        if (savedLead) {
          const parsed = JSON.parse(savedLead);
          if (parsed?.name && parsed?.phone) {
            setLead({ name: parsed.name, phone: parsed.phone });
            setLeadSaved(true);
          }
        }

        const profileResponse = await fetch("/api/academy-student-profile", { cache: "no-store" }).catch(() => null);
        if (profileResponse?.ok) {
          const profileData = await profileResponse.json().catch(() => ({}));
          if (profileData?.profile?.id || profileData?.profile?.public_student_id) {
            setLeadSaved(true);
            setLead((prev) => ({
              name: prev.name || profileData.profile.display_name || "",
              phone: prev.phone || profileData.profile.phone || "",
            }));
          }
        }

        const response = await fetch(`/api/academy-term-progress?locale=${locale}`, { cache: "no-store" }).catch(() => null);
        if (!active) return;
        if (!response?.ok) {
          setCanAccess(termNumber <= 1);
          return;
        }
        const data = await response.json();
        const terms = Array.isArray(data?.terms) ? data.terms : [];
        const prevPassed = termNumber <= 1 || terms.some((item: { term_number?: number; status?: string }) => Number(item.term_number) === termNumber - 1 && item.status === "passed");
        setCanAccess(prevPassed);
      } catch {
        if (active) setCanAccess(termNumber <= 1);
      }
    };
    void checkAccess();
    return () => { active = false; };
  }, [termNumber, locale]);

  const [officialResult, setOfficialResult] = useState<{ score: number; percent: number; passed: boolean } | null>(null);
  const answeredCount = Object.keys(answers).length;
  const completed = answeredCount === shuffledQuestions.length;
  const score = officialResult?.score ?? answeredCount;
  const percent = officialResult?.percent ?? Math.round((answeredCount / Math.max(1, shuffledQuestions.length)) * 100);
  const passed = Boolean(officialResult?.passed);

  useEffect(() => {
    if (!storageKey || !completed) return;
    void fetch("/api/academy-term-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termNumber, locale, answers, attemptLog: answerAttempts }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          setOfficialResult({ score: Number(data?.score || 0), percent: Number(data?.percent || 0), passed: Boolean(data?.passed) });
          const payload = { score: Number(data?.score || 0), percent: Number(data?.percent || 0), passed: Boolean(data?.passed), completedAt: new Date().toISOString(), termNumber };
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(payload));
            window.localStorage.setItem(`tecpey-academy-term-${termNumber}`, JSON.stringify(payload));
            window.dispatchEvent(new Event("tecpey-academy-progress-updated"));
          } catch {}
          setOfficialMessage(data?.passed ? (locale === "fa" ? "نتیجه آزمون به‌صورت رسمی در پرونده آموزشی ثبت شد." : "Your assessment result was officially saved to your learning record.") : (locale === "fa" ? "نیاز به مرور دارید؛ نتیجه رسمی در پرونده آموزشی ثبت شد." : "Review needed; your official result was saved."));
        } else if (data?.error === "complete_account_required") setOfficialMessage(locale === "fa" ? "برای ثبت رسمی نتیجه، ابتدا حساب آکادمی را کامل کن." : "Complete your academy account to save this result officially.");
        else setOfficialMessage(locale === "fa" ? "نتیجه فقط پس از بررسی رسمی در پرونده آموزشی ثبت می‌شود." : "Results are saved only after official verification.");
      })
      .catch(() => setOfficialMessage(locale === "fa" ? "نتیجه فقط پس از بررسی رسمی در پرونده آموزشی ثبت می‌شود." : "Results are saved only after official verification."));
  }, [storageKey, completed, termNumber, locale, answers, answerAttempts]);

  const saveLead = async () => {
    setLeadError("");
    const cleanName = lead.name.trim();
    const cleanPhone = lead.phone.trim();

    if (cleanName.length < 2 || cleanPhone.length < 7) {
      setLeadError(isFa ? "نام و شماره تماس را کامل وارد کنید." : "Please enter a valid name and phone number.");
      return;
    }

    const payload = {
      displayName: cleanName,
      phone: cleanPhone,
      locale,
      source: "academy-term-onboarding",
    };

    try {
      const response = await fetch("/api/academy-student-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) {
        setLeadError(isFa ? "برای ثبت رسمی مسیر، تنظیمات حساب یا پایگاه داده را بررسی کنید." : "Check account or database settings to save the official path.");
        return;
      }
      window.localStorage.setItem("tecpey-academy-lead", JSON.stringify({ name: cleanName, phone: cleanPhone, locale, termNumber, createdAt: new Date().toISOString() }));
      setLeadSaved(true);
      window.dispatchEvent(new Event("tecpey-academy-progress-updated"));
    } catch {
      setLeadError(isFa ? "اتصال ثبت حساب برقرار نشد؛ دوباره تلاش کنید." : "Account setup connection failed; try again.");
    }
  };

  const resetQuiz = () => {
    setAnswers({});
    setAnswerAttempts({});
    setOfficialResult(null);
    setOfficialMessage("");
  };

  return (
    <section id="term-quiz" className="mt-12 rounded-[30px] border border-cyan-300/25 bg-cyan-500/10 p-6">
      {termNumber === 1 && (
      <div className="mb-6 rounded-3xl border border-cyan-300/20 bg-white/90 p-5 dark:bg-white/10">
        <h2 className="text-xl font-black text-slate-950 dark:text-white">
          {isFa ? "قبل از شروع آموزش" : "Before starting"}
        </h2>
        <p className="mt-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">
          {isFa
            ? "برای فعال شدن مرکز هوشمند، ساخت TecPey ID و ورود رسمی به ترم‌ها، حساب آکادمی را کامل کنید."
            : "Complete your academy account to activate Smart Center, issue TecPey ID and officially enter the terms."}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            value={lead.name}
            onChange={(e) => setLead((prev) => ({ ...prev, name: e.target.value }))}
            placeholder={isFa ? "نام و نام خانوادگی" : "Full name"}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-cyan-400 dark:border-white/10 dark:bg-white/10 dark:text-white"
          />
          <input
            value={lead.phone}
            onChange={(e) => setLead((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder={isFa ? "شماره تماس / موبایل" : "Phone / mobile"}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-cyan-400 dark:border-white/10 dark:bg-white/10 dark:text-white"
          />
          <button
            type="button"
            onClick={saveLead}
            className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400"
          >
            {leadSaved ? (isFa ? "ذخیره شد" : "Saved") : isFa ? "تکمیل حساب و شروع" : "Complete account and start"}
          </button>
        </div>
        {leadError && <p className="mt-2 text-sm font-black text-rose-500">{leadError}</p>}
      </div>
      )}

      {!canAccess && (
        <div className="rounded-3xl border border-amber-300/30 bg-amber-50 p-5 text-sm font-black leading-8 text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
          {isFa
            ? `برای دسترسی به ترم ${termNumber} باید ترم ${termNumber - 1} را با حدنصاب قبولی رسمی کامل کنید.`
            : `To access term ${termNumber}, complete term ${termNumber - 1} with the official passing score.`}
        </div>
      )}

      {officialMessage && (
        <div className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-4 text-sm font-black leading-7 text-emerald-800 dark:text-emerald-100">
          {officialMessage}
        </div>
      )}

      <div className={`${!leadSaved || !canAccess ? "pointer-events-none opacity-45" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">{title}</h2>
            <p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">
              {isFa
                ? "انتخاب‌های شما بدون نمایش جواب صحیح ثبت می‌شوند؛ تعداد تلاش‌ها، پاسخ اول و زمان تصمیم برای تحلیل منتور مهم است."
                : "Your choices are recorded without revealing the correct answer; attempts, first answer and decision timing matter for mentor analysis."}
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-300/25 bg-white/90 px-5 py-3 text-center shadow-sm dark:bg-white/10">
            <p className="text-xs font-black text-cyan-700 dark:text-cyan-200">{isFa ? "نتیجه" : "Score"}</p>
            <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{officialResult ? `${score} / ${shuffledQuestions.length}` : `${answeredCount} / ${shuffledQuestions.length}`}</p>
            {officialResult && <p className="mt-1 text-xs font-black text-slate-700 dark:text-slate-300">{percent}%</p>}
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {shuffledQuestions.map((item, index) => {
            const selected = answers[index];
            const hasAnswered = typeof selected === "string";
            const attempts = answerAttempts[index] || [];
            return (
              <div key={item.q} className="rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-cyan-300/10 dark:bg-white/[0.045]">
                <h3 className="font-black leading-8 text-slate-950 dark:text-white">
                  {isFa ? `سؤال ${index + 1}: ` : `Question ${index + 1}: `}
                  {item.q}
                </h3>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {item.options.map((option) => {
                    const isSelected = selected === option;
                    let stateClass =
                      "border-cyan-200 bg-white text-slate-800 hover:border-cyan-400 hover:bg-cyan-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-cyan-400/10";

                    if (isSelected) {
                      stateClass =
                        "border-cyan-400 bg-cyan-50 text-cyan-900 dark:bg-cyan-400/15 dark:text-cyan-100";
                    } else if (hasAnswered) {
                      stateClass =
                        "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400";
                    }

                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setAnswers((prev) => ({ ...prev, [index]: option }));
                          setAnswerAttempts((prev) => ({ ...prev, [index]: [...(prev[index] || []), option] }));
                        }}
                        className={`cursor-pointer rounded-2xl border px-4 py-3 text-right text-sm font-black leading-7 transition active:scale-[0.99] ${stateClass}`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                {attempts.length > 0 && (
                  <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                    {isFa ? `تعداد انتخاب‌های ثبت‌شده برای تحلیل رفتاری: ${attempts.length}` : `Recorded choices for behavior analysis: ${attempts.length}`}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {completed && (
          <div className="mt-6 rounded-3xl border border-cyan-300/25 bg-white/90 p-5 text-sm font-black leading-8 text-slate-800 dark:bg-white/10 dark:text-cyan-100">
            <p>
              {isFa
                ? passed
                  ? `قبول شدید؛ امتیاز وزنی شما ${percent}٪ است و ترم بعدی برای شما باز شد.`
                  : `نیاز به مرور دارید؛ امتیاز شما ${percent}٪ است. قبل از ترم بعد، متن همین آموزش را دوباره بخوانید.`
                : passed
                  ? `Passed; your weighted score is ${percent}%. The next term is unlocked.`
                  : `Review needed; your score is ${percent}%. Read this lesson again before moving to the next term.`}
            </p>

            {passed && (
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={termNumber >= 7 ? (isFa ? "/academy/final-assessment" : "/en/academy/final-assessment") : `${isFa ? "" : "/en"}/academy/term-${termNumber + 1}`}
                  className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400"
                >
                  {termNumber >= 7
                    ? isFa ? "رفتن به ارزیابی نهایی" : "Go to final assessment"
                    : isFa ? `رفتن به ترم ${termNumber + 1}` : `Go to term ${termNumber + 1}`}
                </Link>
                <Link
                  href={isFa ? "/academy/mentor-coach" : "/en/academy/mentor-coach"}
                  className="inline-flex items-center justify-center rounded-2xl border border-cyan-300/30 bg-white/70 px-5 py-3 text-sm font-black text-slate-800 transition hover:bg-cyan-50 dark:bg-white/10 dark:text-white"
                >
                  {isFa ? "پرسیدن سؤال از مربی" : "Ask the mentor"}
                </Link>
              </div>
            )}
          </div>
        )}

        {answeredCount > 0 && (
          <button
            type="button"
            onClick={resetQuiz}
            className="mt-4 rounded-2xl border border-cyan-300/30 bg-white/80 px-4 py-3 text-sm font-black text-slate-800 transition hover:bg-cyan-50 dark:bg-white/10 dark:text-white"
          >
            {isFa ? "شروع دوباره آزمون" : "Reset quiz"}
          </button>
        )}
      </div>
    </section>
  );
}
