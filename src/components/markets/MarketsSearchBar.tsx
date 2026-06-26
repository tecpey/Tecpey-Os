"use client";

import React from "react";
import { Search } from "lucide-react";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  t: (key: string) => string;
};

export default function MarketsSearchBar({ query, onQueryChange, t }: Props) {
  return (
    <div className="w-full px-4 md:px-0">
      <div className="mx-auto w-full max-w-[720px]">
        <div
          className="
            relative
            h-[44px]
            rounded-full
            bg-[var(--card-1)]
            border border-primary/30
            shadow-[0_12px_28px_rgba(30,58,138,0.06)]
          "
        >
          <div className="absolute px-5 top-1/2 -translate-y-1/2 text-[#8EA0BE]">
            <Search size={18} strokeWidth={2.2} />
          </div>

          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="
                h-full 
                w-full          
                rounded-full
                bg-transparent
                outline-none
                px-10
                py-4
                text-[14px]
                font-medium
                text-fg
                placeholder:font-medium
                placeholder:text-muted
                placeholder:px-6
                transition-all   
                focus:ring-2 focus:ring-primary/20
                "
          />
        </div>
      </div>
    </div>
  );
}
