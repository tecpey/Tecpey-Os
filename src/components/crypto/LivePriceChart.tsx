"use client";

import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
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

type TickerFrame = {
  channel?: unknown;
  data?: {
    lastPrice?: unknown;
  };
};

function browserSocketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_SOCKET_URL;
  if (configured) return configured;

  const url = new URL("/ws", window.location.origin);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export default function LivePriceChart({ symbol }: LivePriceChartProps) {
  const [prices, setPrices] = useState<number[]>([]);
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    const market = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,32}$/.test(market)) return;

    const ws = new WebSocket(browserSocketUrl());
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", channel: "ticker", market }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as TickerFrame;
        if (message.channel !== "ticker") return;
        const price = Number(message.data?.lastPrice);
        if (!Number.isFinite(price) || price <= 0) return;

        setPrices((previous) => [...previous.slice(-49), price]);
        setLabels((previous) => [
          ...previous.slice(-49),
          new Date().toLocaleTimeString(),
        ]);
      } catch {
        // Ignore malformed or unrelated frames; the owned socket may carry many channels.
      }
    };

    return () => ws.close();
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
