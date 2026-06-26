import type { Metadata } from "next";
import { AcademyEngagementHub } from "@/components/academy/AcademyEngagementHub";
import { ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "مأموریت روزانه آکادمی تک‌پی | XP، Streak و تمرین یادگیری",
  description: "مأموریت روزانه آکادمی تک‌پی برای تبدیل آموزش رمزارز به عادت یادگیری، تمرین و تصمیم‌گیری مسئولانه.",
  alternates: { canonical: "https://tecpey.ir/academy/daily-challenge" },
};

export default function DailyChallengePage() {
  return <ContentShell><main className="py-12"><AcademyEngagementHub locale="fa" /></main></ContentShell>;
}
