"use client";

import PriceCard from "./PriceCard";
import PriceCardSkeleton from "@/components/skeletons/PriceCardSkeletone";
import { useTranslations } from "next-intl";
import useScrollReveal from "@/hooks/useScrollReveal";
import { useBaseCurrenciesPrice } from "@/hooks/useBaseCurrenciesPrice";
import { useState } from "react";

export default function Hero() {
  const t = useTranslations("Hero");

  const initialPairs = [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "ADAUSDT",
    "DOGEUSDT",
  ];

  const { currencies, isLoading } = useBaseCurrenciesPrice(initialPairs);

  const { ref: heroRef } = useScrollReveal({
    threshold: 0.2,
  });

  const { ref: leftRef, isVisible: leftVisible } = useScrollReveal({
    threshold: 0.2,
  }) as { ref: React.RefObject<HTMLDivElement>; isVisible: boolean };

  // Price cards reveal
  const { ref: cardsRef, isVisible: cardsVisible } = useScrollReveal({
    threshold: 0.2,
  }) as { ref: React.RefObject<HTMLDivElement>; isVisible: boolean };


  const filteredCurrencies = currencies
    .filter((coin) =>
       !["USD" , "IRT" , "USDT" , "hot"].includes(
        coin.symbol
       )
      )
    .slice(0, 6);

    const [email,setEmail] = useState("")

  return (
    <section
      ref={heroRef}
      className="w-full min-h-screen text-white pt-20 pb-32 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/images/hero.png')" }}
    >
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-16 mt-20">
        {/* LEFT SIDE */}
        <div
          ref={leftRef}
          style={{
            transition: "opacity .8s ease, transform .8s ease",
            opacity: leftVisible ? 1 : 0,
            transform: leftVisible ? "translateY(0)" : "translateY(25px)",
          }}
          className="flex flex-col justify-center mt-10"
        >
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-6">
            {t("titleLine1")}
            <br />
            {t("titleLine2")}
          </h1>

          <p className="text-base md:text-lg text-gray-300 mb-4">
            {t("subtitle", { bonus: t("bonus") })}
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 mt-8">
            <input
              type="text"
              value={email}
              onChange={(e)=> setEmail(e.target.value)}
              placeholder={t("placeholder")}
              className="px-5 py-3 bg-gray-700/70 rounded-full outline-none text-sm w-full sm:w-60 placeholder-gray-300 focus:bg-gray-700 transition"
            />

            <a
              href={`https://my.tecpey.ir/signup?email=${encodeURIComponent(email)}`}
              className="px-6 py-3 bg-primary rounded-full text-sm font-semibold hover:bg-blue-700 transition-colors w-full sm:w-auto text-center"
            >
              {t("button")}
            </a>
          </div>
        </div>

        {/* PRICE CARDS */}
        <div ref={cardsRef} className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {isLoading
            ? // loading skeleton
              Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  style={{
                    transition: "opacity .7s ease, transform .7s ease",
                    transitionDelay: `${i * 120}ms`,
                    opacity: cardsVisible ? 1 : 0,
                    transform: cardsVisible ? "translateY(0)" : "translateY(18px)",
                  }}
                >
                  <PriceCardSkeleton />
                </div>
              ))
            : 
              filteredCurrencies.map((coin, i) => {
                const pair = coin.symbol.replace("USDT", "/USDT");
                const price = Number(coin.priceData?.last || 0).toLocaleString();
                const change = Number(coin.priceData?.changePercent || 0);
                const changeText = `${change.toFixed(2)}%`;

                return (
                  <div
                    key={coin.id || i}
                    style={{
                      transition: "opacity .7s ease, transform .7s ease",
                      transitionDelay: `${i * 120}ms`,
                      opacity: cardsVisible ? 1 : 0,
                      transform: cardsVisible ? "translateY(0)" : "translateY(18px)",
                    }}
                  >
                    <PriceCard
                      pair={pair}
                      price={price}
                      change={changeText}
                      logo={coin.icon || "/default-coin.svg"}
                    />
                  </div>
                );
              })}
        </div>
      </div>
    </section>
  );
}