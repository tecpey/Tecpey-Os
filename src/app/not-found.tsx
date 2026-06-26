"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFoundPage() {
  const t = useTranslations("NotFound");

  return (
    <section className="relative min-h-screen w-full flex items-center justify-center bg-bg px-4 overflow-hidden">
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-primary/10 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 -right-20 w-72 h-72 bg-primary/5 rounded-full blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <h1 className="text-[120px] sm:text-[180px] font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-primary/80 to-primary/20 leading-none select-none animate-pulse">
          404
        </h1>
        
        <h2 className="about-title text-2xl sm:text-4xl font-bold text-fg mt-[-20px] sm:mt-[-40px]">
          {t("title")}
        </h2>

        <p className="about-muted mt-6 text-sm sm:text-lg leading-relaxed max-w-lg mx-auto">
          {t("description")}
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/"
            className="group about-cta relative overflow-hidden inline-flex items-center justify-center gap-2 rounded-full px-8 py-3 text-sm font-semibold shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            <span className="relative z-10 flex items-center gap-2">
              <Home className="w-4 h-4" />
              {t("home")}
            </span>
          </Link>

          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/20 px-8 py-3 text-sm font-semibold text-fg bg-bg/50 backdrop-blur-sm hover:bg-primary/10 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("back")}
          </button>
        </div>
      </div>
    </section>
  );
}
