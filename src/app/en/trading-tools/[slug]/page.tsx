import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { StructuredData } from "@/components/seo/StructuredData";
import { NewsImpactTimeline } from "@/components/content/NewsImpactTimeline";
import { EnglishShell, EnglishHero } from "../../components/EnglishUI";
import {
  buildNewsImpactItemListSchema,
  getHighPriorityNewsForTool,
} from "@/lib/news-impact-history";
import {
  buildTraderToolDetailSchemas,
  getTraderToolBySlug,
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
    title: `${tool.name} guide | TecPey Trader Toolbox`,
    description: `${tool.summaryEn} TecPey guide with official links, educational context and risk-aware usage notes.`,
    alternates: {
      canonical: `https://tecpey.ir/en/trading-tools/${tool.slug}`,
      languages: {
        "fa-IR": `https://tecpey.ir/trading-tools/${tool.slug}`,
        "en-US": `https://tecpey.ir/en/trading-tools/${tool.slug}`,
        "x-default": `https://tecpey.ir/trading-tools/${tool.slug}`,
      },
    },
    keywords: [
      `${tool.name} guide`,
      `${tool.name} crypto tool`,
      tool.categoryEn,
      "crypto analysis tools",
      "TecPey Trader Toolbox",
    ],
    openGraph: {
      title: `${tool.name} guide | TecPey`,
      description: tool.summaryEn,
      url: `https://tecpey.ir/en/trading-tools/${tool.slug}`,
      siteName: "TecPey",
      locale: "en_US",
      alternateLocale: ["fa_IR"],
      type: "article",
      images: [{ url: "/images/tecpey-logo.png", width: 512, height: 512, alt: "TecPey" }],
    },
  };
}

export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  const tool = getTraderToolBySlug(slug);
  if (!tool) return notFound();

  const platforms = ["Web", tool.ios ? "iOS" : null, tool.android ? "Android" : null].filter(Boolean);
  const rankScore = Math.round(tool.growthRank.rankScore * 100);
  const impactNews = getHighPriorityNewsForTool(tool.slug, "en", 4);
  const pageUrl = `https://tecpey.ir/en/trading-tools/${tool.slug}`;

  return (
    <EnglishShell>
      <StructuredData
        data={[
          ...buildTraderToolDetailSchemas(tool, "en"),
          buildNewsImpactItemListSchema({
            items: impactNews,
            locale: "en",
            pageUrl,
            name: `${tool.name} high-priority news impact history`,
          }),
        ]}
      />
      <EnglishHero
        eyebrow={tool.categoryEn}
        title={`${tool.name} guide for crypto research`}
        description={tool.articleEn}
        ctaHref="/en/trading-tools"
        ctaLabel="All tools"
        secondaryHref="/en/risk-disclosure"
        secondaryLabel="Risk disclosure"
      />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/en/trading-tools" className="inline-flex items-center gap-2 text-sm font-black text-cyan-700 dark:text-cyan-300">
            Back to toolbox
            <ArrowRight className="h-4 w-4" />
          </Link>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <article className="rounded-[34px] border border-cyan-300/15 bg-[color:var(--tp-card)] p-6 shadow-xl shadow-cyan-500/5 lg:p-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-700 dark:text-cyan-200">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Educational tool context
              </div>
              <h1 className="mt-6 text-4xl font-black leading-tight text-[color:var(--tp-text)] sm:text-5xl">
                How to use {tool.name} without treating it as a signal
              </h1>
              <div className="mt-6 space-y-5 text-base font-bold leading-8 text-[color:var(--tp-muted)]">
                <p>{tool.articleEn}</p>
                <p>
                  TecPey lists {tool.name} as part of a broader decision process: check price, volume, liquidity,
                  relevant news, security context and your own risk plan before acting.
                </p>
                <p>
                  External tools can help you research faster, but they do not remove market risk. Verify the official
                  domain, permissions, pricing and any account connection before use.
                </p>
              </div>

              <section className="mt-8 grid gap-4 md:grid-cols-3">
                {[
                  ["Use case", tool.categoryEn],
                  ["TecPey score", `${rankScore}`],
                  ["Official domain", tool.domain],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[24px] border border-cyan-300/15 bg-cyan-400/10 p-5">
                    <p className="text-xs font-black text-cyan-700 dark:text-cyan-200">{label}</p>
                    <p className="mt-2 text-lg font-black text-[color:var(--tp-text)]">{value}</p>
                  </div>
                ))}
              </section>

              <NewsImpactTimeline items={impactNews} locale="en" subject={tool.name} />
            </article>

            <aside className="space-y-4">
              <section className="rounded-[30px] border border-cyan-300/15 bg-slate-950 p-5 text-white shadow-2xl shadow-cyan-500/10">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black text-cyan-200">TecPey score</p>
                    <p className="mt-1 text-4xl font-black">{rankScore}</p>
                  </div>
                  <ShieldCheck className="h-10 w-10 text-cyan-300" aria-hidden="true" />
                </div>
                <p className="mt-4 text-sm font-bold leading-7 text-slate-300">
                  The score is an educational display signal based on official-link completeness, usefulness, category
                  importance and editorial weighting.
                </p>
              </section>

              <section className="rounded-[30px] border border-cyan-300/15 bg-[color:var(--tp-card)] p-5">
                <h2 className="text-lg font-black text-[color:var(--tp-text)]">Official links</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {platforms.map((platform) => (
                    <span key={platform as string} className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-700 dark:text-cyan-200">
                      {platform}
                    </span>
                  ))}
                </div>
                <a
                  href={tool.site}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  Open official site
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </section>

              <section className="rounded-[30px] border border-cyan-300/15 bg-[color:var(--tp-card)] p-5">
                <h2 className="text-lg font-black text-[color:var(--tp-text)]">Next steps in TecPey</h2>
                <div className="mt-4 grid gap-3">
                  <Link href="/en/academy" className="rounded-2xl border border-cyan-300/15 px-4 py-3 text-sm font-black text-cyan-700 dark:text-cyan-200">
                    Learn before trading
                  </Link>
                  <Link href="/en/markets" className="rounded-2xl border border-cyan-300/15 px-4 py-3 text-sm font-black text-cyan-700 dark:text-cyan-200">
                    Review market board
                  </Link>
                  <Link href="/en/security" className="rounded-2xl border border-cyan-300/15 px-4 py-3 text-sm font-black text-cyan-700 dark:text-cyan-200">
                    Security guide
                  </Link>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </EnglishShell>
  );
}
