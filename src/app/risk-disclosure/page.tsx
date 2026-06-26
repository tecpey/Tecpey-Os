import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "بیانیه ریسک بازار رمزارز | تک‌پی",
  description: "بازار رمزارز پرنوسان است. این صفحه ریسک‌های مهم معامله، نگهداری و انتقال دارایی دیجیتال را به زبان ساده توضیح می‌دهد.",
  alternates: { canonical: "https://tecpey.ir/risk-disclosure" },
};

const sections = [{ title: "نوسان قیمت", body: "قیمت رمزارزها می‌تواند در زمان کوتاه تغییرات شدید داشته باشد. هیچ رشد یا سودی تضمین‌شده نیست و هر تصمیم باید متناسب با شرایط مالی، آگاهی و میزان ریسک‌پذیری شما باشد." },{ title: "ریسک انتقال و شبکه", body: "انتخاب شبکه اشتباه یا وارد کردن آدرس نادرست می‌تواند باعث از دست رفتن دارایی شود. قبل از هر انتقال، شبکه و آدرس مقصد باید با دقت بررسی شود." },{ title: "امنیت حساب", body: "رمز عبور ضعیف، عدم فعال‌سازی 2FA و کلیک روی لینک‌های ناشناس می‌تواند حساب کاربر را در معرض خطر قرار دهد. امنیت ترکیبی از زیرساخت و رفتار درست کاربر است." }];

export default function Page() {
  return (
    <main className="min-h-screen bg-[color:var(--tp-bg,#f7fbff)] pt-28 text-[color:var(--tp-text,#06111f)] dark:bg-[#06111f] dark:text-white">
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-500">
            <ShieldCheck className="h-4 w-4" />
            Risk Disclosure
          </div>
          <h1 className="mt-6 text-4xl font-black leading-tight sm:text-5xl">بیانیه ریسک بازار رمزارز</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-300">بازار رمزارز پرنوسان است. این صفحه ریسک‌های مهم معامله، نگهداری و انتقال دارایی دیجیتال را به زبان ساده توضیح می‌دهد.</p>
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
