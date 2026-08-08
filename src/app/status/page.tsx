import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BellRing, Gauge, LifeBuoy, ShieldCheck } from "lucide-react";
import { ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "وضعیت سرویس‌های تک‌پی | تک‌پی",
  description: "مرجع وضعیت سرویس‌های عمومی، بازار، پشتیبانی و اطلاعیه‌های رسمی تک‌پی.",
  alternates: { canonical: "https://tecpey.ir/status" },
};

const serviceRows = [
  {
    icon: Gauge,
    title: "مارکت برد و مسیر بازار",
    desc: "برای مشاهده قیمت‌ها و مسیر ورود به معامله، ابتدا وضعیت نمایش بازار را از صفحه رسمی بررسی کن.",
    href: "/markets",
    action: "مشاهده بازار",
  },
  {
    icon: LifeBuoy,
    title: "پشتیبانی و ارتباط رسمی",
    desc: "اگر پاسخ یا پیگیری لازم داری، از مسیرهای رسمی پشتیبانی استفاده کن تا درخواست قابل ردیابی بماند.",
    href: "/support",
    action: "مرکز پشتیبانی",
  },
  {
    icon: ShieldCheck,
    title: "اطلاعیه‌های امنیتی",
    desc: "برای لینک‌های مشکوک، پیام‌های ناشناس یا تغییرات مهم حساب، صفحه امنیت مرجع شروع بررسی است.",
    href: "/security",
    action: "مرکز امنیت",
  },
];

const statusPrinciples = [
  "وضعیت سرویس باید با زبان روشن و بدون بزرگ‌نمایی اعلام شود.",
  "اطلاعیه رسمی باید کاربر را به اقدام بعدی هدایت کند، نه فقط خبر بدهد.",
  "در رخدادهای حساس مالی، امنیت حساب و مسیر پشتیبانی جلوتر از معامله قرار می‌گیرد.",
];

export default function Page() {
  return (
    <ContentShell>
      <section className="relative isolate overflow-hidden px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.18),transparent_30%),radial-gradient(circle_at_15%_25%,rgba(37,99,235,.12),transparent_28%)]" />
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.95fr_1.05fr] lg:items-center">
          <aside className="order-2 rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-2xl shadow-cyan-500/10 lg:order-1">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-black text-cyan-200">مرجع وضعیت عمومی</p>
                <p className="mt-2 text-xs leading-6 text-white/65">وضعیت عملیاتی باید از مسیر رسمی و قابل فهم اعلام شود.</p>
              </div>
              <Image src="/logo.png" alt="لوگوی رسمی تک‌پی" width={54} height={54} priority />
            </div>
            <div className="mt-5 space-y-3">
              {statusPrinciples.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/6 p-4">
                  <BellRing className="mt-1 h-5 w-5 shrink-0 text-cyan-300" />
                  <p className="text-sm font-bold leading-7 text-white/78">{item}</p>
                </div>
              ))}
            </div>
          </aside>

          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-600 dark:text-cyan-300">
              وضعیت و اطلاعیه رسمی
            </div>
            <h1 className="mt-6 text-balance text-4xl font-black leading-[1.18] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
              کاربر باید قبل از اقدام مالی بداند سرویس‌ها از کدام مسیر پیگیری می‌شوند.
            </h1>
            <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
              این صفحه نقطه شروع برای وضعیت بازار، پشتیبانی، امنیت حساب و اطلاعیه‌های رسمی تک‌پی است.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/markets"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-cyan-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
              >
                مشاهده بازارها
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <Link
                href="/support"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-6 py-4 text-sm font-black text-slate-900 shadow-sm transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                پیگیری از پشتیبانی
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-3">
          {serviceRows.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="group flex min-h-[260px] flex-col rounded-[28px] border border-slate-200 bg-white/85 p-6 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-xl hover:shadow-cyan-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-white/10 dark:bg-white/5"
            >
              <item.icon className="h-8 w-8 text-cyan-600 dark:text-cyan-300" />
              <h2 className="mt-5 text-xl font-black leading-8 text-slate-950 dark:text-white">{item.title}</h2>
              <p className="mt-3 flex-1 text-sm leading-8 text-slate-600 dark:text-slate-300">{item.desc}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-cyan-700 dark:text-cyan-300">
                {item.action}
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </ContentShell>
  );
}
