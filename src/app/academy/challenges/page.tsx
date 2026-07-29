import type { Metadata } from "next";
import { ContentShell } from "@/components/content/ContentUI";
import { CommunityCareerPanel } from "@/components/community/CommunityCareerPanel";

export const metadata: Metadata = {
  title: "چالش‌های حرفه‌ای آکادمی تک‌پی",
  description: "چالش‌های آموزشی و تمرینی تک‌پی برای سنجش انضباط، مدیریت ریسک، ژورنال و آمادگی مسیر حرفه‌ای.",
  robots: { index: false, follow: false },
};

export default function AcademyChallengesPage() {
  return <ContentShell><main className="min-h-screen px-4 py-12 text-[color:var(--tp-text)] sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><CommunityCareerPanel mode="challenges" /></div></main></ContentShell>;
}
