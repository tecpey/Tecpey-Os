import type { Metadata } from "next";
import { getAlternateLocales } from "@/lib/seo";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ShieldCheck, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "راهنمای آموزشی تبدیل رمزارز | تک‌پی",
  description: "صفحه آموزشی تبدیل رمزارز در تک‌پی؛ مشاهده بازارها، بررسی قیمت‌ها و تمرین بدون ریسک پیش از هر تصمیم پول‌واقعی.",
  alternates: { canonical: "https://tecpey.ir/swap", languages: getAlternateLocales("/swap", "/en/swap") },
};

const features = [
  { icon: Zap, title: "درک سریع", text: "بازارها را بررسی کنید و قبل از هر تصمیم، مسیر تبدیل را در فضای آموزشی بفهمید." },
  { icon: ShieldCheck, title: "امنیت و شفافیت", text: "جزئیات قیمت، کارمزد و ریسک باید قبل از هر اقدام پول‌واقعی برای کاربر روشن باشد." },
  { icon: RefreshCw, title: "تمرین بدون ریسک", text: "تک‌پی مسیر یادگیری و تمرین تبدیل رمزارز را بدون انجام معامله واقعی ساده‌تر می‌کند." },
];

export default function SwapPage() {
  return (
    <main className="min-h-screen bg-[color:var(--tp-bg,#f7fbff)] pt-28 text-[color:var(--tp-text,#06111f)] dark:bg-[#06111f] dark:text-white">
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-500">
            <RefreshCw className="h-4 w-4" />
            راهنمای آموزشی تبدیل رمزارز
          </div>
          <h1 className="mt-6 text-4xl font-black leading-tight sm:text-5xl">آموزش تبدیل رمزارز پیش از تصمیم پول‌واقعی</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-300">
            برای شروع، بازارها و قیمت‌های لحظه‌ای را بررسی کنید. مسیر پول‌واقعی تبدیل، واریز، برداشت و معامله تا پذیرش شواهد امنیتی، عملیاتی و انطباقی launch-gated باقی می‌ماند.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {features.map((item) => (
              <div key={item.title} className="rounded-[28px] border border-slate-200 bg-white/82 p-5 dark:border-white/10 dark:bg-white/5">
                <item.icon className="h-7 w-7 text-cyan-500" />
                <h2 className="mt-4 text-lg font-black">{item.title}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/markets" className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white">
              مشاهده بازارها
            </Link>
            <Link href="/academy/trading-arena" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-6 py-4 text-sm font-black dark:border-white/10 dark:bg-white/5">
              تمرین بدون ریسک
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
