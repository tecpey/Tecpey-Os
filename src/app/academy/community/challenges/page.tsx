import type { Metadata } from "next";
import { ChallengeCenter } from "@/components/academy/community/ChallengeCenter";

export const metadata: Metadata = {
  title: "چالش رسمی بازتاب ژورنال | جامعه تک‌پی",
  description: "چالش هفتگی سرورمحور تک‌پی با Evidence معتبر Trading Arena و پاداش Exactly-Once",
  alternates: { canonical: "https://tecpey.ir/academy/community/challenges" },
};

export default function ChallengesPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-3xl">
        <ChallengeCenter />
      </div>
    </div>
  );
}
