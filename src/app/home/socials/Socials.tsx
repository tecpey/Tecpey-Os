"use client";

import { useTranslations } from "next-intl";
import { FaTelegramPlane, FaInstagram, FaYoutube } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import useScrollReveal from "@/hooks/useScrollReveal";
import Link from "next/link";

export default function Socials() {
  const t = useTranslations("Social");

  const { ref, isVisible } = useScrollReveal({
    threshold: 0.25,
  });

  return (
    <section ref={ref} className="py-12 sm:py-16 bg-bg text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2
          className="text-3xl md:text-4xl font-bold mb-8 sm:mb-10 text-fg"
          style={{
            transition: "opacity 700ms ease, transform 700ms ease",
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          {t("title")}
        </h2>

        <div className="grid gap-6 md:grid-cols-2">
          <div
            className="bg-[#0061D3] rounded-3xl p-6 sm:p-8 flex flex-col justify-between min-h-[220px]"
            style={{
              transition:
                "opacity 700ms ease, transform 700ms ease, filter 700ms ease",
              transitionDelay: "200ms",
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? "translateY(0)" : "translateY(20px)",
              filter: isVisible ? "blur(0px)" : "blur(6px)",
            }}
          >
            <div>
              <h3 className="text-xl md:text-2xl font-semibold mb-3">
                {t("follow-us")}
              </h3>
              <p className="text-white/80 text-sm md:text-base whitespace-pre-line max-w-md">
                {t("description")}
              </p>
            </div>
            <div className="flex items-center gap-4 mt-5 flex-wrap">
              <Link
                href="/contact-us"
                className="social-button px-4 py-2 sm:px-5 sm:py-3 rounded-full text-sm font-medium hover:opacity-80 transition cursor-pointer"
              >
                {t("join-community")}
              </Link>

              <Link href="https://t.me/TecpeyCo" target="_blank">
                <FaTelegramPlane className="w-5 h-5 opacity-80 hover:opacity-100 cursor-pointer" />
              </Link>
              <Link href="https://www.instagram.com/tecpeyco" target="_blank">
              <FaInstagram className="w-5 h-5 opacity-80 hover:opacity-100 cursor-pointer" />
              </Link>
              <Link href="https://x.com/tecpeyco" target="_blank">
                <FaXTwitter className="w-5 h-5 opacity-80 hover:opacity-100 cursor-pointer" />
              </Link>
              <Link href="https://www.youtube.com/@tecpeyco" target="_blank">
                <FaYoutube className="w-5 h-5 opacity-80 hover:opacity-100 cursor-pointer" />
              </Link>
            </div>
          </div>

          <div
            className="rounded-3xl p-6 sm:p-8 min-h-[200px] flex flex-col justify-center items-center bg-cover bg-center"
            style={{
              backgroundImage: "url('/images/main.png')",
              transition:
                "opacity 700ms ease, transform 700ms ease, filter 700ms ease",
              transitionDelay: "350ms",
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? "translateY(0)" : "translateY(20px)",
              filter: isVisible ? "blur(0px)" : "blur(6px)",
            }}
          >
            <h3 className="text-xl md:text-2xl font-semibold mb-3 text-center">
              {t("support")}
            </h3>
            <p className="text-white/70 text-sm md:text-base max-w-md text-center whitespace-pre-line">
              {t("support-description")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
