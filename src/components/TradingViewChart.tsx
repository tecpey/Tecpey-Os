"use client";

import React, { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";

const loadScriptOnce = (src: string) =>
  new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return;
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });

export default function TradingViewChart({ symbol }: { symbol: string }) {
  const locale = useLocale();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  const [mounted, setMounted] = useState(false);
  const [themeMode, setThemeMode] = useState("light");

  const getOverrides = (theme: string) => {
    const isDark = theme === "dark";
    return {
      "paneProperties.background": isDark ? "#0f172a" : "#ffffff",
      "paneProperties.backgroundType": "solid",
      "paneProperties.vertGridProperties.color": isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
      "paneProperties.horzGridProperties.color": isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
      "scalesProperties.textColor": isDark ? "#94a3b8" : "#475569",
      "mainSeriesProperties.candleStyle.upColor": "#22c55e",
      "mainSeriesProperties.candleStyle.downColor": "#ef4444",
      "mainSeriesProperties.candleStyle.borderUpColor": "#22c55e",
      "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
      "mainSeriesProperties.candleStyle.wickUpColor": "#22c55e",
      "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
    };
  };

  useEffect(() => {
    setMounted(true);
    const updateTheme = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setThemeMode(isDark ? "dark" : "light");
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (widgetRef.current) {
      widgetRef.current.onChartReady(() => {
        widgetRef.current.changeTheme(themeMode === "dark" ? "Dark" : "Light");
        
        widgetRef.current.applyOverrides(getOverrides(themeMode));
      });
    }
  }, [themeMode]);


  const tvLocale = locale === "fa" ? "fa" : "en";
  const tvTimezone = locale === "fa" ? "Asia/Tehran" : "Europe/London";
  const symbolCoin = `BINANCE:${symbol}-USDT`;

  useEffect(() => {
    if (!mounted) return;
    let isActive = true;

    const init = async () => {
      await loadScriptOnce("/charting_library/charting_library.standalone.js");
      await loadScriptOnce("/datafeeds/udf/bundle/bundle.js");

      if (!isActive || !(window as any).TradingView) return;

      if (widgetRef.current) {
        widgetRef.current.remove();
      }

      const widget = new (window as any).TradingView.widget({
        container: chartContainerRef.current,
        autosize: true,
        symbol: symbolCoin,
        theme: themeMode === "dark" ? "Dark" : "Light",
        locale: tvLocale,
        timezone: tvTimezone,
        library_path: "/charting_library/",
        overrides: getOverrides(themeMode),
        datafeed: new (window as any).Datafeeds.UDFCompatibleDatafeed(
          `${process.env.NEXT_PUBLIC_API_BACKEND_URL}/api/v1/chart/spot`
        ),
        disabled_features: ["use_localstorage_for_settings"], 
      });

      widgetRef.current = widget;
    };

    init();

    return () => {
      isActive = false;
    };
  }, [symbolCoin, locale, mounted]); 

  return (
  <div className="w-full h-[600px] sm:h-[450px] lg:h-[600px] rounded-3xl overflow-hidden">
    <div
      ref={chartContainerRef}
      style={{ height: "100%", width: "100%" }}
      className="w-full h-full"
    />
  </div>
);
}
