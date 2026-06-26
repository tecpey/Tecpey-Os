"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fa-IR" dir="rtl">
      <body className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8 dark:bg-[#06111f]">
        <div className="max-w-md text-center">
          <p className="mb-2 text-6xl font-black text-slate-950 dark:text-white">خطا</p>
          <p className="mb-6 text-slate-600 dark:text-slate-300">
            خطایی در بارگذاری صفحه رخ داد. لطفاً دوباره تلاش کنید.
          </p>
          <button
            onClick={reset}
            className="rounded-2xl bg-cyan-500 px-8 py-3.5 font-black text-white shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
          >
            تلاش مجدد
          </button>
        </div>
      </body>
    </html>
  );
}
