import { useSocketioMarketPriceSpot } from "./useLiveTicker";
import { getCurrencies } from "@/services/swap.services";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { MarketCurrency } from "@/types/market";

import { useEffect, useMemo, useRef, useState } from "react";
import { isFreshBitycleAuthorityTimestamp } from "@/lib/public-market-data";

export const useBaseCurrenciesPrice = (_pair: string[]) => {

  const usdtIrtAuthority = useQuery({
    queryKey: ["usdt-irt-authority"],
    queryFn: async () => {
      const response = await fetch("/api/markets?source=iran", { cache: "no-store" });
      if (!response.ok) return null;
      const payload = await response.json() as { authority?: { price?: unknown; updatedAt?: unknown; source?: unknown } | null };
      const authority = payload.authority;
      const price = Number(authority?.price);
      const updatedAt = typeof authority?.updatedAt === "string" ? authority.updatedAt : "";
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(Date.parse(updatedAt))) return null;
      return { price, updatedAt, source: typeof authority?.source === "string" ? authority.source : "unknown" };
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const USDT_IRT = usdtIrtAuthority.data && isFreshBitycleAuthorityTimestamp(usdtIrtAuthority.data.updatedAt)
    ? usdtIrtAuthority.data.price
    : 0;


  const [searchQuery, setSearchQuery] = useState("");

  const [currencyList, setCurrencyList] = useState<MarketCurrency[]>([]);

  const initializedRef = useRef(false);

  const query = useInfiniteQuery({
    queryKey: ["currencies", searchQuery],

    queryFn: ({ pageParam = 1 }) => getCurrencies(pageParam, 20, searchQuery),

    getNextPageParam: (lastPage) => {
      const { current_page, last_page } = lastPage.meta;

      return current_page < last_page ? current_page + 1 : undefined;
    },

    initialPageParam: 1,
  });

  const allCurrencies = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  );

  const pairs = useMemo(() =>{
    return allCurrencies.map(
      (item) => item.priceData?.symbol ?? ""
    )
  },[allCurrencies])

    const livePrice = useSocketioMarketPriceSpot(pairs);

  useEffect(() => {
    if (!allCurrencies.length) return;

    setCurrencyList((prev) => {
      if (!initializedRef.current) {
        initializedRef.current = true;

        return allCurrencies;
      }

      return allCurrencies.map((apiCurrency) => {
        const existing = prev.find(
          (item) => item.priceData?.symbol === apiCurrency.priceData?.symbol,
        );

        return existing ?? apiCurrency;
      });
    });
  }, [allCurrencies]);

  useEffect(() => {
    if (!livePrice?.symbol) return;

    setCurrencyList((prev) => {
      const index = prev.findIndex(
        (item) => item.priceData?.symbol === livePrice.symbol,
      );

      if (index === -1) return prev;

      const updated = [...prev];

      updated[index] = {
        ...updated[index],
        priceData: {
          ...updated[index].priceData,
          ...livePrice,
        },
        volume: livePrice.volume,
      };

      return updated;
    });
  }, [livePrice]);

  return {
    currencies: currencyList,
    isLoading: query.isLoading,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    setSearchQuery,
    USDT_IRT
  };
};
