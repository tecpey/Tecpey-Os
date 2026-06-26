"use client";
import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import useScrollReveal from "@/hooks/useScrollReveal";
import Link from "next/link";

export default function BlogSection() {
  const t = useTranslations("Blog");

  const { ref, isVisible } = useScrollReveal({
    threshold: 0.25,
  });

  const blogs = [
    { id: 1, img: "/images/blog1.png" },
    { id: 2, img: "/images/blog2.png" },
    { id: 3, img: "/images/blog3.png" },
    { id: 4, img: "/images/blog1.png" },
    { id: 5, img: "/images/blog2.png" },
    { id: 6, img: "/images/blog3.png" },
  ];

  const [index, setIndex] = useState(0);

  const prev = () => {
    setIndex((prev) => (prev === 0 ? blogs.length - 1 : prev - 1));
  };

  const next = () => {
    setIndex((prev) => (prev === blogs.length - 1 ? 0 : prev + 1));
  };

  const left = blogs[(index - 1 + blogs.length) % blogs.length];
  const center = blogs[index];
  const right = blogs[(index + 1) % blogs.length];

  return (
    <section ref={ref} className="py-15 bg-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* title */}
        <h2
          className="text-2xl sm:text-3xl md:text-4xl font-bold pb-2 text-fg"
          style={{
            transition: "opacity 700ms ease, transform 700ms ease",
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          {t("title")}
        </h2>

        <p
          className="mb-10 text-sm sm:text-base text-muted"
          style={{
            transition: "opacity 700ms ease, transform 700ms ease",
            transitionDelay: "120ms",
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          {t("subtitle")}
        </p>

        {/* slider */}
        <div
          className="relative flex items-center justify-center gap-4 sm:gap-6"
          style={{
            transition:
              "opacity 700ms ease, transform 700ms ease, filter 700ms ease",
            transitionDelay: "250ms",
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(35px)",
            filter: isVisible ? "blur(0px)" : "blur(6px)",
          }}
        >
          <button
            onClick={prev}
            className="absolute left-0 z-10 bg-white/20 hover:bg-white/30 p-2 sm:p-3 rounded-full cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* left */}
          <Link
            href={`/blog/${left.id}`}
            className="hidden md:block w-[260px] lg:w-[352px] h-[180px] lg:h-[230px] scale-90 rounded-3xl overflow-hidden cursor-pointer transition-all duration-300"
          >
            <Image
              src={left.img}
              alt=""
              width={352}
              height={230}
              className="object-cover w-full h-full"
            />
          </Link>

          {/* center */}
          <Link
            href={`/blog/${center.id}`}
            className="w-full max-w-[320px] sm:max-w-[380px] md:w-[450px] md:h-[300px] aspect-[4/3] md:aspect-auto rounded-3xl overflow-hidden shadow-xl cursor-pointer transition-all duration-300 md:scale-110"
          >
            <Image
              src={center.img}
              alt=""
              width={450}
              height={300}
              className="object-cover w-full h-full"
            />
          </Link>

          {/* right */}
          <Link
            href={`/blog/${right.id}`}
            className="hidden md:block w-[260px] lg:w-[352px] h-[180px] lg:h-[230px] scale-90 rounded-3xl overflow-hidden cursor-pointer transition-all duration-300"
          >
            <Image
              src={right.img}
              alt=""
              width={352}
              height={230}
              className="object-cover w-full h-full"
            />
          </Link>

          <button
            onClick={next}
            className="absolute right-0 z-10 bg-white/20 hover:bg-white/30 p-2 sm:p-3 rounded-full cursor-pointer"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
