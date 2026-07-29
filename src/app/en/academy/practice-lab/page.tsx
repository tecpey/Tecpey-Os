import type { Metadata } from "next";
import Link from "next/link";
import { AcademyPracticeLab } from "@/components/academy/AcademyPracticeLab";
import { EnglishShell } from "../../components/EnglishUI";

export const metadata: Metadata = {
  title: "TecPey Academy Practice Lab | Crypto decision scenarios",
  description: "Scenario-based crypto practice lab for safer decisions, risk management and market behavior training.",
  alternates: { canonical: "https://tecpey.ir/en/academy/practice-lab" },
};

export default function EnglishPracticeLabPage() {
  return (
    <EnglishShell>
      <main>
        <AcademyPracticeLab locale="en" />
        <section className="px-4 pb-14 text-center sm:px-6 lg:px-8">
          <Link href="/en/academy/final-assessment" className="inline-flex rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white transition hover:bg-cyan-400">Go to final assessment</Link>
        </section>
      </main>
    </EnglishShell>
  );
}
