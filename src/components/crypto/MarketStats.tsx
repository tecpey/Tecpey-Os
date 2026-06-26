import { MessageSquare } from "lucide-react";
import { forwardRef } from "react";
import { useTranslations } from "next-intl";
import { handleDecimal } from "@/utils/handleDecimal";

type Props = {
  coin: any;
};

const parseNum = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const MarketStats = forwardRef<HTMLDivElement, Props>(({ coin }, ref) => {
  const t = useTranslations("MarketTabs");

  if (!coin) return null;

  const low24h = parseNum(coin.priceData?.low24h);
  const high24h = parseNum(coin.priceData?.high24h);

  const minPrice = Math.min(low24h, high24h);
  const maxPrice = Math.max(low24h, high24h);

  const currentPrice = parseNum(coin.priceData?.last);

  const range = maxPrice - minPrice;

  const rawPercent = range > 0 ? ((currentPrice - minPrice) / range) * 100 : 50;

  const percent = Math.max(0, Math.min(100, rawPercent));

  const change = parseNum(coin.priceData?.changePercent);

  const volume =
    parseNum(coin.priceData?.quoteVolume) || parseNum(coin.priceData?.volume);
  const marketCap = parseNum(coin.priceData?.marketCap) || parseNum(coin.priceData?.market_cap) || parseNum(coin.marketCap);
  const circulatingSupply = parseNum(coin.circulatingSupply) || parseNum(coin.priceData?.circulatingSupply);
  const totalSupply = parseNum(coin.totalSupply) || parseNum(coin.priceData?.totalSupply);
  const maxSupply = parseNum(coin.maxSupply) || parseNum(coin.priceData?.maxSupply);
  const fdv = parseNum(coin.fdv) || parseNum(coin.priceData?.fdv) || parseNum(coin.fullyDilutedValuation) || parseNum(coin.priceData?.fullyDilutedValuation);

  const isRTL =
    typeof document !== "undefined"
      ? document.documentElement.dir === "rtl"
      : false;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  return (
    <div ref={ref} className="stats-card rounded-2xl p-4 sm:p-6 mb-6 shadow-lg">
      <div className="stats-range rounded-xl p-3 sm:p-4 mb-6">
        <p className="stats-range-label text-[10px] sm:text-xs mb-3">
          {t("in24h")}
        </p>

        <div className="relative pt-2 sm:pt-16">
          {/* Bubble */}
          {!isMobile && (
            <div
              className="absolute top-0 z-10 transition-all duration-300"
              style={{
                left: `${percent}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="relative w-full h-full sm:w-14 sm:h-14">
                <MessageSquare className="stats-bubble-icon w-12 h-12" />

                <span className="stats-bubble-text text-fg absolute inset-0 flex items-center justify-center text-[9px] sm:text-[11px] font-bold">
                  ${handleDecimal(currentPrice)}
                </span>
              </div>
            </div>
          )}

          {/* Range */}
          <div className="relative h-2 rounded-full overflow-hidden bg-white/10">
            <div
              className="absolute left-0 top-0 h-full rounded-full stats-range-fill transition-all duration-300"
              style={{
                width: `${percent}%`,
              }}
            />
          </div>

          {/* Labels */}
          <div
            className={`relative flex justify-between mt-3 text-[11px] sm:text-sm ${
              isRTL ? "flex-row-reverse" : ""
            }`}
          >
            <div className={isRTL ? "text-right" : "text-left"}>
              <p className="stats-label">
                {isRTL ? t("maxPrice") : t("minPrice")}:
              </p>

              <p className="stats-value font-semibold">
                ${handleDecimal(isRTL ? maxPrice : minPrice)}
              </p>
            </div>

            <div className={isRTL ? "text-left" : "text-right"}>
              <p className="stats-label">
                {isRTL ? t("minPrice") : t("maxPrice")}:
              </p>

              <p className="stats-value font-semibold">
                ${handleDecimal(isRTL ? minPrice : maxPrice)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 text-[11px] sm:text-sm">
        <div className="flex justify-between">
          <span>{t("currentPrice")}:</span>

          <span className="font-semibold">${handleDecimal(currentPrice)}</span>
        </div>

        <div className="flex justify-between">
          <span>{t("tradingVolume")}:</span>

          <span className="font-semibold">{volume.toFixed(2)}</span>
        </div>

        <div className="flex justify-between">
          <span>{t("priceChange")}:</span>

          <span
            className={`font-semibold ${
              change >= 0 ? "text-[#00C853]" : "text-[#FF1744]"
            }`}
          >
            {change.toFixed(2)}%
          </span>
        </div>



        <div className="flex justify-between">
          <span>Market Cap:</span>
          <span className="font-semibold">{marketCap ? `$${marketCap.toLocaleString()}` : "-"}</span>
        </div>

        <div className="flex justify-between">
          <span>FDV:</span>
          <span className="font-semibold">{fdv ? `$${fdv.toLocaleString()}` : "-"}</span>
        </div>

        <div className="flex justify-between">
          <span>Circulating Supply:</span>
          <span className="font-semibold">{circulatingSupply ? circulatingSupply.toLocaleString() : "-"}</span>
        </div>

        <div className="flex justify-between">
          <span>Total Supply:</span>
          <span className="font-semibold">{totalSupply ? totalSupply.toLocaleString() : "-"}</span>
        </div>

        <div className="flex justify-between">
          <span>Max Supply:</span>
          <span className="font-semibold">{maxSupply ? maxSupply.toLocaleString() : "-"}</span>
        </div>

        <div className="flex justify-between">
          <span>{t("rank")}:</span>

          <span className="font-semibold">#{coin.rank ?? "-"}</span>
        </div>

        <div className="flex justify-between">
          <span>{t("symbol")}:</span>

          <span className="font-semibold">{coin.symbol}</span>
        </div>
      </div>
    </div>
  );
});

MarketStats.displayName = "MarketStats";

export default MarketStats;
