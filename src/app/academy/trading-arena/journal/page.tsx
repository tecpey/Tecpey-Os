import type { Metadata } from "next";
import { JournalView } from "@/components/academy/trading-arena/JournalView";

export const metadata: Metadata = {
  title: "ژورنال معاملاتی | آکادمی تک‌پی",
  description: "ثبت برنامه، احساسات، و بازتاب هر معامله — ابزار یادگیری رفتار معامله‌گری در تک‌پی",
  alternates: { canonical: "https://tecpey.ir/academy/trading-arena/journal" },
};

export default function JournalPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <JournalView />
      </div>
    </div>
  );
}
