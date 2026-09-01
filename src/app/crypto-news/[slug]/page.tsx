import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Clock3, ExternalLink, Newspaper, ShieldAlert, Sparkles } from "lucide-react";
import { ContentShell, SeoNote } from "@/components/content/ContentUI";
import { StructuredData } from "@/components/seo/StructuredData";
import {
  buildNewsDetailSchemas,
  getNewsEditorialBoundaryCards,
  getNewsDetailDisplayMeta,
  getNewsDirectAnswerCards,
  getNewsDetailMetadata,
  getNewsDetailPageModelFromAuthority,
  getNewsDetailStaticParams,
} from "@/lib/news-detail-pages";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getNewsDetailStaticParams("fa");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const model = await getNewsDetailPageModelFromAuthority(slug, "fa");
  if (!model) return { title: "اخبار رمزارز تک‌پی" };
  return getNewsDetailMetadata(model, "fa");
}

export default async function CryptoNewsDetailPage({ params }: Props) {
  const { slug } = await params;
  const model = await getNewsDetailPageModelFromAuthority(slug, "fa");
  if (!model) return notFound();

  const { item, relatedCoins, relatedTools } = model;
  const meta = getNewsDetailDisplayMeta(item, "fa");
  const directAnswerCards = getNewsDirectAnswerCards(model, "fa");
  const editorialBoundaryCards = getNewsEditorialBoundaryCards(model, "fa");

  return (
    <ContentShell>
      <StructuredData data={buildNewsDetailSchemas(model, "fa")} />
      <section dir="rtl" className="bg-[color:var(--tp-bg)] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/crypto-news" className="inline-flex items-center gap-2 text-sm font-black text-cyan-600 dark:text-cyan-300">
            <ArrowLeft className="h-4 w-4 rotate-180" aria-hidden="true" />
            بازگشت به مرکز خبر
          </Link>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <article className="min-w-0 rounded-[34px] border border-cyan-300/15 bg-white/80 p-6 shadow-xl shadow-cyan-500/5 dark:bg-white/[0.045] lg:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-700 dark:text-cyan-100">
                  <Newspaper className="h-4 w-4" aria-hidden="true" />
                  خبر آموزشی تک‌پی
                </span>
                <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-xs font-black text-amber-700 dark:text-amber-200">
                  {meta.toneLabel}
                </span>
              </div>

              <h1 className="mt-6 text-4xl font-black leading-tight text-[color:var(--tp-text)] sm:text-5xl">
                {item.title}
              </h1>
              <p className="mt-5 text-base font-bold leading-9 text-[color:var(--tp-muted)]">{item.summary}</p>

              <div className="mt-6 grid gap-3 text-sm font-black text-slate-700 dark:text-slate-200 md:grid-cols-3">
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-4">
                  <span className="flex items-center gap-2 text-cyan-700 dark:text-cyan-100">
                    <Clock3 className="h-4 w-4" aria-hidden="true" />
                    انتشار
                  </span>
                  <time className="mt-2 block" dateTime={item.publishedAt}>{meta.publishedLabel}</time>
                </div>
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-4">
                  <span className="flex items-center gap-2 text-cyan-700 dark:text-cyan-100">
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    ثبت در تک‌پی
                  </span>
                  <time className="mt-2 block" dateTime={item.recordedAt}>{meta.recordedLabel}</time>
                </div>
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-4">
                  <span className="block text-cyan-700 dark:text-cyan-100">اولویت و اثر</span>
                  <span className="mt-2 block">اولویت {item.priority}/100 · اثر {item.impactScore}/10</span>
                </div>
              </div>

              <section className="mt-8 rounded-[28px] border border-cyan-300/15 bg-cyan-500/[0.065] p-5">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-2 text-xs font-black text-cyan-700 dark:bg-white/5 dark:text-cyan-100">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  دلیل ثبت در history
                </div>
                <p className="mt-4 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">{item.reasonFa}</p>
              </section>

              <section className="mt-8 rounded-[28px] border border-cyan-300/20 bg-slate-950 p-5 text-white">
                <h2 className="text-2xl font-black">پاسخ سریع و قابل استناد</h2>
                <p className="mt-2 text-xs font-bold leading-6 text-slate-300">پاسخ‌های مستقیم از دادهٔ همین صفحه ساخته شده‌اند تا کاربر، موتور جست‌وجو و Answer Engine بتوانند واقعیت، اهمیت و مسیر بررسی را بدون حدس استخراج کنند.</p>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {directAnswerCards.map((card) => (
                    <div key={card.question} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <h3 className="text-sm font-black text-cyan-200">{card.question}</h3>
                      <p className="mt-2 text-sm font-bold leading-7 text-slate-200">{card.answer}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-8 rounded-[28px] border border-cyan-300/15 bg-white/70 p-5 dark:bg-white/[0.04]">
                <h2 className="text-2xl font-black text-[color:var(--tp-text)]">مرز خبر، تحلیل و خلاصه AI</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {editorialBoundaryCards.map((card) => (
                    <div key={card.title} className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-4">
                      <h3 className="text-sm font-black text-cyan-700 dark:text-cyan-100">{card.title}</h3>
                      <p className="mt-3 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">{card.body}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-8">
                <h2 className="text-2xl font-black text-[color:var(--tp-text)]">این خبر به چه چیزهایی وصل است؟</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[26px] border border-cyan-300/15 bg-white/70 p-5 dark:bg-white/[0.04]">
                    <h3 className="font-black text-[color:var(--tp-text)]">کوین‌های مرتبط</h3>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {relatedCoins.map((coin) => (
                        <Link key={coin.symbol} href={`/coins/${coin.slug}`} className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-700 dark:text-cyan-100">
                          {coin.faName} · {coin.symbol}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[26px] border border-cyan-300/15 bg-white/70 p-5 dark:bg-white/[0.04]">
                    <h3 className="font-black text-[color:var(--tp-text)]">ابزارهای مرتبط</h3>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {relatedTools.map((tool) => (
                        <Link key={tool.slug} href={`/trading-tools/${tool.slug}`} className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-700 dark:text-cyan-100">
                          {tool.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="mt-8 rounded-[28px] border border-amber-300/25 bg-amber-400/10 p-5">
                <h2 className="text-xl font-black text-[color:var(--tp-text)]">قانون تک‌پی برای این خبر</h2>
                <p className="mt-3 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">
                  این صفحه برای آموزش، شفافیت و دنبال کردن زمینه بازار ساخته شده است؛ توصیه مالی، سیگنال خرید/فروش یا وعده سود نیست.
                </p>
              </section>
            </article>

            <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
              <section className="rounded-[30px] border border-cyan-300/15 bg-slate-950 p-5 text-white shadow-2xl shadow-cyan-500/10">
                <p className="text-xs font-black text-cyan-200">منبع و مسیر بررسی</p>
                <h2 className="mt-2 text-xl font-black">{item.sourceName}</h2>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  مشاهده منبع
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </section>

              <section className="rounded-[30px] border border-cyan-300/15 bg-white/80 p-5 dark:bg-white/[0.045]">
                <h2 className="text-lg font-black text-[color:var(--tp-text)]">قدم آموزشی بعدی</h2>
                <Link href={item.relatedLessonHref} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 px-5 py-3 text-sm font-black text-cyan-700 dark:text-cyan-100">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  رفتن به مسیر آموزشی مرتبط
                </Link>
              </section>

              <SeoNote />
            </aside>
          </div>
        </div>
      </section>
    </ContentShell>
  );
}
