import type { Metadata } from "next";
import { AdminControlPlaneMatrixPanel } from "@/components/admin/AdminControlPlaneMatrixPanel";

export const metadata: Metadata = {
  title: "Control Plane Matrix | TecPey Command Center",
  description: "Admin-visible matrix of TecPey modules, settings, connections, permissions and launch gates.",
  robots: { index: false, follow: false },
};

export default function CommandCenterControlPlanePage() {
  return <AdminControlPlaneMatrixPanel />;
}
