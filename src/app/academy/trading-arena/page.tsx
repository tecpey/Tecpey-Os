import type { Metadata } from "next";
import { TradingArenaDashboard } from "@/components/academy/trading-arena/TradingArenaDashboard";

export const metadata: Metadata = {
  title: "آرنای معاملاتی | آکادمی تک‌پی",
  description: "شبیه‌ساز معاملاتی آموزشی — تمرین رفتار، انضباط، و مدیریت ریسک بدون سرمایه واقعی",
  alternates: { canonical: "https://tecpey.ir/academy/trading-arena" },
};

export default function TradingArenaPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <TradingArenaDashboard />
      </div>
    </div>
  );
}
