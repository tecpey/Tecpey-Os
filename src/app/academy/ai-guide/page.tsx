import type { Metadata } from "next";
import Link from "next/link";
import { ContentShell } from "@/components/content/ContentUI";
import { MessageCircleQuestion, ShieldCheck, BookOpenCheck, AlertTriangle, CheckCircle2, BrainCircuit } from "lucide-react";
import { AiMentorExperience } from "@/components/academy/AiMentorExperience";

export const metadata: Metadata = {
  title: "دستیار هوشمند آکادمی تک‌پی | پرسش و پاسخ آموزشی رمزارز",
  description: "سناریوی دستیار آموزشی آکادمی تک‌پی برای پاسخ به سوال‌های مفهومی، امنیتی و آموزشی کاربران؛ بدون سیگنال خرید و فروش یا توصیه مالی.",
  alternates: { canonical: "https://tecpey.ir/academy/ai-guide" },
};


const guardrails = [
  "نباید سود، قیمت آینده یا نتیجه مالی را تضمین کند.",
  "نباید سیگنال خرید و فروش شخصی بدهد.",
  "باید کاربر را به مدیریت ریسک، امنیت و تحقیق شخصی هدایت کند.",
  "باید اگر سؤال خارج از آموزش بود، پاسخ را محدود و محتاط کند.",
  "باید در موضوعات امنیتی مثل Seed Phrase، هشدار واضح و عملی بدهد.",
];

export default function AcademyAiGuidePage() {
  return (
    <ContentShell>
      <main className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/academy" className="text-sm font-black text-cyan-400">بازگشت به آکادمی</Link>
          <section className="mt-6 rounded-[40px] border border-violet-300/20 bg-[#07111f] p-7 shadow-[0_35px_100px_rgba(124,58,237,.18)] sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-4 py-2 text-xs font-black text-violet-100">
                  <MessageCircleQuestion className="h-4 w-4" />
                  دستیار آموزشی، نه مشاور سرمایه‌گذاری
                </div>
                <h1 className="mt-5 text-4xl font-black leading-tight text-white sm:text-5xl">چت هوشمند آکادمی تک‌پی؛ پاسخ به ابهام‌ها قبل از تصمیم</h1>
                <p className="mt-5 text-base font-bold leading-9 text-slate-300">
                  این بخش برای کامل‌تر کردن تجربه یادگیری طراحی شده است. کاربر بعد از هر درس می‌تواند سؤال بپرسد، مثال ساده‌تر بگیرد، چک‌لیست مرور دریافت کند و مطمئن شود مفهوم را فهمیده است. مرز اصلی آن روشن است: آموزش، امنیت و توضیح مفهومی؛ نه سیگنال خرید و فروش.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/academy/mentor-coach" className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">مشاهده مربی شخصی‌سازی‌شده</Link>
                  <Link href="/academy/profile" className="rounded-2xl border border-cyan-300/30 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/10">داشبورد پیشرفت</Link>
                </div>
              </div>
              <div className="rounded-[32px] border border-cyan-300/20 bg-cyan-500/10 p-5">
                <div className="rounded-3xl bg-slate-950/70 p-5 shadow-[0_20px_60px_rgba(34,211,238,.12)]">
                  <p className="text-xs font-black text-cyan-300">گفتگوی زنده با مربی</p>
                  <h2 className="mt-3 text-2xl font-black leading-9 text-white">سؤالت را بپرس؛ مربی پاسخ آموزشی می‌دهد</h2>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.055] p-4 text-sm font-black leading-7 text-slate-100">
                    مثلاً: Seed Phrase را چطور امن نگه دارم؟
                  </div>
                  <Link href="#mentor-chat" className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-cyan-500 px-5 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:bg-cyan-400">باز کردن کادر پرسش از مربی</Link>
                </div>
              </div>
            </div>
          </section>

          <section id="mentor-chat" className="mt-8 scroll-mt-28">
            <AiMentorExperience />
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="rounded-[32px] border border-cyan-300/15 bg-white/90 p-6 dark:bg-white/[0.055]">
              <BookOpenCheck className="h-8 w-8 text-cyan-400" />
              <h2 className="mt-4 text-2xl font-black text-slate-950 dark:text-white">کجا استفاده شود؟</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">در صفحه هر ترم، کنار درس‌ها و بعد از آزمون؛ جایی که کاربر تازه یک مفهوم را دیده و نیاز به توضیح ساده‌تر، مثال یا مرور دارد.</p>
            </div>
            <div className="rounded-[32px] border border-emerald-300/15 bg-white/90 p-6 dark:bg-white/[0.055]">
              <ShieldCheck className="h-8 w-8 text-emerald-400" />
              <h2 className="mt-4 text-2xl font-black text-slate-950 dark:text-white">چه کاری انجام دهد؟</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">تعریف ساده، مثال واقعی، چک‌لیست، مقایسه مفاهیم، مرور آزمون و هشدار امنیتی. پاسخ‌ها باید آموزشی و محتاط باشند.</p>
            </div>
            <div className="rounded-[32px] border border-rose-300/15 bg-white/90 p-6 dark:bg-white/[0.055]">
              <AlertTriangle className="h-8 w-8 text-rose-400" />
              <h2 className="mt-4 text-2xl font-black text-slate-950 dark:text-white">چه کاری نکند؟</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">پیش‌بینی قیمت، سیگنال خرید و فروش، وعده سود، تحلیل شخصی پرریسک یا درخواست اطلاعات محرمانه مثل Seed Phrase.</p>
            </div>
          </section>

          <section className="mt-8 rounded-[34px] border border-cyan-300/20 bg-cyan-500/10 p-6">
            <h2 className="text-2xl font-black text-white">سؤالت را مستقیم از مربی بپرس</h2>
            <p className="mt-3 text-sm font-bold leading-8 text-cyan-50">برای دریافت پاسخ دقیق‌تر، سؤال آموزشی خودت را در کادر مربی هوشمند همین صفحه بنویس. مربی پاسخ را با تمرکز بر آموزش، امنیت و مدیریت ریسک ارائه می‌کند.</p>
            <Link href="#mentor-chat" className="mt-5 inline-flex rounded-2xl bg-cyan-500 px-5 py-4 text-sm font-black text-white transition hover:bg-cyan-400">رفتن به کادر سؤال از مربی</Link>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-[34px] border border-cyan-300/20 bg-white/90 p-6 dark:bg-white/[0.055]">
              <BrainCircuit className="h-8 w-8 text-cyan-400" />
              <h2 className="mt-4 text-2xl font-black text-slate-950 dark:text-white">مربی چگونه به تو کمک می‌کند؟</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">هر سؤال به یک پاسخ آموزشی، درس مرتبط، چک‌لیست عملی و قدم بعدی وصل می‌شود. هدف این است که ابهامت قبل از تصمیم کمتر شود و مسیر یادگیری‌ات واضح‌تر جلو برود.</p>
            </div>
            <div className="rounded-[34px] border border-violet-300/20 bg-white/90 p-6 dark:bg-white/[0.055]">
              <ShieldCheck className="h-8 w-8 text-violet-400" />
              <h2 className="mt-4 text-2xl font-black text-slate-950 dark:text-white">حریم خصوصی و امنیت سؤال‌ها</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">برای گرفتن پاسخ بهتر، فقط سؤال آموزشی خودت را بنویس. هیچ‌وقت Seed Phrase، رمز عبور، کد 2FA، کلیدهای محرمانه یا اطلاعات محرمانه مالی را برای هیچ شخص یا رباتی ارسال نکن.</p>
            </div>
          </section>

          <section className="mt-8 rounded-[34px] border border-amber-300/20 bg-amber-500/10 p-6">
            <h2 className="text-2xl font-black text-white">قوانین ایمنی پاسخ‌گویی</h2>
            <div className="mt-5 grid gap-3">
              {guardrails.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl bg-white/10 p-4 text-sm font-bold leading-7 text-amber-50">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-amber-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </ContentShell>
  );
}
