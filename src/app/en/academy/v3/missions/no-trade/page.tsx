import type { Metadata } from "next";
import { AcademyV3MissionPreview } from "@/components/academy/v3/AcademyV3MissionPreview";
import { academyV3ReferenceMissions } from "@/data/academyV3ReferenceMissions";

const mission = academyV3ReferenceMissions.find(
  (candidate) => candidate.id === "MISSION.T6.NO_TRADE.INSUFFICIENT_EVIDENCE",
);

export const metadata: Metadata = {
  title: "Decision Mission | TecPey Academy",
  description: "Practice evidence-based decisions under uncertainty and bounded risk in TecPey Academy.",
  robots: { index: false, follow: false },
};

export default function AcademyV3NoTradeMissionPageEn() {
  if (!mission) throw new Error("Academy V3 reference mission is unavailable.");

  return (
    <main className="tecpey-motion-content-surface--dark min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="ltr">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] px-4 py-3 text-xs font-bold leading-6 text-cyan-100">
          V3 preview · this route creates no official learning authority, score, or mastery.
        </div>
        <AcademyV3MissionPreview mission={mission} locale="en" />
      </div>
    </main>
  );
}
