import type { Metadata } from "next";
import { LearningInsightsDashboard } from "@/components/academy/v2/LearningInsightsDashboard";

export const metadata: Metadata = {
  title: "داشبورد یادگیری | آکادمی تک‌پی",
  description: "تحلیل رفتار یادگیری، نقشه دانش، تقویم مطالعه و پیش‌بینی پیشرفت — آکادمی تک‌پی",
  alternates: { canonical: "https://tecpey.ir/academy/insights" },
};

export default function InsightsPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <LearningInsightsDashboard />
      </div>
    </div>
  );
}
