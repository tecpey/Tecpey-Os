import type { Metadata } from "next";
import { EnglishShell } from "../../components/EnglishUI";
import { AcademySpecializedProgram } from "@/components/academy/AcademySpecializedProgram";

export const metadata: Metadata = {
  title: "TecPey Academy Specialized Program | Review Request",
  description: "Apply for TecPey Academy's specialized online or in-person program after completing the foundation path, final assessment and scenario practice.",
  alternates: { canonical: "https://tecpey.ir/en/academy/specialized-program" },
};

export default function EnglishSpecializedProgramPage() {
  return <EnglishShell><AcademySpecializedProgram locale="en" /></EnglishShell>;
}
