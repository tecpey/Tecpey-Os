import { StructuredData } from "@/components/seo/StructuredData";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpenCheck, CheckCircle2, ShieldCheck, TrendingUp, WalletCards } from "lucide-react";
import { ContentHero, ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "راهنمای شروع در تک‌پی | مسیر امن ورود به بازار رمزارز",
  description: "مسیر عملی شروع در تک‌پی: آموزش پایه، امنیت حساب، مشاهده بازار، تمرین تصمیم و ورود مرحله‌ای به معامله.",
  alternates: { canonical: "https://tecpey.ir/start-guide" },
};

const steps = [
  { icon: BookOpenCheck, title: "۱. از آموزش پایه شروع کن", desc: "اول بیت‌کوین، تتر، کیف پول، شبکه انتقال و کارمزد را بفهم. اگر یک اصطلاح را نمی‌دانی، قبل از معامله از مربی هوشمند بپرس.", href: "/academy" },
  { icon: ShieldCheck, title: "۲. حساب و دارایی را امن کن", desc: "رمز قوی، 2FA، دامنه رسمی، ضد فیشینگ، عدم ارسال Seed Phrase و بررسی آدرس مقصد را به عادت ثابت تبدیل کن.", href: "/security" },
  { icon: TrendingUp, title: "۳. بازار را زنده ببین", desc: "قیمت‌ها، تغییرات، نقدشوندگی و خبرهای اثرگذار را کنار هم بررسی کن؛ فقط با دیدن رشد قیمت وارد معامله نشو.", href: "/markets" },
  { icon: WalletCards, title: "۴. قبل از پول واقعی تمرین کن", desc: "با شبیه‌ساز تصمیم، سناریوی خرید، فروش یا صبر را تمرین کن و بعد با مدیریت ریسک تصمیم بگیر.", href: "/academy/simulator" },
];

const startGuideFaqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "برای شروع امن در رمزارز از کجا شروع کنم؟", acceptedAnswer: { "@type": "Answer", text: "ابتدا مفاهیم پایه، امنیت حساب، کارمزدها و شبکه انتقال را یاد بگیرید؛ سپس بازار را مشاهده کنید و قبل از معامله واقعی تمرین کنید." } },
    { "@type": "Question", name: "آیا بدون آموزش باید معامله کنم؟", acceptedAnswer: { "@type": "Answer", text: "خیر. تک‌پی توصیه می‌کند قبل از معامله، آکادمی، چک‌لیست امنیت و شبیه‌ساز تصمیم را مرور کنید." } },
  ],
};

export default function Page() {
  return (
    <ContentShell>
      <StructuredData data={startGuideFaqSchema} />
      <ContentHero eyebrow="TecPey Start" title="راهنمای شروع در تک‌پی" description="این مسیر برای کاربری است که می‌خواهد با آگاهی، امنیت و مدیریت ریسک وارد بازار رمزارز شود؛ نه با عجله و هیجان." ctaHref="/academy" ctaLabel="شروع آموزش رایگان" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.16),transparent_34%),linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-2xl shadow-cyan-500/10 md:p-8">
          <h2 className="text-2xl font-black">خلاصه مسیر امن</h2>
          <p className="mt-4 max-w-4xl text-sm font-bold leading-8 text-white/72">اول یاد بگیر، بعد امنیتت را بساز، سپس بازار را ببین و در نهایت با تمرین و چک‌لیست وارد تصمیم واقعی شو. این صفحه برای شروع سریع، اما مسئولانه طراحی شده است.</p>
        </div>
        <div className="mx-auto mt-8 grid max-w-7xl gap-4 md:grid-cols-2">
          {steps.map((item) => (
            <Link key={item.title} href={item.href} className="group rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-white/5">
              <item.icon className="h-8 w-8 text-cyan-500" />
              <h3 className="mt-4 text-xl font-black leading-8 text-slate-950 dark:text-white">{item.title}</h3>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">{item.desc}</p>
              <div className="mt-5 inline-flex items-center gap-2 text-sm font-black text-cyan-500">ادامه این مرحله <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" /></div>
            </Link>
          ))}
        </div>
        <div className="mx-auto mt-8 max-w-7xl rounded-[30px] border border-emerald-400/25 bg-emerald-400/10 p-6 text-emerald-950 dark:text-emerald-100">
          <h2 className="text-xl font-black">قبل از اولین معامله، این سه سؤال را از خودت بپرس</h2>
          <ul className="mt-4 space-y-3 text-sm font-bold leading-8">
            <li className="flex gap-2"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0" />آیا مفهوم دارایی، شبکه انتقال و کارمزد را می‌دانم؟</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0" />اگر قیمت برخلاف انتظار حرکت کرد، برنامه مدیریت ریسک دارم؟</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0" />آیا از دامنه رسمی و امنیت حسابم مطمئن هستم؟</li>
          </ul>
        </div>
      </section>
    </ContentShell>
  );
}
