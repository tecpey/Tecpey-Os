"use client";

import React from "react";
import { Search } from "lucide-react";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  t: (key: string) => string;
};

export default function MarketsSearchBar({ query, onQueryChange, t }: Props) {
  const label = t("searchPlaceholder");

  return (
    <div className="w-full px-4 md:px-0">
      <label className="relative mx-auto block w-full max-w-[720px]">
        <span className="sr-only">{label}</span>
        <Search aria-hidden="true" className="pointer-events-none absolute start-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#64748b] dark:text-[#94a3b8]" strokeWidth={2.2} />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={label}
          className="h-12 w-full rounded-full border border-primary/30 bg-[var(--card-1)] ps-12 pe-4 text-[14px] font-medium text-fg outline-none shadow-[0_12px_28px_rgba(30,58,138,0.06)] placeholder:font-medium placeholder:text-muted focus-visible:border-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-600/25 dark:focus-visible:border-cyan-300 dark:focus-visible:ring-cyan-300/25"
        />
      </label>
    </div>
  );
}
