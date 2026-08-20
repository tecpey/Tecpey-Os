import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { StructuredData } from "@/components/seo/StructuredData";
import { NewsImpactTimeline } from "@/components/content/NewsImpactTimeline";
import { ContentShell, SeoNote } from "@/components/content/ContentUI";
import {
  buildNewsImpactItemListSchema,
  getHighPriorityNewsForTool,
} from "@/lib/news-impact-history";
import {
  buildTraderToolDetailSchemas,
  getTraderToolBySlug,
  getTraderToolSurfaceContract,
  getTraderToolSlugs,
} from "@/lib/trading-tools-growth";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getTraderToolSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTraderToolBySlug(slug);
  if (!tool) return {};

  return {
    title: `راهنمای ${tool.name} | ابزار ${tool.categoryFa} در تک‌پی`,
    description: `${tool.summaryFa} راهنمای فارسی تک‌پی برای استفاده آموزشی، بررسی ریسک، لینک رسمی و جایگاه ${tool.name} در جعبه ابزار معامله‌گر.`,
    alternates: {
      canonical: `https://tecpey.ir/trading-tools/${tool.slug}`,
      languages: {
        "fa-IR": `https://tecpey.ir/trading-tools/${tool.slug}`,
        "en-US": `https://tecpey.ir/en/trading-tools/${tool.slug}`,
        "x-default": `https://tecpey.ir/trading-tools/${tool.slug}`,
      },
    },
    keywords: [
      `${tool.name} چیست`,
      `آموزش ${tool.name}`,
      `${tool.name} فارسی`,
      tool.categoryFa,
      "ابزار تحلیل ارز دیجیتال",
      "جعبه ابزار معامله‌گر تک‌پی",
    ],
    openGraph: {
      title: `راهنمای ${tool.name} در تک‌پی`,
      description: tool.summaryFa,
      url: `https://tecpey.ir/trading-tools/${tool.slug}`,
      siteName: "TecPey",
      locale: "fa_IR",
      type: "article",
      images: [{ url: "/images/tecpey-logo.png", width: 512, height: 512, alt: "TecPey" }],
    },
  };
}

export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  const tool = getTraderToolBySlug(slug);
  if (!tool) return notFound();

  const platforms = ["وب", tool.ios ? "iOS" : null, tool.android ? "Android" : null].filter(Boolean);
  const rankScore = Math.round(tool.growthRank.rankScore * 100);
  const impactNews = getHighPriorityNewsForTool(tool.slug, "fa", 4);
  const pageUrl = `https://tecpey.ir/trading-tools/${tool.slug}`;
  const contract = getTraderToolSurfaceContract(tool, "fa");
  const contractGroups = [
    { title: "مناسب برای", items: contract.suitableFor },
    { title: "نامناسب برای", items: contract.notSuitableFor },
    { title: "ورودی‌ها", items: contract.inputs },
    { title: "خروجی‌ها", items: contract.outputs },
  ];

  return (
    <ContentShell>
      <StructuredData
        data={[
          ...buildTraderToolDetailSchemas(tool, "fa"),
          buildNewsImpactItemListSchema({
            items: impactNews,
            locale: "fa",
            pageUrl,
            name: `خبرهای اثرگذار مرتبط با ${tool.name}`,
          }),
        ]}
      />
      <section dir="rtl" className="bg-[color:var(--tp-bg)] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/trading-tools" className="inline-flex items-center gap-2 text-sm font-black text-cyan-600 dark:text-cyan-300">
            <ArrowLeft className="h-4 w-4 rotate-180" />
            بازگشت به جعبه ابزار
          </Link>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <article className="rounded-[34px] border border-cyan-300/15 bg-white/80 p-6 shadow-xl shadow-cyan-500/5 dark:bg-white/[0.045] lg:p-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-600 dark:text-cyan-200">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {tool.categoryFa}
              </div>
              <h1 className="mt-6 text-4xl font-black leading-tight text-[color:var(--tp-text)] sm:text-5xl">
                {tool.name} چیست و چطور باید از آن امن‌تر استفاده کنیم؟
              </h1>
              <p className="mt-5 text-base font-bold leading-9 text-[color:var(--tp-muted)]">{tool.articleFa}</p>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <section className="rounded-[26px] border border-emerald-300/20 bg-emerald-400/10 p-5">
                  <h2 className="text-xl font-black text-[color:var(--tp-text)]">مزایا</h2>
                  <ul className="mt-4 space-y-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                    {tool.prosFa.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </section>
                <section className="rounded-[26px] border border-amber-300/25 bg-amber-400/10 p-5">
                  <h2 className="text-xl font-black text-[color:var(--tp-text)]">محدودیت‌ها</h2>
                  <ul className="mt-4 space-y-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                    {tool.consFa.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </section>
              </div>

              <section className="mt-6 rounded-[26px] border border-cyan-300/15 bg-cyan-400/10 p-5">
                <h2 className="text-xl font-black text-[color:var(--tp-text)]">آموزش سریع استفاده</h2>
                <ol className="mt-4 space-y-3 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">
                  {tool.tutorialFa.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </section>

              <section className="mt-6 rounded-[26px] border border-cyan-300/15 bg-white/70 p-5 dark:bg-white/[0.04]">
                <h2 className="text-xl font-black text-[color:var(--tp-text)]">قرارداد استفاده امن</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {contractGroups.map(({ title, items }) => (
                    <div key={title} className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-4">
                      <h3 className="text-sm font-black text-cyan-700 dark:text-cyan-200">{title}</h3>
                      <ul className="mt-3 space-y-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                        {items.map((item) => <li key={item}>• {item}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4">
                    <h3 className="text-sm font-black text-amber-700 dark:text-amber-200">فرض‌ها و محدودیت‌ها</h3>
                    <ul className="mt-3 space-y-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                      {contract.assumptions.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4">
                    <h3 className="text-sm font-black text-amber-700 dark:text-amber-200">یادداشت‌های ریسک</h3>
                    <ul className="mt-3 space-y-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                      {contract.riskNotes.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4">
                    <h3 className="text-sm font-black text-rose-700 dark:text-rose-200">ریسک حریم خصوصی و مجوزها</h3>
                    <ul className="mt-3 space-y-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                      {contract.privacyAndPermissions.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                </div>
              </section>

              <NewsImpactTimeline items={impactNews} locale="fa" subject={tool.name} />

              <div className="mt-6">
                <SeoNote />
              </div>
            </article>

            <aside className="space-y-4">
              <section className="rounded-[30px] border border-cyan-300/15 bg-slate-950 p-5 text-white shadow-2xl shadow-cyan-500/10">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black text-cyan-200">امتیاز تک‌پی</p>
                    <p className="mt-1 text-4xl font-black">{rankScore}</p>
                  </div>
                  <ShieldCheck className="h-10 w-10 text-cyan-300" aria-hidden="true" />
                </div>
                <p className="mt-4 text-sm font-bold leading-7 text-slate-300">
                  این امتیاز برای نمایش آموزشی است و بر اساس امنیت لینک رسمی، کاربرد، اهمیت دسته و وزن سردبیری محاسبه می‌شود.
                </p>
                <p className="mt-3 rounded-2xl border border-cyan-300/15 bg-white/5 p-3 text-xs font-bold leading-6 text-cyan-100">
                  {contract.lastVerifiedLabel}
                </p>
              </section>

              <section className="rounded-[30px] border border-cyan-300/15 bg-white/80 p-5 dark:bg-white/[0.045]">
                <h2 className="text-lg font-black text-[color:var(--tp-text)]">لینک رسمی و پلتفرم‌ها</h2>
                <p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{contract.officialLinkStatus}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {platforms.map((platform) => (
                    <span key={platform as string} className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-600 dark:text-cyan-200">
                      {platform}
                    </span>
                  ))}
                </div>
                <a
                  href={tool.site}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  ورود به سایت رسمی
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </section>

              <section className="rounded-[30px] border border-cyan-300/15 bg-white/80 p-5 dark:bg-white/[0.045]">
                <h2 className="text-lg font-black text-[color:var(--tp-text)]">قدم بعدی در تک‌پی</h2>
                <div className="mt-4 grid gap-3">
                  <Link href="/academy" className="rounded-2xl border border-cyan-300/15 px-4 py-3 text-sm font-black text-cyan-600 dark:text-cyan-200">
                    آموزش قبل از معامله
                  </Link>
                  <Link href="/markets" className="rounded-2xl border border-cyan-300/15 px-4 py-3 text-sm font-black text-cyan-600 dark:text-cyan-200">
                    بررسی مارکت برد آنلاین
                  </Link>
                  <Link href="/risk-disclosure" className="rounded-2xl border border-cyan-300/15 px-4 py-3 text-sm font-black text-cyan-600 dark:text-cyan-200">
                    مطالعه افشای ریسک
                  </Link>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </ContentShell>
  );
}
