import type { Metadata } from "next";
import { AcademyMasterySeasonsShowcase } from "@/components/academy/AcademyMasterySeasonsShowcase";
import { TermAccessGuard } from "@/components/academy/TermAccessGuard";

export const metadata: Metadata = {
  title: "Term 8: Infinite Growth | TecPey Academy",
  description: "A personalized assess, practice, reflect and verify cycle after all seven core terms.",
  robots: { index: false, follow: false },
};

export default function EnglishAcademyInfiniteGrowthTermPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <TermAccessGuard termNumber={8} locale="en">
          <AcademyMasterySeasonsShowcase locale="en" />
        </TermAccessGuard>
      </div>
    </main>
  );
}
