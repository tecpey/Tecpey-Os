import type { Metadata } from "next";
import { FlashcardsPageClient } from "@/components/academy/v2/FlashcardsPageClient";

export const metadata: Metadata = {
  title: "مرور روزانه فلش‌کارت‌ها | آکادمی تک‌پی",
  description: "مرور روزانه کارت‌های حافظه با الگوریتم تکرار فاصله‌دار SM-2 — تقویت حافظه بلندمدت",
  alternates: { canonical: "https://tecpey.ir/academy/flashcards" },
};

export default function FlashcardsPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-lg">
        <FlashcardsPageClient />
      </div>
    </div>
  );
}
