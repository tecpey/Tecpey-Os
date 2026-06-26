import type { Metadata } from "next";
import { AcademyMentorCoachCenter } from "@/components/academy/AcademyMentorCoachCenter";
import { EnglishShell } from "../../components/EnglishUI";

export const metadata: Metadata = {
  title: "TecPey Academy personal coach | Learning memory and roadmap",
  description: "TecPey Academy personal coach analyzes progress, learning weaknesses, mentor mode and recommended next steps.",
  alternates: { canonical: "https://tecpey.ir/en/academy/mentor-coach" },
};

export default function EnglishAcademyMentorCoachPage() {
  return (
    <EnglishShell>
      <AcademyMentorCoachCenter locale="en" />
    </EnglishShell>
  );
}
