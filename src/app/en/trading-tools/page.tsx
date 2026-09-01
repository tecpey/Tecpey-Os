import type { Metadata } from "next";
import { StructuredData } from "@/components/seo/StructuredData";
import TradingToolsClient from "@/components/tools/TradingToolsClient";
import { buildTradingToolsSchemas } from "@/lib/trading-tools-growth";
import { TrendRadarWidget } from "@/components/growth/TrendRadarWidget";
import { getGrowthTrendRadarFromAuthority } from "@/lib/growth-trend-authority";

export const metadata: Metadata = {
  title: "TecPey Trader Toolbox | Crypto analysis, on-chain, security and research tools",
  description:
    "A curated crypto toolbox for technical analysis, market data, on-chain research, security checks and risk-aware learning with official links and governed ranking.",
  alternates: {
    canonical: "https://tecpey.ir/en/trading-tools",
    languages: {
      "fa-IR": "https://tecpey.ir/trading-tools",
      "en-US": "https://tecpey.ir/en/trading-tools",
      "x-default": "https://tecpey.ir/trading-tools",
    },
  },
  keywords: [
    "crypto analysis tools",
    "trading tools",
    "on-chain analytics tools",
    "crypto security tools",
    "TradingView",
    "CoinMarketCap",
    "CoinGecko",
    "TecPey",
  ],
  openGraph: {
    title: "TecPey Trader Toolbox",
    description: "Curated crypto tools with official links and a governed, risk-aware educational ranking.",
    url: "https://tecpey.ir/en/trading-tools",
    siteName: "TecPey",
    locale: "en_US",
    alternateLocale: ["fa_IR"],
    type: "website",
    images: [{ url: "/images/tecpey-logo.png", width: 512, height: 512, alt: "TecPey" }],
  },
};

export default async function Page() {
  const trendRadar = await getGrowthTrendRadarFromAuthority("en");
  return (
    <>
      <StructuredData data={buildTradingToolsSchemas("en")} />
      <TrendRadarWidget data={trendRadar} locale="en" />
      <TradingToolsClient locale="en" />
    </>
  );
}
