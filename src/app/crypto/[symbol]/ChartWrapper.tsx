"use client";

import { useEffect, useRef, memo } from "react";

declare global {
  interface Window {
    TradingView: any;
    Datafeeds: any;
  }
}

interface ChartWrapperProps {
  symbol: string;
}

function ChartWrapper({ symbol }: ChartWrapperProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInitialized = useRef(false);

  useEffect(() => {
    const initChart = () => {
      if (
        !window.TradingView ||
        !window.Datafeeds ||
        !chartContainerRef.current ||
        chartInitialized.current
      ) {
        return;
      }

      chartInitialized.current = true;

      const tvSymbol = `${symbol.toUpperCase()}USDT`;

      new window.TradingView.widget({
        symbol: tvSymbol,
        interval: "15",
        container_id: chartContainerRef.current.id,
        theme: "dark",
        locale: "en",
        autosize: true,
        library_path: "/charting_library/",
        datafeed: new window.Datafeeds.UDFCompatibleDatafeed(
          `${process.env.NEXT_PUBLIC_API_BACKEND_URL || ""}/api/v1/chart/spot`
        ),
      });
    };

    const loadScripts = () => {
      if (window.TradingView && window.Datafeeds) {
        initChart();
        return;
      }

      const tvScript = document.createElement("script");
      tvScript.src = "/charting_library/charting_library.js";
      tvScript.async = true;

      const dfScript = document.createElement("script");
      dfScript.src = "/datafeeds/udf/dist/bundle.js";
      dfScript.async = true;

      tvScript.onload = initChart;
      dfScript.onload = initChart;

      document.body.appendChild(tvScript);
      document.body.appendChild(dfScript);
    };

    loadScripts();

    return () => {
      chartInitialized.current = false;
    };
  }, [symbol]);

  const containerId = `tv_chart_${symbol}`;

  return (
    <div
      id={containerId}
      ref={chartContainerRef}
      className="w-full h-[500px]"
    />
  );
}

export default memo(ChartWrapper);
