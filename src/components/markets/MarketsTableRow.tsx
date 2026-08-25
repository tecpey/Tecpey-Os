"use client";

import { useRouter } from "next/navigation";
import Chart from "@/components/charts/chart";
import { CryptoAssetIcon } from "@/components/crypto/CryptoAssetIcon";
import { handleDecimal } from "@/utils/handleDecimal";
import type { MarketCurrency } from "@/types/market";

type Props = {
  coin: MarketCurrency;
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

  const rawChange = coin.priceData?.changePercent;
  const change = rawChange === null || rawChange === undefined ? null : Number(rawChange);
  const hasChange = change !== null && Number.isFinite(change);
  const isUp = hasChange && change >= 0;
  const rawPrice = coin.priceData?.last;
  const hasPrice = rawPrice !== null && rawPrice !== undefined && Number.isFinite(Number(rawPrice));
  const rawVolume = coin.priceData?.volume;
  const hasVolume = rawVolume !== null && rawVolume !== undefined && Number.isFinite(Number(rawVolume));

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
        <CryptoAssetIcon symbol={coin.symbol || ""} name={coin.name} size="sm" />
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
        {hasPrice ? handleDecimal(rawPrice) : "—"}
      </p>

      {/* price irt */}
      {isIRTenabled && (
        <p className="text-[10px] sm:text-[12px] font-semibold text-fg/80 whitespace-nowrap">
          {irtPrice ? Math.floor(irtPrice).toLocaleString() : "-"}
        </p>
      )}

      {/* volume */}
      <p className="text-[10px] sm:text-[11px] font-medium text-muted whitespace-nowrap">
        {hasVolume ? Number(rawVolume).toFixed(2) : "—"}{" "}
      </p>

      {/* change */}
      <p
        className={`text-[10px] sm:text-[11px] font-bold whitespace-nowrap ${
          !hasChange ? "text-muted" : isUp ? "text-green-600" : "text-red-600"
        }`}
      >
        {hasChange ? `${isUp ? "+" : ""}${change.toFixed(2)}%` : "—"}
      </p>

      {/* chart */}
      <div className="h-[28px] w-[54px] sm:h-[32px] sm:w-[76px] lg:w-[92px]">
        {hasChange ? <Chart symbol={coin.priceData?.symbol ?? coin.symbol ?? ""} change={change} height={28} /> : <span className="text-muted">—</span>}
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
