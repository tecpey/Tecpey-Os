import type { Metadata } from "next";
import { getAlternateLocales } from "@/lib/seo";
import Link from "next/link";
import { ArrowLeft, BadgeInfo, ReceiptText, Scale, ShieldQuestion } from "lucide-react";
import { TecpeyMark } from "@/components/brand/TecpeyMark";
import { ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "شفافیت تک‌پی | تک‌پی",
  description: "شفافیت قیمت، کارمزد، ریسک، قوانین و مسیر پشتیبانی در تک‌پی.",
  alternates: { canonical: "https://tecpey.ir/transparency", languages: getAlternateLocales("/transparency", "/en/transparency") },
};

const transparencyTracks = [
  {
    icon: ReceiptText,
    title: "قیمت و کارمزد",
    desc: "کاربر باید قبل از تأیید معامله بداند قیمت، کارمزد، شبکه انتقال و هزینه نهایی چگونه خوانده می‌شود.",
    href: "/fees",
    action: "بررسی کارمزدها",
  },
  {
    icon: ShieldQuestion,
    title: "ریسک و مسئولیت",
    desc: "بازار رمزارز پرنوسان است. تک‌پی باید ریسک را روشن توضیح بدهد و وعده سود قطعی نسازد.",
    href: "/risk-disclosure",
    action: "افشای ریسک",
  },
  {
    icon: Scale,
    title: "قوانین و محدودیت‌ها",
    desc: "قوانین حساب، احراز هویت، استفاده از سرویس و محدودیت‌های عملیاتی باید قبل از تصمیم قابل دسترس باشند.",
    href: "/rules",
    action: "مطالعه قوانین",
  },
];

const userChecks = [
  "آیا قیمت و هزینه نهایی را قبل از تأیید فهمیده‌ام؟",
  "آیا ریسک نوسان و اشتباه شبکه انتقال را در نظر گرفته‌ام؟",
  "آیا مسیر پشتیبانی رسمی را برای پیگیری احتمالی می‌شناسم؟",
];

export default function Page() {
  return (
    <ContentShell>
      <section className="relative isolate overflow-hidden px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.18),transparent_30%),radial-gradient(circle_at_15%_25%,rgba(37,99,235,.12),transparent_28%)]" />
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-600 dark:text-cyan-300">
              شفافیت قبل از معامله
            </div>
            <h1 className="mt-6 text-balance text-4xl font-black leading-[1.18] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
              اعتماد از جایی شروع می‌شود که کاربر هزینه، ریسک و قانون را واضح می‌بیند.
            </h1>
            <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
              تک‌پی شفافیت را بخشی از تجربه معامله می‌داند: قبل از اقدام مالی، اطلاعات باید ساده، دقیق و قابل پیگیری باشد.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/fees"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-cyan-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
              >
                کارمزدها و هزینه‌ها
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <Link
                href="/risk-disclosure"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-6 py-4 text-sm font-black text-slate-900 shadow-sm transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                ریسک را بخوان
              </Link>
            </div>
          </div>

          <aside className="rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-2xl shadow-cyan-500/10">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-white/8">
                <TecpeyMark alt="لوگوی رسمی تک‌پی" width={44} height={44} priority />
              </div>
              <div>
                <p className="text-sm font-black text-cyan-200">چک قبل از تأیید</p>
                <p className="mt-1 text-xs leading-6 text-white/65">معامله آگاهانه با سوال‌های درست شروع می‌شود.</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {userChecks.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/6 p-4">
                  <BadgeInfo className="mt-1 h-5 w-5 shrink-0 text-cyan-300" />
                  <p className="text-sm font-bold leading-7 text-white/78">{item}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-3">
          {transparencyTracks.map((item) => (
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
