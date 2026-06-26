import type { Metadata } from "next";
import Link from "next/link";
import { Brain, CalendarCheck2, CheckCircle2, ClipboardCheck, GraduationCap, ShieldCheck, Target, TriangleAlert } from "lucide-react";
import { ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "ارزیابی نهایی آکادمی تک‌پی | آیا آماده ورود آگاهانه به بازار هستید؟",
  description: "چک‌لیست نهایی TecPey Academy برای سنجش دانش رمزارز، امنیت، تحلیل، مدیریت ریسک و آمادگی رفتاری پیش از ورود مسئولانه به بازار.",
  alternates: { canonical: "https://tecpey.ir/academy/final-assessment" },
};

const readiness = [
  {
    title: "دانش پایه بازار",
    icon: Brain,
    checks: ["می‌توانم بیت‌کوین، بلاکچین، کوین، توکن و استیبل‌کوین را با مثال توضیح بدهم.", "می‌دانم قیمت پایین واحدی به معنی ارزندگی نیست.", "Market Cap، حجم و نقدشوندگی را کنار قیمت می‌بینم."],
  },
  {
    title: "امنیت دارایی",
    icon: ShieldCheck,
    checks: ["Seed Phrase و Private Key را هرگز آنلاین ذخیره یا ارسال نمی‌کنم.", "2FA، رمز یکتا و دامنه رسمی را جدی می‌گیرم.", "قبل از انتقال، شبکه و آدرس را چندبار بررسی می‌کنم."],
  },
  {
    title: "تحلیل و تحقیق",
    icon: ClipboardCheck,
    checks: ["برای پروژه‌ها پرونده کوتاه شامل تیم، کاربرد، Tokenomics، FDV، Vesting و Red Flag می‌سازم.", "تحلیل تکنیکال را احتمال می‌دانم، نه قطعیت.", "بدون نقطه ابطال و سناریوی اشتباه بودن وارد تصمیم نمی‌شوم."],
  },
  {
    title: "مدیریت ریسک",
    icon: Target,
    checks: ["قبل از سود، مقدار زیان قابل تحمل را مشخص می‌کنم.", "Position Size را با حد ضرر و کل سرمایه هماهنگ می‌کنم.", "بعد از ضررهای پی‌درپی قانون توقف دارم."],
  },
  {
    title: "روانشناسی تصمیم",
    icon: GraduationCap,
    checks: ["FOMO، طمع، ترس و معامله انتقامی را به عنوان ریسک رفتاری می‌شناسم.", "قبل از تصمیم‌های هیجانی مکث و ژورنال می‌نویسم.", "می‌دانم هدف آکادمی وعده سود نیست؛ تصمیم مسئولانه است."],
  },
];

const blockers = [
  "هنوز نمی‌توانم Seed Phrase را دقیق توضیح بدهم.",
  "هنوز با دیدن پامپ یا تبلیغ، بدون چک‌لیست وارد می‌شوم.",
  "هنوز فرق Market Cap، FDV و قیمت واحد را نمی‌فهمم.",
  "هنوز برای معامله حد ضرر یا نقطه ابطال نمی‌نویسم.",
  "هنوز بعد از ضرر دنبال جبران فوری می‌روم.",
];

export default function FinalAssessmentPage() {
  return (
    <ContentShell>
      <main className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-[38px] border border-cyan-300/15 bg-[#06111f] p-7 shadow-[0_35px_110px_rgba(34,211,238,.12)] lg:p-10">
            <p className="text-sm font-black text-cyan-300">TecPey Academy Final Assessment</p>
            <h1 className="mt-4 text-balance text-4xl font-black leading-[1.2] text-white sm:text-5xl">آیا برای ورود آگاهانه به بازار آماده هستید؟</h1>
            <p className="mt-5 max-w-4xl text-base font-bold leading-9 text-slate-300">
              این صفحه پایان مسیر آموزشی نیست؛ نقطه کنترل قبل از اقدام واقعی است. اگر در هر بخش هنوز ابهام دارید، به ترم مرتبط برگردید و از AI Mentor تک‌پی سؤال بپرسید. هدف تک‌پی وعده سود نیست؛ هدف ورود امن‌تر، آگاهانه‌تر و مسئولانه‌تر است.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/academy/profile" className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">مشاهده داشبورد پیشرفت</Link>
              <Link href="/academy/specialized-program" className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-400">درخواست ورود به دوره تخصصی</Link>
              <Link href="/academy/ai-guide" className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15">سؤال از مربی هوشمند</Link>
            </div>
          </section>

          <section className="mt-8 grid gap-5 lg:grid-cols-5">
            {readiness.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-[30px] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-cyan-300/10 dark:bg-white/[0.055]">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-500"><Icon className="h-6 w-6" /></div>
                  <h2 className="mt-4 text-lg font-black text-slate-950 dark:text-white">{item.title}</h2>
                  <ul className="mt-4 space-y-3">
                    {item.checks.map((check) => (
                      <li key={check} className="flex gap-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />{check}</li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </section>

          <section className="mt-8 rounded-[34px] border border-cyan-300/20 bg-cyan-500/10 p-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 text-cyan-700 dark:text-cyan-100"><CalendarCheck2 className="h-6 w-6" /><h2 className="text-2xl font-black">قدم بعدی بعد از پایان مسیر پایه</h2></div>
                <p className="mt-4 max-w-4xl text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">
                  اگر تمام ۷ ترم، تمرین‌های سناریویی و چک‌لیست آمادگی را کامل کرده‌اید، می‌توانید برای دوره تخصصی حضوری یا آنلاین آکادمی تک‌پی درخواست بررسی ثبت کنید. این مرحله برای آموزش عمیق‌تر و بازخورد ساختاریافته است؛ نه سیگنال و نه وعده سود.
                </p>
              </div>
              <Link href="/academy/specialized-program" className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">ثبت درخواست بررسی دوره تخصصی</Link>
            </div>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-[34px] border border-amber-300/25 bg-amber-400/10 p-6">
              <div className="flex items-center gap-3 text-amber-700 dark:text-amber-100"><TriangleAlert className="h-6 w-6" /><h2 className="text-2xl font-black">اگر این موارد را دارید، هنوز آماده نیستید</h2></div>
              <ul className="mt-5 space-y-3">
                {blockers.map((item) => <li key={item} className="text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">• {item}</li>)}
              </ul>
            </div>
            <div className="rounded-[34px] border border-emerald-300/25 bg-emerald-400/10 p-6">
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">نتیجه مطلوب آکادمی</h2>
              <p className="mt-4 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">
                بعد از پایان مسیر، کاربر نباید احساس کند استاد بازار شده است؛ باید احساس کند دیگر یک تازه‌وارد بی‌دفاع نیست. او باید بداند چه چیزی را نمی‌داند، چگونه سؤال درست بپرسد، چگونه از سرمایه محافظت کند و چگونه بدون هیجان وارد تصمیم شود.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/academy/practice-lab" className="inline-flex rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-400">تمرین سناریو در Practice Lab</Link>
                <Link href="/markets" className="inline-flex rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-5 py-3 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/15">مشاهده بازار با ذهن آماده</Link>
                <Link href="/academy/specialized-program" className="inline-flex rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15">ورود به لیست بررسی دوره تخصصی</Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </ContentShell>
  );
}
