import "server-only";

import { createHash } from "crypto";
import { resolveOfficialLesson, type AcademyLocale } from "./academy-lesson-progress";

export type AcademyLessonQuestionOption = {
  id: string;
  label: string;
};

export type AcademyLessonQuestion = {
  id: string;
  version: number;
  prompt: string;
  options: AcademyLessonQuestionOption[];
};

type AcademyLessonQuestionAuthority = AcademyLessonQuestion & {
  correctOptionId: string;
};

const QUESTION_VERSION = 1;
const CORRECT_OPTION_ID = "explain_with_example";

function stableShuffle<T>(items: T[], seedText: string): T[] {
  const values = [...items];
  const digest = createHash("sha256").update(seedText).digest();
  let cursor = 0;
  for (let index = values.length - 1; index > 0; index -= 1) {
    const value = digest[cursor % digest.length];
    cursor += 1;
    const swapIndex = value % (index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function options(locale: AcademyLocale, heading: string): AcademyLessonQuestionOption[] {
  return locale === "en"
    ? [
        {
          id: CORRECT_OPTION_ID,
          label: `I can explain “${heading}” with a simple example and name its main risk`,
        },
        { id: "title_only", label: "I only read the lesson title" },
        {
          id: "act_without_practice",
          label: "I can make a financial decision without practice or verification",
        },
        {
          id: "risk_unrelated",
          label: "This topic is unrelated to financial or security risk",
        },
      ]
    : [
        {
          id: CORRECT_OPTION_ID,
          label: `می‌توانم مفهوم «${heading}» را با یک مثال ساده توضیح دهم و ریسک اصلی آن را نام ببرم`,
        },
        { id: "title_only", label: "فقط عنوان درس را خوانده‌ام" },
        {
          id: "act_without_practice",
          label: "بدون تمرین یا بررسی می‌توانم تصمیم مالی بگیرم",
        },
        {
          id: "risk_unrelated",
          label: "این موضوع ارتباطی با ریسک مالی یا امنیتی ندارد",
        },
      ];
}

export function resolveAcademyLessonQuestion(
  locale: AcademyLocale,
  termSlug: string,
  sectionKey: string,
): AcademyLessonQuestionAuthority | null {
  const lesson = resolveOfficialLesson(locale, termSlug, sectionKey);
  if (!lesson) return null;
  const id = `${locale}:${lesson.termSlug}:${lesson.sectionKey}:quick-check`;
  return {
    id,
    version: QUESTION_VERSION,
    prompt:
      locale === "en"
        ? `Which statement best demonstrates safe understanding after “${lesson.sectionHeading}”?`
        : `بعد از درس «${lesson.sectionHeading}»، کدام گزینه نشان‌دهنده فهم ایمن و واقعی است؟`,
    options: stableShuffle(
      options(locale, lesson.sectionHeading),
      `${id}:v${QUESTION_VERSION}`,
    ),
    correctOptionId: CORRECT_OPTION_ID,
  };
}

export function publicAcademyLessonQuestion(
  locale: AcademyLocale,
  termSlug: string,
  sectionKey: string,
): AcademyLessonQuestion | null {
  const question = resolveAcademyLessonQuestion(locale, termSlug, sectionKey);
  if (!question) return null;
  const { correctOptionId: _correctOptionId, ...publicQuestion } = question;
  return publicQuestion;
}

export function gradeAcademyLessonQuestion(input: {
  locale: AcademyLocale;
  termSlug: string;
  sectionKey: string;
  questionId: string;
  questionVersion: number;
  selectedOptionId: string;
}):
  | {
      valid: true;
      correct: boolean;
      question: AcademyLessonQuestionAuthority;
    }
  | { valid: false } {
  const question = resolveAcademyLessonQuestion(
    input.locale,
    input.termSlug,
    input.sectionKey,
  );
  if (
    !question ||
    question.id !== input.questionId ||
    question.version !== input.questionVersion ||
    !question.options.some((option) => option.id === input.selectedOptionId)
  ) {
    return { valid: false };
  }
  return {
    valid: true,
    correct: input.selectedOptionId === question.correctOptionId,
    question,
  };
}
