"use client";

import React, { useEffect, useMemo, useState } from "react";
import useScrollReveal from "@/hooks/useScrollReveal";
import { useTranslations } from "next-intl";
import { useBaseCurrenciesPrice } from "@/hooks/useBaseCurrenciesPrice";
import MarketsHero from "../../components/markets/MarketsHero";
import MarketsSearchBar from "../../components/markets/MarketsSearchBar";
import MarketsFilters from "../../components/markets/MarketsFilters";
import MarketsTable from "../../components/markets/MarketsTable";

import { useQuery } from "@tanstack/react-query";
import { getCurrencies } from "@/services/swap.services";
import {

  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

const getPageNumbers = (current: number, total: number) => {
  const pages: (number | string)[] = [];
  const showMax = 5;

  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 2) pages.push("...");

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (current < total - 2) pages.push("...");
    pages.push(total);
  }
  return pages;
};

function useDebouncedValue<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function MarketsPage() {
  const t = useTranslations("Markets");
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });

  const initialPairs = [
    "BTCUSDT",
    "ETHUSDT",
    "USDTUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "ADAUSDT",
  ];

  const {
    currencies: baseCurrencies,
    isLoading: baseLoading,
    USDT_IRT,
  } = useBaseCurrenciesPrice(initialPairs);

  const isIRTenabled = Boolean(USDT_IRT);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const [sortBy, setSortBy] = useState<"volume" | "change">("volume");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const LIMIT = 10;
  const [currentPage, setCurrentPage] = useState(1);

  const debouncedQuery = useDebouncedValue(query, 400);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedQuery]);

  const { data, isPending, isFetching } = useQuery({
    queryKey: ["market-currencies", currentPage, LIMIT, debouncedQuery, filter],
    queryFn: () => getCurrencies(currentPage, LIMIT, debouncedQuery),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    placeholderData: (previousData) => previousData,
  });

  const pageCurrencies = useMemo(() => {
    return data?.data ?? [];
  }, [data]);

  const processedCurrencies = useMemo(() => {
    let list = pageCurrencies.filter(
      (coin: any) => !["IRT", "USD"].includes(coin.symbol),
    );

    const q = debouncedQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((c: any) => {
        const symbol = String(c?.symbol ?? "").toLowerCase();
        const name = String(c?.name ?? "").toLowerCase();
        const priceSymbol = String(c?.priceData?.symbol ?? "").toLowerCase();

        return (
          symbol.includes(q) || name.includes(q) || priceSymbol.includes(q)
        );
      });
    }

    const getChange = (c: any) => Number(c?.priceData?.changePercent ?? 0);
    const getVolume = (c: any) => Number(c?.priceData?.volume ?? 0);
    const getRank = (c: any) => Number(c?.priceData?.rank ?? 0);

    list = [...list].sort((a: any, b: any) => {
      if (filter === "all") {
        return getRank(a);
      }
      if (filter === "ascending") {
        return getChange(b) - getChange(a);
      }

      if (filter === "descending") {
        return getChange(a) - getChange(b);
      }

      if (filter === "high_volume") {
        return getVolume(b) - getVolume(a);
      }

      return getVolume(b) - getVolume(a);
    });

    return list;
  }, [pageCurrencies, debouncedQuery, filter, sortBy, sortDir]);

  const totalPages = Math.max(1, Number(data?.meta?.last_page ?? 1));

  const pageNumbers = useMemo(
    () => getPageNumbers(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const goToPrevPage = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(p + 1, totalPages));
  const goToPage = (page: number) => setCurrentPage(page);


 return (
    <main className="bg-bg">
      <MarketsHero t={t} />

      <section className="py-12 px-4 md:px-8 max-w-7xl mx-auto">
        <MarketsSearchBar t={t} query={query} onQueryChange={setQuery} />
        {/* <MarketsFilters
          t={t}
          activeFilter={filter}
          onFilterChange={setFilter}
        /> */}

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="w-full">
            <div className="relative mt-12">
              <MarketsTable
                t={t}
                rows={processedCurrencies}
                isIRTenabled={isIRTenabled}
                USDT_IRT={USDT_IRT}
                itemsPerPage={LIMIT}
              />

              {isFetching && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-[1px]"></div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center mt-6 overflow-x-auto">
                <div className="flex items-center gap-2 sm:gap-4 min-w-max">
                  <button
                    onClick={goToPrevPage}
                    disabled={currentPage === 1 || isFetching}
                    className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg text-white ${
                      currentPage === 1 || isFetching
                        ? "bg-gray-500 cursor-not-allowed"
                        : "bg-primary hover:bg-blue-700"
                    }`}
                  >
                    <ChevronsLeft className="size-4 rtl-flip" />
                  </button>

                  <div className="flex items-center gap-1 sm:gap-2">
                    {pageNumbers.map((p, idx) =>
                      p === "..." ? (
                        <span
                          key={`dots-${idx}`}
                          className="px-1 sm:px-2 text-gray-500"
                        >
                          ...
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => typeof p === "number" && goToPage(p)}
                          disabled={isFetching}
                          className={`min-w-8 h-8 sm:min-w-9 sm:h-9 px-2 sm:px-3 rounded-lg border text-xs sm:text-sm font-medium transition-colors ${
                            p === currentPage
                              ? "bg-primary text-white border-primary/20"
                              : "bg-[var(--card-1)] text-muted border-primary/30 hover:bg-white/5"
                          }`}
                        >
                          {p}
                        </button>
                      ),
                    )}
                  </div>

                  <button
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages || isFetching}
                    className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg text-white ${
                      currentPage === totalPages || isFetching
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    <ChevronsRight className="size-4 rtl-flip" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
