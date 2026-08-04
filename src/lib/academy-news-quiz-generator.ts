// News-driven quiz generation for the Academy (smart quizzes).
//
// Turns a day's crypto-news item into a well-formed, answerable QuizQuestion so
// the exams can reflect current events. This is the deterministic, template
// based generator: it is pure (no model call, no I/O) and every question it
// emits is passed through the quiz-question integrity authority
// (assertQuizQuestionValid) before it is returned, so it fails closed — it can
// never hand a learner an unanswerable or malformed question. An AI-mentor
// generator can later replace the templating, but it MUST clear the same gate.
//
// Pedagogy matches TecPey's risk-first stance: the correct answer is always the
// responsible, education-first action, and the distractors are the hype / FOMO /
// signal-chasing mistakes. The generator never emits profit promises or
// predictions — questions teach process, not price.

import type { QuizQuestion } from "@/data/academy/term1Curriculum";
import { assertQuizQuestionValid } from "./academy-quiz-authority";

export type NewsQuizLocale = "fa" | "en";

export type NewsQuizInput = {
  id: string;
  title: string;
  category?: string;
  tone?: "bullish" | "bearish" | "neutral" | string;
  /** 1-10 headline significance; drives the difficulty label only. */
  impact?: number;
};

export type NewsQuizOptions = {
  locale: NewsQuizLocale;
  /** Overrides the concept tag the question is filed under. */
  conceptTag?: string;
};

/**
 * Profit-promise and price-prediction language that must never reach a learner.
 * The live news feed is untrusted copy, so a headline containing any of this is
 * not reproduced in the prompt — it is replaced with a neutral subject. Exported
 * as the single source of truth so tests assert against the same rule. Uses no
 * global flag, so `.test()` is stateless.
 */
export const PROHIBITED_CLAIM_PATTERN =
  /(guarantee|guaranteed|profit|double your|to the moon|\bmoon\b|\bx\d+\b|\d+\s*%\s*(?:gain|return|up)|\bpump\b|سود ?تضمین|حتماً? سود|قطعاً? رشد|دو ?برابر|به ?ماه|صد ?در ?صد)/i;

export function containsProhibitedClaim(text: string): boolean {
  return PROHIBITED_CLAIM_PATTERN.test(text);
}

const COPY: Record<NewsQuizLocale, {
  prompt: (subject: string) => string;
  correct: string;
  distractors: [string, string, string];
  explanation: string;
  defaultConceptTag: string;
  genericSubject: string;
}> = {
  en: {
    prompt: (subject) =>
      `A crypto headline reads: "${subject}". What is the most responsible first step before acting on it?`,
    correct: "Review the risk, your time horizon and position size before doing anything",
    distractors: [
      "Buy immediately before the price moves without you",
      "Follow a signal channel's call and skip your own checks",
      "Ignore security and act purely on the excitement",
    ],
    explanation:
      "News is context, not a trade instruction. The risk-first habit — checking exposure, horizon and security before acting — protects a learner regardless of which way the market moves.",
    defaultConceptTag: "crypto-news-literacy",
    genericSubject: "this market update",
  },
  fa: {
    prompt: (subject) =>
      `یک تیتر رمزارزی می‌گوید: «${subject}». مسئولانه‌ترین قدمِ اول قبل از هر واکنش چیست؟`,
    correct: "قبل از هر کاری، ریسک، افق زمانی و اندازه پوزیشن خود را بررسی کنید",
    distractors: [
      "فوراً و پیش از حرکت قیمت خرید کنید",
      "به سیگنالِ یک کانال اعتماد کنید و بررسی خودتان را نادیده بگیرید",
      "امنیت را کنار بگذارید و فقط با هیجان تصمیم بگیرید",
    ],
    explanation:
      "خبر، زمینه است نه دستور معامله. عادتِ ریسک‌محور — بررسی میزان درگیری سرمایه، افق زمانی و امنیت قبل از اقدام — کاربر را فارغ از جهتِ بازار محافظت می‌کند.",
    defaultConceptTag: "crypto-news-literacy",
    genericSubject: "این بروزرسانی بازار",
  },
};

function difficultyFor(impact: number | undefined): QuizQuestion["difficulty"] {
  if (typeof impact !== "number" || Number.isNaN(impact)) return "medium";
  if (impact >= 8) return "hard";
  if (impact >= 5) return "medium";
  return "easy";
}

function nonBlankOr(value: string | undefined, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

/**
 * Builds one answerable, risk-first QuizQuestion from a news item. Throws
 * `invalid_quiz_question:...` (via the integrity authority) if the constructed
 * question is not well-formed, so a caller can never surface a broken question.
 */
export function generateNewsQuizQuestion(
  item: NewsQuizInput,
  options: NewsQuizOptions,
): QuizQuestion {
  const copy = COPY[options.locale];
  // The headline is untrusted feed copy. Reproduce it only when it carries no
  // profit-promise / price-prediction language; otherwise teach the risk-first
  // response to a neutral "market update" rather than amplify the hype.
  const rawTitle = nonBlankOr(item.title, "");
  const subject =
    rawTitle.length > 0 && !containsProhibitedClaim(rawTitle) ? rawTitle : copy.genericSubject;
  // A single space keeps the four choices distinct and the correct answer an
  // exact option; the integrity authority enforces both.
  const choices = [copy.correct, ...copy.distractors];

  const question: QuizQuestion = {
    id: `news-quiz-${nonBlankOr(item.id, "unknown")}-${options.locale}`,
    type: "single",
    question: copy.prompt(subject),
    options: choices,
    correctAnswer: copy.correct,
    explanation: copy.explanation,
    difficulty: difficultyFor(item.impact),
    conceptTag: nonBlankOr(options.conceptTag, copy.defaultConceptTag),
  };

  // Fail closed: never return a question the graders cannot score.
  assertQuizQuestionValid(question);
  return question;
}

/**
 * Generates a validated question per news item and drops any item that cannot
 * produce a well-formed question, guaranteeing unique ids across the returned
 * bank (a later duplicate id for the same source item is skipped). The result is
 * always a bank every question of which passes the integrity authority.
 */
export function generateNewsQuizBank(
  items: NewsQuizInput[],
  options: NewsQuizOptions,
): QuizQuestion[] {
  const seen = new Set<string>();
  const bank: QuizQuestion[] = [];
  for (const item of items) {
    let question: QuizQuestion;
    try {
      question = generateNewsQuizQuestion(item, options);
    } catch {
      continue; // fail closed: skip an item that cannot yield a valid question
    }
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    bank.push(question);
  }
  return bank;
}
