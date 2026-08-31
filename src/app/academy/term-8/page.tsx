import type { Metadata } from "next";
import { AcademyMasterySeasonsShowcase } from "@/components/academy/AcademyMasterySeasonsShowcase";
import { TermAccessGuard } from "@/components/academy/TermAccessGuard";

export const metadata: Metadata = {
  title: "ترم ۸؛ ترم رشد بی‌نهایت | آکادمی تک‌پی",
  description: "چرخه شخصی‌سازی‌شده ارزیابی، تمرین، بازتاب و اعتبارسنجی پس از تکمیل هفت ترم اصلی.",
  robots: { index: false, follow: false },
};

export default function AcademyInfiniteGrowthTermPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <TermAccessGuard termNumber={8} locale="fa">
          <AcademyMasterySeasonsShowcase locale="fa" />
        </TermAccessGuard>
      </div>
    </main>
  );
}
