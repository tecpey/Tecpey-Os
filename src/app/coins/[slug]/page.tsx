
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { coinPages } from "@/data/coins";
import { getCoinKnowledge } from "@/data/coinKnowledge";
import { ContentShell, FaqList, SeoNote } from "@/components/content/ContentUI";
import { ArrowLeft, CheckCircle2, AlertTriangle, BookOpen } from "lucide-react";
import { NeonIcon } from "@/components/tecpey/NeonIcon";

type Props = { params: Promise<{ slug: string }> };

function getCoin(slug: string) {
  return coinPages.find((coin) => coin.slug === slug);
}

export async function generateStaticParams() {
  return coinPages.map((coin) => ({ slug: coin.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const coin = getCoin(slug);
  if (!coin) return {};
  return {
    title: `${coin.faName} (${coin.symbol}) | قیمت، معرفی، کاربردها و ریسک‌ها در تک‌پی`,
    description: coin.description,
    keywords: coin.seoKeywords,
    alternates: { canonical: `https://tecpey.ir/coins/${coin.slug}` },
    openGraph: {
      title: `${coin.faName} (${coin.symbol}) | تک‌پی`,
      description: coin.description,
      url: `https://tecpey.ir/coins/${coin.slug}`,
      siteName: "TecPey",
      locale: "fa_IR",
      type: "article",
    },
  };
}

export default async function CoinPage({ params }: Props) {
  const { slug } = await params;
  const coin = getCoin(slug);
  if (!coin) return notFound();
  const profile = getCoinKnowledge(coin.symbol, coin.name, coin.faName);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: coin.faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const financialProductSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${coin.faName} (${coin.symbol})`,
    description: coin.description,
    url: `https://tecpey.ir/coins/${coin.slug}`,
    inLanguage: "fa-IR",
    about: {
      "@type": "Thing",
      name: coin.name,
      alternateName: [coin.symbol, coin.faName],
      description: coin.intro,
    },
    publisher: {
      "@type": "Organization",
      name: "TecPey",
      logo: "https://tecpey.ir/images/tecpey-logo.png",
    },
  };

  return (
    <ContentShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(financialProductSchema) }} />
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <Link href="/coins" className="inline-flex items-center gap-2 text-sm font-black text-cyan-500">
              <ArrowLeft className="h-4 w-4 rotate-180" />
              بازگشت به صفحات کوین
            </Link>
            <div className="mt-6 inline-flex rounded-full bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-500">
              {coin.category}
            </div>
            <h1 className="mt-5 text-4xl font-black leading-tight text-slate-950 dark:text-white sm:text-5xl">
              {coin.faName} ({coin.symbol})؛ قیمت، کاربردها و ریسک‌ها
            </h1>
            <p className="mt-5 text-lg leading-9 text-slate-600 dark:text-slate-300">{coin.intro}</p>

            <section className="mt-8 rounded-[32px] border border-cyan-300/15 bg-white/80 p-6 shadow-sm dark:bg-white/[0.04]">
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">پرونده کامل {coin.faName}</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {[
                  ["نام پروژه / شرکت", profile.projectEntity],
                  ["سال شروع", profile.launch],
                  ["دسته‌بندی", profile.category],
                  ["مدل اجماع", profile.consensus],
                  ["داده‌های بازار لحظه‌ای", "در تب رمزارز همین دارایی، قیمت، تغییرات ۲۴ساعته، Market Cap، FDV، Volume 24h، Circulating Supply، Total Supply و Max Supply از مارکت‌برد آنلاین نمایش داده می‌شود."],
                  ["مدل عرضه", profile.supplyModel],
                  ["ایده اصلی", profile.coreIdea],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">{label}</p>
                    <p className="mt-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-[28px] border border-cyan-300/20 bg-cyan-500/10 p-5">
                <h3 className="text-xl font-black text-slate-950 dark:text-white">داده‌های عددی مهم برای تصمیم‌گیری</h3>
                <p className="mt-3 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
                  برای {coin.faName} فقط توضیح پروژه کافی نیست. قبل از خرید یا نگهداری باید این عددها را کنار هم ببینید: ارزش بازار، ارزش کاملاً رقیق‌شده، حجم معاملات، عرضه در گردش، عرضه کل، حداکثر عرضه، رتبه بازار و نقدشوندگی.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    ["Market Cap / ارزش بازار", "اندازه فعلی پروژه بر اساس عرضه در گردش و قیمت؛ برای مقایسه با رقبا مهم است."],
                    ["FDV / ارزش کاملاً رقیق‌شده", "ارزش فرضی پروژه در صورت ورود کل عرضه به بازار؛ اختلاف زیاد با Market Cap یعنی Unlock و فشار فروش آینده باید بررسی شود."],
                    ["Volume 24h / حجم ۲۴ ساعته", "نشان می‌دهد ورود و خروج از معامله چقدر آسان است و آیا بازار عمق کافی دارد یا نه."],
                    ["Circulating Supply", "تعداد واحدهایی که فعلاً در بازار در گردش است و روی ارزش بازار اثر مستقیم دارد."],
                    ["Total Supply", "کل واحدهای ایجادشده یا قابل ایجاد طبق مدل پروژه."],
                    ["Max Supply", "حداکثر عرضه ممکن؛ برای بررسی کمیابی، تورم عرضه و ریسک رقیق‌شدن مهم است."],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-cyan-300/15 bg-white/70 p-4 dark:bg-white/5">
                      <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">{label}</p>
                      <p className="mt-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">{value}</p>
                    </div>
                  ))}
                </div>
                <Link href={`/crypto/${coin.symbol}`} className="mt-5 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">
                  مشاهده قیمت، حجم و عرضه لحظه‌ای {coin.symbol}
                </Link>
              </div>

              <div className="mt-5 space-y-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
                {profile.deepIntro.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {[
                  ["وب‌سایت رسمی", profile.website],
                  ["وایت‌پیپر / مستند اصلی", profile.whitepaper],
                  ["مستندات فنی", profile.docs],
                ].map(([label, href]) => (
                  <a key={label} href={href || "#"} target="_blank" rel="noreferrer" className={`rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4 text-sm font-black ${href ? "text-cyan-600 dark:text-cyan-300" : "pointer-events-none text-slate-400"}`}>
                    {label}
                  </a>
                ))}
              </div>
            </section>

            <div className="mt-8 rounded-[32px] border border-cyan-300/15 bg-white/80 p-6 shadow-sm dark:bg-white/[0.04]">
              <div className="flex items-center gap-4">
                <NeonIcon icon={BookOpen} size="md" />
                <div>
                  <h2 className="text-xl font-black text-slate-950 dark:text-white">خلاصه کاربردی قبل از خرید</h2>
                  <p className="mt-2 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
                    قبل از معامله {coin.faName}، قیمت لحظه‌ای، کارمزد، شبکه انتقال، ریسک نوسان و هدف خرید خود را بررسی کنید.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-[32px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.18),transparent_35%),linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-xl shadow-cyan-500/10">
              <h2 className="text-2xl font-black">قیمت لحظه‌ای و معامله {coin.symbol}</h2>
              <p className="mt-3 text-sm leading-8 text-white/72">
                برای مشاهده قیمت لحظه‌ای، عمق بازار و شروع معامله، وارد بخش بازارهای تک‌پی شوید. این راهنما برای شناخت بهتر رمزارز است؛ قبل از خرید، قیمت لحظه‌ای، کارمزد، شبکه انتقال و ریسک‌ها را بررسی کنید.
              </p>
              <Link href="/markets" className="mt-5 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">
                مشاهده بازارها
              </Link>
            </div>

            <section className="mt-10">
              <h2 className="text-2xl font-black">کاربردهای اصلی {coin.faName}</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {coin.useCases.map((item) => (
                  <div key={item} className="rounded-3xl border border-slate-200 bg-white/82 p-5 dark:border-white/10 dark:bg-white/5">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item}</p>
                  </div>
                ))}
              </div>
            </section>


            <section className="mt-10 rounded-[32px] border border-cyan-300/15 bg-cyan-500/10 p-6">
              <h2 className="text-2xl font-black">تحلیل ۱۰/۱۰ تک‌پی برای این رمزارز</h2>
              <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
                برای بررسی {coin.faName} فقط دانستن قیمت کافی نیست. باید تاریخچه، تیم، Tokenomics، Market Data، رقبا، اکوسیستم، منابع رسمی و ریسک‌ها را کنار هم ببینید.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {[
                  ["Market Data", "Price، Market Cap، FDV، Volume 24h، Rank، ATH و ATL برای سنجش اندازه و نقدشوندگی."],
                  ["Tokenomics", "عرضه در گردش، عرضه کل، Max Supply، تورمی یا ضدتورمی بودن، Burn، Vesting و Unlock."],
                  ["Competitors", "رقبای مستقیم و غیرمستقیم؛ برای مقایسه ارزش‌گذاری و کاربرد واقعی."],
                  ["Risk Analysis", "ریسک نهنگ‌ها، نقدشوندگی، قرارداد هوشمند، قانون‌گذاری، تمرکز عرضه و اخبار."],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-2xl border border-cyan-300/15 bg-white/70 p-4 dark:bg-white/5">
                    <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">{title}</p>
                    <p className="mt-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">{text}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-2xl font-black">توکنومیکس، عرضه و معیارهای بازار {coin.symbol}</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {profile.tokenomics.map((item) => (
                  <div key={item} className="rounded-3xl border border-blue-400/20 bg-blue-500/10 p-5">
                    <CheckCircle2 className="h-6 w-6 text-blue-500" />
                    <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
                ارزش بازار، FDV، حجم معاملات ۲۴ ساعته، رتبه بازار، عرضه در گردش، عرضه کل، حداکثر عرضه و نقدشوندگی باید با داده‌های لحظه‌ای صفحه بازار و تب رمزارز بررسی شود؛ چون این اعداد دائماً تغییر می‌کنند.
              </p>
            </section>

            <section className="mt-10">
              <h2 className="text-2xl font-black">ریسک‌هایی که باید جدی بگیرید</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {coin.risks.map((item) => (
                  <div key={item} className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                    <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="mb-5 text-2xl font-black">سوالات پرتکرار درباره {coin.faName}</h2>
              <FaqList faqs={coin.faqs} />
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
            <SeoNote />
            <div className="rounded-[30px] border border-slate-200 bg-white/80 p-5 dark:border-white/10 dark:bg-white/5">
              <h3 className="font-black">کلیدواژه‌های این صفحه</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {coin.seoKeywords.map((keyword) => (
                  <span key={keyword} className="rounded-full bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-500">{keyword}</span>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </ContentShell>
  );
}
