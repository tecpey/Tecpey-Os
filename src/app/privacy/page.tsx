import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "حریم خصوصی کاربران تک‌پی | تک‌پی",
  description: "تک‌پی به حفاظت از اطلاعات کاربران، شفافیت در ارتباطات و استفاده مسئولانه از داده‌ها متعهد است.",
  alternates: { canonical: "https://tecpey.ir/privacy" },
};

const sections = [{ title: "اصل حداقل‌گرایی داده", body: "دریافت اطلاعات کاربران باید فقط در حد نیاز واقعی سرویس، امنیت حساب و الزامات ضروری انجام شود." },{ title: "امنیت ارتباطات", body: "اطلاعات تماس و ارتباطات کاربران باید در مسیرهای رسمی تک‌پی مدیریت شود و کاربران باید از ارسال اطلاعات حساس در کانال‌های ناشناس خودداری کنند." },{ title: "شفافیت با کاربر", body: "مسیرهای رسمی تماس با تک‌پی و روش پیگیری سوالات یا مشکلات به‌صورت روشن معرفی می‌شود." }];

export default function Page() {
  return (
    <main className="min-h-screen bg-[color:var(--tp-bg,#f7fbff)] pt-28 text-[color:var(--tp-text,#06111f)] dark:bg-[#06111f] dark:text-white">
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-500">
            <ShieldCheck className="h-4 w-4" />
            Privacy
          </div>
          <h1 className="mt-6 text-4xl font-black leading-tight sm:text-5xl">حریم خصوصی کاربران تک‌پی</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-300">تک‌پی به حفاظت از اطلاعات کاربران، شفافیت در ارتباطات و استفاده مسئولانه از داده‌ها متعهد است.</p>
          <div className="mt-8 grid gap-4">
            {sections.map((item) => (
              <div key={item.title} className="rounded-[30px] border border-slate-200 bg-white/82 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
                <h2 className="flex items-center gap-2 text-xl font-black">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  {item.title}
                </h2>
                <p className="mt-4 text-base leading-9 text-slate-600 dark:text-slate-300">{item.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/start-guide" className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white">
              راهنمای شروع
            </Link>
            <Link href="/contact-us" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-6 py-4 text-sm font-black dark:border-white/10 dark:bg-white/5">
              تماس با تک‌پی
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
