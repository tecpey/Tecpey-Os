import { academyPathTerms } from "@/data/academyPath";
import { academyPathTermsEn } from "@/data/academyPathEn";
import type { Lesson, QuizQuestion, Term } from "./term1Curriculum";
import { TERM1 } from "./term1Curriculum";

export type AcademyCurriculumLocale = "fa" | "en";
type LegacyTerm = (typeof academyPathTerms)[number];

function toQuestion(locale: AcademyCurriculumLocale, termNumber: number, lessonIndex: number, questionIndex: number, source: LegacyTerm["questions"][number]): QuizQuestion {
  const distractors = source.options.filter((option) => option !== source.answer);
  const contrast = distractors.length > 0
    ? distractors[(termNumber + questionIndex) % distractors.length]
    : null;
  const explanation = locale === "fa"
    ? contrast
      ? `«${source.answer}» با اصل سنجیده‌شده در این سؤال سازگار است؛ «${contrast}» نمونهٔ گزینه‌ای است که همان اصل را نقض یا بیش‌ازحد ساده می‌کند. پاسخ را از روی دلیل انتخاب کنید، نه جای گزینه.`
      : `«${source.answer}» با اصل سنجیده‌شده در این سؤال سازگار است. پاسخ را از روی دلیل انتخاب کنید، نه جای گزینه.`
    : contrast
      ? `“${source.answer}” fits the principle being assessed; “${contrast}” is an example of an alternative that violates or oversimplifies that principle. Choose from the reasoning, not the option position.`
      : `“${source.answer}” fits the principle being assessed. Choose from the reasoning, not the option position.`;
  return {
    id: `t${termNumber}-l${lessonIndex}-q${questionIndex + 1}-${locale}`,
    type: "single",
    question: source.q,
    options: [...source.options],
    correctAnswer: source.answer,
    explanation,
    difficulty: questionIndex === 0 ? "easy" : questionIndex === 3 ? "hard" : "medium",
    conceptTag: `term-${termNumber}-lesson-${lessonIndex}`,
  };
}

function adaptLegacyLesson(locale: AcademyCurriculumLocale, term: LegacyTerm, lesson: LegacyTerm["lessons"][number], lessonIndex: number): Lesson {
  const [title, concept, example, mistake, checklist, coaching] = lesson;
  // Retrieval checks must assess this lesson, not recycle a term-level question bank.
  // This prevents learners from passing through recognition/memorization of unrelated prompts.
  const saferAction = checklist;
  const unsafeShortcut = mistake;
  const explainConcept = concept;
  const primaryOptions = [saferAction, unsafeShortcut, explainConcept];
  const primaryShift = (term.number + lessonIndex) % primaryOptions.length;
  const primaryCheck: QuizQuestion = {
    id: `t${term.number}-l${lessonIndex + 1}-retrieval-action-${locale}`,
    type: "single",
    question: locale === "fa"
      ? `در یک موقعیت تازه درباره «${title}»، کدام اقدام بیشترین تطابق را با فرآیند امن این درس دارد؟`
      : `In a fresh “${title}” scenario, which action best follows this lesson's safer process?`,
    options: [...primaryOptions.slice(primaryShift), ...primaryOptions.slice(0, primaryShift)],
    correctAnswer: saferAction,
    explanation: locale === "fa"
      ? `پاسخ باید به اقدام قابل‌اجرا برگردد: ${saferAction} این انتخاب از میانبر «${unsafeShortcut}» فاصله می‌گیرد.`
      : `The answer must return to an executable process: ${saferAction} This avoids the shortcut “${unsafeShortcut}”.`,
    difficulty: "medium",
    conceptTag: `term-${term.number}-lesson-${lessonIndex + 1}-application`,
  };
  const riskOptions = [unsafeShortcut, saferAction, coaching];
  const riskShift = (term.number + lessonIndex + 1) % riskOptions.length;
  const secondaryCheck: QuizQuestion = {
    id: `t${term.number}-l${lessonIndex + 1}-retrieval-risk-${locale}`,
    type: "single",
    question: locale === "fa"
      ? `کدام گزینه در «${title}» همان خطای رایجی است که باید تشخیص دهید؟`
      : `Which option is the common failure mode you should recognize in “${title}”?`,
    options: [...riskOptions.slice(riskShift), ...riskOptions.slice(0, riskShift)],
    correctAnswer: unsafeShortcut,
    explanation: locale === "fa"
      ? `این همان خطای هدف درس است: ${unsafeShortcut} برای اصلاح، به چک‌لیست و شواهد برگردید، نه حدس یا هیجان.`
      : `This is the lesson's target failure mode: ${unsafeShortcut} Correct it by returning to the checklist and evidence rather than guesswork or emotion.`,
    difficulty: "medium",
    conceptTag: `term-${term.number}-lesson-${lessonIndex + 1}-risk`,
  };
  return {
    id: `t${term.number}-l${lessonIndex + 1}-${locale}`, termNumber: term.number, lessonIndex: lessonIndex + 1,
    title, subtitle: term.subtitle,
    estimatedMinutes: Math.max(8, Math.round(Number.parseInt(term.duration, 10) / Math.max(1, term.lessons.length)) || 10),
    difficulty: term.number <= 2 ? "beginner" : term.number <= 5 ? "intermediate" : "advanced",
    objectives: locale === "fa"
      ? [`مفهوم «${title}» را با زبان خودم توضیح دهم.`, "ریسک یا خطای رایج این موضوع را تشخیص دهم.", "یک چک‌لیست عملی برای تصمیم امن‌تر بسازم."]
      : [`Explain “${title}” in my own words.`, "Recognize the main failure mode or risk.", "Build a practical checklist for a safer decision."],
    sections: [
      { heading: locale === "fa" ? "مفهوم اصلی" : "Core concept", body: concept },
      { heading: locale === "fa" ? "سناریوی واقعی" : "Worked scenario", body: example },
      { heading: locale === "fa" ? "خطای رایج" : "Common failure mode", body: mistake, callout: { type: "warning", text: mistake } },
      { heading: locale === "fa" ? "از دانستن تا عمل" : "From knowledge to action", body: checklist, callout: { type: "tip", text: coaching } },
    ],
    knowledgeChecks: [primaryCheck, secondaryCheck],
    flashcards: [
      { id: `fc-t${term.number}-l${lessonIndex + 1}-concept-${locale}`, front: title, back: concept, example, relatedTerms: [term.theme] },
      { id: `fc-t${term.number}-l${lessonIndex + 1}-risk-${locale}`, front: locale === "fa" ? `خطای رایج در «${title}» چیست؟` : `What is a common failure mode in “${title}”?`, back: mistake, example: checklist, relatedTerms: [term.theme] },
    ],
    keyTakeaways: [concept, mistake, checklist].map((value) => value.length > 220 ? `${value.slice(0, 217)}…` : value),
    mentorNote: coaching,
    practiceExercise: { title: locale === "fa" ? `تمرین تصمیم: ${title}` : `Decision practice: ${title}`, prompt: checklist, type: "checklist", items: term.readiness.slice(0, 3), expectedInsight: coaching },
    reflection: locale === "fa" ? `اگر امروز با سناریوی «${title}» روبه‌رو شوید، قبل از اقدام چه چیزی را بررسی می‌کنید و چه چیزی می‌تواند نظر شما را تغییر دهد؟` : `If you faced “${title}” today, what would you verify before acting, and what evidence could change your mind?`,
    responsibleTradingInsert: locale === "fa" ? "این تمرین آموزشی است و توصیه خرید یا فروش نیست. هدف، ساختن فرآیند تصمیم‌گیری قابل توضیح و کنترل ریسک است." : "This is educational practice, not a buy or sell recommendation. The goal is an explainable decision process with controlled risk.",
    nextLessonTeaser: locale === "fa" ? "در قدم بعد، همین مهارت را در یک سناریوی تازه بازیابی و تمرین می‌کنیم." : "Next, retrieve and apply the same skill in a fresh scenario.",
  };
}

function adaptLegacyTerm(locale: AcademyCurriculumLocale, term: LegacyTerm): Term {
  const lessons = term.lessons.map((lesson, index) => adaptLegacyLesson(locale, term, lesson, index));
  const moduleQuiz = term.questions.map((question, index) => toQuestion(locale, term.number, 0, index, question));
  return {
    number: term.number, slug: term.slug, title: term.title, subtitle: term.subtitle, outcome: term.outcome,
    estimatedWeeks: term.duration, level: term.number <= 2 ? "beginner" : term.number <= 5 ? "intermediate" : "advanced",
    prerequisites: term.number === 1 ? [] : [`term-${term.number - 1}`],
    modules: [{ id: `t${term.number}-core-${locale}`, termNumber: term.number, moduleIndex: 1, title: term.theme, lessons, moduleQuiz, masteryThreshold: 75 }],
    termExam: moduleQuiz, examPassThreshold: 75,
    certificate: { name: locale === "fa" ? `گواهی آکادمی تک‌پی — ترم ${term.number}` : `TecPey Academy Certificate — Term ${term.number}`, description: term.outcome },
  };
}

export function getUnifiedAcademyTerms(locale: AcademyCurriculumLocale): Term[] {
  const source = locale === "en" ? academyPathTermsEn : academyPathTerms;
  return source.map((term) => locale === "fa" && term.number === 1 ? TERM1 : adaptLegacyTerm(locale, term as LegacyTerm));
}
export function getUnifiedAcademyTerm(locale: AcademyCurriculumLocale, slug: string): Term | null {
  return getUnifiedAcademyTerms(locale).find((term) => term.slug === slug) ?? null;
}
