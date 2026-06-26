
import { ArticleSchema } from "@/components/seo/ArticleSchema";
import type { Metadata } from "next";
import Link from "next/link";
import { academyArticles, academyCategories } from "@/data/academy";
import { ContentHero, ContentShell, TrustStrip } from "@/components/content/ContentUI";
import { TextOnlyCard } from "@/components/tecpey/TextOnlyCard";
import { BookOpen, ShieldCheck, Coins, TrendingUp, WalletCards, HelpCircle, ClipboardCheck, CheckCircle2, MessageCircleQuestion } from "lucide-react";
import { TermGateLink } from "@/components/academy/TermGateLink";
import { AcademyInteractiveRoadmap } from "@/components/academy/AcademyInteractiveRoadmap";
import { AcademyEngagementHub } from "@/components/academy/AcademyEngagementHub";
import { academyCaseStudies } from "@/data/academyCaseStudies";
import { AcademyWorldClassUpgrade } from "@/components/academy/AcademyWorldClassUpgrade";

export const metadata: Metadata = {
  title: "آکادمی تک‌پی | نقطه امن یادگیری و ورود به بازار رمزارز",
  description: "آکادمی تک‌پی بر پایه یک هدف شکل گرفته است: ایجاد نقطه‌ای امن برای ورود آگاهانه به بازار رمزارز؛ از آموزش و ارزیابی تا شروع حرفه‌ای.",
  alternates: { canonical: "https://tecpey.ir/academy" },
  keywords: ["آموزش ارز دیجیتال", "آکادمی تک‌پی", "خرید تتر", "بیت کوین چیست", "امنیت رمزارز"],
  openGraph: {
    title: "آکادمی تک‌پی",
    description: "آموزش انسانی، ساده و حرفه‌ای برای ورود امن‌تر به بازار رمزارز.",
    url: "https://tecpey.ir/academy",
    siteName: "TecPey",
    locale: "fa_IR",
    type: "website",
  },
};


const academyTerms = [
  {
    term: "ترم ۱",
    title: "دنیای رمزارز از صفر",
    lessons: ["بلاکچین چیست؟", "بیت‌کوین چیست؟", "تتر چیست؟", "کیف پول چیست؟"],
    exam: "آزمون ۱",
  },
  {
    term: "ترم ۲",
    title: "امنیت حساب و نگهداری دارایی",
    lessons: ["رمز عبور امن", "ورود دومرحله‌ای", "فیشینگ", "اشتباهات امنیتی رایج"],
    exam: "آزمون ۲",
  },
  {
    term: "ترم ۳",
    title: "کار با صرافی و معامله اسپات",
    lessons: ["ثبت‌نام", "احراز هویت", "خرید و فروش", "واریز و برداشت"],
    exam: "آزمون ۳",
  },
  {
    term: "ترم ۴",
    title: "شناخت پروژه‌ها و تحلیل بنیادی",
    lessons: ["وایت‌پیپر", "تیم پروژه", "توکنومیکس", "ریسک‌های پروژه"],
    exam: "آزمون ۴",
  },
  {
    term: "ترم ۵",
    title: "تحلیل بازار و نمودارخوانی مقدماتی",
    lessons: ["کندل", "روند", "حمایت و مقاومت", "حجم معاملات"],
    exam: "آزمون ۵",
  },
  {
    term: "ترم ۶",
    title: "مدیریت سرمایه و ریسک",
    lessons: ["حد ضرر", "مدیریت ریسک", "FOMO", "ژورنال معاملاتی"],
    exam: "آزمون ۶",
  },
  {
    term: "ترم ۷",
    title: "روانشناسی بازار و آمادگی نهایی",
    lessons: ["مرور مسیر", "تمرین تصمیم", "آزمون جامع", "چک‌لیست آمادگی نهایی"],
    exam: "آزمون نهایی",
  },
];

const collectionSchema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "آکادمی تک‌پی",
  url: "https://tecpey.ir/academy",
  inLanguage: "fa-IR",
  about: ["Cryptocurrency Education", "Bitcoin", "USDT", "Crypto Security", "Trading Fees"],
};

const academyIcons = [BookOpen, ShieldCheck, Coins, TrendingUp, WalletCards, HelpCircle];

export default function AcademyPage() {
  const grouped = Object.entries(academyCategories).map(([key, category]) => ({
    key,
    category,
    articles: academyArticles.filter((article) => article.category === key),
  }));

  return (
    <ContentShell>
      <ArticleSchema headline="آکادمی تک‌پی؛ آموزش روشن و کاربردی رمزارز" description="آموزش مفاهیم رمزارز، امنیت حساب، کارمزدها و شروع آگاهانه معامله برای کاربران فارسی‌زبان." url="https://tecpey.ir/academy" language="fa-IR" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }} />
      <ContentHero
        eyebrow="آکادمی تک‌پی"
        title="تک‌پی، نقطه امن ورود به بازار رمزارز"
        description="آکادمی تک‌پی یک مسیر آموزشی کامل و مرحله‌به‌مرحله است؛ از فهم ساده بلاکچین و بیت‌کوین تا امنیت دارایی، کار با صرافی، تحلیل بازار، مدیریت ریسک و تصمیم‌گیری مسئولانه. هدف، وعده سود نیست؛ هدف این است که کاربر بعد از پایان مسیر، با دانش واقعی و کاربردی وارد بازار شود."
        ctaHref="/academy/onboarding"
        ctaLabel="ساخت پروفایل آکادمی و شروع ترم اول"
      />
      <TrustStrip />
      <AcademyWorldClassUpgrade />
      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/25 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.20),transparent_34%),linear-gradient(145deg,#07111f,#0f172a)] p-6 shadow-[0_24px_80px_rgba(34,211,238,.12)]">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
            <div>
              <p className="text-xs font-black text-cyan-300">مربی هوشمند آکادمی</p>
              <h2 className="mt-3 text-2xl font-black text-white">هرجا ابهام داشتی، قبل از تصمیم از مربی هوشمند بپرس</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-300">این بخش برای سؤال‌های آموزشی، امنیتی و مدیریت ریسک ساخته شده است؛ نه سیگنال خرید و فروش. پاسخ‌ها به درس‌های آکادمی و قدم بعدی یادگیری وصل می‌شوند.</p>
            </div>
            <div className="grid gap-3">
              <Link href="/academy/onboarding" className="rounded-2xl bg-cyan-500 px-5 py-4 text-center text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400">فعال‌سازی منتور با پروفایل آکادمی</Link>
              <Link href="/academy/onboarding" className="rounded-2xl border border-cyan-300/25 bg-white/5 px-5 py-4 text-center text-sm font-black text-cyan-100 transition hover:bg-white/10">ساخت هویت آموزشی</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-emerald-300/20 bg-emerald-500/10 p-6 shadow-[0_24px_80px_rgba(16,185,129,.10)]">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
            <div>
              <p className="text-xs font-black text-emerald-300">TecPey Verified Certificate</p>
              <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">هر ترم موفق، یک مدرک قابل استعلام می‌سازد</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-300">پس از تکمیل ترم و قبولی در ارزیابی، گواهی شما با شناسه یکتا، QR قابل اسکن و صفحه استعلام عمومی صادر می‌شود؛ قابل چاپ، قابل اشتراک‌گذاری و مناسب رزومه آموزشی.</p>
            </div>
            <div className="grid gap-3">
              <Link href="/academy/certificates" className="rounded-2xl bg-emerald-500 px-5 py-4 text-center text-sm font-black text-white transition hover:bg-emerald-400">مشاهده مدارک قابل استعلام</Link>
              <Link href="/academy/hall-of-fame" className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-5 py-4 text-center text-sm font-black text-amber-100 transition hover:bg-amber-300/15">تالار افتخار آکادمی</Link>
            </div>
          </div>
        </div>
      </section>

      <AcademyInteractiveRoadmap />
      <AcademyEngagementHub locale="fa" />
      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/20 bg-cyan-500/10 p-6 shadow-[0_24px_80px_rgba(34,211,238,.12)]">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-white">مربی شخصی‌سازی‌شده آکادمی</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-300">مربی شخصی آکادمی، پیشرفت ترم‌ها، سؤال‌های اخیر و نقاط نیازمند مرور را به قدم بعدی روشن تبدیل می‌کند تا مسیر یادگیری برای شما دقیق‌تر شود.</p>
            </div>
            <Link href="/academy/mentor-coach" className="rounded-2xl bg-cyan-500 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-cyan-400">ورود به مربی شخصی</Link>
          </div>
        </div>
      </section>

      <section className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[30px] border border-amber-300/25 bg-amber-300/10 p-6 text-center">
          <h2 className="text-2xl font-black text-white">آموزش قبل از معامله، اصل اول تک‌پی است</h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-300">
            در این مسیر، ابتدا مفهوم بازار را می‌فهمید، بعد امنیت را یاد می‌گیرید و سپس معامله، تحلیل، مدیریت سرمایه و روانشناسی بازار را تمرین می‌کنید. آکادمی شما را به خرید عجولانه هل نمی‌دهد؛ برای تصمیم آگاهانه آماده می‌کند.
          </p>
          <p className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm font-black leading-7 text-rose-100">
            آکادمی تک‌پی توصیه مالی یا وعده سود نیست؛ یک مسیر آموزشی برای کاهش خطا، افزایش آگاهی و ورود مسئولانه به بازار رمزارز است.
          </p>
        </div>
      </section>


      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-black text-white">مسیر ۷ ترمی آکادمی تک‌پی</h2>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
              در این مسیر از صفر شروع می‌کنید و هر ترم یک مهارت واقعی می‌سازد: شناخت بازار، امنیت، معامله، بررسی پروژه‌ها، نمودارخوانی، مدیریت ریسک و کنترل هیجان. پایان هر ترم یک آزمون کوتاه دارد تا یادگیری فقط خواندن متن نباشد.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
            {academyTerms.map((item, index) => (
              <article key={item.term} className="rounded-[28px] border border-cyan-200 bg-white/92 p-5 shadow-[0_18px_55px_rgba(15,23,42,.10)] backdrop-blur-xl dark:border-cyan-300/15 dark:bg-white/[0.055]">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-700 dark:text-cyan-200">{item.term}</span>
                  <ClipboardCheck className="h-6 w-6 text-cyan-300" />
                </div>
                <h3 className="mt-4 text-lg font-black leading-8 text-slate-950 dark:text-white">{item.title}</h3>
                <ul className="mt-3 space-y-2">
                  {item.lessons.map((lesson) => (
                    <li key={lesson} className="flex gap-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
                      <span>{lesson}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-50 p-3 dark:bg-cyan-300/10 text-xs font-black text-cyan-800 dark:text-cyan-100">{item.exam}</p>
                <TermGateLink href={`/academy/term-${index + 1}`} termNumber={index + 1} className="mt-3 block rounded-2xl bg-cyan-500 px-3 py-2 text-center text-xs font-black text-white transition hover:bg-cyan-400" lockedClassName="bg-slate-600 hover:bg-slate-600" locale="fa">شروع آموزش و آزمون</TermGateLink>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-violet-300/20 bg-violet-500/10 p-6 shadow-[0_24px_80px_rgba(124,58,237,.12)]">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-4 py-2 text-xs font-black text-violet-100">
                <MessageCircleQuestion className="h-4 w-4" />
                راهنمای هوشمند آکادمی
              </div>
              <h2 className="mt-4 text-2xl font-black text-white sm:text-3xl">سؤال داری؟ از دستیار آموزشی تک‌پی بپرس</h2>
              <p className="mt-4 text-sm font-bold leading-8 text-slate-300">
                کنار مسیر آموزشی، مربی هوشمند کمک می‌کند سؤال‌های درسی خود را بپرسید، مثال ساده‌تر بگیرید، چک‌لیست مرور بسازید و ابهام‌ها را قبل از تصمیم مالی برطرف کنید. این بخش برای آموزش است، نه سیگنال خرید و فروش یا توصیه مالی.
              </p>
            </div>
            <Link href="/academy/practice-lab" className="group rounded-[28px] border border-emerald-300/25 bg-white/10 p-5 text-center transition hover:-translate-y-1 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-emerald-300/60">
              <ClipboardCheck className="mx-auto h-8 w-8 text-emerald-300" />
              <h3 className="mt-4 text-lg font-black text-white">Practice Lab تصمیم‌گیری</h3>
              <p className="mt-3 text-sm font-bold leading-7 text-slate-300">سناریوهای واقعی بازار، بازخورد تصمیم، تمرین ریسک و اتصال مستقیم به AI Mentor.</p>
            </Link>
            <Link href="/academy/onboarding" className="group rounded-[28px] border border-violet-300/25 bg-white/10 p-5 text-center transition hover:-translate-y-1 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-violet-300/60">
              <MessageCircleQuestion className="mx-auto h-10 w-10 text-violet-200" />
              <p className="mt-3 text-lg font-black text-white">مشاهده سناریوی دستیار آموزشی</p>
              <p className="mt-2 text-xs font-bold leading-6 text-slate-300">سؤال‌های پرتکرار، اصول پاسخ‌گویی امن و راهنمای استفاده از مربی هوشمند</p>
              <span className="mt-4 inline-flex rounded-2xl bg-violet-500 px-4 py-3 text-xs font-black text-white transition group-hover:bg-violet-400">ورود به بخش راهنما</span>
            </Link>
          </div>
        </div>
      </section>


      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-black text-white">Case Study Lab؛ یادگیری از سناریوهای واقعی بازار</h2>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
              ضعف اصلی بسیاری از آکادمی‌ها این است که مفهوم را تعریف می‌کنند اما کاربر را با موقعیت واقعی روبه‌رو نمی‌کنند. این بخش هر ترم را به یک پرونده عملی وصل می‌کند: خطای امنیتی، شکست جعلی، مدیریت سرمایه، FOMO و تحلیل پروژه.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {academyCaseStudies.map((item) => (
              <TermGateLink
                key={item.slug}
                href={`/academy/term-${item.term}`}
                termNumber={item.term}
                className="group block rounded-[28px] border border-cyan-200 bg-white/92 p-5 shadow-[0_18px_55px_rgba(15,23,42,.10)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/50 hover:bg-cyan-50 dark:border-cyan-300/15 dark:bg-white/[0.055] dark:hover:bg-cyan-300/10"
                lockedClassName="hover:translate-y-0 hover:bg-white/92 dark:hover:bg-white/[0.055]"
              >
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-700 dark:text-cyan-200">ترم {item.term}</span>
                <h3 className="mt-4 text-lg font-black leading-8 text-slate-950 dark:text-white">{item.title}</h3>
                <p className="mt-3 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{item.summary}</p>
                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs font-black leading-6 text-amber-800 dark:text-amber-100">
                  تمرین: {item.learnerTask}
                </div>
              </TermGateLink>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {[
            { title: "مسیر یادگیری از صفر", text: "کاربر از مفاهیم پایه شروع می‌کند و قدم‌به‌قدم به تصمیم‌گیری آگاهانه می‌رسد.", href: "/academy/term-1", termNumber: 1 },
            { title: "یادگیری همراه با سنجش", text: "هر ترم با آزمون، چک‌لیست و مثال واقعی کامل می‌شود تا یادگیری سطحی نباشد.", href: "/academy/profile", termNumber: 1 },
            { title: "آمادگی واقعی قبل از ورود", text: "هدف نهایی این است که کاربر بداند چه می‌خرد، چه ریسکی می‌کند و چگونه از دارایی خود محافظت می‌کند.", href: "/academy/term-7", termNumber: 7 },
          ].map((item) => (
            <TermGateLink key={item.title} href={item.href} termNumber={item.termNumber} className="group block rounded-[28px] border border-cyan-200 bg-white/92 p-5 shadow-[0_18px_55px_rgba(15,23,42,.10)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/60 hover:shadow-[0_24px_70px_rgba(34,211,238,.16)] focus:outline-none focus:ring-2 focus:ring-cyan-300/60 dark:border-cyan-300/15 dark:bg-white/[0.055]">
              <h2 className="text-lg font-black text-white">{item.title}</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">{item.text}</p>
              <span className="mt-4 inline-flex text-xs font-black text-cyan-300 opacity-0 transition group-hover:opacity-100">مشاهده جزئیات</span>
            </TermGateLink>
          ))}
        </div>
      </section>
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-14">
          {grouped.map(({ key, category, articles }, groupIndex) => (
            <div key={key} className="rounded-[34px] border border-cyan-300/10 bg-[#06111f]/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,.25)] sm:p-7">
              <div className="mb-7 max-w-3xl">
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-200">مرکز دانش تک‌پی</span>
                <h2 className="mt-5 text-2xl font-black text-white sm:text-3xl">{category.title}</h2>
                <p className="mt-3 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">{category.description}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {articles.map((article, index) => (
                  <TextOnlyCard
                    key={article.slug}
                    href={`/academy/${article.slug}`}
                    title={article.title}
                    text={article.description}
                    meta={article.readTime}
                    icon={academyIcons[(groupIndex + index) % academyIcons.length]}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    
      <section id="academy-quiz" className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[30px] border border-cyan-200 bg-white/92 p-6 text-center shadow-[0_18px_55px_rgba(15,23,42,.10)] dark:border-cyan-300/15 dark:bg-white/[0.055]">
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">آزمون‌های پایان ترم</h2>
          <p className="mt-3 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
            بعد از هر ترم، آزمون کوتاه فعال است تا کاربر فقط متن نخواند؛ بلکه بفهمد آیا می‌تواند مفهوم را به رفتار قابل اجرا تبدیل کند یا نه.
          </p>
          <a href="/academy/term-1" className="mt-5 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">شروع مسیر از ترم اول</a>
        </div>
      </section>

    </ContentShell>
  );
}
