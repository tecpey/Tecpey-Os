import type { Metadata } from "next";
import { AuthProviderControlPanel } from "@/components/admin/AuthProviderControlPanel";

export const metadata: Metadata = {
  title: "Auth Provider Control | TecPey Command Center",
  description: "Admin-gated control surface for TecPey sign-in providers.",
  robots: { index: false, follow: false },
};

export default function CommandCenterAuthProvidersPage() {
  return (
    <main className="min-h-screen bg-[#030914] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <AuthProviderControlPanel />
      </div>
    </main>
  );
}
