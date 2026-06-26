import type { Metadata } from "next";
import { ContentShell } from "@/components/content/ContentUI";
import { CommunityCareerPanel } from "@/components/community/CommunityCareerPanel";

export const metadata: Metadata = {
  title: "مسیر حرفه‌ای آکادمی تک‌پی | Career Engine",
  description: "تحلیل هوشمند مسیر حرفه‌ای دانشجو بر پایه یادگیری، ژورنال، تمرین، مدیریت ریسک و عملکرد در آکادمی.",
  robots: { index: false, follow: false },
};

export default function AcademyCareerPage() {
  return <ContentShell><main className="min-h-screen px-4 py-12 text-[color:var(--tp-text)] sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><CommunityCareerPanel mode="career" /></div></main></ContentShell>;
}
