"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import useScrollReveal from "@/hooks/useScrollReveal";
import { useEffect, useState } from "react";

export default function About() {
  const t = useTranslations("About");
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <section ref={ref} className="bg-bg overflow-hidden">
      <div
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 md:py-20"
        style={{
          transition: "opacity 600ms ease, transform 600ms ease",
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0)" : "translateY(30px)",
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-12 md:gap-16">
          
          {/* Image */}
          <div
            className="flex justify-center md:justify-start"
            style={{
              transition: "all 600ms ease",
              transitionDelay: "150ms",
              opacity: isVisible ? 1 : 0,
              transform: isVisible
                ? "translateX(0)"
                : isMobile
                ? "translateY(30px)"
                : "translateX(-30px)",
            }}
          >
            <div className="w-full max-w-[420px] sm:max-w-[480px] md:max-w-[520px] rounded-2xl overflow-hidden shadow-lg">
              <Image
                src="/images/About.png"
                alt="About TecPey"
                width={520}
                height={390}
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
          <div
            className="text-center md:text-left"
            style={{
              transition: "all 600ms ease",
              transitionDelay: "300ms",
              opacity: isVisible ? 1 : 0,
              transform: isVisible
                ? "translateX(0)"
                : isMobile
                ? "translateY(30px)"
                : "translateX(30px)",
            }}
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-fg leading-snug">
              {t("title")}
            </h2>

            <p className="mt-5 text-sm sm:text-base md:text-lg text-muted leading-relaxed max-w-xl mx-auto md:mx-0">
              {t("description")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
