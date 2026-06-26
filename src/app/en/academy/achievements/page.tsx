import type { Metadata } from "next";
import { AcademyEngagementHub } from "@/components/academy/AcademyEngagementHub";
import { EnglishShell } from "../../components/EnglishUI";

export const metadata: Metadata = {
  title: "TecPey Academy Achievements | Badges and progress",
  description: "Academy badges, XP, learner level and progress path for safer crypto education.",
  alternates: { canonical: "https://tecpey.ir/en/academy/achievements" },
};

export default function EnglishAchievementsPage() {
  return <EnglishShell><main className="py-12"><AcademyEngagementHub locale="en" /></main></EnglishShell>;
}
