import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TERM1 } from "@/data/academy/term1Curriculum";
import { LessonPlayerV2Client } from "@/components/academy/v2/LessonPlayerV2Client";

type Props = { params: Promise<{ termSlug: string; lessonIndex: string }> };

const TERMS = [TERM1];

function resolveTerm(termSlug: string) {
  return TERMS.find((t) => t.slug === termSlug) ?? null;
}

function resolveLesson(termSlug: string, lessonIndexStr: string) {
  const term = resolveTerm(termSlug);
  if (!term) return null;
  const idx = parseInt(lessonIndexStr, 10);
  if (isNaN(idx)) return null;
  return term.modules.flatMap((m) => m.lessons).find((l) => l.lessonIndex === idx) ?? null;
}

export async function generateStaticParams() {
  const paths: { termSlug: string; lessonIndex: string }[] = [];
  for (const term of TERMS) {
    for (const mod of term.modules) {
      for (const lesson of mod.lessons) {
        paths.push({ termSlug: term.slug, lessonIndex: String(lesson.lessonIndex) });
      }
    }
  }
  return paths;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { termSlug, lessonIndex } = await params;
  const lesson = resolveLesson(termSlug, lessonIndex);
  if (!lesson) return { title: "آکادمی تک‌پی" };
  return {
    title: `${lesson.title} | آکادمی تک‌پی`,
    description: lesson.subtitle,
    alternates: { canonical: `https://tecpey.ir/academy/learn/${termSlug}/${lessonIndex}` },
  };
}

export default async function LessonPage({ params }: Props) {
  const { termSlug, lessonIndex } = await params;
  const term = resolveTerm(termSlug);
  const lesson = resolveLesson(termSlug, lessonIndex);
  if (!term || !lesson) return notFound();

  // Determine next lesson path
  const allLessons = term.modules.flatMap((m) => m.lessons);
  const nextLesson = allLessons.find((l) => l.lessonIndex === lesson.lessonIndex + 1);
  const nextPath = nextLesson
    ? `/academy/learn/${termSlug}/${nextLesson.lessonIndex}`
    : `/academy/${termSlug}`;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <LessonPlayerV2Client lesson={lesson} nextPath={nextPath} />
      </div>
    </div>
  );
}
