import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "دسترسی مدرس هنوز فعال نیست | جامعه تک‌پی",
  description:
    "فضای مدرس تک‌پی تا ایجاد نقش، مجوز مشاهده و رضایت سرورمحور دانشجو غیرفعال است.",
  alternates: { canonical: "https://tecpey.ir/academy/community/instructor" },
  robots: { index: false, follow: false },
};

const activationRequirements = [
  "نقش مدرس تأییدشده و وابستگی سازمانی یا آموزشی معتبر",
  "مجوز مشخص دانشجو با هدف، دامنه، تاریخ انقضا و امکان لغو",
  "جداسازی کامل tenant و برنامه آموزشی",
  "نمایش حداقلی داده با ثبت دسترسی و شواهد تراکنشی",
] as const;

export default function InstructorPage() {
  return (
    <main
      className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6 lg:px-8"
      dir="rtl"
    >
      <section className="mx-auto max-w-2xl rounded-[28px] border border-amber-300/20 bg-slate-900/70 p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-wide text-amber-300">
              دسترسی مدرس غیرفعال
            </p>
            <h1 className="mt-3 text-2xl font-black leading-10 sm:text-3xl">
              فضای مدرس هنوز راه‌اندازی نشده است
            </h1>
          </div>
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-300/10"
            aria-hidden="true"
          >
            <LockKeyhole className="h-6 w-6 text-amber-300" />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-5">
          <p className="text-sm font-bold leading-8 text-slate-300">
            در وضعیت فعلی هیچ نقش مدرس، فهرست دانشجو یا مجوز مشاهده‌ای از این مسیر
            صادر نمی‌شود. رضایت عمومی پروفایل یا تنظیم «بررسی توسط مدرس» به‌تنهایی
            مجوز دسترسی ایجاد نمی‌کند.
          </p>
          <p className="mt-3 text-sm font-bold leading-8 text-slate-400">
            بینش‌های شخصی و snapshot رفتاری فقط برای خود کاربر هستند و از این صفحه
            با مدرس، سازمان یا شخص دیگری به اشتراک گذاشته نمی‌شوند.
          </p>
        </div>

        <div className="mt-6">
          <div className="flex items-center gap-2 text-sm font-black text-cyan-200">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            شرایط لازم برای فعال‌سازی آینده
          </div>
          <ul className="mt-4 space-y-3">
            {activationRequirements.map((requirement) => (
              <li
                key={requirement}
                className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold leading-7 text-slate-300"
              >
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                <span>{requirement}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/academy/community"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            بازگشت به جامعه تک‌پی
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/academy"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-black text-slate-200 transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            بازگشت به آکادمی
          </Link>
        </div>
      </section>
    </main>
  );
}
