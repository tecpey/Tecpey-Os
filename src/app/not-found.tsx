"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFoundPage() {
  const t = useTranslations("NotFound");

  return (
    <section className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 px-4 dark:bg-[#06111f]">
      <div className="pointer-events-none absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-cyan-500/10 blur-[100px]" />
      <div className="pointer-events-none absolute -right-20 bottom-1/4 h-72 w-72 rounded-full bg-cyan-500/5 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <h1 className="select-none bg-gradient-to-b from-cyan-500/80 to-cyan-500/20 bg-clip-text text-[120px] font-black leading-none text-transparent sm:text-[180px]">
          404
        </h1>

        <h2 className="mt-[-20px] text-2xl font-black text-slate-950 dark:text-white sm:mt-[-40px] sm:text-4xl">
          {t("title")}
        </h2>

        <p className="mx-auto mt-6 max-w-lg text-sm leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
          {t("description")}
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-8 py-3.5 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300/60 active:scale-95"
          >
            <Home className="h-4 w-4" />
            {t("home")}
          </Link>

          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/50 px-8 py-3.5 text-sm font-black text-slate-950 backdrop-blur transition hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-300/60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </button>
        </div>
      </div>
    </section>
  );
}
