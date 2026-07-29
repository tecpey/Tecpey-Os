import type { Metadata } from "next";
import { MentorV2 } from "@/components/academy/v2/MentorV2";

export const metadata: Metadata = {
  title: "مربی رفتاری V2 | آکادمی تک‌پی",
  description: "کوچینگ بلندمدت رفتاری برای معامله‌گران — تحلیل انضباط، صبر، ریسک و تصمیم‌گیری",
  alternates: { canonical: "https://tecpey.ir/academy/mentor-v2" },
};

export default function MentorV2Page() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <MentorV2 />
      </div>
    </div>
  );
}
