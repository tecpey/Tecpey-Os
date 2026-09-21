import type { Metadata } from "next";
import { ContentShell } from "@/components/content/ContentUI";
import { MarketIntelligenceOverview } from "@/components/academy/MarketIntelligenceOverview";

export const metadata: Metadata = {
  title: "Market Intelligence | آکادمی تک‌پی",
  description: "مرکز آموزش‌محور تک‌پی برای فهم داده بازار، خبر، روایت عمومی، شواهد متعارض و عدم‌قطعیت؛ بدون سیگنال خرید و فروش.",
};

export default function Page() {
  return <ContentShell><MarketIntelligenceOverview locale="fa" /></ContentShell>;
}
