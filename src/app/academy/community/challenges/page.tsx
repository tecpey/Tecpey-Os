import type { Metadata } from "next";
import { ChallengeCenter } from "@/components/academy/community/ChallengeCenter";

export const metadata: Metadata = {
  title: "چالش‌های هفتگی | جامعه تک‌پی",
  description: "چالش‌های هفتگی آموزشی تک‌پی — یادگیری ساختارمند با شبیه‌ساز بدون سرمایه واقعی",
  alternates: { canonical: "https://tecpey.ir/academy/community/challenges" },
};

export default function ChallengesPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <ChallengeCenter />
      </div>
    </div>
  );
}
