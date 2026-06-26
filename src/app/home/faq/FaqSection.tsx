"use client";

import { useTranslations } from "next-intl";
import { BadgePlus } from "lucide-react";
import { useState, useRef } from "react";
import useScrollReveal from "@/hooks/useScrollReveal";

export default function FaqSection() {
  const t = useTranslations("Faq");

  const items = [
    { q: t("q1"), a: t("a1") },
    { q: t("q2"), a: t("a2") },
    { q: t("q3"), a: t("a3") },
    { q: t("q4"), a: t("a4") },
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });

  const toggle = (i: number) => {
    setOpenIndex((prev) => (prev === i ? null : i));
  };

  return (
    <section
      ref={ref}
      className="py-12 sm:py-16 lg:py-20 max-w-7xl mx-auto text-fg px-4 sm:px-6 lg:px-8"
    >
      <h2
        className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-8 sm:mb-10 text-center sm:text-start"
        style={{
          transition: "opacity 700ms ease, transform 700ms ease",
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0)" : "translateY(20px)",
        }}
      >
        {t("title")}
      </h2>

      <div className="flex flex-col gap-4">
        {items.map((item, i) => {
          const isOpen = openIndex === i;

          return (
            <div
              key={i}
              className={`
                faq-bg rounded-2xl border transition-all duration-300
                ${
                  isOpen
                    ? "border-blue-600/60 shadow-[0_0_10px_#1e40ff33]"
                    : "border-white/10"
                }
              `}
              style={{
                transition:
                  "opacity 700ms ease, transform 700ms ease, filter 700ms ease",
                transitionDelay: `${200 + i * 100}ms`,
                opacity: isVisible ? 1 : 0,
                transform: isVisible
                  ? "translateY(0)"
                  : "translateY(25px)",
                filter: isVisible ? "blur(0px)" : "blur(6px)",
              }}
            >
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 text-left"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span
                    className={`
                      mt-2 w-2.5 h-2.5 rotate-45 rounded-sm shrink-0
                      bg-blue-700 transition-all
                      ${
                        isOpen
                          ? "shadow-[0_0_8px_#1e40ff99]"
                          : ""
                      }
                    `}
                  />

                  <span className="text-sm sm:text-base lg:text-lg font-medium leading-6 sm:leading-7 break-words">
                    {item.q}
                  </span>
                </div>

                <BadgePlus
                  size={20}
                  className={`
                    shrink-0 transition-transform duration-300
                    ${isOpen ? "rotate-45" : ""}
                  `}
                />
              </button>

              <div
                ref={(el) => {
                  contentRefs.current[i] = el;
                }}
                style={{
                  height: isOpen
                    ? (contentRefs.current[i]?.scrollHeight ?? 0)
                    : 0,
                }}
                className="overflow-hidden transition-all duration-300 ease-in-out"
              >
                <div
                  className={`
                    px-4 pb-4 sm:px-6 sm:pb-6
                    text-sm sm:text-base
                    text-fg/70
                    leading-7
                    transition-all duration-300
                    ${
                      isOpen
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 -translate-y-2"
                    }
                  `}
                >
                  {item.a}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}