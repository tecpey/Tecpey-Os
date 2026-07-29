"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { ArrowDownToLine } from "lucide-react";
import TokenDropdown from "./TokenDropdown";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { getCurrencies } from "@/services/swap.services";
import SwapSkeleton from "../skeletons/SwapSkeleton";
import { useInfiniteQuery } from "@tanstack/react-query";

export default function SwapPanel({ coins: initialCoins }: { coins: any[] }) {
  const t = useTranslations("MarketTabs");

  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");

  const [openSell, setOpenSell] = useState(false);
  const [openBuy, setOpenBuy] = useState(false);

  const [searchSell, setSearchSell] = useState("");
  const [searchBuy, setSearchBuy] = useState("");

  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");

  const params = useParams();

  const symbol = useMemo(() => {
    const value = params?.symbol;

    if (typeof value === "string") {
      return value.toUpperCase();
    }

    if (Array.isArray(value)) {
      return value[0]?.toUpperCase() || "";
    }

    return "";
  }, [params]);

  const sellRef = useRef<HTMLDivElement | null>(null);
  const buyRef = useRef<HTMLDivElement | null>(null);

  const [selectedSellCoin, setSelectedSellCoin] = useState<any>(null);
  const [selectedBuyCoin, setSelectedBuyCoin] = useState<any>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["currencies"],
      queryFn: ({ pageParam = 1 }) => getCurrencies(pageParam, 10),
      getNextPageParam: (lastPage, allPages) => {
        if (!lastPage?.data || lastPage.data.length < 10) return undefined;
        return allPages.length + 1;
      },
      initialPageParam: 1,
    });

  const coins = useMemo(() => {
    return (
      data?.pages
        ?.flatMap((page) => page.data)
        ?.map((coin: any) => ({
          symbol: coin.symbol.replace("_USDT", ""),
          name: coin.name || coin.fullName || "",
          icon: coin.icon || "/default-coin.svg",
          price: Number(coin.priceData?.last || 0),
        })) ||
      initialCoins ||
      []
    );
  }, [data, initialCoins]);

  const paymentCoins = useMemo(
    () => coins.filter((c) => c.symbol === "IRT" || c.symbol === "USDT"),
    [coins],
  );

  const tradeCoins = useMemo(
    () => coins.filter((c) => c.symbol !== "IRT" && c.symbol !== "USDT"),
    [coins],
  );

  const initializedRef = useRef(false);

  useEffect(() => {
    if (!coins.length) return;

    if (initializedRef.current) return;

    const paymentCoin =
      paymentCoins.find((c) => c.symbol === "IRT") ||
      paymentCoins.find((c) => c.symbol === "USDT") ||
      paymentCoins[0];

    const receiveCoin =
      tradeCoins.find((c) => c.symbol === symbol) || tradeCoins[0];

    setSelectedSellCoin(paymentCoin || null);
    setSelectedBuyCoin(receiveCoin || null);

    initializedRef.current = true;
  }, [coins, symbol, paymentCoins, tradeCoins]);

  useEffect(() => {
    if (!selectedSellCoin || !selectedBuyCoin) return;

    const amount = Number(sellAmount);

    if (!sellAmount || isNaN(amount) || amount <= 0) {
      setBuyAmount("");
      return;
    }

    const sellPrice = Number(selectedSellCoin.price);
    const buyPrice = Number(selectedBuyCoin.price);

    if (!sellPrice || !buyPrice) {
      setBuyAmount("");
      return;
    }

    const result = amount * (sellPrice / buyPrice);

    if (!isFinite(result)) {
      setBuyAmount("");
      return;
    }

    setBuyAmount(result.toFixed(6));
  }, [sellAmount, selectedSellCoin, selectedBuyCoin]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;

      if (sellRef.current && !sellRef.current.contains(target)) {
        setOpenSell(false);
      }

      if (buyRef.current && !buyRef.current.contains(target)) {
        setOpenBuy(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredSellCoins = useMemo(() => {
    const source = activeTab === "buy" ? paymentCoins : tradeCoins;

    return source.filter(
      (coin) =>
        coin.symbol.toLowerCase().includes(searchSell.toLowerCase()) ||
        coin.name.toLowerCase().includes(searchSell.toLowerCase()),
    );
  }, [activeTab, paymentCoins, tradeCoins, searchSell]);

  const filteredBuyCoins = useMemo(() => {
    const source = activeTab === "buy" ? tradeCoins : paymentCoins;

    return source.filter(
      (coin) =>
        coin.symbol.toLowerCase().includes(searchBuy.toLowerCase()) ||
        coin.name.toLowerCase().includes(searchBuy.toLowerCase()),
    );
  }, [activeTab, paymentCoins, tradeCoins, searchBuy]);

  return (
    <div>
      {/* BUY / SELL TOGGLE */}
      <div className="swap-toggle flex mb-2 sm:mb-6  sm:mt-20 gap-2">
        <button
          onClick={() => setActiveTab("sell")}
          className={`flex-1 py-2 sm:py-3 rounded-full font-semibold text-sm sm:text-base swap-tab 
      ${activeTab === "sell" ? "swap-tab-active-sell" : ""}`}
        >
          {t("sell")}
        </button>

        <button
          onClick={() => setActiveTab("buy")}
          className={`flex-1 py-2 sm:py-3 rounded-full font-semibold text-sm sm:text-base swap-tab 
      ${activeTab === "buy" ? "swap-tab-active-buy" : ""}`}
        >
          {t("buy")}
        </button>
      </div>

      <div className="flex flex-col">
        {activeTab === "buy" ? (
          <>
            {/* SELL CARD */}
            <div
              className="relative rounded-2xl sm:rounded-3xl  p-3 sm:p-6 mb-4 sm-mb-6 transition swap-primary"
              ref={sellRef}
            >
              <p className="text-sm text-black mb-2">{t("sell")}</p>

              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  placeholder="0"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(e.target.value)}
                  className="outline-none font-bold text-black text-lg sm:text-xl w-full bg-transparent"
                />

                <div className="relative shrink-0">
                  {selectedSellCoin ? (
                    <TokenDropdown
                      selectedCoin={selectedSellCoin}
                      open={openSell}
                      setOpen={setOpenSell}
                      setOtherOpen={setOpenBuy}
                      coins={filteredSellCoins}
                      search={searchSell}
                      setSearch={setSearchSell}
                      hoverClass="hover:bg-black/5"
                      setSelectedCoin={setSelectedSellCoin}
                      fetchNextPage={fetchNextPage}
                      hasNextPage={hasNextPage}
                      isFetchingNextPage={isFetchingNextPage}
                    />
                  ) : (
                    <SwapSkeleton />
                  )}
                </div>
              </div>
            </div>

            {/* ARROW */}
            <div className="flex justify-center -mt-8 sm:-mt-10 -mb-5 relative z-10">
              <div className="bg-blue-900 text-white w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl shadow-lg animate-bounce">
                <ArrowDownToLine size={18} />
              </div>
            </div>

            {/* BUY CARD */}
            <div
              className="relative rounded-2xl sm:rounded-3xl  p-3 sm:p-6 mb-4 sm-mb-6 transition swap-secondary"
              ref={buyRef}
            >
              <p className="text-sm text-white mb-2">{t("buy")}</p>

              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  placeholder="0"
                  value={buyAmount}
                  readOnly
                  className="outline-none font-bold text-lg text-black sm:text-xl w-full bg-transparent"
                />

                <div className="relative shrink-0">
                  {selectedBuyCoin ? (
                    <TokenDropdown
                      selectedCoin={selectedBuyCoin}
                      open={openBuy}
                      setOpen={setOpenBuy}
                      setOtherOpen={setOpenSell}
                      coins={filteredBuyCoins}
                      search={searchBuy}
                      setSearch={setSearchBuy}
                      hoverClass="hover:bg-white/10"
                      setSelectedCoin={setSelectedBuyCoin}
                      fetchNextPage={fetchNextPage}
                      hasNextPage={hasNextPage}
                      isFetchingNextPage={isFetchingNextPage}
                    />
                  ) : (
                    <SwapSkeleton />
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/*  REVERSED ORDER FOR SELL MODE */}

            {/* BUY CARD */}
            <div
              className="relative rounded-3xl p-4 sm:p-6 mb-6 transition swap-secondary"
              ref={buyRef}
            >
              <p className="text-sm text-white mb-2">{t("buy")}</p>

              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  placeholder="0"
                  value={buyAmount}
                  readOnly
                  className="outline-none font-bold text-lg text-black sm:text-xl w-full bg-transparent"
                />

                <div className="relative shrink-0">
                  {selectedBuyCoin ? (
                    <TokenDropdown
                      selectedCoin={selectedBuyCoin}
                      open={openBuy}
                      setOpen={setOpenBuy}
                      setOtherOpen={setOpenSell}
                      coins={filteredBuyCoins}
                      search={searchBuy}
                      setSearch={setSearchBuy}
                      hoverClass="hover:bg-white/10"
                      setSelectedCoin={setSelectedBuyCoin}
                      fetchNextPage={fetchNextPage}
                      hasNextPage={hasNextPage}
                      isFetchingNextPage={isFetchingNextPage}
                    />
                  ) : (
                    <SwapSkeleton />
                  )}
                </div>
              </div>
            </div>

            {/* ARROW */}
            <div className="flex justify-center -mt-8 sm:-mt-10 -mb-5 relative z-10">
              <div className="bg-blue-900 text-white w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl shadow-lg animate-bounce">
                <ArrowDownToLine size={18} />
              </div>
            </div>

            {/* SELL CARD */}
            <div
              className="relative rounded-3xl p-4 sm:p-6 mb-6 transition swap-primary"
              ref={sellRef}
            >
              <p className="text-sm text-black mb-2">{t("sell")}</p>

              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  placeholder="0"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(e.target.value)}
                  className="outline-none font-bold text-black text-lg sm:text-xl w-full bg-transparent"
                />

                <div className="relative shrink-0">
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
                      hoverClass="hover:bg-black/5"
                      fetchNextPage={fetchNextPage}
                      hasNextPage={hasNextPage}
                      isFetchingNextPage={isFetchingNextPage}
                    />
                  ) : (
                    <SwapSkeleton />
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* BUTTON */}
      <button
        className={`w-full py-3 sm:py-4 rounded-2xl text-base sm:text-lg font-semibold transition
      ${
        activeTab === "buy"
          ? "bg-green-600 text-white hover:opacity-90"
          : "bg-red-600 text-white hover:opacity-90"
      }`}
      >
        {activeTab === "buy" ? t("buy") : t("sell")}
      </button>
    </div>
  );
}
