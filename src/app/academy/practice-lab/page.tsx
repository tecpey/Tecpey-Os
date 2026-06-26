import type { Metadata } from "next";
import Link from "next/link";
import { AcademyPracticeLab } from "@/components/academy/AcademyPracticeLab";
import { ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "Practice Lab آکادمی تک‌پی | تمرین تصمیم‌گیری بازار رمزارز",
  description: "آزمایشگاه تمرین آکادمی تک‌پی برای سناریوهای واقعی بازار، مدیریت ریسک، امنیت و تصمیم‌گیری بدون هیجان.",
  alternates: { canonical: "https://tecpey.ir/academy/practice-lab" },
};

export default function PracticeLabPage() {
  return (
    <ContentShell>
      <main>
        <AcademyPracticeLab locale="fa" />
        <section className="px-4 pb-14 text-center sm:px-6 lg:px-8">
          <Link href="/academy/final-assessment" className="inline-flex rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white transition hover:bg-cyan-400">رفتن به ارزیابی نهایی</Link>
        </section>
      </main>
    </ContentShell>
  );
}
