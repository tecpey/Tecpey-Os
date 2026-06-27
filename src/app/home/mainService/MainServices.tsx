"use client";

import { useTranslations } from "next-intl";
import useScrollReveal from "@/hooks/useScrollReveal";
import { TrendingUp, RefreshCw, BarChart3, Coins } from "lucide-react";

export default function MainServices() {
  const t = useTranslations("Services");
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });

  const services = [
    {
      title: t("spot.title"),
      desc: t("spot.desc"),
      icon: <TrendingUp size={32} />,
    },
    {
      title: t("swap.title"),
      desc: t("swap.desc"),
      icon: <RefreshCw size={32} />,
    },
    {
      title: t("futures.title"),
      desc: t("futures.desc"),
      icon: <BarChart3 size={32} />,
    },
    {
      title: t("staking.title"),
      desc: t("staking.desc"),
      icon: <Coins size={32} />,
    },
  ];

  return (
    <section ref={ref as any} className="py-20 bg-bg text-fg overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            {t("title")}
          </h2>
          <p className="mt-4 text-muted text-base sm:text-lg max-w-2xl mx-auto opacity-80">
            {t("subtitle")}
          </p>
        </div>

        <div
          className="
            grid 
            grid-cols-2    
            lg:grid-cols-4   
            gap-4 sm:gap-6
            justify-items-center
          "
        >
          {services.map((service, i) => {
            const delay = `${i * 100}ms`;

            return (
              <div
                key={i}
                className={`
                  w-full
                  h-[200px] sm:h-[180px] lg:h-[210px]
                  rounded-3xl
                  overflow-hidden
                  p-4 sm:p-6
                  flex flex-col
                  justify-center
                  items-center
                  text-center
                  group
                  cursor-pointer
                  transition-all duration-700 ease-out
                  hover:scale-[1.03] hover:shadow-2xl
                  ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}
                  relative
                  `}
                style={{
                  transitionDelay: delay,
                }}
              >
                <div
                  className="absolute inset-0 z-0 bg-center bg-cover transition-transform duration-500 group-hover:scale-110"
                  style={{ backgroundImage: "url('/images/main.png')" }}
                />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors z-10" />

                <div className="relative z-20 flex flex-col items-center">
                  <div className="text-primary-light mb-4 text-blue-400 group-hover:scale-110 transition-transform duration-300">
                    {service.icon}
                  </div>

                  <h3 className="text-lg sm:text-xl font-bold text-white mb-2">
                    {service.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-gray-200 opacity-90 leading-relaxed line-clamp-3">
                    {service.desc}
                  </p>
                </div>

                <div className="absolute bottom-0 left-0 h-1 bg-primary w-0 group-hover:w-full transition-all duration-500 z-30" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
