
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { coinPages } from "@/data/coins";
import { ContentShell, FaqList } from "@/components/content/ContentUI";
import { ArrowLeft, BarChart3, BookOpen, ShieldAlert, TrendingUp } from "lucide-react";

type Props = { params: Promise<{ slug: string }> };

function getCoin(slug: string) {
  return coinPages.find((coin) => coin.slug === slug);
}

export function generateStaticParams() {
  return coinPages.slice(0, 16).map((coin) => ({ slug: coin.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const coin = getCoin(slug);
  if (!coin) return { title: "قیمت رمزارزها" };
  return {
    title: `قیمت ${coin.faName} (${coin.symbol}) | نرخ لحظه‌ای، آموزش و ریسک‌ها`,
    description: `قیمت ${coin.faName} در تک‌پی همراه با مسیر آموزشی، نکات ریسک، سوالات پرتکرار و لینک مستقیم به مارکت‌برد آنلاین ${coin.symbol}.`,
    keywords: [`قیمت ${coin.faName}`, `خرید ${coin.faName}`, `${coin.symbol}`, ...coin.seoKeywords],
    alternates: { canonical: `https://tecpey.ir/price/${coin.slug}` },
    openGraph: {
      title: `قیمت ${coin.faName} (${coin.symbol}) | تک‌پی`,
      description: coin.description,
      url: `https://tecpey.ir/price/${coin.slug}`,
      siteName: "TecPey",
      locale: "fa_IR",
      type: "website",
    },
  };
}

export default async function PriceSeoPage({ params }: Props) {
  const { slug } = await params;
  const coin = getCoin(slug);
  if (!coin) return notFound();

  const faqs = [
    { q: `قیمت ${coin.faName} را کجا ببینم؟`, a: `در تک‌پی می‌توانید از مسیر مارکت‌برد و صفحه رمزارز ${coin.symbol} قیمت، تغییرات و داده‌های بازار را دنبال کنید.` },
    { q: `آیا رشد قیمت ${coin.faName} تضمین‌شده است؟`, a: "خیر. بازار رمزارز نوسان دارد و هیچ سودی تضمین‌شده نیست. آموزش، مدیریت ریسک و امنیت حساب ضروری است." },
    ...coin.faqs,
  ].slice(0, 5);

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "تک‌پی", item: "https://tecpey.ir/" },
      { "@type": "ListItem", position: 2, name: "قیمت ارز دیجیتال", item: "https://tecpey.ir/price" },
      { "@type": "ListItem", position: 3, name: `قیمت ${coin.faName}`, item: `https://tecpey.ir/price/${coin.slug}` },
    ],
  };
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
  };
  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `TecPey ${coin.symbol} market board data`,
    description: `Live-oriented market board entry and education page for ${coin.name} (${coin.symbol}).`,
    inLanguage: "fa-IR",
    creator: { "@type": "Organization", name: "TecPey" },
    keywords: coin.seoKeywords.join(", "),
    url: `https://tecpey.ir/price/${coin.slug}`,
  };

  return (
    <ContentShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbSchema, faqSchema, datasetSchema]) }} />
      <main className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/markets" className="inline-flex items-center gap-2 text-sm font-black text-cyan-600 dark:text-cyan-300"><ArrowLeft className="h-4 w-4 rotate-180" /> بازگشت به مارکت‌برد آنلاین</Link>
          <section className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-[38px] border border-cyan-300/20 bg-white/85 p-8 dark:bg-white/[0.045] lg:p-10">
              <p className="inline-flex rounded-full bg-cyan-500/10 px-4 py-2 text-xs font-black text-cyan-600 dark:text-cyan-300">قیمت، آموزش و ریسک</p>
              <h1 className="mt-5 text-4xl font-black leading-tight text-slate-950 dark:text-white lg:text-5xl">قیمت {coin.faName} ({coin.symbol})؛ نرخ لحظه‌ای، آموزش و ریسک‌ها</h1>
              <p className="mt-5 text-lg font-bold leading-9 text-slate-600 dark:text-slate-300">{coin.intro}</p>
              <div className="mt-7 grid gap-4 md:grid-cols-3">
                <div className="rounded-[26px] border border-cyan-300/15 bg-cyan-500/10 p-5"><BarChart3 className="h-6 w-6 text-cyan-500" /><p className="mt-3 text-sm font-black text-slate-800 dark:text-white">قیمت و تغییرات از مارکت‌برد آنلاین تک‌پی</p></div>
                <div className="rounded-[26px] border border-cyan-300/15 bg-cyan-500/10 p-5"><BookOpen className="h-6 w-6 text-cyan-500" /><p className="mt-3 text-sm font-black text-slate-800 dark:text-white">اتصال مستقیم به آموزش مرتبط</p></div>
                <div className="rounded-[26px] border border-cyan-300/15 bg-cyan-500/10 p-5"><ShieldAlert className="h-6 w-6 text-cyan-500" /><p className="mt-3 text-sm font-black text-slate-800 dark:text-white">تمرکز روی ریسک و تصمیم مسئولانه</p></div>
              </div>
            </div>
            <aside className="h-fit rounded-[34px] border border-cyan-300/20 bg-slate-950 p-6 text-white">
              <h2 className="text-xl font-black">مسیر سریع {coin.symbol}</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-white/70">این صفحه قیمت را به آموزش، مارکت‌برد و تصمیم‌گیری امن وصل می‌کند.</p>
              <div className="mt-5 grid gap-3">
                <Link href={`/crypto/${coin.symbol}`} className="rounded-2xl bg-cyan-500 px-4 py-3 text-center text-sm font-black text-white">مشاهده داده زنده {coin.symbol}</Link>
                <Link href={`/coins/${coin.slug}`} className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-center text-sm font-black text-cyan-100">پرونده آموزشی {coin.faName}</Link>
                <Link href="/academy" className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-center text-sm font-black text-cyan-100">ورود به آکادمی</Link>
              </div>
            </aside>
          </section>

          <section className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className="rounded-[32px] border border-slate-200 bg-white/85 p-6 dark:border-white/10 dark:bg-white/[0.04]">
              <h2 className="flex items-center gap-2 text-2xl font-black text-slate-950 dark:text-white"><TrendingUp className="h-6 w-6 text-cyan-500" /> چرا قیمت {coin.faName} برای کاربران مهم است؟</h2>
              <p className="mt-4 text-sm font-bold leading-9 text-slate-600 dark:text-slate-300">قیمت فقط یک عدد نیست. برای تصمیم‌گیری باید تغییرات ۲۴ساعته، حجم معاملات، نقدشوندگی، اخبار پروژه، ریسک بازار و هدف کاربر کنار هم دیده شوند.</p>
            </div>
            <div className="rounded-[32px] border border-slate-200 bg-white/85 p-6 dark:border-white/10 dark:bg-white/[0.04]">
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">ریسک‌های مهم {coin.faName}</h2>
              <ul className="mt-4 space-y-3 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
                {coin.risks.map((risk) => <li key={risk}>• {risk}</li>)}
              </ul>
            </div>
          </section>

          <section className="mt-8 rounded-[32px] border border-cyan-300/20 bg-cyan-500/10 p-6">
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">سوالات پرتکرار قیمت {coin.faName}</h2>
            <div className="mt-5"><FaqList faqs={faqs} /></div>
          </section>
        </div>
      </main>
    </ContentShell>
  );
}
