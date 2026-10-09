import type { Metadata } from "next";
import { StructuredData } from "@/components/seo/StructuredData";
import TradingToolsClient from "@/components/tools/TradingToolsClient";
import { buildTradingToolsSchemas } from "@/lib/trading-tools-growth";
import { TrendRadarWidget } from "@/components/growth/TrendRadarWidget";
import { getGrowthTrendRadarFromAuthority } from "@/lib/growth-trend-authority";

export const metadata: Metadata = {
  title: "جعبه ابزار معامله‌گر تک‌پی | ابزار تحلیل، آنچین، امنیت و تحقیق رمزارز",
  description:
    "جعبه ابزار تک‌پی برای شناخت ابزارهای معتبر تحلیل تکنیکال، داده بازار، آنچین، امنیت و تحقیق رمزارز با توضیح فارسی، لینک رسمی و رتبه‌بندی آموزشی کنترل‌شده.",
  alternates: {
    canonical: "https://tecpey.ir/trading-tools",
    languages: {
      "fa-IR": "https://tecpey.ir/trading-tools",
      "en-US": "https://tecpey.ir/en/trading-tools",
      "x-default": "https://tecpey.ir/trading-tools",
    },
  },
  keywords: [
    "ابزار تحلیل ارز دیجیتال",
    "ابزار تحلیل تکنیکال",
    "ابزار آنچین",
    "ابزار امنیت رمزارز",
    "TradingView فارسی",
    "CoinMarketCap فارسی",
    "CoinGecko فارسی",
    "جعبه ابزار معامله‌گر",
    "تک‌پی",
  ],
  openGraph: {
    title: "جعبه ابزار معامله‌گر تک‌پی",
    description: "ابزارهای معتبر رمزارز با توضیح فارسی، لینک رسمی و رتبه‌بندی آموزشی ریسک‌محور.",
    url: "https://tecpey.ir/trading-tools",
    siteName: "TecPey",
    locale: "fa_IR",
    type: "website",
    images: [{ url: "/images/tecpey-logo.png", width: 512, height: 512, alt: "TecPey" }],
  },
};

export default async function Page() {
  const trendRadar = await getGrowthTrendRadarFromAuthority("fa");
  return (
    <>
      <StructuredData data={buildTradingToolsSchemas("fa")} />
      <TrendRadarWidget data={trendRadar} locale="fa" />
      <TradingToolsClient locale="fa" />
    </>
  );
}
