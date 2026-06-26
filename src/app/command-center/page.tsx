import type { Metadata } from "next";
import { CommandCenterDashboard } from "@/components/admin/CommandCenterDashboard";
import { isAdminConfigured } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "TecPey Command Center",
  description: "Protected operational console for TecPey Learning OS.",
  robots: { index: false, follow: false },
};

function CommandCenterLocked() {
  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <section className="w-full max-w-xl rounded-[34px] border border-cyan-300/20 bg-white/[0.06] p-8 text-center shadow-2xl shadow-cyan-500/10">
        <p className="mx-auto inline-flex rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-100">
          TecPey Command Center
        </p>
        <h1 className="mt-5 text-2xl font-black md:text-4xl">مرکز فرماندهی محافظت شده است</h1>
        <p className="mt-4 text-sm font-bold leading-8 text-slate-300">
          دسترسی به پنل عملیاتی فقط پس از فعال‌سازی تنظیمات مدیریتی و احراز هویت مجاز امکان‌پذیر است.
        </p>
      </section>
    </main>
  );
}

export default function CommandCenterPage() {
  if (!isAdminConfigured()) return <CommandCenterLocked />;
  return <CommandCenterDashboard />;
}
