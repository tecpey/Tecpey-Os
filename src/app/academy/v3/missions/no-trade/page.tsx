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
    <main className="tecpey-motion-content-surface--dark min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] px-4 py-3 text-xs font-bold leading-6 text-cyan-100">
          پیش‌نمایش V3 · این مسیر هنوز authority آموزشی، امتیاز رسمی یا mastery ایجاد نمی‌کند.
        </div>
        <AcademyV3MissionPreview mission={mission} locale="fa" />
      </div>
    </main>
  );
}
