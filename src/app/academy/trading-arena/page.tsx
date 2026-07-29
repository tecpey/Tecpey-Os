import type { Metadata } from "next";
import { TradingArenaExecutionClient } from "@/components/academy/trading-arena/TradingArenaExecutionClient";

export const metadata: Metadata = {
  title: "آرنای معاملاتی | آکادمی تک‌پی",
  description: "شبیه‌ساز معاملاتی آموزشی با اجرای سروری، مدیریت ریسک و حافظه رفتاری منتور",
  alternates: { canonical: "https://tecpey.ir/academy/trading-arena" },
};

export default function TradingArenaPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.14),transparent_34%),#020617] px-4 py-8 text-white sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-[1500px]">
        <TradingArenaExecutionClient />
      </div>
    </main>
  );
}
