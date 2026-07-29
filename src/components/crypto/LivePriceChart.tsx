"use client";

import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import { socket } from "@/lib/socket";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

type LivePriceChartProps = {
  symbol: string;
};

type TickerPayload = {
  data?: {
    symbol?: unknown;
    last?: unknown;
    lastPrice?: unknown;
    price?: unknown;
    close?: unknown;
  };
};

function tickerPrice(payload: TickerPayload): number | null {
  const data = payload.data;
  if (!data) return null;

  const price = Number(data.last ?? data.lastPrice ?? data.price ?? data.close);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export default function LivePriceChart({ symbol }: LivePriceChartProps) {
  const [prices, setPrices] = useState<number[]>([]);
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    const market = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,32}$/.test(market)) return;

    const handler = (payload: TickerPayload) => {
      const payloadMarket = String(payload.data?.symbol ?? "")
        .trim()
        .toUpperCase();
      if (payloadMarket && payloadMarket !== market) return;

      const price = tickerPrice(payload);
      if (price === null) return;

      setPrices((previous) => [...previous.slice(-49), price]);
      setLabels((previous) => [
        ...previous.slice(-49),
        new Date().toLocaleTimeString(),
      ]);
    };

    const subscription = { pair: [market] };
    socket.on("pair:price", handler);
    socket.emit("subscribe:pair:price", subscription);

    return () => {
      socket.off("pair:price", handler);
      socket.emit("unsubscribe:pair:price", subscription);
    };
  }, [symbol]);

  if (prices.length === 0) {
    return (
      <div className="flex justify-center items-center h-[450px]">
        <p className="text-gray-400">Connecting live data...</p>
      </div>
    );
  }

  const data = {
    labels,
    datasets: [
      {
        data: prices,
        borderColor: "#16c784",
        backgroundColor: "rgba(22, 199, 132, 0.1)",
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        display: false,
      },
      y: {
        ticks: {
          color: "#666",
        },
      },
    },
  };

  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">
      <div className="h-[450px] w-full">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
