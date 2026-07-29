
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { comparePages } from "@/data/academy";
import { ContentShell, FaqList, SeoNote } from "@/components/content/ContentUI";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

type Props = { params: Promise<{ slug: string }> };

function getCompare(slug: string) {
  return comparePages.find((page) => page.slug === slug);
}

export async function generateStaticParams() {
  return comparePages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getCompare(slug);
  if (!page) return {};
  return {
    title: `${page.title} | تک‌پی`,
    description: page.description,
    alternates: { canonical: `https://tecpey.ir/compare/${page.slug}` },
    keywords: ["مقایسه صرافی ارز دیجیتال", "تک‌پی", page.competitor, "خرید تتر", "خرید بیت کوین"],
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const page = getCompare(slug);
  if (!page) return notFound();

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <ContentShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <Link href="/compare" className="inline-flex items-center gap-2 text-sm font-black text-cyan-500">
              <ArrowLeft className="h-4 w-4 rotate-180" />
              بازگشت به مقایسه‌ها
            </Link>
            <h1 className="mt-6 text-4xl font-black leading-tight text-slate-950 dark:text-white sm:text-5xl">{page.title}</h1>
            <p className="mt-5 text-lg leading-9 text-slate-600 dark:text-slate-300">{page.intro}</p>

            <div className="mt-10 overflow-hidden rounded-[32px] border border-slate-200 bg-white/82 shadow-sm dark:border-white/10 dark:bg-white/5">
              {page.points.map((point) => (
                <div key={point.title} className="grid gap-4 border-b border-slate-200 p-5 last:border-b-0 dark:border-white/10 lg:grid-cols-[.8fr_1fr_1fr]">
                  <h2 className="text-lg font-black">{point.title}</h2>
                  <div>
                    <p className="mb-2 text-xs font-black text-cyan-500">تک‌پی</p>
                    <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">{point.tecpey}</p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-black text-slate-500">{page.competitor}</p>
                    <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">{point.competitor}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 rounded-[32px] border border-cyan-400/20 bg-cyan-500/10 p-6">
              <h2 className="flex items-center gap-2 text-xl font-black">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                جمع‌بندی
              </h2>
              <p className="mt-4 text-base leading-9 text-slate-600 dark:text-slate-300">{page.conclusion}</p>
            </div>

            <section className="mt-10">
              <h2 className="mb-5 text-2xl font-black">سوالات پرتکرار</h2>
              <FaqList faqs={page.faqs} />
            </section>
          </div>
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <SeoNote />
          </aside>
        </div>
      </section>
    </ContentShell>
  );
}
