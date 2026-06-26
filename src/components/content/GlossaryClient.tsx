"use client";

import { useMemo, useState } from "react";
import { BookOpen, Search, ShieldCheck, X } from "lucide-react";
import terms from "@/data/glossaryTerms.json";

type Locale = "fa" | "en";
type GlossaryTerm = (typeof terms)[number];

export default function GlossaryClient({ locale = "fa" }: { locale?: Locale }) {
  const isEn = locale === "en";
  const [query, setQuery] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<GlossaryTerm | null>(null);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return terms;
    return terms.filter((t) => [t.fa, t.en, t.categoryFa, t.categoryEn, t.summaryFa, t.summaryEn, t.detailFa, t.slug].join(" ").toLowerCase().includes(q));
  }, [query]);

  return (
    <main dir={isEn ? "ltr" : "rtl"} className="min-h-screen bg-[color:var(--tp-bg)] px-4 py-10 text-[color:var(--tp-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-[34px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.18),transparent_34%),rgba(255,255,255,.045)] p-6 shadow-2xl shadow-cyan-500/10 lg:p-8">
          <div className="inline-flex rounded-full bg-cyan-500/10 px-4 py-2 text-xs font-black text-cyan-500">{isEn ? "TecPey Crypto Wiki" : "ویکی تخصصی رمزارز تک‌پی"}</div>
          <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">{isEn ? "Crypto terms, explained clearly" : "واژه‌نامه ساده و تخصصی بازار رمزارز"}</h1>
          <p className="mt-4 max-w-4xl text-base font-bold leading-8 text-[color:var(--tp-muted)]">
            {isEn
              ? "Search each concept, understand its real use, common mistakes and risk points without leaving the page."
              : "هر مفهوم را ساده، دقیق و کاربردی یاد بگیر؛ تعریف، مثال، ریسک و اشتباهات رایج را همان‌جا ببین، بدون اینکه از صفحه خارج شوی."}
          </p>
          <div className="mt-6 flex max-w-2xl items-center gap-3 rounded-2xl border border-cyan-300/15 bg-white/70 px-4 py-3 dark:bg-white/[0.06]">
            <Search className="h-5 w-5 text-cyan-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isEn ? "Search FVG, funding, liquidity..." : "جستجو: FVG، فاندینگ، لیکوییدیشن، RSI..."} className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-500" />
          </div>
          <div className="mt-4 text-xs font-bold text-[color:var(--tp-muted)]">{isEn ? `${list.length} terms` : `${list.length} واژه تخصصی`}</div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((term) => (
            <button key={term.slug} type="button" onClick={() => setSelectedTerm(term)} className="group text-start rounded-[30px] border border-cyan-300/15 bg-white/80 p-5 shadow-xl shadow-cyan-500/5 transition hover:-translate-y-1 hover:border-cyan-300/45 dark:bg-white/[0.055]">
              <div className="flex items-start justify-between gap-4">
                <div><div className="text-2xl font-black">{isEn ? term.en : term.fa}</div><div className="mt-1 text-sm font-black text-cyan-500">{isEn ? term.fa : term.en}</div></div>
                <BookOpen className="h-6 w-6 text-cyan-400" />
              </div>
              <p className="mt-4 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{isEn ? term.summaryEn : term.summaryFa}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-[11px] font-black text-cyan-500">{isEn ? term.categoryEn : term.categoryFa}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-black text-emerald-500"><ShieldCheck className="h-3 w-3" /> {isEn ? "Risk-aware" : "آموزش امن"}</span>
              </div>
            </button>
          ))}
        </section>
      </div>

      {selectedTerm ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-md" role="dialog" aria-modal="true">
          <div className="max-h-[86dvh] w-full max-w-2xl overflow-hidden rounded-[30px] border border-cyan-300/25 bg-[color:var(--tp-bg)] shadow-[0_30px_120px_rgba(0,0,0,.55)]">
            <div className="flex items-start justify-between gap-4 border-b border-cyan-300/15 bg-cyan-400/10 p-5">
              <div>
                <div className="text-2xl font-black">{isEn ? selectedTerm.en : selectedTerm.fa}</div>
                <div className="mt-1 text-sm font-black text-cyan-500">{isEn ? selectedTerm.fa : selectedTerm.en}</div>
              </div>
              <button type="button" onClick={() => setSelectedTerm(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5 transition hover:bg-white/10" aria-label={isEn ? "Close" : "بستن"}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(86dvh-86px)] overflow-y-auto p-5">
              <p className="text-sm font-bold leading-8 text-[color:var(--tp-muted)]">{isEn ? selectedTerm.detailEn : selectedTerm.detailFa}</p>

              <div className="mt-5 rounded-3xl border border-cyan-300/15 bg-cyan-400/10 p-4">
                <div className="mb-2 text-sm font-black text-cyan-500">{isEn ? "Practical example" : "مثال کاربردی"}</div>
                <p className="text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{isEn ? selectedTerm.exampleEn : selectedTerm.exampleFa}</p>
              </div>

              {!isEn ? (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-rose-300/15 bg-rose-500/10 p-4">
                    <div className="mb-2 text-sm font-black text-rose-400">ریسک‌ها</div>
                    <ul className="space-y-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                      {selectedTerm.risksFa.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-3xl border border-amber-300/15 bg-amber-500/10 p-4">
                    <div className="mb-2 text-sm font-black text-amber-400">اشتباهات رایج</div>
                    <ul className="space-y-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                      {selectedTerm.mistakesFa.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                {(selectedTerm.related || []).slice(0, 5).map((slug) => {
                  const related = terms.find((term) => term.slug === slug);
                  if (!related) return null;
                  return (
                    <button key={slug} type="button" onClick={() => setSelectedTerm(related)} className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-black text-cyan-500 transition hover:bg-cyan-500/20">
                      {isEn ? related.en : related.fa}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
