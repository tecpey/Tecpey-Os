import { academyPathTerms } from "@/data/academyPath";
import { academyPathTermsEn } from "@/data/academyPathEn";

export type AcademyLocale = "fa" | "en";
export type LessonProgressAction = "complete" | "answer";

export type LessonProgressRecord = {
  locale: AcademyLocale;
  termNumber: number;
  termSlug: string;
  sectionKey: string;
  sectionHeading: string;
  completed: boolean;
  answer: string | null;
  firstAnswer: string | null;
  answerAttempts: string[];
  completedAt: string | null;
  answeredAt: string | null;
  updatedAt: string;
};

export type TermLearningSummary = {
  locale: AcademyLocale;
  termNumber: number;
  termSlug: string;
  totalSections: number;
  completedSections: number;
  answeredSections: number;
  percent: number;
  xp: number;
  updatedAt: string | null;
};

export type OfficialLessonDefinition = {
  termNumber: number;
  termSlug: string;
  totalSections: number;
  sectionKey: string;
  sectionIndex: number;
  sectionHeading: string;
};

const MAX_ANSWER_LENGTH = 500;
const MAX_ATTEMPTS = 20;

export function parseAcademyLocale(value: unknown): AcademyLocale {
  return value === "en" ? "en" : "fa";
}

export function normalizeLessonAnswer(value: unknown): string | null {
  const answer = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ANSWER_LENGTH);
  return answer.length > 0 ? answer : null;
}

export function sectionKeyForIndex(index: number): string {
  return `lesson-${index + 1}`;
}

export function resolveOfficialLesson(
  locale: AcademyLocale,
  termSlug: string,
  sectionKey: string,
): OfficialLessonDefinition | null {
  const terms = locale === "en" ? academyPathTermsEn : academyPathTerms;
  const term = terms.find((item) => item.slug === termSlug);
  if (!term || term.number < 1 || term.number > 7) return null;

  const match = /^lesson-(\d+)$/.exec(sectionKey);
  if (!match) return null;
  const sectionIndex = Number(match[1]) - 1;
  const canonicalSectionKey = sectionKeyForIndex(sectionIndex);
  if (sectionKey !== canonicalSectionKey) return null;

  const lesson = term.lessons[sectionIndex];
  const sectionHeading = lesson?.[0];
  if (!lesson || typeof sectionHeading !== "string" || !sectionHeading.trim()) return null;

  return {
    termNumber: term.number,
    termSlug: term.slug,
    totalSections: term.lessons.length,
    sectionKey: canonicalSectionKey,
    sectionIndex,
    sectionHeading: sectionHeading.trim().slice(0, 500),
  };
}

export function normalizeAttempts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeLessonAnswer)
    .filter((item): item is string => item !== null)
    .slice(-MAX_ATTEMPTS);
}

export function appendAttempt(existing: unknown, answer: string): string[] {
  return [...normalizeAttempts(existing), answer].slice(-MAX_ATTEMPTS);
}

export function calculateTermLearningSummary(input: {
  locale: AcademyLocale;
  termNumber: number;
  termSlug: string;
  totalSections: number;
  completedSections: number;
  answeredSections: number;
  updatedAt?: string | null;
}): TermLearningSummary {
  const totalSections = Math.max(1, Math.min(100, Math.round(input.totalSections)));
  const completedSections = Math.max(0, Math.min(totalSections, Math.round(input.completedSections)));
  const answeredSections = Math.max(0, Math.min(totalSections, Math.round(input.answeredSections)));
  const percent = Math.round((completedSections / totalSections) * 100);
  const xp = completedSections * 10 + answeredSections * 5;

  return {
    locale: input.locale,
    termNumber: Math.max(1, Math.min(7, Math.round(input.termNumber))),
    termSlug: input.termSlug,
    totalSections,
    completedSections,
    answeredSections,
    percent,
    xp,
    updatedAt: input.updatedAt ?? null,
  };
}
