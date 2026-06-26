import type React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { academyPathTermsEn } from "@/data/academyPathEn";
import { EnglishShell } from "@/app/en/components/EnglishUI";
import { TermQuizClient } from "@/components/academy/TermQuizClient";
import { TermAccessGuard } from "@/components/academy/TermAccessGuard";
import { ArrowLeft, BookOpen, Brain, CheckCircle2, ClipboardCheck, Lightbulb, ListChecks, ShieldCheck, Target, TriangleAlert } from "lucide-react";


function publicQuizQuestions(questions: { q: string; options: string[]; answer?: string }[]) {
  return questions.map(({ q, options }) => ({ q, options }));
}

export function getAcademyTermEn(slug: string) {
  return academyPathTermsEn.find((term) => term.slug === slug);
}

export function generateTermMetadataEn(slug: string) {
  const term = getAcademyTermEn(slug);
  if (!term) return { title: "TecPey Academy" };
  return {
    title: `${term.title} | TecPey Academy`,
    description: term.subtitle,
    alternates: { canonical: `https://tecpey.ir/en/academy/${term.slug}` },
    openGraph: {
      title: `${term.title} | TecPey Academy`,
      description: term.subtitle,
      url: `https://tecpey.ir/en/academy/${term.slug}`,
      siteName: "TecPey",
      locale: "en_US",
      type: "article",
    },
  };
}

export function AcademyTermPageEn({ slug }: { slug: string }) {
  const term = getAcademyTermEn(slug);
  if (!term) return notFound();

  const courseSchema = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: term.title,
    description: term.subtitle,
    inLanguage: "en-US",
    provider: { "@type": "Organization", name: "TecPey", url: "https://tecpey.ir" },
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", courseWorkload: term.duration },
  };

  return (
    <EnglishShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(courseSchema) }} />
      <main className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/en/academy" className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-black text-cyan-700 transition hover:bg-cyan-100">
            <ArrowLeft className="h-4 w-4" />
            Back to Academy Path
          </Link>

          <TermAccessGuard termNumber={term.number} locale="en">
          <section className="mt-8 overflow-hidden rounded-[36px] border border-cyan-200 bg-[#06111f] shadow-[0_30px_100px_rgba(0,0,0,.30)]">
            <div className="grid gap-8 p-6 lg:grid-cols-[1fr_360px] lg:p-10">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-200">Term {term.number}</span>
                  <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-xs font-black text-emerald-200">{term.level}</span>
                  <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-black text-amber-100">{term.duration}</span>
                </div>
                <h1 className="mt-6 text-balance text-4xl font-black leading-[1.2] text-white sm:text-5xl">{term.title}</h1>
                <p className="mt-5 max-w-3xl text-lg font-bold leading-8 text-slate-300">{term.subtitle}</p>
                <div className="mt-7 rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5">
                  <div className="flex items-center gap-3 text-cyan-200">
                    <Target className="h-6 w-6" />
                    <h2 className="text-lg font-black">Learning outcome</h2>
                  </div>
                  <p className="mt-3 text-sm font-bold leading-8 text-slate-300">{term.outcome}</p>
                </div>
              </div>

              <aside className="rounded-[30px] border border-cyan-300/15 bg-cyan-300/10 p-5">
                <h2 className="text-xl font-black text-white">Term map</h2>
                <div className="mt-4 grid gap-3">
                  {term.lessons.map((lesson, index) => (
                    <a key={lesson[0]} href={`#lesson-${index + 1}`} className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3 text-sm font-black text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/10">
                      <span className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-300/15 text-cyan-200">{index + 1}</span>
                      <span className="leading-7">{lesson[0]}</span>
                    </a>
                  ))}
                </div>
              </aside>
            </div>
          </section>

          <section className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              {term.lessons.map((lesson, index) => {
                const [title, concept, example, mistake, checklist, proTip] = lesson;
                return (
                  <article id={`lesson-${index + 1}`} key={title} className="scroll-mt-28 rounded-[34px] border border-cyan-200 bg-white/95 p-6 shadow-[0_18px_60px_rgba(15,23,42,.10)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-700">Lesson {index + 1}</span>
                        <h2 className="mt-4 text-2xl font-black leading-10 text-slate-950">{title}</h2>
                      </div>
                      <BookOpen className="h-8 w-8 text-cyan-500" />
                    </div>
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <InfoCardEn icon={<Brain className="h-5 w-5" />} title="Core concept" text={concept} />
                      <InfoCardEn icon={<Lightbulb className="h-5 w-5" />} title="Real example" text={example} />
                      <InfoCardEn icon={<TriangleAlert className="h-5 w-5" />} title="Common mistake" text={mistake} danger />
                      <InfoCardEn icon={<ListChecks className="h-5 w-5" />} title="Practical checklist" text={checklist} />
                    </div>
                    <div className="mt-5 rounded-3xl border border-emerald-300/25 bg-emerald-50 p-5">
                      <div className="flex items-center gap-3 text-emerald-700">
                        <ShieldCheck className="h-5 w-5" />
                        <h3 className="font-black">TecPey pro tip</h3>
                      </div>
                      <p className="mt-3 text-sm font-bold leading-8 text-slate-700">{proTip}</p>
                    </div>
                  </article>
                );
              })}
            </div>
            <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-[30px] border border-cyan-300/15 bg-[#06111f] p-5 shadow-[0_20px_70px_rgba(0,0,0,.25)]">
                <h2 className="flex items-center gap-2 text-xl font-black text-white"><ClipboardCheck className="h-5 w-5 text-cyan-300" /> Readiness checklist</h2>
                <ul className="mt-4 space-y-3">
                  {term.readiness.map((item) => (
                    <li key={item} className="flex gap-2 text-sm font-bold leading-7 text-slate-300">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[30px] border border-amber-300/20 bg-amber-50 p-5">
                <h2 className="text-lg font-black text-amber-900">Important note</h2>
                <p className="mt-3 text-sm font-bold leading-8 text-slate-700">This path is educational. It is not financial advice and does not promise profit, prizes or outcomes.</p>
              </div>
            </aside>
          </section>

          <section id="term-quiz" className="mt-10 rounded-[34px] border border-cyan-200 bg-cyan-50 p-6">
            <h2 className="text-2xl font-black text-slate-950">End-of-term quiz</h2>
            <p className="mt-3 text-sm font-bold leading-8 text-slate-700">The goal is not memorization. The goal is to check whether knowledge can become safer behavior.</p>
            <TermQuizClient title={`Quiz: ${term.title}`} questions={publicQuizQuestions(term.questions)} locale="en" storageKey={`tecpey-academy-en-term-${term.number}`} termNumber={term.number} />
          </section>
          </TermAccessGuard>
        </div>
      </main>
    </EnglishShell>
  );
}

function InfoCardEn({ icon, title, text, danger = false }: { icon: React.ReactNode; title: string; text: string; danger?: boolean }) {
  return (
    <div className={`rounded-3xl border p-5 ${danger ? "border-rose-200 bg-rose-50" : "border-cyan-200 bg-cyan-50/70"}`}>
      <div className={`flex items-center gap-3 ${danger ? "text-rose-700" : "text-cyan-700"}`}>
        {icon}
        <h3 className="font-black">{title}</h3>
      </div>
      <p className="mt-3 text-sm font-bold leading-8 text-slate-700">{text}</p>
    </div>
  );
}
