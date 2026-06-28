import type { Metadata } from "next";
import { InstructorDashboard } from "@/components/academy/community/InstructorDashboard";

export const metadata: Metadata = {
  title: "نمای مدرس | جامعه تک‌پی",
  description: "داشبورد مدرس تک‌پی — مشاهده پیشرفت رفتاری دانشجو با رضایت کامل، بدون اطلاعات خصوصی",
  alternates: { canonical: "https://tecpey.ir/academy/community/instructor" },
};

export default function InstructorPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <InstructorDashboard />
      </div>
    </div>
  );
}
