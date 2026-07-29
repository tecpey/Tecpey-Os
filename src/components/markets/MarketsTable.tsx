"use client";

import React, { useMemo } from "react";
import MarketsTableRow from "./MarketsTableRow";
import PriceTableSkeleton from "../skeletons/PriceTableSkeletone";

type Props = {
  t: any;
  rows: any[];
  isIRTenabled: boolean;
  USDT_IRT?: number | string | null;
  itemsPerPage: number;
};

export default function MarketsTable({
  t,
  rows,
  isIRTenabled,
  USDT_IRT,
}: Props) {
  const gridClass = useMemo(() => {
    return isIRTenabled
      ? "grid-cols-[1.25fr_.82fr_.9fr_.72fr_.58fr_.72fr_.78fr]"
      : "grid-cols-[1.25fr_.9fr_.78fr_.62fr_.76fr_.78fr]";
  }, [isIRTenabled]);




  

    if (!rows || rows.length ===0) {
    return <PriceTableSkeleton rows={8} hasIRT={isIRTenabled} />;
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
