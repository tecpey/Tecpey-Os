import type { Metadata } from "next";
import { LeaderboardView } from "@/components/academy/community/LeaderboardView";

export const metadata: Metadata = {
  title: "رتبه‌بندی انضباط | جامعه تک‌پی",
  description: "رتبه‌بندی یادگیرندگان تک‌پی بر اساس انضباط، ثبات و مدیریت ریسک — نه سود",
  alternates: { canonical: "https://tecpey.ir/academy/community/leaderboards" },
};

export default function LeaderboardsPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <LeaderboardView />
      </div>
    </div>
  );
}
