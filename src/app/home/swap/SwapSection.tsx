"use client";

import { useTranslations } from "next-intl";
import { ArrowDownToLine } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import TokenDropdown from "@/components/crypto/TokenDropdown";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getCurrencies } from "@/services/swap.services";
import SwapSkeleton from "@/components/skeletons/SwapSkeleton";

export default function SwapSection() {
  const t = useTranslations("Swap");

  const sellRef = useRef<HTMLDivElement | null>(null);
  const buyRef = useRef<HTMLDivElement | null>(null);

  const [openSell, setOpenSell] = useState(false);
  const [openBuy, setOpenBuy] = useState(false);
  const [searchSell, setSearchSell] = useState("");
  const [searchBuy, setSearchBuy] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");

  const [selectedSellCoin, setSelectedSellCoin] = useState<any>(null);
  const [selectedBuyCoin, setSelectedBuyCoin] = useState<any>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["currencies"],
      queryFn: ({ pageParam = 1 }) => getCurrencies(pageParam, 10),
      getNextPageParam: (lastPage, allPages) => {
        if (!lastPage?.data || lastPage.data.length < 6) return undefined;
        return allPages.length + 1;
      },
      initialPageParam: 1,
    });

  const coins = useMemo(() => {
    return (
      data?.pages
        .flatMap((page) => page.data)
        .map((coin: any) => ({
          symbol: coin.symbol.replace("_USDT", ""),
          name: coin.name || coin.fullName || "",
          icon: coin.icon || "/default-coin.svg",
          price: Number(coin.priceData?.last || 0),
        })) || []
    );
  }, [data]);

  const sellCoin = coins.find((c) => c.symbol === selectedSellCoin?.symbol);
  const buyCoin = coins.find((c) => c.symbol === selectedBuyCoin?.symbol);

 useEffect(() => {
  if (!sellCoin || !buyCoin) return;

  const rawSell = sellAmount.replace(/,/g, "");
  const amount = parseFloat(rawSell);

  if (!rawSell || isNaN(amount) || amount <= 0) {
    setBuyAmount("");
    return;
  }

  if (buyCoin.price > 0) {
    const result = (amount * sellCoin.price) / buyCoin.price;
    setBuyAmount(formatAmount(result, buyCoin.symbol));
  }
}, [sellAmount, sellCoin, buyCoin]);


  useEffect(() => {
    if (coins.length > 0) {
      setSelectedSellCoin((prev: any) => prev ?? coins[0]);
      setSelectedBuyCoin((prev: any) => prev ?? (coins[1] || coins[0]));
    }
  }, [coins]);

  const filteredSellCoins = useMemo(() => {
    return coins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(searchSell.toLowerCase()) ||
        c.name.toLowerCase().includes(searchSell.toLowerCase()),
    );
  }, [coins, searchSell]);

  const filteredBuyCoins = useMemo(() => {
    return coins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(searchBuy.toLowerCase()) ||
        c.name.toLowerCase().includes(searchBuy.toLowerCase()),
    );
  }, [coins, searchBuy]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sellRef.current && !sellRef.current.contains(e.target as Node)) {
        setOpenSell(false);
      }
      if (buyRef.current && !buyRef.current.contains(e.target as Node)) {
        setOpenBuy(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);





  const formatAmount = (value: number, symbol?: string) => {
  if (!Number.isFinite(value)) return "";
  const isIRT = symbol?.toUpperCase() === "IRT";
  if (isIRT) {
    return Math.round(value).toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
};


  return (
    <section className="py-16 bg-bg text-fg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex-col lg:flex-row flex items-center gap-16 ">
        <div className="flex flex-col text-center items-center lg:text-left">
          <h2 className="text-4xl lg:text-5xl font-extrabold mb-4">
            {t("title")}
          </h2>
          <p className="text-lg text-muted mb-8 max-w-md mx-auto lg:mx-0">
            {t("subtitle")}
          </p>
          <a href="/swap">
            <button className="bg-primary text-white px-10 py-4 rounded-2xl font-bold hover:bg-blue-700 transition">
              {t("button")}
            </button>
          </a>
        </div>

        <div className="flex-1 w-full max-w-[460px] relative mx-auto min-w-0">
          {/* SELL CARD */}
          <div className="relative rounded-3xl p-6 mb-6 swap-primary border border-white/10">
            <p className="text-sm text-black/40 mb-2">{t("sell")}</p>
            <div className="flex justify-between items-center gap-3">
              <input
                type="text"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder="0"
                className="bg-transparent placeholder:text-black/50 outline-none font-bold text-2xl w-full text-black"
              />
              <div ref={sellRef} className="relative shrink-0">
                {selectedSellCoin ? (
                  <TokenDropdown
                    selectedCoin={selectedSellCoin}
                    open={openSell}
                    setOpen={setOpenSell}
                    setOtherOpen={setOpenBuy}
                    coins={filteredSellCoins}
                    search={searchSell}
                    setSearch={setSearchSell}
                    setSelectedCoin={setSelectedSellCoin}
                    hoverClass="hover:bg-gray-100"
                    fetchNextPage={fetchNextPage}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                  />
                ) : (
                  <SwapSkeleton/>
                )}
              </div>
            </div>
            <p className="text-sm text-black/40 mt-1"></p>
          </div>

          {/* ARROW */}
          <div className="flex justify-center -mt-10 -mb-5 relative z-10 animate-bounce">
            <div className="bg-blue-900 text-white w-12 h-12 flex items-center justify-center rounded-xl shadow-lg">
              <ArrowDownToLine size={20} />
            </div>
          </div>

          {/* BUY CARD */}
          <div className="relative rounded-3xl p-6 mb-6 swap-secondary  border border-white/10">
            <p className="text-sm text-gray-300 mb-2">{t("buy")}</p>
            <div className="flex justify-between items-center gap-3">
              <input
                type="text"
                value={buyAmount}
                readOnly
                placeholder="0"
                className="bg-transparent placeholder:text-black/50 outline-none font-bold text-2xl w-full text-black"
              />
              <div ref={buyRef} className="relative shrink-0">
                {selectedBuyCoin ? (
                  <TokenDropdown
                    selectedCoin={selectedBuyCoin}
                    open={openBuy}
                    setOpen={setOpenBuy}
                    setOtherOpen={setOpenSell}
                    coins={filteredBuyCoins}
                    search={searchBuy}
                    setSearch={setSearchBuy}
                    setSelectedCoin={setSelectedBuyCoin}
                    hoverClass="hover:bg-gray-100"
                    fetchNextPage={fetchNextPage}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                  />
                ) : (
                  <SwapSkeleton/>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-300 mt-1"></p>
          </div>
        </div>
      </div>
    </section>
  );
}
