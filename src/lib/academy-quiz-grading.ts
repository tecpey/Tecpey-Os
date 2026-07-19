import type { QuizQuestion } from "@/data/academy/term1Curriculum";

export type QuizSubmission = Record<string, unknown>;

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : [];
}

function normalizeMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [normalizeText(key), normalizeText(item)] as const)
      .filter(([key, item]) => key && item),
  );
}

export function gradeQuizAnswer(question: QuizQuestion, submitted: unknown): boolean {
  switch (question.type) {
    case "single":
    case "scenario":
      return normalizeText(submitted) === normalizeText(question.correctAnswer);
    case "multi": {
      const selected = [...new Set(normalizeList(submitted))].sort();
      const correct = [...new Set(normalizeList(question.correctAnswer))].sort();
      return selected.length === correct.length && selected.every((value, index) => value === correct[index]);
    }
    case "ordering": {
      const selected = normalizeList(submitted);
      const correct = normalizeList(question.correctOrder);
      return selected.length === correct.length && selected.every((value, index) => value === correct[index]);
    }
    case "matching": {
      const selected = normalizeMap(submitted);
      const pairs = question.pairs ?? [];
      return pairs.length > 0 && pairs.every(([term, definition]) => selected[term] === definition);
    }
    case "fillblank": {
      const value = normalizeText(submitted).toLowerCase();
      const accepted = normalizeText(question.correctAnswer)
        .toLowerCase()
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
      return value.length > 0 && accepted.includes(value);
    }
  }
}

export function gradeQuizSubmission(questions: QuizQuestion[], submission: QuizSubmission) {
  const results = questions.map((question) => ({
    questionId: question.id,
    correct: gradeQuizAnswer(question, submission[question.id]),
  }));
  const correct = results.filter((result) => result.correct).length;
  const total = questions.length;
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, percent, results };
}
