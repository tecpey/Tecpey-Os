import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, Scale, ShieldCheck, WalletCards } from "lucide-react";
import { ContentHero, ContentShell } from "@/components/content/ContentUI";
import { StructuredData } from "@/components/seo/StructuredData";

export const metadata: Metadata = {
  title: "قوانین و چارچوب استفاده | تک‌پی",
  description: "قوانین استفاده از تک‌پی با تمرکز بر امنیت حساب، مسئولیت کاربر، معاملات اسپات، کارمزدها، و رفتارهای ممنوع.",
  alternates: { canonical: "https://tecpey.ir/rules" },
};

const rules = [
  {
    icon: ShieldCheck,
    title: "۱. امنیت حساب و اطلاعات ورود",
    desc: "شما مسئول نگهداری امن رمز عبور، کدهای تأیید دومرحله‌ای و دسترسی‌های حساب خود هستید. تک‌پی هرگز Seed Phrase، کلید خصوصی، رمز عبور یا کد 2FA شما را درخواست نمی‌کند.",
  },
  {
    icon: WalletCards,
    title: "۲. واریز، برداشت و انتخاب شبکه",
    desc: "قبل از هر انتقال، نام رمزارز، شبکه انتقال، آدرس مقصد، Memo/Tag، کارمزد و حداقل برداشت را بررسی کنید. انتقال روی شبکه اشتباه یا به آدرس نادرست ممکن است برگشت‌پذیر نباشد.",
  },
  {
    icon: Scale,
    title: "۳. معاملات اسپات و مسئولیت تصمیم",
    desc: "قیمت بازار رمزارزها نوسانی است. سفارش Market، Limit و سایر ابزارهای معاملاتی باید با شناخت ریسک، نقدشوندگی و کارمزد انجام شود. تک‌پی سیگنال خرید، فروش یا وعده سود تضمینی ارائه نمی‌دهد.",
  },
  {
    icon: FileText,
    title: "۴. احراز هویت، شفافیت و استفاده مجاز",
    desc: "برای استفاده از خدماتی که نیاز به احراز هویت دارند، اطلاعات باید دقیق، متعلق به خود شما و قابل بررسی باشد. استفاده از حساب دیگران، جعل هویت یا دور زدن محدودیت‌های امنیتی مجاز نیست.",
  },
  {
    icon: AlertTriangle,
    title: "۵. رفتارهای ممنوع و ریسک مسدودی",
    desc: "فیشینگ، سوءاستفاده از باگ، ارسال اطلاعات جعلی، تلاش برای دسترسی غیرمجاز، پول‌شویی، فعالیت مشکوک یا استفاده از تک‌پی برای مقاصد غیرقانونی ممنوع است و می‌تواند باعث محدودیت حساب شود.",
  },
  {
    icon: CheckCircle2,
    title: "۶. آموزش قبل از معامله",
    desc: "اگر با مفهومی مثل کارمزد شبکه، Seed Phrase، سفارش Market، لیکوئیدیشن، مدیریت ریسک یا نوسان بازار آشنا نیستید، ابتدا آکادمی تک‌پی و مربی هوشمند را مرور کنید و سپس تصمیم بگیرید.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "آیا تک‌پی مشاور سرمایه‌گذاری است؟", acceptedAnswer: { "@type": "Answer", text: "خیر. محتوای تک‌پی آموزشی است و نباید به عنوان سیگنال خرید یا فروش قطعی استفاده شود." } },
    { "@type": "Question", name: "قبل از برداشت رمزارز چه چیزی را باید بررسی کنم؟", acceptedAnswer: { "@type": "Answer", text: "نام رمزارز، شبکه انتقال، آدرس مقصد، Memo یا Tag، کارمزد، حداقل برداشت و صحت مقصد را بررسی کنید." } },
  ],
};

export default function RulesPage() {
  return (
    <ContentShell>
      <StructuredData data={faqSchema} />
      <ContentHero
        eyebrow="قوانین تک‌پی"
        title="قوانین روشن برای ورود امن به بازار رمزارز"
        description="این صفحه برای این نوشته شده که قبل از ثبت‌نام، واریز، برداشت یا معامله، مسئولیت‌ها، ریسک‌ها و مسیر استفاده امن از تک‌پی را شفاف بدانید."
        ctaHref="/academy"
        ctaLabel="آموزش قبل از معامله"
      />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2">
          {rules.map((item) => (
            <article key={item.title} className="rounded-[30px] border border-cyan-400/15 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-cyan-300/15 dark:bg-white/[0.055]">
              <item.icon className="h-8 w-8 text-cyan-500" />
              <h2 className="mt-5 text-xl font-black leading-8 text-slate-950 dark:text-white">{item.title}</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">{item.desc}</p>
            </article>
          ))}
        </div>
        <div className="mx-auto mt-8 max-w-7xl rounded-[30px] border border-amber-400/25 bg-amber-400/10 p-6 text-amber-950 dark:text-amber-100">
          <h2 className="text-xl font-black">یادآوری مهم</h2>
          <p className="mt-3 text-sm font-bold leading-8">اگر در هر مرحله ابهام دارید، قبل از انتقال پول یا ثبت سفارش، از مربی هوشمند تک‌پی سؤال بپرسید یا بخش مرتبط آکادمی را مرور کنید. تصمیم عجولانه در بازار رمزارز می‌تواند پرهزینه باشد.</p>
          <Link href="/academy/ai-guide" className="mt-5 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">رفتن به مربی هوشمند</Link>
        </div>
      </section>
    </ContentShell>
  );
}
