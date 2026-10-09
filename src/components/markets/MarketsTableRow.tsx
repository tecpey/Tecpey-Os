"use client";

import Link from "next/link";
import { publicMarketQuoteCurrency } from "@/lib/public-market-data";
import Chart from "@/components/charts/chart";
import { CryptoAssetIcon } from "@/components/crypto/CryptoAssetIcon";
import { getCoinVisualAsset } from "@/lib/coin-visual-assets";
import { handleDecimal } from "@/utils/handleDecimal";
import type { MarketCurrency } from "@/types/market";

type Props = {
  coin: MarketCurrency;
  isIRTenabled: boolean;
  USDT_IRT?: number | string | null;
  detailsLabel: string;
  priceLabel: string;
  priceIrtLabel: string;
  volumeLabel: string;
  changeLabel: string;
  unavailableLabel: string;
  gridClass: string;
  isFresh: boolean;
};

export default function MarketsTableRow({
  coin,
  isIRTenabled,
  USDT_IRT,
  detailsLabel,
  priceLabel,
  priceIrtLabel,
  volumeLabel,
  changeLabel,
  unavailableLabel,
  gridClass,
  isFresh,
}: Props) {
  const quote = publicMarketQuoteCurrency(coin.marketDataSource);
  const rawChange = coin.priceData?.changePercent;
  const change = rawChange === null || rawChange === undefined ? null : Number(rawChange);
  const hasChange = isFresh && change !== null && Number.isFinite(change);
  const isUp = hasChange && change >= 0;
  const rawPrice = coin.priceData?.last;
  const hasPrice = isFresh && quote !== null && rawPrice !== null && rawPrice !== undefined && Number.isFinite(Number(rawPrice));
  const rawVolume = coin.priceData?.volume;
  const hasVolume = isFresh && rawVolume !== null && rawVolume !== undefined && Number.isFinite(Number(rawVolume));

  const irtPrice =
    isFresh && quote === "USDT" && USDT_IRT && coin.priceData?.last
      ? Number(coin.priceData.last) * Number(USDT_IRT)
      : null;

  const href = `/crypto/${(coin.symbol ?? "").toLowerCase()}`;
  const visual = getCoinVisualAsset({ symbol: coin.symbol, name: coin.name, remoteIcon: typeof coin.icon === "string" ? coin.icon : undefined });
  const priceText = hasPrice ? `${handleDecimal(rawPrice)} ${quote}` : "—";
  const irtText = irtPrice ? Math.floor(irtPrice).toLocaleString() : "—";
  const volumeText = hasVolume ? Number(rawVolume).toFixed(2) : "—";
  const changeText = hasChange ? `${isUp ? "+" : ""}${change.toFixed(2)}%` : "—";
  const changeClass = !hasChange ? "text-muted" : isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

  return (
    <Link
      href={href}
      data-market-asset={coin.symbol}
      data-price-current={isFresh}
      className={`
        group block ${gridClass}
        min-w-0 px-4 py-4
        transition-[background-color,box-shadow] duration-150
        hover:bg-cyan-50/70 dark:hover:bg-cyan-950/25
        focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2
        focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-700
        dark:focus-visible:outline-cyan-300
        lg:grid lg:h-[62px] lg:items-center lg:gap-2 lg:px-5 lg:py-0
      `}
    >
      <div className="lg:hidden">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <CryptoAssetIcon symbol={coin.symbol || ""} name={coin.name} size="sm" assetSrc={visual.src} assetSource={visual.source} />
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-fg/90">{coin.symbol}</p>
              <p className="mt-0.5 truncate text-xs font-medium text-muted">{coin.name}</p>
            </div>
          </div>
          <div className="min-w-0 shrink-0 text-end">
            <span className="block text-[10px] font-semibold leading-5 text-muted">{priceLabel}</span>
            <span aria-label={hasPrice ? undefined : unavailableLabel} className="block whitespace-nowrap text-sm font-black text-fg/90">
              {priceText}
            </span>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-cyan-300/15 bg-white/45 p-3 dark:bg-white/[0.025]">
          {isIRTenabled && (
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold leading-5 text-muted">{priceIrtLabel}</dt>
              <dd className="mt-0.5 truncate text-xs font-bold text-fg/80">{irtText}</dd>
            </div>
          )}
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold leading-5 text-muted">{changeLabel}</dt>
            <dd className={`mt-0.5 truncate text-xs font-black ${changeClass}`}>{changeText}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold leading-5 text-muted">{volumeLabel}</dt>
            <dd className="mt-0.5 truncate text-xs font-bold text-fg/80">{volumeText}</dd>
          </div>
        </dl>

        <div className="mt-3 flex min-h-11 items-center justify-end">
          <span className="inline-flex min-h-11 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-500/10 px-4 text-xs font-black text-cyan-800 transition-colors group-hover:bg-cyan-500/15 dark:text-cyan-200">
            {detailsLabel}
          </span>
        </div>
      </div>

      <div className="hidden lg:contents">
        <div className="flex min-w-0 items-center gap-2">
          <CryptoAssetIcon symbol={coin.symbol || ""} name={coin.name} size="sm" assetSrc={visual.src} assetSource={visual.source} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-fg/80">{coin.symbol}</p>
            <p className="truncate text-[11px] font-medium text-muted">{coin.name}</p>
          </div>
        </div>

        <p aria-label={hasPrice ? undefined : unavailableLabel} className="whitespace-nowrap text-[12px] font-semibold text-fg/80">
          {priceText}
        </p>

        {isIRTenabled && (
          <p className="whitespace-nowrap text-[12px] font-semibold text-fg/80">{irtText}</p>
        )}

        <p className="whitespace-nowrap text-[11px] font-medium text-muted">{volumeText}</p>

        <p className={`whitespace-nowrap text-[11px] font-bold ${changeClass}`}>{changeText}</p>

        <div className="h-[32px] w-[76px] lg:w-[92px]">
          {hasChange ? <Chart symbol={coin.priceData?.symbol ?? coin.symbol ?? ""} change={change} height={28} /> : <span className="text-muted">—</span>}
        </div>

        <div className="flex justify-end">
          <span className="inline-flex min-h-11 min-w-[76px] items-center justify-center rounded-full bg-primary px-3 text-[11px] font-bold text-white transition-shadow group-hover:shadow-lg">
            {detailsLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}
