import { createHash } from "crypto";
import { TERM1, type Lesson, type QuizQuestion } from "@/data/academy/term1Curriculum";

export type QuizAnswerValue = string | string[] | Record<string, string>;
export type QuizAnswerMap = Record<string, QuizAnswerValue>;

export type LessonAssessmentResult = {
  lessonId: string;
  termNumber: number;
  moduleId: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
  perfect: boolean;
};

export function listCanonicalLessons(): Array<{ lesson: Lesson; moduleId: string }> {
  return TERM1.modules.flatMap((module) => module.lessons.map((lesson) => ({ lesson, moduleId: module.id })));
}

export function resolveCanonicalLesson(lessonId: string): { lesson: Lesson; moduleId: string } | null {
  return listCanonicalLessons().find((item) => item.lesson.id === lessonId) ?? null;
}

function normalizeString(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(normalizeString).filter(Boolean) : [];
}

function gradeQuestion(question: QuizQuestion, answer: QuizAnswerValue | undefined): boolean {
  switch (question.type) {
    case "single":
    case "scenario":
      return normalizeString(answer) === normalizeString(question.correctAnswer);
    case "fillblank": {
      const submitted = normalizeString(answer);
      return normalizeString(question.correctAnswer).split("|").map((item) => item.trim()).includes(submitted);
    }
    case "multi": {
      const submitted = normalizeStringArray(answer).sort();
      const expected = normalizeStringArray(question.correctAnswer).sort();
      return submitted.length === expected.length && submitted.every((item, index) => item === expected[index]);
    }
    case "ordering": {
      const submitted = normalizeStringArray(answer);
      const expected = normalizeStringArray(question.correctOrder ?? []);
      return submitted.length === expected.length && submitted.every((item, index) => item === expected[index]);
    }
    case "matching": {
      if (!answer || Array.isArray(answer) || typeof answer !== "object") return false;
      const submitted = answer as Record<string, string>;
      return (question.pairs ?? []).every(([term, definition]) => normalizeString(submitted[term]) === normalizeString(definition));
    }
    default:
      return false;
  }
}

export function canonicalizeLessonAnswers(lessonId: string, answers: QuizAnswerMap): QuizAnswerMap | null {
  const canonical = resolveCanonicalLesson(lessonId);
  if (!canonical) return null;
  return Object.fromEntries(
    canonical.lesson.knowledgeChecks.map((question) => [question.id, answers[question.id] ?? ""]),
  );
}

export function gradeCanonicalLesson(lessonId: string, answers: QuizAnswerMap): LessonAssessmentResult | null {
  const canonical = resolveCanonicalLesson(lessonId);
  if (!canonical) return null;
  const canonicalAnswers = canonicalizeLessonAnswers(lessonId, answers);
  if (!canonicalAnswers) return null;
  const questions = canonical.lesson.knowledgeChecks;
  if (questions.length === 0) return null;

  const correctCount = questions.reduce(
    (total, question) => total + (gradeQuestion(question, canonicalAnswers[question.id]) ? 1 : 0),
    0,
  );
  const score = Math.round((correctCount / questions.length) * 100);
  return {
    lessonId: canonical.lesson.id,
    termNumber: canonical.lesson.termNumber,
    moduleId: canonical.moduleId,
    score,
    correctCount,
    totalQuestions: questions.length,
    passed: score >= 80,
    perfect: score === 100,
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function hashLearningCommand(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}
