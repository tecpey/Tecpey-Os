"use client";

import React from "react";
import { TrendingDown, TrendingUp, Activity } from "lucide-react";

type FilterOption = {
  id: string;
  label: string;
  icon?: React.ReactNode;
};

type Props = {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  t: (key: string) => string;
};

export default function MarketsFilters({
  activeFilter,
  onFilterChange,
  t,
}: Props) {
  const filters: FilterOption[] = [
    { id: "all", label: t("all") },
    { id: "ascending", label: t("ascending"), icon: <TrendingUp size={14} /> },
    {
      id: "descending",
      label: t("descending"),
      icon: <TrendingDown size={14} />,
    },
    {
      id: "high_volume",
      label: t("high_volume"),
      icon: <Activity size={14} />,
    },
  ];

  // return (
  //   <div className="w-full px-4 md:px-0 my-6 md:my-8">
  //     <div className="mx-auto max-w-[980px]">
  //       <div
  //         className="
  //   -mx-4 px-4
  //   flex gap-2
  //   overflow-x-auto no-scrollbar
  //   md:mx-0 md:px-0
  //   md:flex-wrap md:justify-center
  //   md:overflow-visible
  // "
  //       >
  //         {filters.map((filter) => {
  //           const isActive = activeFilter === filter.id;

  //           return (
  //             <button
  //               key={filter.id}
  //               type="button"
  //               onClick={() => onFilterChange(filter.id)}
  //               className={`
  //                 inline-flex items-center gap-1.5
  //                 shrink-0                 
  //                 h-9 md:h-[38px]
  //                 rounded-full
  //                 px-3.5 md:px-5
  //                 text-[13px] md:text-[14px]
  //                 font-medium
  //                 transition-all duration-200
  //                 border
  //                 cursor-pointer
  //                 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
  //                 ${
  //                   isActive
  //                     ? "bg-primary border-primary text-white shadow-[0_10px_22px_rgba(47,128,237,0.18)]"
  //                     : "bg-[var(--card-1)] border-primary/10 text-muted hover:border-primary/30 hover:bg-white/5"
  //                 }
  //               `}
  //             >
  //               {filter.icon}
  //               <span className="leading-none">{filter.label}</span>
  //             </button>
  //           );
  //         })}
  //       </div>
  //     </div>
  //   </div>
  // );
}
