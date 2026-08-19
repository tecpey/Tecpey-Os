import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, CheckCircle2, GraduationCap, ShieldCheck, Sparkles } from "lucide-react";
import { ContentShell } from "@/components/content/ContentUI";
import { safeJsonLd } from "@/lib/json-ld";

const courseUrl = "https://tecpey.ir/academy/free";
const ogImage = "https://tecpey.ir/images/tecpey-og.png";

export const metadata: Metadata = {
  title: "دوره رایگان ارز دیجیتال تک‌پی | آموزش امن رمزارز از صفر",
  description:
    "دوره رایگان ارز دیجیتال تک‌پی مسیر آموزشی فارسی برای شروع امن رمزارز است: مفاهیم پایه، امنیت، کار با صرافی، تحلیل مقدماتی، مدیریت ریسک و تمرین بدون وعده سود.",
  alternates: {
    canonical: courseUrl,
    languages: {
      "fa-IR": courseUrl,
      "en-US": "https://tecpey.ir/en/academy/free",
      "x-default": courseUrl,
    },
  },
  keywords: ["دوره رایگان ارز دیجیتال", "آموزش رایگان ترید", "کلاس رایگان رمزارز", "آموزش رایگان بیت کوین", "آکادمی تک‌پی"],
  openGraph: {
    title: "دوره رایگان ارز دیجیتال تک‌پی",
    description: "مسیر رایگان آموزش رمزارز از مفاهیم پایه تا امنیت، ریسک و تمرین مسئولانه؛ بدون سیگنال یا وعده سود.",
    url: courseUrl,
    siteName: "TecPey",
    locale: "fa_IR",
    type: "website",
    images: [{ url: ogImage, width: 1200, height: 630, alt: "دوره رایگان ارز دیجیتال تک‌پی" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "دوره رایگان ارز دیجیتال تک‌پی",
    description: "آموزش رایگان رمزارز از صفر، با امنیت، ریسک و تمرین آموزشی؛ نه وعده سود.",
    images: [ogImage],
  },
};

const directAnswers = [
  {
    question: "دوره رایگان ارز دیجیتال تک‌پی شامل چیست؟",
    answer: "این دوره مفاهیم پایه رمزارز، امنیت حساب و کیف پول، کار با صرافی، بررسی پروژه‌ها، نمودارخوانی مقدماتی، مدیریت ریسک، روانشناسی بازار و تمرین آموزشی را پوشش می‌دهد.",
  },
  {
    question: "آیا این دوره برای شروع معامله کافی است؟",
    answer: "این دوره نقطه شروع امن و ساختارمند است، اما تضمین آمادگی بازار نیست. تصمیم واقعی نیاز به تمرین، مدیریت ریسک، تحقیق شخصی و پذیرش مسئولیت دارد.",
  },
  {
    question: "آیا دوره رایگان تک‌پی سیگنال یا وعده سود می‌دهد؟",
    answer: "خیر. دوره رایگان تک‌پی برای آموزش، امنیت و کاهش خطاست و نباید سیگنال خرید و فروش، وعده سود یا توصیه مالی شخصی ارائه کند.",
  },
];

const modules = [
  ["مفاهیم پایه", "بلاکچین، بیت‌کوین، تتر، کیف پول و تفاوت نگهداری دارایی با معامله."],
  ["امنیت و خطاهای رایج", "رمز عبور، 2FA، فیشینگ، Seed Phrase، شبکه انتقال و محافظت از حساب."],
  ["شروع کار با صرافی", "ثبت‌نام، کارمزد، واریز و برداشت، سفارش اسپات و بررسی قبل از معامله."],
  ["تحلیل و مدیریت ریسک", "کندل، روند، حمایت/مقاومت، حد ضرر، اندازه موقعیت و ژورنال."],
];

const internalLinks = [
  ["آکادمی تک‌پی", "/academy"],
  ["برنامه درسی", "/academy/curriculum"],
  ["امنیت آکادمی", "/academy/security-first"],
  ["شبیه‌ساز ریسک", "/academy/risk-simulator"],
  ["ثبت‌نام رایگان", "/academy/signup"],
];

const relationLinks = [
  ["راهنمای بیت‌کوین", "/coins/bitcoin"],
  ["راهنمای تتر", "/coins/tether"],
  ["راهنمای اتریوم", "/coins/ethereum"],
  ["CoinMarketCap", "/trading-tools/coinmarketcap"],
  ["CoinGecko", "/trading-tools/coingecko"],
  ["اخبار رمزارز", "/crypto-news"],
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Course",
    name: "دوره رایگان ارز دیجیتال تک‌پی",
    description: "دوره رایگان فارسی برای آموزش مفاهیم رمزارز، امنیت، کار با صرافی، تحلیل مقدماتی، مدیریت ریسک و تمرین مسئولانه.",
    url: courseUrl,
    inLanguage: "fa-IR",
    provider: { "@type": "Organization", name: "TecPey", url: "https://tecpey.ir" },
    educationalLevel: "Beginner",
    teaches: ["مفاهیم رمزارز", "امنیت حساب", "کار با صرافی", "مدیریت ریسک", "تمرین آموزشی"],
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", courseWorkload: "P7D" },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: directAnswers.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "تک‌پی", item: "https://tecpey.ir" },
      { "@type": "ListItem", position: 2, name: "آکادمی", item: "https://tecpey.ir/academy" },
      { "@type": "ListItem", position: 3, name: "دوره رایگان ارز دیجیتال", item: courseUrl },
    ],
  },
];

export default function AcademyFreePage() {
  return (
    <ContentShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }} />
      <div className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <section className="overflow-hidden rounded-[34px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.18),transparent_36%),linear-gradient(145deg,#04101d,#0f172a)] p-6 text-white shadow-[0_28px_100px_rgba(34,211,238,.12)] lg:p-8">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100"><Sparkles className="h-4 w-4" aria-hidden="true" />دوره رایگان، مسیر امن شروع</div>
                <h1 className="mt-5 max-w-4xl text-balance text-3xl font-black leading-[1.25] sm:text-5xl">دوره رایگان ارز دیجیتال تک‌پی؛ از صفر تا تمرین مسئولانه</h1>
                <p className="mt-5 max-w-3xl text-sm font-bold leading-8 text-slate-300 sm:text-base">این صفحه نقطه ورود رایگان آکادمی است: یادگیری مفاهیم پایه، امنیت، کار با صرافی، تحلیل مقدماتی و مدیریت ریسک، با مسیر تمرین و آزمون. هدف، آموزش و کاهش خطاست؛ نه سیگنال، فشار خرید یا وعده سود.</p>
                <div className="mt-7 flex flex-wrap gap-3"><Link href="/academy/signup" className="rounded-2xl bg-cyan-500 px-5 py-3.5 text-sm font-black text-white transition hover:bg-cyan-400">ثبت‌نام و شروع رایگان</Link><Link href="/academy/term-1" className="rounded-2xl border border-white/12 bg-white/[0.055] px-5 py-3.5 text-sm font-black text-cyan-100 transition hover:bg-white/10">دیدن ترم اول</Link></div>
              </div>
              <aside className="rounded-[28px] border border-amber-300/25 bg-amber-300/10 p-5"><ShieldCheck className="h-8 w-8 text-amber-200" aria-hidden="true" /><h2 className="mt-4 text-lg font-black">آموزش، نه توصیه مالی</h2><p className="mt-3 text-sm font-bold leading-7 text-slate-300">هیچ بخش از دوره، سود، موفقیت یا آمادگی قطعی برای معامله واقعی را تضمین نمی‌کند.</p></aside>
            </div>
          </section>
          <section className="grid gap-4 md:grid-cols-3">{directAnswers.map((item) => <article key={item.question} className="rounded-[24px] border border-cyan-200 bg-cyan-50 p-5 dark:border-cyan-300/15 dark:bg-cyan-300/10"><h2 className="text-lg font-black leading-8 text-slate-950 dark:text-white">{item.question}</h2><p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">{item.answer}</p></article>)}</section>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{modules.map(([title, text]) => <article key={title} className="rounded-[26px] border border-cyan-200 bg-white/92 p-5 shadow-sm dark:border-cyan-300/15 dark:bg-white/[0.055]"><GraduationCap className="h-7 w-7 text-cyan-600 dark:text-cyan-300" aria-hidden="true" /><h2 className="mt-4 text-base font-black text-slate-950 dark:text-white">{title}</h2><p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{text}</p></article>)}</section>
          <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-[30px] border border-emerald-200 bg-white/92 p-6 shadow-sm dark:border-emerald-300/15 dark:bg-white/[0.055]"><BookOpenCheck className="h-8 w-8 text-emerald-500" aria-hidden="true" /><h2 className="mt-4 text-2xl font-black text-slate-950 dark:text-white">مسیرهای بعدی</h2><div className="mt-4 flex flex-wrap gap-2">{internalLinks.map(([title, href]) => <Link key={href} href={href} className="rounded-full border border-cyan-200 bg-white px-4 py-2 text-xs font-black text-cyan-800">{title}</Link>)}</div></div><div className="rounded-[30px] border border-cyan-300/15 bg-white/92 p-6 shadow-sm dark:bg-white/[0.055]"><CheckCircle2 className="h-8 w-8 text-cyan-500" aria-hidden="true" /><h2 className="mt-4 text-2xl font-black text-slate-950 dark:text-white">زمینه بازار، نه فشار معامله</h2><div className="mt-4 flex flex-wrap gap-2">{relationLinks.map(([title, href]) => <Link key={href} href={href} className="rounded-full border border-cyan-200 bg-white px-4 py-2 text-xs font-black text-cyan-800">{title}</Link>)}</div></div></section>
        </div>
      </div>
    </ContentShell>
  );
}
