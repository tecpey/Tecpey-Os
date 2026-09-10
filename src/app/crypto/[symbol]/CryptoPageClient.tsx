"use client";

import SwapPanel from "@/components/crypto/SwapPanel";
import MarketTabs, { type MarketTab, type MarketTabId } from "@/components/crypto/MarketTabs";
import MarketStats from "@/components/crypto/MarketStats";
import AboutCoin from "@/components/crypto/AboutCoin";
import OtherCoins from "@/components/crypto/OtherCoins";
import { CoinVisual } from "@/components/tecpey/CoinVisual";
import { getCoinVisualAsset } from "@/lib/coin-visual-assets";
import { normalizeMarketSymbol } from "@/lib/public-market-data";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import TradingViewChart from "@/components/TradingViewChart";
import { useBaseCurrenciesPrice } from "@/hooks/useBaseCurrenciesPrice";
import type { MarketCurrency } from "@/types/market";

export default function CryptoPageClient({
  symbol,
  initialCoin,
}: {
  symbol: string;
  initialCoin: MarketCurrency | undefined;
}) {
  const pairs = [`${symbol}USDT`];
  const { currencies } = useBaseCurrenciesPrice(pairs);

  const liveCoin = currencies?.find(
    (coin) => normalizeMarketSymbol(coin.symbol) === symbol,
  ) ?? initialCoin;

  const currentVisual = getCoinVisualAsset({
    symbol,
    name: liveCoin?.name || symbol,
    faName: liveCoin?.faName,
    remoteIcon: liveCoin?.icon,
  });

  const currentCoin = {
    symbol,
    name: liveCoin?.name || symbol,
    icon: currentVisual.src,
    description: "",
  };

  const t = useTranslations("MarketTabs");
  const tabs: readonly MarketTab[] = [
    { id: "market-chart", label: t("marketChart") },
    { id: "market-data", label: t("marketData") },
    { id: "price-information", label: t("priceInformation") },
    { id: "about-coin", label: t("aboutCoin") },
    { id: "other-coins", label: t("otherCoins") },
  ];

  const [active, setActive] = useState<MarketTabId>("market-chart");

  const chartRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<HTMLDivElement>(null);
  const forecastRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const otherCoinsRef = useRef<HTMLDivElement>(null);

  const handleTabClick = (tab: MarketTabId) => {
    setActive(tab);

    const map: Record<MarketTabId, React.RefObject<HTMLDivElement | null>> = {
      "market-chart": chartRef,
      "market-data": dataRef,
      "price-information": forecastRef,
      "about-coin": historyRef,
      "other-coins": otherCoinsRef,
    };

    map[tab].current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <section className="max-w-7xl mx-auto px-6 py-6 mt-20">
      <MarketTabs tabs={tabs} active={active} onSelect={handleTabClick} />

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
        <div ref={chartRef} className="scroll-mt-24">
          <div className="flex items-center gap-4 mb-4">
            <CoinVisual symbol={symbol} name={currentCoin.name} remoteIcon={liveCoin?.icon} variant="avatar" priority />

            <div>
              <h1 className="text-2xl font-bold">{symbol}/USDT</h1>
              <p className="text-muted text-sm">{currentCoin.name}</p>
            </div>
          </div>

          <div className="rounded-xl shadow-lg h-[600px] ">
            <TradingViewChart symbol={symbol} />
          </div>
        </div>

        <div className="mt-30">
          <SwapPanel coins={currencies || []} />
        </div>
      </div>

      <div
        ref={dataRef}
        className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 mt-10 scroll-mt-24"
      >
        <div className="space-y-6">
          <MarketStats
            ref={forecastRef}
            coin={{
              rank: liveCoin?.rank,
              symbol,
              name: currentCoin.name,
              icon: currentCoin.icon,
              priceData: liveCoin?.priceData,
              marketCap: liveCoin?.marketCap,
              circulatingSupply: liveCoin?.circulatingSupply,
              totalSupply: liveCoin?.totalSupply,
              maxSupply: liveCoin?.maxSupply,
              fdv: liveCoin?.fdv,
            }}
          />

          <AboutCoin ref={historyRef} symbol={symbol} coin={liveCoin} />
        </div>

        <div>
          <OtherCoins ref={otherCoinsRef} />
        </div>
      </div>
    </section>
  );
}
