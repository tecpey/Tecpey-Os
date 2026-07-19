import type { Metadata } from "next";
import { NotificationCenter } from "@/components/learning-os/NotificationCenter";

export const metadata: Metadata = {
  title: "مرکز اعلان‌های تک‌پی | آکادمی",
  description:
    "مشاهده اعلان‌های تأییدشده آکادمی، تریدینگ آرنا، منتور، امنیت و پشتیبانی در مرکز خصوصی اعلان‌های تک‌پی.",
  robots: { index: false, follow: false },
};

export default function AcademyNotificationsPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-slate-950 px-4 py-12 text-white">
      <section className="mx-auto max-w-4xl rounded-[34px] border border-cyan-300/20 bg-gradient-to-br from-cyan-500/15 to-violet-500/10 p-6 md:p-8">
        <p className="text-sm font-black text-cyan-100">مرکز اعلان‌های تک‌پی</p>
        <h1 className="mt-3 text-3xl font-black">اعلان‌های تأییدشده شما</h1>
        <p className="mt-4 text-sm font-bold leading-8 text-slate-300">
          پیام‌های ثبت‌شده آکادمی، آرنا، منتور، امنیت و پشتیبانی را در یک صندوق
          خصوصی مرور کنید. کانال‌های خارجی تا پیش از تأیید ارائه‌دهنده، کنترل‌های
          رضایت و شواهد تحویل، فعال معرفی نمی‌شوند.
        </p>
        <div className="mt-8">
          <NotificationCenter locale="fa" compact />
        </div>
      </section>
    </main>
  );
}
