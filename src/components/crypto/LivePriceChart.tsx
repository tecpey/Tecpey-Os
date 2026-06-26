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

export default function LivePriceChart({ symbol }: LivePriceChartProps) {
  const [prices, setPrices] = useState<number[]>([]);
  const [labels, setLabels] = useState<string[]>([]);

  
  useEffect(() => {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@trade`);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const price = parseFloat(message.p);
      const time = new Date(message.T).toLocaleTimeString();
        
      setPrices((prev) => [...prev.slice(-49), price]); 
      setLabels((prev) => [...prev.slice(-49), time]);
    };

    ws.onerror = (err) => console.error("WebSocket Error:", err);
    ws.onclose = () => { };

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
