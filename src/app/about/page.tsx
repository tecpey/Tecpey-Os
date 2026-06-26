"use client";

import React, { useRef} from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
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
      <section className="mt-16 bg-bg px-4 py-2 mt-2">
        <div className="mx-auto w-full max-w-6xl py-14">
          <h1 className="about-title text-center text-3xl sm:text-4xl md:text-5xl font-bold leading-relaxed">
            {t("title")}
          </h1>

          <p className=" about-muted mt-6 text-center text-base sm:text-lg md:text-xl font-medium max-w-3xl mx-auto">
            {t("description")}
          </p>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex flex-col items-center border-t border-b border-primary/30 py-6 text-center"
              >
                <div className="text-2xl font-bold text-fg">
                  {t(`tileCard${i}`)}
                </div>
                <div className="mt-1 text-sm font-semibold text-muted">
                  {t(`descCard${i}`)}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-16">
            <button
              type="button"
              aria-label="Scroll Down"
              onClick={scrollToStory}
              className="about-scroll-btn animate-bounce w-10 h-10 flex items-center justify-center rounded-full cursor-pointer"
            >
              <ChevronDown className="text-fg w-5 h-5  " />
            </button>
          </div>
        </div>
      </section>

      <section className="bg-bg-light px-4" ref={storyRef}>
        <div className="mx-auto w-full max-w-6xl py-14 border-t border-neutral-300/60">
          <h2 className="text-2xl sm:text-3xl font-bold text-fg mb-6 about-title">
            {t("OurStory-title")}
          </h2>

          <p className="text-sm sm:text-base md:text-lg about-muted leading-relaxed max-w-5xl">
            {t("OurStory-desc")}
          </p>
        </div>
      </section>

      <section className="bg-bg-light px-4">
        <div className="mx-auto w-full max-w-6xl pb-16 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="rounded-2xl faq-bg border border-primary/20 border  shadow-lg  px-8 py-10 flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold text-fg mb-3">
                {t("vision-title")}
              </h3>
              <p className="text-sm sm:text-base about-muted">
                {t("vision-desc")}
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <RocketIcon className="w-16 h-16 text-fg mb-4" />
            </div>
          </div>

          <div className="rounded-2xl faq-bg border border-primary/20 border  shadow-lg p-8 px-8 py-10 flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold text-fg mb-3">
                {t("mission-title")}
              </h3>
              <p className="text-sm sm:text-base about-muted">
                {t("mission-desc")}
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <CommunityIcon className="w-16 h-16 text-fg mb-4" />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-bg-light px-4 pb-20">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-fg text-center about-title">
            {t("advantage-title")}
          </h2>

          <p className="mt-4 text-sm sm:text-base md:text-lg about-muted text-center max-w-3xl mx-auto leading-relaxed">
            {t("advantage-desc")}
          </p>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="rounded-2xl faq-bg border border-primary/20 border  shadow-lg  px-6 py-10 text-center flex flex-col items-center">
              <RocketIcon className="w-16 h-16 text-fg mb-4" />
              <h3 className="text-lg font-bold text-fg mb-3">
                {t("security-title")}
              </h3>
              <p className="text-xs sm:text-sm about-muted leading-relaxed">
                {t("security-desc")}
              </p>
            </div>

            <div className="rounded-2xl faq-bg border border-primary/20 border  shadow-lg  px-6 py-10 text-center flex flex-col items-center">
              <CommunityIcon className="w-16 h-16 text-fg mb-4" />

              <h3 className="text-lg font-bold text-fg mb-3">
                {t("ecosystem-title")}
              </h3>
              <p className="text-xs sm:text-sm about-muted leading-relaxed">
                {t("ecosystem-desc")}
              </p>
            </div>

            <div className="rounded-2xl faq-bg border border-primary/20 border  shadow-lg  px-6 py-10 text-center flex flex-col items-center">
              <RocketIcon className="w-16 h-16 text-fg mb-4" />
              <h3 className="text-lg font-bold text-fg mb-3">
                {t("mce-title")}
              </h3>
              <p className="text-xs sm:text-sm about-muted leading-relaxed">
                {t("mce-desc")}
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="bg-bg-light px-4 pb-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl sm:text-4xl font-bold text-fg mb-12">
            {t("principles-title")}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-xl border border-primary/20 faq-bg px-6 py-5 shadow-lg"
              >
                <div className="about-check-box flex h-8 w-8 items-center justify-center rounded-md">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>

                <p className="text-sm sm:text-base about-muted font-medium">
                  {t(`principle${i}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-bg-light px-4 pb-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-fg about-title">
            🚀 {t("future-title")}
          </h2>

          <p className="mt-4 about-muted text-sm sm:text-base leading-relaxed">
            {t("future-desc")}
          </p>

          <div className="mt-8">
            <a
              href="/careers"
              className="about-cta inline-block rounded-full px-8 py-3 text-sm font-semibold shadow-lg"
            >
              {t("future-btn")}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
