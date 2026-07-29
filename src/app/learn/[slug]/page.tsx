
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { learningSeoPages, getLearningSeoPage } from "@/data/organicSeo";
import { ContentShell, FaqList } from "@/components/content/ContentUI";
import { BookOpen, CheckCircle2, ShieldCheck, ArrowLeft, Sparkles } from "lucide-react";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return learningSeoPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getLearningSeoPage(slug);
  if (!page) return { title: "مرکز یادگیری تک‌پی" };
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: { canonical: `https://tecpey.ir/learn/${page.slug}` },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `https://tecpey.ir/learn/${page.slug}`,
      siteName: "TecPey",
      locale: "fa_IR",
      type: "article",
      images: [{ url: "/images/tecpey-logo.png", width: 512, height: 512, alt: "TecPey" }],
    },
  };
}

export default async function LearningSeoPage({ params }: Props) {
  const { slug } = await params;
  const page = getLearningSeoPage(slug);
  if (!page) return notFound();

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "تک‌پی", item: "https://tecpey.ir/" },
      { "@type": "ListItem", position: 2, name: "مرکز یادگیری", item: "https://tecpey.ir/learn" },
      { "@type": "ListItem", position: 3, name: page.h1, item: `https://tecpey.ir/learn/${page.slug}` },
    ],
  };
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.h1,
    description: page.description,
    inLanguage: "fa-IR",
    mainEntityOfPage: `https://tecpey.ir/learn/${page.slug}`,
    author: { "@type": "Organization", name: "TecPey Academy" },
    publisher: {
      "@type": "Organization",
      name: "TecPey",
      logo: { "@type": "ImageObject", url: "https://tecpey.ir/images/tecpey-logo.png" },
    },
    about: page.keywords.map((name) => ({ "@type": "Thing", name })),
  };

  const courseSchema = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: page.h1,
    description: page.description,
    provider: { "@type": "Organization", name: "TecPey Academy", sameAs: "https://tecpey.ir/academy" },
    educationalLevel: "Beginner to Intermediate",
    inLanguage: "fa-IR",
    teaches: page.outcomes,
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: "PT2H",
      location: { "@type": "VirtualLocation", url: "https://tecpey.ir/academy" },
    },
  };

  return (
    <ContentShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbSchema, faqSchema, articleSchema, courseSchema]) }} />
      <main className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Link href="/academy" className="inline-flex items-center gap-2 text-sm font-black text-cyan-600 dark:text-cyan-300">
            <ArrowLeft className="h-4 w-4 rotate-180" /> بازگشت به آکادمی
          </Link>
          <section className="mt-6 overflow-hidden rounded-[38px] border border-cyan-300/20 bg-white/85 p-7 shadow-[0_24px_80px_rgba(8,47,73,.10)] dark:bg-white/[0.045] lg:p-10">
            <div className="inline-flex rounded-full bg-cyan-500/10 px-4 py-2 text-xs font-black text-cyan-600 dark:text-cyan-300">TecPey Learning OS</div>
            <h1 className="mt-5 text-4xl font-black leading-tight text-slate-950 dark:text-white lg:text-5xl">{page.h1}</h1>
            <p className="mt-5 max-w-4xl text-lg font-bold leading-9 text-slate-600 dark:text-slate-300">{page.description}</p>
            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <div className="rounded-[26px] border border-cyan-300/15 bg-cyan-500/10 p-5">
                <p className="text-xs font-black text-cyan-700 dark:text-cyan-200">هدف جستجوی کاربر</p>
                <p className="mt-2 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">{page.intent}</p>
              </div>
              <div className="rounded-[26px] border border-violet-300/15 bg-violet-500/10 p-5">
                <p className="text-xs font-black text-violet-700 dark:text-violet-200">مناسب برای</p>
                <p className="mt-2 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">{page.audience}</p>
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-4 md:grid-cols-3">
            {page.outcomes.map((item) => (
              <div key={item} className="rounded-[28px] border border-slate-200 bg-white/80 p-5 dark:border-white/10 dark:bg-white/[0.04]">
                <CheckCircle2 className="h-6 w-6 text-cyan-500" />
                <p className="mt-3 text-sm font-black leading-8 text-slate-800 dark:text-white">{item}</p>
              </div>
            ))}
          </section>

          <section className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <article className="space-y-5">
              {page.sections.map((section, index) => (
                <section key={section.title} className="rounded-[32px] border border-slate-200 bg-white/85 p-6 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="flex items-center gap-3">
                    {index === 0 ? <BookOpen className="h-6 w-6 text-cyan-500" /> : index === 1 ? <ShieldCheck className="h-6 w-6 text-cyan-500" /> : <Sparkles className="h-6 w-6 text-cyan-500" />}
                    <h2 className="text-2xl font-black text-slate-950 dark:text-white">{section.title}</h2>
                  </div>
                  <p className="mt-4 text-sm font-bold leading-9 text-slate-600 dark:text-slate-300">{section.body}</p>
                </section>
              ))}
              <section className="rounded-[32px] border border-cyan-300/20 bg-cyan-500/10 p-6">
                <h2 className="text-2xl font-black text-slate-950 dark:text-white">سوالات پرتکرار</h2>
                <div className="mt-5"><FaqList faqs={page.faqs} /></div>
              </section>
            </article>
            <aside className="h-fit rounded-[32px] border border-cyan-300/20 bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(8,47,73,.18)]">
              <h2 className="text-xl font-black">مسیر پیشنهادی تک‌پی</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-white/70">این مسیر یادگیری به درس‌های آکادمی، داده‌های بازار و کارتکس دانشجو وصل می‌شود تا مطالعه به اقدام آموزشی تبدیل شود.</p>
              <div className="mt-5 grid gap-3">
                {page.relatedAcademy.map((item) => (
                  <Link key={item.href} href={item.href} className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-black text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-400/10">
                    {item.label}
                  </Link>
                ))}
              </div>
              <Link href="/signup" className="mt-5 flex justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">شروع مسیر یادگیری</Link>
            </aside>
          </section>
        </div>
      </main>
    </ContentShell>
  );
}
