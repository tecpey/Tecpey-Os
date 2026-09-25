import type { Metadata } from "next";
import { AcademyV3MissionPreview } from "@/components/academy/v3/AcademyV3MissionPreview";
import { academyV3ReferenceMissions } from "@/data/academyV3ReferenceMissions";

const mission = academyV3ReferenceMissions.find(
  (candidate) => candidate.id === "MISSION.T6.NO_TRADE.INSUFFICIENT_EVIDENCE",
);

export const metadata: Metadata = {
  title: "ماموریت تصمیم‌گیری | آکادمی تک‌پی",
  description: "تمرین تصمیم‌گیری مبتنی بر شواهد، عدم‌قطعیت و بودجه ریسک در آکادمی تک‌پی.",
  robots: { index: false, follow: false },
};

export default function AcademyV3NoTradeMissionPage() {
  if (!mission) throw new Error("Academy V3 reference mission is unavailable.");

  return (
    <main className="tecpey-motion-content-surface--dark min-h-screen bg-[#030812] px-4 py-6 sm:px-6 sm:py-10 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex min-h-11 items-center rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-2.5 text-xs font-semibold leading-6 text-slate-400">
          پیش‌نمایش V3 · این مسیر هنوز authority آموزشی، امتیاز رسمی یا mastery ایجاد نمی‌کند.
        </div>
        <AcademyV3MissionPreview mission={mission} locale="fa" />
      </div>
    </main>
  );
}
