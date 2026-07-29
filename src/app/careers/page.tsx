import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "همکاری با تک‌پی | فرصت‌های همکاری و رشد",
  description: "صفحه همکاری با تک‌پی برای جذب همکاران، تیم‌های محتوایی، فنی، پشتیبانی و شرکای رشد در مسیر توسعه صرافی رمزارز تک‌پی.",
  alternates: { canonical: "https://tecpey.ir/careers" },
};

const items = [
  "همکاری در تولید محتوا و آکادمی رمزارز",
  "همکاری در پشتیبانی و ارتباط با کاربران",
  "همکاری فنی و توسعه محصول",
  "همکاری در رشد، بازاریابی و شبکه‌های اجتماعی",
];

export default function CareersPage() {
  return (
    <main className="min-h-screen bg-[color:var(--tp-bg,#f7fbff)] pt-28 text-[color:var(--tp-text,#06111f)] dark:bg-[#06111f] dark:text-white">
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-500">
            <BriefcaseBusiness className="h-4 w-4" />
            همکاری با تک‌پی
          </div>
          <h1 className="mt-6 text-4xl font-black leading-tight sm:text-5xl">با تک‌پی در ساخت یک تجربه مالی شفاف‌تر همراه شوید</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-300">
            تک‌پی برای رشد یک پلتفرم امن، آموزشی و کاربرمحور به همکاری افراد حرفه‌ای در حوزه محصول، محتوا، پشتیبانی، فناوری و رشد نیاز دارد.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <div key={item} className="rounded-[28px] border border-slate-200 bg-white/82 p-5 dark:border-white/10 dark:bg-white/5">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/contact-us" className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white">
              ارسال درخواست همکاری
            </Link>
            <Link href="/why-tecpey" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-6 py-4 text-sm font-black dark:border-white/10 dark:bg-white/5">
              چرا تک‌پی؟
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
