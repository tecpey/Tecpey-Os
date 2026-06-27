"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import useScrollReveal from "@/hooks/useScrollReveal";
import { useBaseCurrenciesPrice } from "@/hooks/useBaseCurrenciesPrice";
import Chart from "@/components/charts/chart";
import PriceTableSkeleton from "@/components/skeletons/PriceTableSkeletone";
import { handleDecimal } from "@/utils/handleDecimal";

export default function PriceListSection() {
  const t = useTranslations("PriceList");

  const { ref, isVisible } = useScrollReveal({
    threshold: 0.2,
  });

  const pairs = ["BTCUSDT", "ETHUSDT", "XRPUSDT", "DOGEUSDT"];

  const { currencies, isLoading, USDT_IRT } = useBaseCurrenciesPrice(pairs);

  const filteredCurrencies = currencies?.filter(
    (coin) => !["USD", "IRT"].includes(coin.symbol),
  );

  const isIRTenabled = currencies.some((c) => c.usdtIRT);


  if (isLoading) {
    return <PriceTableSkeleton rows={6} hasIRT={isIRTenabled} />;
  }

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className="py-15 bg-bg text-fg transition duration-300"
    >
      <div
        className="max-w-7xl mx-auto px-6"
        style={{
          transition:
            "opacity 700ms ease, transform 700ms ease, filter 700ms ease",
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0px)" : "translateY(32px)",
          filter: isVisible ? "blur(0px)" : "blur(6px)",
        }}
      >
        <h2 className="text-3xl md:text-4xl font-extrabold text-center mb-10">
          {t("title")}
        </h2>

        <div className="bg-bg border border-strong rounded-3xl p-4 md:p-6 shadow-lg backdrop-blur-md">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header */}
              <div
                className={`
    grid
    items-center
    gap-3
    px-4 py-3
    text-sm font-semibold opacity-60
    border-b border-black/10 dark:border-white/10
    ${
      isIRTenabled
        ? "grid-cols-[1fr_1fr_1fr_.8fr_1fr_1.5fr_120px]"
        : "grid-cols-[1fr_1fr_.8fr_1fr_1.5fr_120px]"
    }
  `}
              >
                <span>{t("coin")}</span>
                <span>{t("price")}</span>
                {isIRTenabled && <span>{t("priceIrt")}</span>}
                <span>{t("volume")}</span>
                <span>{t("change")}</span>
                <span>{t("chart")}</span>
                <span></span>
              </div>

              <div className="divide-y divide-black/10 dark:divide-white/10">
                {filteredCurrencies.map((coin) => {
                  const change = Number(coin.priceData?.changePercent || 0);

                  const irtPrice =
                    USDT_IRT && coin.priceData?.last
                      ? Number(coin.priceData.last) * Number(USDT_IRT)
                      : null;

                  return (
                    <div
                      key={coin.id}
                      onClick={() => {
                        const url = `/crypto/${coin.symbol?.toLowerCase()}`;
                        window.location.href = url;
                      }}
                      className={`
          grid
          items-center
          gap-3
          px-4 py-4
          transition
          cursor-pointer
          hover:bg-white/5
          ${
            isIRTenabled
              ? "grid-cols-[1fr_1fr_1fr_.8fr_1fr_1.5fr_120px]"
              : "grid-cols-[1fr_1fr_.8fr_1fr_1.5fr_120px]"
          }
        `}
                    >
                      {/* Coin */}
                      <div className="flex items-center gap-3 min-w-0">
                        <Image
                          src={coin.icon || "/default-coin.svg"}
                          alt={coin.symbol}
                          width={34}
                          height={34}
                          className="rounded-full shrink-0"
                          unoptimized
                        />

                        <div className="min-w-0">
                          <p className="font-bold truncate">{coin.symbol}</p>

                          <p className="text-sm opacity-60 truncate">
                            {coin.name}
                          </p>
                        </div>
                      </div>

                      {/* Price */}
                      <p className="font-medium text-sm">
                        {handleDecimal(coin.priceData?.last ?? 0)}
                      </p>

                      {/* IRT */}
                      {isIRTenabled && (
                        <p className="font-medium text-sm">
                          {irtPrice
                            ? Math.floor(irtPrice).toLocaleString()
                            : "-"}
                        </p>
                      )}

                      {/* Volume */}
                      <p className="font-medium text-sm">
                        {Number(coin.priceData?.volume).toFixed(2)}
                      </p>

                      {/* Change */}
                      <p
                        className={`font-bold text-sm ${
                          change > 0 ? "text-[#00C853]" : "text-[#FF1744]"
                        }`}
                      >
                        {change.toFixed(2)}%
                      </p>

                      {/* Chart */}
                      <div className="w-[90px] h-[40px]">
                        <Chart
                          symbol={coin.priceData?.symbol}
                          change={change}
                          height={45}
                        />
                      </div>

                      {/* Button */}
                      <a
                        href={"https://my.tecpey.ir/signin"}
                        onClick={(e) => e.stopPropagation()}
                        className="
                          flex items-center justify-center gap-2
                          h-9 px-3 rounded-full
                          text-xs font-medium
                          bg-primary hover:bg-blue-700
                          text-white transition
                          "
                      >
                        <span>{t("trade")}</span>
                        <TrendingUp size={16} />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* View More */}
          <div className="text-center mt-6">
            <Link
              href="/markets"
              className="text-muted hover:text-gray-500 transition flex items-center gap-1 mx-auto w-fit"
            >
              View More <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
