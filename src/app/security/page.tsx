import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  MonitorSmartphone,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "امنیت حساب و دارایی در تک‌پی | تک‌پی",
  description:
    "امنیت در تک‌پی؛ راهنمای احراز هویت، ورود امن، ضد فیشینگ، مدیریت دستگاه‌ها، نکات نگهداری رمزارز و کاهش ریسک کاربران ایرانی.",
  alternates: { canonical: "https://tecpey.ir/security" },
  keywords: ["امنیت تک پی", "امنیت صرافی ارز دیجیتال", "فیشینگ رمزارز", "احراز هویت دو مرحله‌ای", "امنیت حساب کاربری"],
};

const shieldItems = [
  {
    icon: Fingerprint,
    title: "احراز هویت امن",
    text: "مسیر شناسایی هویت در تک‌پی روشن، قابل پیگیری و متناسب با استانداردهای امنیت حساب طراحی شده است.",
  },
  {
    icon: KeyRound,
    title: "رمز عبور و ورود دومرحله‌ای",
    text: "شما می‌توانید حساب خود را با رمز قوی و کد تأیید محافظت کند و ورودهای مشکوک را جدی بگیرد.",
  },
  {
    icon: BellRing,
    title: "هشدار و اطلاع‌رسانی",
    text: "اطلاع از ورودهای جدید، تغییرات حساس و درخواست‌های امنیتی، ریسک سوءاستفاده را کاهش می‌دهد.",
  },
  {
    icon: MonitorSmartphone,
    title: "مدیریت دستگاه‌ها",
    text: "مشاهده دستگاه‌های فعال و خروج از نشست‌های ناشناس، یکی از ساده‌ترین ابزارهای کنترل امنیت است.",
  },
];

const learningCards = [
  {
    title: "فیشینگ چیست؟",
    text: "فیشینگ یعنی ساخت صفحه، پیام یا لینک جعلی برای گرفتن اطلاعات ورود یا کد تأیید. همیشه دامنه رسمی tecpey.ir را بررسی کنید.",
  },
  {
    title: "رمز عبور قوی چه ویژگی دارد؟",
    text: "رمز عبور باید طولانی، غیرتکراری و ترکیبی باشد. استفاده از رمز مشترک بین چند سایت، ریسک نفوذ را بالا می‌برد.",
  },
  {
    title: "قبل از انتقال رمزارز چه چک کنیم؟",
    text: "آدرس مقصد، شبکه انتقال، مبلغ، کارمزد شبکه و مقصد نهایی را قبل از تأیید چند بار بررسی کنید.",
  },
];

const accountChecklist = [
  "ایمیل و موبایل تأیید شده",
  "رمز عبور قوی و غیرتکراری",
  "ورود دومرحله‌ای فعال",
  "بررسی لینک و دامنه قبل از ورود",
  "عدم ارسال کد تأیید برای دیگران",
];

const faqs = [
  {
    q: "اگر رمز عبورم را فراموش کنم چه کار کنم؟",
    a: "از مسیر بازیابی رمز عبور و کانال‌های رسمی تک‌پی اقدام کنید و هرگز کد تأیید را برای افراد ناشناس ارسال نکنید.",
  },
  {
    q: "اگر روی لینک مشکوک کلیک کردم چه کنم؟",
    a: "رمز عبور را تغییر دهید، نشست‌های فعال را بررسی کنید و موضوع را از طریق پشتیبانی رسمی تک‌پی پیگیری کنید.",
  },
  {
    q: "آیا امنیت فقط وظیفه صرافی است؟",
    a: "خیر. زیرساخت امن مهم است، اما رفتار کاربر مثل استفاده از رمز قوی، بررسی دامنه و مراقبت از کد تأیید هم حیاتی است.",
  },
];

export default function SecurityPage() {
  return (
    <ContentShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />

      <section className="relative isolate overflow-hidden px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.22),transparent_32%),radial-gradient(circle_at_15%_25%,rgba(37,99,235,.14),transparent_30%)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-500">
              <ShieldCheck className="h-4 w-4" />
              مرکز امنیت تک‌پی
            </div>
            <h1 className="mt-6 text-balance text-4xl font-black leading-[1.18] tracking-tight sm:text-5xl lg:text-6xl">
              دارایی و حساب شما در اولویت اول تک‌پی است
            </h1>
            <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
              از ورود امن و احراز هویت تا آموزش ضد فیشینگ و بررسی ریسک انتقال؛ تک‌پی امنیت را فقط یک شعار نمی‌داند، بلکه آن را بخشی از تجربه روزانه کاربر می‌سازد.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="https://my.tecpey.ir/signup" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5">
                ساخت حساب امن
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <Link href="/contact-us" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-6 py-4 text-sm font-black text-slate-900 backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white">
                گزارش مورد مشکوک
                <Siren className="h-5 w-5 text-cyan-500" />
              </Link>
            </div>
          </div>

          <div className="rounded-[34px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.18),transparent_34%),linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-2xl shadow-cyan-500/10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-cyan-200">وضعیت امنیت حساب</p>
                <h2 className="mt-2 text-2xl font-black">چک‌لیست شروع امن</h2>
              </div>
              <LockKeyhole className="h-10 w-10 text-cyan-300" />
            </div>
            <div className="mt-6 space-y-3">
              {accountChecklist.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/6 p-4">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                  <span className="text-sm font-bold text-white/88">{item}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-7 text-white/65">
              این چک‌لیست جایگزین تصمیم امنیتی نیست؛ اما کمک می‌کند قبل از اولین معامله، حساب خود را اصولی‌تر آماده کنید.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-black">سپر امنیتی تک‌پی</h2>
          <p className="mt-3 max-w-3xl text-sm leading-8 text-slate-600 dark:text-slate-300">
            امنیت واقعی از ترکیب زیرساخت، آموزش، هشدارهای درست و رفتار آگاهانه کاربر ساخته می‌شود.
          </p>
          <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {shieldItems.map((item) => (
              <div key={item.title} className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
                <item.icon className="h-8 w-8 text-cyan-500" />
                <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-8 text-slate-600 dark:text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-[34px] border border-slate-200 bg-white/85 p-6 dark:border-white/10 dark:bg-white/5">
            <ShieldAlert className="h-10 w-10 text-amber-500" />
            <h2 className="mt-4 text-2xl font-black">امنیت فقط تکنولوژی نیست</h2>
            <p className="mt-4 text-sm leading-8 text-slate-600 dark:text-slate-300">
              بخش مهمی از امنیت به انتخاب‌های روزانه کاربر بستگی دارد؛ از بررسی لینک ورود تا نگهداری رمز عبور و دقت در شبکه انتقال رمزارز.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {learningCards.map((item) => (
              <div key={item.title} className="rounded-3xl border border-slate-200 bg-white/82 p-5 dark:border-white/10 dark:bg-white/5">
                <h3 className="text-lg font-black">{item.title}</h3>
                <p className="mt-3 text-sm leading-8 text-slate-600 dark:text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-black">سوالات پرتکرار امنیت</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {faqs.map((item) => (
              <div key={item.q} className="rounded-3xl border border-slate-200 bg-white/82 p-5 dark:border-white/10 dark:bg-white/5">
                <h3 className="text-base font-black">{item.q}</h3>
                <p className="mt-3 text-sm leading-8 text-slate-600 dark:text-slate-300">{item.a}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-[34px] border border-cyan-400/20 bg-cyan-500 p-7 text-white shadow-xl shadow-cyan-500/20">
            <h2 className="text-2xl font-black">با خیال راحت‌تر شروع کنید</h2>
            <p className="mt-3 max-w-3xl text-sm leading-8 text-white/85">
              اگر قبل از ثبت‌نام یا اولین معامله درباره امنیت حساب، احراز هویت یا انتقال رمزارز سوال دارید، از مسیرهای رسمی تک‌پی با ما در ارتباط باشید.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link href="https://my.tecpey.ir/signup" className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-4 text-sm font-black text-cyan-700">
                ایجاد حساب کاربری
              </Link>
              <Link href="/support" className="inline-flex items-center justify-center rounded-2xl border border-white/30 px-6 py-4 text-sm font-black text-white">
                مرکز پشتیبانی
              </Link>
            </div>
          </div>
        </div>
      </section>
    </ContentShell>
  );
}
