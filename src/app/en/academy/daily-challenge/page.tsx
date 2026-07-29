import type { Metadata } from "next";
import { AcademyEngagementHub } from "@/components/academy/AcademyEngagementHub";
import { EnglishShell } from "../../components/EnglishUI";

export const metadata: Metadata = {
  title: "TecPey Academy Daily Challenge | XP, streak and learning habit",
  description: "Daily Academy missions that turn crypto education into practice, feedback and responsible learning habits.",
  alternates: { canonical: "https://tecpey.ir/en/academy/daily-challenge" },
};

export default function EnglishDailyChallengePage() {
  return <EnglishShell><main className="py-12"><AcademyEngagementHub locale="en" /></main></EnglishShell>;
}
