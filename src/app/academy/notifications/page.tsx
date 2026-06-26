import type { Metadata } from "next";
import { NotificationCenter } from "@/components/learning-os/NotificationCenter";

export const metadata: Metadata = {
  title: "مرکز هوشمند اعلان‌های تک‌پی | بازگشت به مسیر یادگیری",
  description: "اعلان‌های هوشمند آکادمی، منتور، شبیه‌ساز، دستاوردها و جامعه تک‌پی.",
  robots: { index: false, follow: false },
};

export default function AcademyNotificationsPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-slate-950 px-4 py-12 text-white">
      <section className="mx-auto max-w-4xl rounded-[34px] border border-cyan-300/20 bg-gradient-to-br from-cyan-500/15 to-violet-500/10 p-6 md:p-8">
        <p className="text-sm font-black text-cyan-100">TecPey Intelligence Center</p>
        <h1 className="mt-3 text-3xl font-black">مرکز هوشمند اعلان‌ها</h1>
        <p className="mt-4 text-sm font-bold leading-8 text-slate-300">
          این مرکز برای نسخه وب، اندروید، iOS، ایمیل و تلگرام طراحی شده تا هر کاربر دقیقاً در زمان مناسب، پیام مناسب برای ادامه مسیر یادگیری و تمرین دریافت کند.
        </p>
        <div className="mt-8"><NotificationCenter locale="fa" compact /></div>
      </section>
    </main>
  );
}
