"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import Chart from "@/components/charts/chart";
import { handleDecimal } from "@/utils/handleDecimal";

type Props = {
  coin: any;
  isIRTenabled: boolean;
  USDT_IRT?: number | string | null;
  tradeLabel: string;
  gridClass: string;
};

export default function MarketsTableRow({
  coin,
  isIRTenabled,
  USDT_IRT,
  tradeLabel,
  gridClass,
}: Props) {
  const router = useRouter();

  const change = Number(coin.priceData?.changePercent || 0);
  const isUp = change >= 0;

  const irtPrice =
    USDT_IRT && coin.priceData?.last
      ? Number(coin.priceData.last) * Number(USDT_IRT)
      : null;

  const href = `/crypto/${(coin.symbol ?? "").toLowerCase()}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          router.push(href);
        }
      }}
      className={`
        grid ${gridClass}
        items-center
        gap-1
        px-2 sm:px-4
        h-[58px] sm:h-[62px]
        cursor-pointer
        transition-colors
        hover:bg-white/5
      `}
    >
      {/* coin */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <Image
          src={coin.icon || "/default-coin.svg"}
          alt={coin.symbol || "coin"}
          width={28}
          height={28}
          className="h-7 w-7 rounded-full shrink-0 border border-primary/20 sm:h-8 sm:w-8"
          unoptimized
        />
        <div className="min-w-0">
          <p className="truncate text-[11px] sm:text-[13px] font-bold text-fg/80">
            {coin.symbol}
          </p>
          <p className="truncate text-[10px] sm:text-[11px] font-medium text-muted">
            {coin.name}
          </p>
        </div>
      </div>

      {/* price usdt */}
      <p className="text-[10px] sm:text-[12px] font-semibold text-fg/80 whitespace-nowrap">
        {handleDecimal(coin.priceData?.last ?? 0)}
      </p>

      {/* price irt */}
      {isIRTenabled && (
        <p className="text-[10px] sm:text-[12px] font-semibold text-fg/80 whitespace-nowrap">
          {irtPrice ? Math.floor(irtPrice).toLocaleString() : "-"}
        </p>
      )}

      {/* volume */}
      <p className="text-[10px] sm:text-[11px] font-medium text-muted whitespace-nowrap">
        {coin.priceData?.volume
          ? Number(coin.priceData.volume).toFixed(2)
          : "0.00"}{" "}
      </p>

      {/* change */}
      <p
        className={`text-[10px] sm:text-[11px] font-bold whitespace-nowrap ${
          isUp ? "text-green-600" : "text-red-600"
        }`}
      >
        {isUp ? "+" : ""}
        {change.toFixed(2)}%
      </p>

      {/* chart */}
      <div className="h-[28px] w-[54px] sm:h-[32px] sm:w-[76px] lg:w-[92px]">
        <Chart symbol={coin.priceData?.symbol} change={change} height={28} />
      </div>

      {/* action */}
      <div className="flex justify-end">
        <a
          href={"https://my.tecpey.ir/signin"}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-[30px] min-w-[58px] items-center justify-center rounded-full bg-primary px-2 text-[10px] font-bold text-white transition-shadow hover:shadow-lg sm:h-[32px] sm:min-w-[76px] sm:px-3 sm:text-[11px]"
        >
          {tradeLabel}
        </a>
      </div>
    </div>
  );
}
