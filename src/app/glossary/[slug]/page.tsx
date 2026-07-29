
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import terms from "@/data/glossaryTerms.json";

type Props = { params: Promise<{ slug: string }> };
function getTerm(slug: string) { return terms.find((term) => term.slug === slug); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; const term = getTerm(slug); if (!term) return {};
  return { title: `${term.fa} چیست؟ | واژه‌نامه رمزارز تک‌پی`, description: term.summaryFa, alternates: { canonical: `https://tecpey.ir/glossary/${term.slug}` }, keywords: [term.fa, term.en, `${term.fa} چیست`, term.categoryFa, ...term.related] };
}
export default async function GlossaryTermPage({ params }: Props) {
  const { slug } = await params; const term = getTerm(slug); if (!term) return notFound();
  const schema = { "@context":"https://schema.org", "@type":"DefinedTerm", name: term.fa, alternateName: term.en, description: term.summaryFa, inDefinedTermSet:"https://tecpey.ir/glossary", url:`https://tecpey.ir/glossary/${term.slug}` };
  const faqSchema = { "@context":"https://schema.org", "@type":"FAQPage", mainEntity: term.faqFa.map((f)=>({"@type":"Question", name:f.q, acceptedAnswer:{"@type":"Answer", text:f.a}})) };
  return <main dir="rtl" className="min-h-screen bg-[color:var(--tp-bg)] px-4 py-14 text-[color:var(--tp-text)] sm:px-6 lg:px-8">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema)}} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(faqSchema)}} />
    <article className="mx-auto max-w-4xl">
      <Link href="/glossary" className="inline-flex items-center gap-2 text-sm font-black text-cyan-500"><ArrowLeft className="h-4 w-4 rotate-180" /> بازگشت به واژه‌نامه</Link>
      <div className="mt-6 rounded-[36px] border border-cyan-300/15 bg-white/80 p-6 shadow-2xl shadow-cyan-500/10 dark:bg-white/[0.055] lg:p-8">
        <div className="inline-flex rounded-full bg-cyan-500/10 px-4 py-2 text-xs font-black text-cyan-500">{term.categoryFa}</div>
        <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl">{term.fa} چیست؟</h1>
        <p className="mt-2 text-lg font-black text-cyan-500">{term.en}</p>
        <p className="mt-5 text-lg font-bold leading-9 text-[color:var(--tp-muted)]">{term.summaryFa}</p>
      </div>
      <section className="mt-6 rounded-[32px] border border-slate-200 bg-white/82 p-6 dark:border-white/10 dark:bg-white/5"><h2 className="text-2xl font-black">توضیح کامل</h2><p className="mt-4 text-base font-bold leading-9 text-[color:var(--tp-muted)]">{term.detailFa}</p></section>
      <section className="mt-6 rounded-[32px] border border-cyan-300/20 bg-cyan-400/10 p-6"><h2 className="text-2xl font-black">مثال کاربردی</h2><p className="mt-4 text-base font-bold leading-9 text-[color:var(--tp-muted)]">{term.exampleFa}</p></section>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section className="rounded-[30px] border border-emerald-300/20 bg-emerald-400/10 p-5"><h3 className="flex items-center gap-2 text-xl font-black"><CheckCircle2 className="h-5 w-5 text-emerald-400" />مزایا</h3><ul className="mt-4 space-y-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{term.prosFa.map((x)=><li key={x}>• {x}</li>)}</ul></section>
        <section className="rounded-[30px] border border-rose-300/20 bg-rose-400/10 p-5"><h3 className="flex items-center gap-2 text-xl font-black"><XCircle className="h-5 w-5 text-rose-400" />محدودیت‌ها</h3><ul className="mt-4 space-y-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{term.consFa.map((x)=><li key={x}>• {x}</li>)}</ul></section>
      </div>
      <section className="mt-6 rounded-[32px] border border-amber-300/20 bg-amber-400/10 p-6"><h2 className="flex items-center gap-2 text-2xl font-black"><AlertTriangle className="h-6 w-6 text-amber-400" />ریسک‌ها و اشتباهات رایج</h2><ul className="mt-4 space-y-3 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">{[...term.risksFa,...term.mistakesFa].map((x)=><li key={x}>• {x}</li>)}</ul></section>
      <section className="mt-6 rounded-[32px] border border-slate-200 bg-white/82 p-6 dark:border-white/10 dark:bg-white/5"><h2 className="text-2xl font-black">سوالات پرتکرار</h2><div className="mt-4 space-y-4">{term.faqFa.map((f)=><div key={f.q} className="rounded-2xl bg-slate-100/70 p-4 dark:bg-white/5"><h3 className="font-black">{f.q}</h3><p className="mt-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{f.a}</p></div>)}</div></section>
      <section className="mt-6"><h2 className="text-xl font-black">واژه‌های مرتبط</h2><div className="mt-3 flex flex-wrap gap-2">{term.related.map((r)=><Link key={r} href={`/glossary/${r}`} className="rounded-full border border-cyan-300/20 px-3 py-1 text-xs font-black text-cyan-500 hover:bg-cyan-500/10">{r}</Link>)}</div></section>
    </article>
  </main>;
}
