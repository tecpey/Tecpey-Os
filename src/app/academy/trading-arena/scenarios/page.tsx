import type { Metadata } from "next";
import { ScenarioList } from "@/components/academy/trading-arena/ScenarioPlayer";

export const metadata: Metadata = {
  title: "سناریوهای معاملاتی | آکادمی تک‌پی",
  description: "سناریوهای آموزشی معاملاتی — کنترل FOMO، مقاومت در برابر معامله انتقامی، مدیریت ریسک، واکنش به اخبار",
  alternates: { canonical: "https://tecpey.ir/academy/trading-arena/scenarios" },
};

export default function ScenariosPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <ScenarioList />
      </div>
    </div>
  );
}
