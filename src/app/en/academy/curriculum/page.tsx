import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { EnglishShell } from "../../components/EnglishUI";
import { safeJsonLd } from "@/lib/json-ld";

const pageUrl = "https://tecpey.ir/en/academy/curriculum";

export const metadata: Metadata = {
  title: "TecPey Academy 7-Term Curriculum | Learn crypto step by step",
  description:
    "The TecPey Academy curriculum starts from the basics and moves through account security, exchange use, technical and fundamental analysis, risk management and professional readiness.",
  alternates: {
    canonical: pageUrl,
    languages: {
      "fa-IR": "https://tecpey.ir/academy/curriculum",
      "en-US": pageUrl,
      "x-default": "https://tecpey.ir/academy/curriculum",
    },
  },
  openGraph: {
    title: "TecPey Academy 7-Term Curriculum",
    description:
      "A structured crypto learning path: basics, security, exchange use, analysis, risk management and professional readiness.",
    url: pageUrl,
    siteName: "TecPey",
    locale: "en_US",
    type: "website",
  },
};

const items = [
  "Term 1: Blockchain and crypto fundamentals",
  "Term 2: Account security and asset custody",
  "Terms 3–5: Exchange use, technical and fundamental analysis",
  "Terms 6–7: Money management, psychology and professional readiness",
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Course",
    name: "TecPey Academy 7-Term Curriculum",
    description:
      "Structured crypto learning path from fundamentals to professional readiness across seven terms.",
    url: pageUrl,
    inLanguage: "en-US",
    provider: { "@type": "Organization", name: "TecPey", url: "https://tecpey.ir" },
    educationalLevel: "Beginner to Advanced",
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "TecPey", item: "https://tecpey.ir/en" },
      { "@type": "ListItem", position: 2, name: "Academy", item: "https://tecpey.ir/en/academy" },
      { "@type": "ListItem", position: 3, name: "Curriculum", item: pageUrl },
    ],
  },
];

export default function Page() {
  return (
    <EnglishShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }} />
      <main className="bg-[color:var(--tp-bg)] px-4 py-24 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-5xl rounded-[34px] border border-cyan-300/15 bg-white/[0.07] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl lg:p-10">
          <div className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-200">TecPey Academy</div>
          <h1 className="mt-5 text-3xl font-black leading-tight text-white sm:text-5xl">The 7-term Academy path</h1>
          <p className="mt-5 text-base font-bold leading-9 text-slate-300">The TecPey Academy starts from the basics and moves through account security, exchange use, analysis, risk management and professional readiness — education first, with no profit or signal promises.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <div key={item} className="rounded-[24px] border border-cyan-300/15 bg-slate-950/35 p-5">
                <CheckCircle2 className="h-6 w-6 text-cyan-300" />
                <p className="mt-3 text-sm font-bold leading-8 text-slate-200">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/en/academy/term-1" className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">
              Continue the path
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/en/academy" className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15">
              Back to Academy
            </Link>
          </div>
        </section>
      </main>
    </EnglishShell>
  );
}
