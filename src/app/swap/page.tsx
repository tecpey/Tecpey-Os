import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ShieldCheck, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "تبدیل سریع رمزارز | تک‌پی",
  description: "صفحه راهنمای تبدیل سریع رمزارز در تک‌پی؛ مشاهده بازارها، بررسی قیمت‌ها و شروع معامله با مسیر شفاف و امن.",
  alternates: { canonical: "https://tecpey.ir/swap" },
};

const features = [
  { icon: Zap, title: "شروع سریع", text: "بازارها را بررسی کنید و با مسیر ساده وارد معامله شوید." },
  { icon: ShieldCheck, title: "امنیت و شفافیت", text: "جزئیات قیمت، کارمزد و مسیر معامله باید قبل از تأیید برای کاربر روشن باشد." },
  { icon: RefreshCw, title: "تجربه ساده", text: "تک‌پی تجربه تبدیل و معامله رمزارز را برای کاربر فارسی‌زبان قابل فهم‌تر می‌کند." },
];

export default function SwapPage() {
  return (
    <main className="min-h-screen bg-[color:var(--tp-bg,#f7fbff)] pt-28 text-[color:var(--tp-text,#06111f)] dark:bg-[#06111f] dark:text-white">
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-500">
            <RefreshCw className="h-4 w-4" />
            تبدیل رمزارز
          </div>
          <h1 className="mt-6 text-4xl font-black leading-tight sm:text-5xl">تبدیل و معامله رمزارز در تک‌پی</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-300">
            برای شروع، بازارها و قیمت‌های لحظه‌ای را بررسی کنید. تک‌پی مسیر مشاهده بازار، ثبت‌نام و ورود به معامله را شفاف‌تر و ساده‌تر می‌کند.
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
            <Link href="/start-guide" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-6 py-4 text-sm font-black dark:border-white/10 dark:bg-white/5">
              راهنمای شروع
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
