import type { Metadata } from "next";
import { AcademyOnboardingClient } from "@/components/academy/AcademyOnboardingClient";

export const metadata: Metadata = {
  title: "Create TecPey Academy Profile | Start Learning Path",
  description: "Create your display name, username and learning identity before entering TecPey Academy terms.",
  robots: { index: false, follow: false },
};

export default function EnglishAcademyOnboardingPage() {
  return <AcademyOnboardingClient locale="en" />;
}
