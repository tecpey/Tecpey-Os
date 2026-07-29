
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import terms from "@/data/glossaryTerms.json";

type Props = { params: Promise<{ slug: string }> };
function getTerm(slug: string) { return terms.find((term) => term.slug === slug); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const term=getTerm(slug); if(!term)return{}; return {title:`${term.en} | TecPey Glossary`,description:term.summaryEn,alternates:{canonical:`https://tecpey.ir/en/glossary/${term.slug}`}}; }
export default async function EnGlossaryTermPage({ params }: Props) { const {slug}=await params; const term=getTerm(slug); if(!term)return notFound(); return <main className="min-h-screen bg-[color:var(--tp-bg)] px-4 py-14 text-[color:var(--tp-text)] sm:px-6 lg:px-8"><article className="mx-auto max-w-4xl"><Link href="/en/glossary" className="text-sm font-black text-cyan-500">Back to glossary</Link><section className="mt-6 rounded-[36px] border border-cyan-300/15 bg-white/80 p-6 dark:bg-white/[0.055]"><div className="text-xs font-black text-cyan-500">{term.categoryEn}</div><h1 className="mt-4 text-5xl font-black">{term.en}</h1><p className="mt-2 text-lg font-black text-cyan-500">{term.fa}</p><p className="mt-5 text-lg font-bold leading-9 text-[color:var(--tp-muted)]">{term.summaryEn}</p></section><section className="mt-6 rounded-[32px] border border-slate-200 bg-white/82 p-6 dark:border-white/10 dark:bg-white/5"><h2 className="text-2xl font-black">Explanation</h2><p className="mt-4 text-base font-bold leading-9 text-[color:var(--tp-muted)]">{term.detailEn}</p></section></article></main> }
