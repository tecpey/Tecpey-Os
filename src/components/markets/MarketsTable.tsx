"use client";

import React, { useMemo } from "react";
import MarketsTableRow from "./MarketsTableRow";
import PriceTableSkeleton from "../skeletons/PriceTableSkeletone";
import type { MarketCurrency } from "@/types/market";

type Props = {
  t: (key: string) => string;
  rows: MarketCurrency[];
  isIRTenabled: boolean;
  USDT_IRT?: number | string | null;
  itemsPerPage: number;
  isLoading?: boolean;
};

export default function MarketsTable({
  t,
  rows,
  isIRTenabled,
  USDT_IRT,
  isLoading = false,
}: Props) {
  const gridClass = useMemo(() => {
    return isIRTenabled
      ? "grid-cols-[1.25fr_.82fr_.9fr_.72fr_.58fr_.72fr_.78fr]"
      : "grid-cols-[1.25fr_.9fr_.78fr_.62fr_.76fr_.78fr]";
  }, [isIRTenabled]);




  

  if (isLoading) {
    return <PriceTableSkeleton rows={8} hasIRT={isIRTenabled} />;
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-[22px] border border-amber-300/25 bg-amber-400/10 px-5 py-10 text-center" role="status">
        <p className="text-sm font-black text-[color:var(--tp-text)]">
          {t("unavailableTitle")}
        </p>
        <p className="mx-auto mt-2 max-w-xl text-xs font-bold leading-6 text-[color:var(--tp-muted)]">
          {t("unavailableDescription")}
        </p>
      </div>
    );
  }


  return (
    <div className="w-full h-full px-2 sm:px-4 md:px-0">
      <div className="mx-auto max-w-[1320px] rounded-[22px] bg-[var(--card-1)] border border-primary/20 overflow-hidden shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
        
        <div className="w-full overflow-hidden">
          
          <div className={`grid ${gridClass} items-center gap-1 px-2 sm:px-4 h-[44px] border-b border-primary/20`}>
             <span className="text-[10px] sm:text-[11px] font-semibold text-muted">{t("coin")}</span>
             <span className="text-[10px] sm:text-[11px] font-semibold text-muted">{t("priceUsdt")}</span>
             {isIRTenabled && <span className="text-[10px] sm:text-[11px] font-semibold text-muted">{t("priceIrt")}</span>}
             <span className="text-[10px] sm:text-[11px] font-semibold text-muted">{t("volume")}</span>
             <span className="text-[10px] sm:text-[11px] font-semibold text-muted">{t("change")}</span>
             <span className="text-[10px] sm:text-[11px] font-semibold text-muted">{t("chart")}</span>
             <span></span>
          </div>

          <div className="divide-y divide-primary/20">
            {rows.map((coin) => (
              <MarketsTableRow
                key={coin.id}
                coin={coin}
                isIRTenabled={isIRTenabled}
                USDT_IRT={USDT_IRT}
                tradeLabel={t("trade")}
                gridClass={gridClass}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
