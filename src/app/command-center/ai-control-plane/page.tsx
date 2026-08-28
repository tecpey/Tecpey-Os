import type { Metadata } from "next";
import { AiControlPlanePanel } from "@/components/admin/AiControlPlanePanel";
import { AiAutomationPanel } from "@/components/admin/AiAutomationPanel";

export const metadata: Metadata = {
  title: "AI Control Plane | TecPey Command Center",
  description: "Governed provider, agent, workflow and AI knowledge controls for TecPey.",
  robots: { index: false, follow: false },
};

export default function AiControlPlanePage() {
  return (
    <main className="min-h-screen bg-[#030914] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1500px]">
        <AiControlPlanePanel />
        <AiAutomationPanel />
      </div>
    </main>
  );
}
