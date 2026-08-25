"use client";

import Link from "next/link";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";

type Locale = "fa" | "en";

export function AcademyProfileUnavailableState({
  locale,
  retrying = false,
  onRetry,
}: {
  locale: Locale;
  retrying?: boolean;
  onRetry: () => void;
}) {
  const isFa = locale === "fa";

  return (
    <main
      className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,.16),transparent_36%),#020617] px-4 py-16 text-white sm:px-6"
      dir={isFa ? "rtl" : "ltr"}
    >
      <section
        aria-labelledby="academy-profile-unavailable-title"
        className="mx-auto max-w-3xl rounded-[38px] border border-amber-300/20 bg-white/[0.06] p-7 text-center shadow-[0_32px_110px_rgba(34,211,238,.12)] sm:p-10"
        role="alert"
      >
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-amber-200/25 bg-amber-300/10 text-amber-200">
          <ShieldAlert className="h-8 w-8" aria-hidden="true" />
        </span>
        <p className="mx-auto mt-5 w-fit rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
          {isFa ? "وضعیت حساب حدس زده نشد" : "Account state was not guessed"}
        </p>
        <h1
          id="academy-profile-unavailable-title"
          className="mt-5 text-3xl font-black leading-tight sm:text-4xl"
        >
          {isFa
            ? "پروفایل آکادمی موقتاً در دسترس نیست"
            : "Academy profile is temporarily unavailable"}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm font-bold leading-8 text-slate-300 sm:text-base">
          {isFa
            ? "برای امنیت، این اختلال را خروج از حساب یا نبودن پروفایل در نظر نگرفتیم. کمی بعد دوباره تلاش کن؛ اطلاعات و مسیر یادگیریت بازنویسی نمی‌شود."
            : "For safety, we did not treat this outage as a sign-out or a missing profile. Try again shortly; your identity and learning path will not be overwritten."}
        </p>
        <div className="mx-auto mt-7 grid max-w-xl gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition-[transform,background-color,box-shadow] duration-150 ease-out active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {retrying ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {isFa ? "تلاش دوباره" : "Try again"}
          </button>
          <Link
            href={isFa ? "/academy" : "/en/academy"}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-black text-slate-200 transition-[transform,border-color,background-color] duration-150 ease-out active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {isFa ? "بازگشت به آکادمی" : "Back to Academy"}
          </Link>
        </div>
      </section>
    </main>
  );
}
