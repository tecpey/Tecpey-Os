"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrencyInfo } from "@/services/swap.services";

import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";

interface ChartPoint {
  time: string;
  value: number;
}

interface ChartProps {
  symbol: string;
  change: number;
  height?: number;
}



export default function Chart({ symbol, change, height = 60 }: ChartProps) {
  const formattedSymbol = useMemo(() => {
    if (!symbol) return "";

    

    return symbol.replace("USDT", "").replace("_", "").replace("-", "").trim();
  }, [symbol]);

  const isStaticCoin =
  symbol === "USDT";

   if (isStaticCoin) {
  return (
    <svg
      viewBox="0 0 100 40"
      className="w-full h-full"
      preserveAspectRatio="none"
    >
      <path
        d="M0 20 L20 20 L40 19 L60 20 L80 20 L100 20"
        stroke="#9CA3AF"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}

  const { data, isLoading, error } = useQuery({
    queryKey: ["chart", formattedSymbol],

    queryFn: () =>
      getCurrencyInfo({
        symbol: formattedSymbol,
      }),

    enabled: !!formattedSymbol,
  });

  const chartData: ChartPoint[] = useMemo(() => {
    if (!data?.labels || !data?.prices) {
      return [];
    }

    return data.labels.map((label: string, index: number) => ({
      time: label,
      value: Number(data.prices[index] ?? 0),
    }));
  }, [data]);

  if (isLoading) {
    return <div className="text-xs opacity-50">...</div>;
  }

  if (error) {
    return <div className="text-xs text-red-500">Error</div>;
  }

  if (!chartData.length) {
    return <div className="text-xs opacity-40">—</div>;
  }



  return (
    <div
  className="w-full"
  style={{
    height,
    minWidth: 80,
  }}
>
      <ResponsiveContainer
  width="100%"
  height="100%"
>
  <AreaChart
    data={chartData}
    margin={{
      top: 10,
      right: 0,
      left: 0,
      bottom: 0,
    }}
  >

    <YAxis
      domain={["dataMin", "dataMax"]}
      hide
    />

    <Area
      type="monotone"
      dataKey="value"
      stroke={
        change > 0
          ? "#00C853"
          : "#FF1744"
      }
      fill={
        change > 0
          ? "rgba(0,200,83,0.15)"
          : "rgba(255,23,68,0.15)"
      }
      strokeWidth={1.5}
      dot={false}
      isAnimationActive={false}
    />
  </AreaChart>
</ResponsiveContainer>
    </div>
  );
}
