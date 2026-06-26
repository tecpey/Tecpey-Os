"use client";

import Navbar, { User } from "@/components/navbar/Navbar";
import Image from "next/image";
import SwapPanel from "@/components/crypto/SwapPanel";
import MarketTabs from "@/components/crypto/MarketTabs";
import MarketStats from "@/components/crypto/MarketStats";
import AboutCoin from "@/components/crypto/AboutCoin";
import OtherCoins from "@/components/crypto/OtherCoins";
import { useState, useRef} from "react";
import { useTranslations } from "next-intl";
import TradingViewChart from "@/components/TradingViewChart";
import { useParams } from "next/navigation";
import { useBaseCurrenciesPrice } from "@/hooks/useBaseCurrenciesPrice";

export default function CryptoPage() {
  const params = useParams();

  const rawSymbol = params?.symbol;
  const symbol = (typeof rawSymbol === 'string' ? rawSymbol : 'BTC').toLocaleUpperCase()

  const pairs = [`${symbol}USDT`];

  const { currencies } = useBaseCurrenciesPrice(pairs);

  const liveCoin = currencies?.find((c) => c.symbol === symbol);

  const currentCoin = {
    symbol,
    name: liveCoin?.name || symbol,
    icon: liveCoin?.icon || "/default-coin.svg",
    description: "",
  };

  const t = useTranslations("MarketTabs");

  const tabs = [
    t("marketChart"),
    t("marketData"),
    t("priceInformation"),
    t("aboutCoin"),
    t("otherCoins"),
  ];

  const [active, setActive] = useState("Market Chart");

  const chartRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<HTMLDivElement>(null);
  const forecastRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const otherCoinsRef = useRef<HTMLDivElement>(null);



  const handleTabClick = (tab: string) => {
    setActive(tab);

    const map: Record<string, React.RefObject<HTMLDivElement | null>> = {
      "Market Chart": chartRef,
      "Market Data": dataRef,
      "Price Information": forecastRef,
      "About Coin": historyRef,
      "Other Coins": otherCoinsRef,
    };

    map[tab]?.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <>

      <section className="max-w-7xl mx-auto px-6 py-6 mt-20">
        <MarketTabs tabs={tabs} active={active} setActive={handleTabClick} />

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
          <div ref={chartRef} className="scroll-mt-24">
            <div className="flex items-center gap-4 mb-4">
              <Image
                src={currentCoin.icon}
                alt={symbol}
                width={40}
                height={40}
                unoptimized
              />

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
                symbol: symbol,
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
    </>
  );
}
