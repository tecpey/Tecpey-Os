import type { Metadata } from "next";
import { AcademyStudentDashboardV2 } from "@/components/academy/AcademyStudentDashboardV2";

export const metadata: Metadata = {
  title: "TecPey Academy learner dashboard | Personal learning path",
  description: "Private TecPey Academy dashboard for terms, Smart Center, mentor, simulator and certificates.",
  robots: { index: false, follow: false },
};

export default function EnglishAcademyProfilePage() {
  return <AcademyStudentDashboardV2 locale="en" />;
}
