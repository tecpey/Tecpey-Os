import type { Metadata } from "next";
import { AdminPasskeyAccessGate } from "@/components/admin/AdminPasskeyAccessGate";

export const metadata: Metadata = {
  title: "TecPey Enterprise Command Center",
  description: "Identity-bound operational control plane for TecPey.",
  robots: { index: false, follow: false },
};

export default function CommandCenterPage() {
  return <AdminPasskeyAccessGate />;
}
