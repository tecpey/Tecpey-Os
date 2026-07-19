import { createHash } from "node:crypto";
import { academyPathTerms } from "@/data/academyPath";
import { academyPathTermsEn } from "@/data/academyPathEn";
import {
  parseAcademyLocale,
  resolveOfficialLesson,
  type AcademyLocale,
  type OfficialLessonDefinition,
} from "./academy-lesson-progress";

export type AcademyCheckpointOption = {
  id: string;
  text: string;
};

export type AcademySectionCheckpoint = {
  questionId: string;
  questionVersion: string;
  prompt: string;
  options: AcademyCheckpointOption[];
};

type ResolvedCheckpoint = {
  definition: OfficialLessonDefinition;
  checkpoint: AcademySectionCheckpoint;
  correctOptionId: string;
};

type LessonTuple = readonly string[];
type TermShape = {
  number: number;
  slug: string;
  lessons: readonly LessonTuple[];
};

function stableShuffle<T>(items: readonly T[], seedText: string): T[] {
  const values = [...items];
  let seed = 0;
  for (let index = 0; index < seedText.length; index += 1) {
    seed = (seed * 31 + seedText.charCodeAt(index)) >>> 0;
  }
  for (let index = values.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function cleanText(value: unknown, fallback: string): string {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function lessonTuple(locale: AcademyLocale, definition: OfficialLessonDefinition): LessonTuple | null {
  const terms = (locale === "en" ? academyPathTermsEn : academyPathTerms) as readonly TermShape[];
  const term = terms.find((entry) => entry.slug === definition.termSlug);
  return term?.lessons[definition.sectionIndex] ?? null;
}

function checkpointVersion(input: {
  locale: AcademyLocale;
  definition: OfficialLessonDefinition;
  heading: string;
  outcome: string;
  commonMistake: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      schema: "academy_section_checkpoint_v1",
      locale: input.locale,
      termSlug: input.definition.termSlug,
      sectionKey: input.definition.sectionKey,
      heading: input.heading,
      outcome: input.outcome,
      commonMistake: input.commonMistake,
    }))
    .digest("hex")
    .slice(0, 24);
}

export function resolveAcademySectionCheckpoint(
  localeInput: unknown,
  termSlug: string,
  sectionKey: string,
): ResolvedCheckpoint | null {
  const locale = parseAcademyLocale(localeInput);
  const definition = resolveOfficialLesson(locale, termSlug, sectionKey);
  if (!definition) return null;
  const lesson = lessonTuple(locale, definition);
  if (!lesson) return null;

  const isFa = locale === "fa";
  const heading = cleanText(lesson[0], definition.sectionHeading);
  const commonMistake = cleanText(
    lesson[3],
    isFa
      ? "تصمیم‌گیری سریع بدون بررسی شواهد، ریسک و پیامدها"
      : "Acting quickly without checking evidence, risk, or consequences",
  );
  const outcome = cleanText(
    lesson[5],
    cleanText(lesson[1], isFa ? "درک مسئولانه مفهوم درس" : "Responsible understanding of the lesson"),
  );
  const questionId = `${definition.termSlug}/${definition.sectionKey}/checkpoint`;
  const questionVersion = checkpointVersion({
    locale,
    definition,
    heading,
    outcome,
    commonMistake,
  });
  const correctOptionId = "lesson-outcome";
  const options = stableShuffle<AcademyCheckpointOption>([
    { id: correctOptionId, text: outcome },
    { id: "common-mistake", text: commonMistake },
    {
      id: "skip-evidence",
      text: isFa
        ? "بدون تمرین و بدون بررسی منبع می‌توان بر اساس عنوان درس تصمیم مالی گرفت."
        : "The lesson title alone is enough to make a financial decision without practice or source review.",
    },
    {
      id: "guaranteed-result",
      text: isFa
        ? "یادگیری این مفهوم، نتیجه مالی مثبت و بدون ریسک را تضمین می‌کند."
        : "Learning this concept guarantees a positive financial result without risk.",
    },
  ], `${questionId}:${questionVersion}`);

  return {
    definition,
    correctOptionId,
    checkpoint: {
      questionId,
      questionVersion,
      prompt: isFa
        ? `کدام گزینه پیام اصلی درس «${heading}» را دقیق‌تر و مسئولانه‌تر بیان می‌کند؟`
        : `Which option most accurately and responsibly expresses the main lesson of “${heading}”?`,
      options,
    },
  };
}

export function listAcademyTermCheckpoints(
  localeInput: unknown,
  termSlug: string,
): Array<{ sectionKey: string; checkpoint: AcademySectionCheckpoint }> {
  const locale = parseAcademyLocale(localeInput);
  const terms = (locale === "en" ? academyPathTermsEn : academyPathTerms) as readonly TermShape[];
  const term = terms.find((entry) => entry.slug === termSlug);
  if (!term) return [];
  return term.lessons.flatMap((_lesson, index) => {
    const sectionKey = `lesson-${index + 1}`;
    const resolved = resolveAcademySectionCheckpoint(locale, termSlug, sectionKey);
    return resolved ? [{ sectionKey, checkpoint: resolved.checkpoint }] : [];
  });
}

export function gradeAcademySectionCheckpoint(input: {
  locale: unknown;
  termSlug: string;
  sectionKey: string;
  questionVersion: string;
  selectedOptionId: string;
}):
  | { status: "graded"; correct: boolean; resolved: ResolvedCheckpoint }
  | { status: "not_found" }
  | { status: "version_conflict"; current: AcademySectionCheckpoint } {
  const resolved = resolveAcademySectionCheckpoint(input.locale, input.termSlug, input.sectionKey);
  if (!resolved) return { status: "not_found" };
  if (resolved.checkpoint.questionVersion !== input.questionVersion) {
    return { status: "version_conflict", current: resolved.checkpoint };
  }
  const optionExists = resolved.checkpoint.options.some((option) => option.id === input.selectedOptionId);
  return {
    status: "graded",
    correct: optionExists && input.selectedOptionId === resolved.correctOptionId,
    resolved,
  };
}
