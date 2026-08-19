import type { Metadata } from "next";
import { getAlternateLocales } from "@/lib/seo";
import Link from "next/link";
import { ArrowLeft, BookOpenCheck, LifeBuoy, MailCheck, ShieldAlert } from "lucide-react";
import { TecpeyMark } from "@/components/brand/TecpeyMark";
import { ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "مرکز پشتیبانی تک‌پی | تک‌پی",
  description: "پشتیبانی فارسی برای حساب، امنیت، کارمزد، بازار و مسیر شروع آگاهانه در تک‌پی.",
  alternates: { canonical: "https://tecpey.ir/support", languages: getAlternateLocales("/support", "/en/support") },
};

const supportPaths = [
  {
    icon: LifeBuoy,
    title: "مشکل حساب یا ورود",
    desc: "اگر ثبت‌نام، ورود، احراز هویت یا دسترسی حساب نامشخص است، از مسیر رسمی تماس شروع کنید.",
    href: "/contact-us",
    action: "ثبت درخواست",
  },
  {
    icon: ShieldAlert,
    title: "گزارش امنیتی",
    desc: "برای لینک مشکوک، پیام جعلی، تلاش ورود ناشناس یا نگرانی امنیتی، صفحه امنیت را قبل از ادامه بررسی کنید.",
    href: "/security",
    action: "بررسی امنیت",
  },
  {
    icon: BookOpenCheck,
    title: "سوال آموزشی",
    desc: "برای سوال‌های شروع، ریسک، کارمزد و مفاهیم پایه، اول راهنمای آکادمی و FAQ را بخوانید.",
    href: "/faq",
    action: "مشاهده FAQ",
  },
];

const beforeContact = [
  "آدرس ایمیل یا شماره مرتبط با حساب را آماده داشته باش.",
  "برای مسائل مالی، اسکرین‌شات و زمان رخداد را بدون ارسال رمز یا کد تایید نگه دار.",
  "فقط از مسیرهای رسمی تک‌پی پیگیری کن و به پیام‌های ناشناس پاسخ نده.",
];

export default function Page() {
  return (
    <ContentShell>
      <section className="relative isolate overflow-hidden px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.18),transparent_30%),radial-gradient(circle_at_15%_25%,rgba(37,99,235,.12),transparent_28%)]" />
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-600 dark:text-cyan-300">
              مرکز پاسخ‌گویی رسمی
            </div>
            <h1 className="mt-6 text-balance text-4xl font-black leading-[1.18] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
              وقتی سوال مالی داری، مسیر پاسخ باید امن و قابل پیگیری باشد.
            </h1>
            <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
              پشتیبانی تک‌پی برای حساب، امنیت، کارمزد، بازار و شروع آگاهانه از مسیرهای رسمی راهنمایی می‌دهد.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/contact-us"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-cyan-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
              >
                ارتباط با تک‌پی
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <Link
                href="/security"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-6 py-4 text-sm font-black text-slate-900 shadow-sm transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                اول امنیت حساب
              </Link>
            </div>
          </div>

          <aside className="rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-2xl shadow-cyan-500/10">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-white/8">
                <TecpeyMark alt="لوگوی رسمی تک‌پی" width={44} height={44} priority />
              </div>
              <div>
                <p className="text-sm font-black text-cyan-200">قبل از ارسال پیام</p>
                <p className="mt-1 text-xs leading-6 text-white/65">اطلاعات حساس را فقط در مسیر رسمی وارد کن.</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {beforeContact.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/6 p-4">
                  <MailCheck className="mt-1 h-5 w-5 shrink-0 text-cyan-300" />
                  <p className="text-sm font-bold leading-7 text-white/78">{item}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-3">
          {supportPaths.map((item) => (
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
