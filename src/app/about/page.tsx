"use client";

import React, { useRef } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, CheckCircle2 } from "lucide-react";
import RocketIcon from "@/components/icons/RocketIcon";
import CommunityIcon from "@/components/icons/CommunityIcon";

export default function About() {
  const t = useTranslations("About");
  const storyRef = useRef<HTMLDivElement>(null);
  const scrollToStory = () => {
    if (storyRef.current) {
      storyRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <>
      {/* Hero + stats */}
      <section className="px-4 pt-16 pb-4">
        <div className="mx-auto w-full max-w-6xl py-14">
          <h1 className="text-center text-3xl font-black leading-relaxed text-slate-950 dark:text-white sm:text-4xl md:text-5xl">
            {t("title")}
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-center text-base font-bold leading-8 text-slate-600 dark:text-slate-300 sm:text-lg md:text-xl">
            {t("description")}
          </p>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex flex-col items-center border-b border-t border-cyan-300/30 py-6 text-center"
              >
                <div className="text-2xl font-black text-slate-950 dark:text-white">
                  {t(`tileCard${i}`)}
                </div>
                <div className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
                  {t(`descCard${i}`)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 flex justify-center">
            <button
              type="button"
              aria-label="Scroll Down"
              onClick={scrollToStory}
              className="flex h-10 w-10 animate-bounce cursor-pointer items-center justify-center rounded-full border border-cyan-300/30 bg-white/50 transition hover:bg-cyan-50 dark:bg-white/[0.06] dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
            >
              <ChevronDown className="h-5 w-5 text-slate-950 dark:text-white" />
            </button>
          </div>
        </div>
      </section>

      {/* Our story */}
      <section className="bg-slate-50/70 px-4 dark:bg-white/[0.025]" ref={storyRef}>
        <div className="mx-auto w-full max-w-6xl border-t border-neutral-200/70 py-14 dark:border-white/[0.08]">
          <h2 className="mb-6 text-2xl font-black text-slate-950 dark:text-white sm:text-3xl">
            {t("OurStory-title")}
          </h2>
          <p className="max-w-5xl text-sm font-bold leading-8 text-slate-600 dark:text-slate-300 sm:text-base md:text-lg">
            {t("OurStory-desc")}
          </p>
        </div>
      </section>

      {/* Vision / Mission */}
      <section className="bg-slate-50/70 px-4 dark:bg-white/[0.025]">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 pb-16 md:grid-cols-2">
          <div className="tp-card flex flex-col justify-between px-8 py-10">
            <div>
              <h3 className="mb-3 text-xl font-black text-slate-950 dark:text-white">
                {t("vision-title")}
              </h3>
              <p className="text-sm font-bold leading-8 text-slate-600 dark:text-slate-300 sm:text-base">
                {t("vision-desc")}
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <RocketIcon className="mb-4 h-16 w-16 text-cyan-500" />
            </div>
          </div>

          <div className="tp-card flex flex-col justify-between px-8 py-10">
            <div>
              <h3 className="mb-3 text-xl font-black text-slate-950 dark:text-white">
                {t("mission-title")}
              </h3>
              <p className="text-sm font-bold leading-8 text-slate-600 dark:text-slate-300 sm:text-base">
                {t("mission-desc")}
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <CommunityIcon className="mb-4 h-16 w-16 text-cyan-500" />
            </div>
          </div>
        </div>
      </section>

      {/* Advantages */}
      <section className="bg-slate-50/70 px-4 pb-20 dark:bg-white/[0.025]">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="text-center text-2xl font-black text-slate-950 dark:text-white sm:text-3xl">
            {t("advantage-title")}
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-center text-sm font-bold leading-8 text-slate-600 dark:text-slate-300 sm:text-base md:text-lg">
            {t("advantage-desc")}
          </p>

          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              { Icon: RocketIcon, title: t("security-title"), desc: t("security-desc") },
              { Icon: CommunityIcon, title: t("ecosystem-title"), desc: t("ecosystem-desc") },
              { Icon: RocketIcon, title: t("mce-title"), desc: t("mce-desc") },
            ].map(({ Icon, title, desc }) => (
              <div
                key={String(title)}
                className="tp-card flex flex-col items-center px-6 py-10 text-center"
              >
                <Icon className="mb-4 h-16 w-16 text-cyan-500" />
                <h3 className="mb-3 text-lg font-black text-slate-950 dark:text-white">
                  {title}
                </h3>
                <p className="text-xs font-bold leading-7 text-slate-600 dark:text-slate-300 sm:text-sm">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="bg-slate-50/70 px-4 pb-20 dark:bg-white/[0.025]">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-black text-slate-950 dark:text-white sm:text-4xl">
            {t("principles-title")}
          </h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="tp-card flex items-center gap-4 px-6 py-5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-sm font-bold leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                  {t(`principle${i}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Future CTA */}
      <section className="bg-slate-50/70 px-4 pb-24 dark:bg-white/[0.025]">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-black text-slate-950 dark:text-white sm:text-4xl">
            🚀 {t("future-title")}
          </h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300 sm:text-base">
            {t("future-desc")}
          </p>
          <div className="mt-8">
            <a
              href="/careers"
              className="inline-block rounded-2xl bg-cyan-500 px-8 py-3.5 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
            >
              {t("future-btn")}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
