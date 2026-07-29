import type { Metadata } from "next";
import { TradingArenaProClient } from "@/components/academy/TradingArenaProClient";

export const metadata: Metadata = {
  title: "اتاق معامله تمرینی تک‌پی | Trading Arena آکادمی",
  description: "اتاق معامله تمرینی تک‌پی با چارت پیشرفته، کیف دمو، ژورنال، مدیریت ریسک و نظارت منتور هوشمند برای دانشجویان آکادمی.",
  alternates: { canonical: "https://tecpey.ir/academy/simulator" },
};

export default function TradingSimulatorPage() {
  return <TradingArenaProClient locale="fa" />;
}
