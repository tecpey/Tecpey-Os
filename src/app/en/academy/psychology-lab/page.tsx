import type { Metadata } from "next";
import { AcademySimulationWorld } from "@/components/academy/AcademySimulationWorld";
import { EnglishShell } from "../../components/EnglishUI";

export const metadata: Metadata = {
  title: "TecPey Academy Simulator | Crypto decision practice",
  description: "Scenario-based TecPey Academy simulator for risk, psychology, portfolio and responsible crypto decisions.",
  alternates: { canonical: "https://tecpey.ir/en/academy/psychology-lab" },
};

export default function EnglishPsychologyLabPage() {
  return <EnglishShell><AcademySimulationWorld locale="en" focus="psychology" /></EnglishShell>;
}
