"use client";

import { ArrowDown } from "lucide-react";
import { Virtuoso } from "react-virtuoso";

type Coin = {
  symbol: string;
  name?: string;
  icon: string;
};

type Props = {
  selectedCoin: Coin;
  open: boolean;
  setOpen: (v: boolean) => void;
  setOtherOpen: (v: boolean) => void;
  isFetchingNextPage?: boolean;

  coins: Coin[];

  search: string;
  setSearch: (v: string) => void;

  setSelectedCoin: (coin: Coin) => void;

  hoverClass: string;

  fetchNextPage?: () => void;
  hasNextPage?: boolean;

  listHeight?: number;
};

export default function TokenDropdown({
  selectedCoin,
  open,
  setOpen,
  setOtherOpen,
  coins,
  search,
  setSearch,
  setSelectedCoin,
  hoverClass,
  fetchNextPage,
  hasNextPage,
  listHeight,
  isFetchingNextPage,
}: Props) {
  if (!selectedCoin) return null;

  return (
    <div className="relative w-fit max-w-full">
      <button
        onClick={() => {
          setOpen(!open);
          setOtherOpen(false);
        }}
        className="flex items-center gap-2 bg-[#1e293b] text-white px-4 py-2 rounded-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={selectedCoin.icon} className="w-5 h-5" alt="coin" />
        {selectedCoin.symbol}

        <ArrowDown
          size={14}
          className={`stroke-white transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="
      absolute left-1/2 -translate-x-1/2
      sm:left-auto sm:right-0 sm:translate-x-0
      mt-2 z-50
      w-[220px] sm:w-[260px]
      max-w-[calc(100vw-32px)]
      overflow-hidden
      rounded-2xl
      border border-primary/20
      bg-white text-black
      shadow-2xl
    "
        >
          <div className="p-3 border-b border-primary/10">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search coin..."
              className="
          w-full
          text-sm
          outline-none
          bg-transparent
        "
            />
          </div>

          <div
            className="
        max-h-[260px]
        overflow-hidden
      "
          >
            <Virtuoso
              style={{
                height: listHeight || 260,
              }}
              data={coins}
              endReached={() => {
                if (hasNextPage && fetchNextPage) {
                  fetchNextPage();
                }
              }}
              components={{
                Footer: () =>
                  isFetchingNextPage ? (
                    <div className="flex justify-center items-center py-3 text-muted">
                      ...loading
                    </div>
                  ) : null,
              }}
              itemContent={(index, coin) => (
                <div
                  key={coin.symbol}
                  onClick={() => {
                    setSelectedCoin(coin);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`
              flex items-center gap-3
              px-4 py-3
              cursor-pointer
              transition
              ${hoverClass}
            `}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coin.icon}
                    className="w-5 h-5 rounded-full"
                    alt="coin"
                  />

                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-semibold truncate">
                      {coin.symbol}
                    </span>

                    {coin.name && (
                      <span className="text-xs text-gray-400 truncate">
                        {coin.name}
                      </span>
                    )}
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
