import type { Metadata } from "next";
import { CommunicationProviderControlPanel } from "@/components/admin/CommunicationProviderControlPanel";

export const metadata: Metadata = {
  title: "Communication Providers | TecPey Command Center",
  description: "Secret-safe SMS and email provider configuration for TecPey.",
  robots: { index: false, follow: false },
};

export default function CommandCenterCommunicationsPage() {
  return (
    <main className="min-h-screen bg-[#030914] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <CommunicationProviderControlPanel />
      </div>
    </main>
  );
}
