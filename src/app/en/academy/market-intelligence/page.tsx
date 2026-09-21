import type { Metadata } from "next";
import { ContentShell } from "@/components/content/ContentUI";
import { MarketIntelligenceOverview } from "@/components/academy/MarketIntelligenceOverview";

export const metadata: Metadata = {
  title: "Market Intelligence | TecPey Academy",
  description: "TecPey's learning-first surface for market data, news, public narratives, conflicting evidence and uncertainty—without buy or sell signals.",
};

export default function Page() {
  return <ContentShell><MarketIntelligenceOverview locale="en" /></ContentShell>;
}
