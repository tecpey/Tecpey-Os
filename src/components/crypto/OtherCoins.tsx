"use client";

import { forwardRef, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getCurrencies } from "@/services/swap.services";

type TabKey = "trending" | "gainers" | "newest";

const OtherCoins = forwardRef<HTMLDivElement>((props, ref) => {
  const t = useTranslations("MarketTabs");

  const [activeTab, setActiveTab] = useState<TabKey>("trending");

  const [visibleCount, setVisibleCount] = useState(9);

  const { data, isLoading } = useInfiniteQuery({
    queryKey: ["other-coins"],
    queryFn: ({ pageParam = 1 }) => getCurrencies(pageParam, 50),
    getNextPageParam: () => undefined,
    initialPageParam: 1,
  });

  // normalize api data
  const allCoins = useMemo(() => {
    return (
      data?.pages
        ?.flatMap((page: any) => page.data)
        ?.filter((coin: any) => coin.symbol !== "USDT" && coin.symbol !== "IRT")
        ?.map((coin: any) => ({
          id: coin.id,
          symbol: coin.symbol,
          name: coin.name,
          icon: coin.icon || "/default-coin.svg",
          rank: coin.rank || 999999,
          price: Number(coin.priceData?.last || 0),
          change: Number(coin.priceData?.changePercent || 0),
          volume: Number(coin.priceData?.volume || 0),
          timestamp: coin.priceData?.timestamp || 0,
        })) || []
    );
  }, [data]);

  // tabs logic
  const coins = useMemo(() => {
    switch (activeTab) {
      case "trending":
        return [...allCoins].sort((a, b) => b.volume - a.volume);

      case "gainers":
        return [...allCoins].sort((a, b) => b.change - a.change);

      case "newest":
        return [...allCoins].sort((a, b) => b.timestamp - a.timestamp);

      default:
        return allCoins;
    }
  }, [allCoins, activeTab]);

  const locale =
    typeof document !== "undefined" ? document.documentElement.lang : "en";

  return (
    <div
      ref={ref}
      className="oc-card rounded-2xl p-4 sm:p-6 shadow-lg h-full flex flex-col"
    >
      <h3 className="oc-title font-bold text-base sm:text-lg mb-3 sm:mb-4">
        {t("otherCoins")}
      </h3>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 text-[11px] sm:text-xs font-medium overflow-x-auto pb-1">
        {(["trending", "gainers", "newest"] as TabKey[]).map((tab) => {
          const isActive = activeTab === tab;

          return (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setVisibleCount(9);
              }}
              className={`oc-tab px-3 py-1 rounded-full whitespace-nowrap hover:bg-primary/90 hover:text-white transition-all shrink-0 ${
                isActive ? "oc-tab-active" : "oc-tab-inactive"
              }`}
            >
              {tab === "trending" && t("tabs.trending")}
              {tab === "gainers" && t("tabs.gainers")}
              {tab === "newest" && t("tabs.newest")}
            </button>
          );
        })}
      </div>

      {/* LIST */}
      <div className="space-y-2 flex-1 overflow-hidden">
        {isLoading
          ? Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-xl bg-gray-100 animate-pulse"
              />
            ))
          : coins.slice(0, visibleCount).map((coin, i) => (
              <Link
                key={`${coin.id}-${i}`}
                href={`/crypto/${coin.symbol.toLowerCase()}`}
                className="flex items-center justify-between oc-row px-2 py-1 hover:bg-bg rounded-lg transition-all"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <Image
                    src={coin.icon}
                    alt={coin.symbol}
                    width={28}
                    height={28}
                    className="rounded-full object-contain shrink-0"
                    unoptimized
                  />

                  <div className="min-w-0">
                    <p className="oc-coin-name font-semibold text-xs sm:text-sm uppercase truncate">
                      {coin.symbol}
                    </p>

                    <p className="oc-coin-sub text-[10px] sm:text-xs capitalize truncate">
                      {coin.name}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className={`oc-price text-xs sm:text-sm font-semibold
                     ${
                      locale === "fa" ? "text-left" : "text-right"}`}>
                    ${coin.price.toLocaleString()}
                  </p>

                  <p
                    className={`oc-change text-[10px] sm:text-xs font-medium ${
                      locale === "fa" ? "text-left" : "text-right"
                    } ${coin.change < 0 ? "oc-change-neg" : "oc-change-pos"}`}
                  >
                    {coin.change > 0 ? "+" : ""}
                    {coin.change.toFixed(2)}%
                  </p>
                </div>
              </Link>
            ))}
      </div>

      {!isLoading && visibleCount < coins.length && (
        <div className="pt-4">
          <button
            onClick={() => setVisibleCount((prev) => prev + 9)}
            className="
            w-full
            rounded-xl
            py-2
            text-sm
            font-medium
            bg-primary
            text-white
            hover:bg-blue-700
            transition-all
            cursor-pointer
          "
          >
            {t("viewMore")}
          </button>
        </div>
      )}
    </div>
  );
});

OtherCoins.displayName = "OtherCoins";

export default OtherCoins;
