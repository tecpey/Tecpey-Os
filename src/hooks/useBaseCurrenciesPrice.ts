import { useSocketioMarketPriceSpot } from "./useLiveTicker";
import { getCurrencies } from "@/services/swap.services";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { MarketCurrency } from "@/types/market";

import { useEffect, useMemo, useRef, useState } from "react";

export const useBaseCurrenciesPrice = (_pair: string[]) => {

  const usdtIrtAuthority = useQuery({\n    queryKey: ["usdt-irt-authority"],\n    queryFn: async () => {\n      const response = await fetch("/api/markets?source=iran", { cache: "no-store" });\n      if (!response.ok) return null;\n      const payload = await response.json() as { authority?: { price?: unknown; updatedAt?: unknown; source?: unknown } | null };\n      const authority = payload.authority;\n      const price = Number(authority?.price);\n      const updatedAt = typeof authority?.updatedAt === "string" ? authority.updatedAt : "";\n      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(Date.parse(updatedAt))) return null;\n      return { price, updatedAt, source: typeof authority?.source === "string" ? authority.source : "unknown" };\n    },\n    staleTime: 30_000,\n    refetchInterval: 30_000,\n    refetchOnWindowFocus: true,\n  });\n\n  const USDT_IRT = usdtIrtAuthority.data?.price ?? 0;


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
