// Source-grounded news exercises for the Academy.
//
// A feed item is publishable only when its source and publication time are
// complete. The bank rotates both the learning objective and the answer key so
// learners are assessed on evidence, calibration and relevance instead of
// memorising one generic "risk-first" response.

import type { QuizQuestion } from "@/data/academy/term1Curriculum";
import { assertQuizQuestionValid } from "./academy-quiz-authority";

export type NewsQuizLocale = "fa" | "en";

export type NewsQuizInput = {
  id: string;
  title: string;
  category?: string;
  tone?: "bullish" | "bearish" | "neutral" | string;
  impact?: number;
  source?: string;
  sourceUrl?: string;
  publishedAt?: string;
};

export type NewsQuizOptions = {
  locale: NewsQuizLocale;
  conceptTag?: string;
};

export type NewsQuizQuestion = QuizQuestion & {
  source: {
    name: string;
    url: string;
    publishedAt: string;
  };
  learningObjective: string;
  optionRationales: Record<string, string>;
  mentorTakeaway: string;
  checklist: string[];
  lessonHref: string;
  provenanceStatus: "complete";
};

export const PROHIBITED_CLAIM_PATTERN = new RegExp(
  [
    "guarantee|guaranteed|profit|double your|to the moon|\\bmoon\\b|\\bpump\\b",
    "\\bx\\s*\\d+\\b|\\b\\d+\\s*x\\b",
    "\\d+\\s*%\\s*(?:gain|return|up)",
    "\\bwill\\s+(?:reach|hit|surge|soar|rally|rocket|explode|skyrocket|double|triple|moon|crash)\\b",
    "\\bprice\\s+(?:target|prediction)\\b|\\bpredict(?:ion|ions|ed|s)?\\b|\\bforecast(?:ed|s)?\\b",
    "(?:reach|hit|to|target)\\s*\\$\\s?[\\d,]+|\\$\\s?[\\d,]+\\s?(?:k|m|bn?|million|billion|trillion)\\b",
    "سود ?تضمین|حتماً? سود|قطعاً? رشد|دو ?برابر|چند ?برابر|ده ?برابر|صد ?برابر|به ?ماه|صد ?در ?صد|هدف ?قیمت|پیش[‌ ]?بینی",
  ].join("|"),
  "i",
);

export function containsProhibitedClaim(text: string): boolean {
  return PROHIBITED_CLAIM_PATTERN.test(text);
}

type ExerciseTemplate = {
  objective: string;
  prompt: (subject: string, source: string, publishedAt: string) => string;
  correct: string;
  distractors: [string, string, string];
  rationales: [string, string, string, string];
  explanation: string;
  mentorTakeaway: string;
  checklist: [string, string, string];
  lessonHref: string;
};

const TEMPLATES: Record<NewsQuizLocale, ExerciseTemplate[]> = {
  fa: [
    {
      objective: "سنجش تازگی و قابلیت ردیابی خبر",
      prompt: (subject, source, publishedAt) =>
        `برای ارزیابی «${subject}» از ${source} در ${publishedAt}، کدام بررسی باید پیش از تفسیر اثر بازار انجام شود؟`,
      correct: "زمان انتشار را با منبع اصلی و هر به‌روزرسانی بعدی تطبیق دهید",
      distractors: [
        "تعداد بازنشرها را به‌جای منبع اصلی معیار اعتبار قرار دهید",
        "فقط واکنش قیمت در چند دقیقه اول را نشانه صحت خبر بدانید",
        "تا زمانی که تیتر همسو با انتظار شماست، جزئیات منبع را کنار بگذارید",
      ],
      rationales: [
        "تطبیق منبع و زمان مشخص می‌کند با خبر تازه، بازنشر قدیمی یا نسخه اصلاح‌شده روبه‌رو هستیم.",
        "محبوبیت، جای زنجیره منشأ و سند اولیه را نمی‌گیرد.",
        "حرکت کوتاه‌مدت قیمت می‌تواند واکنشی یا نویزی باشد و اعتبار خبر را اثبات نمی‌کند.",
        "همسویی با انتظار شخصی می‌تواند سوگیری تأییدی را تشدید کند.",
      ],
      explanation:
        "اولین کنترل حرفه‌ای، ردیابی منبع و زمان است؛ چون خبر قدیمی یا اصلاح‌شده می‌تواند برداشت کاملاً متفاوتی بسازد.",
      mentorTakeaway: "اعتبار خبر از زنجیره منبع و زمان آن آغاز می‌شود، نه از شدت واکنش شبکه‌های اجتماعی.",
      checklist: ["منبع اولیه", "زمان و نسخه انتشار", "اصلاحیه یا تکذیبیه"],
      lessonHref: "/academy/term-1",
    },
    {
      objective: "تفکیک ادعا از شواهد قابل راستی‌آزمایی",
      prompt: (subject) =>
        `در بررسی تیتر «${subject}»، کدام روش بهتر از تبدیل یک ادعا به نتیجه قطعی جلوگیری می‌کند؟`,
      correct: "ادعا، داده پشتیبان و بخش‌های هنوز نامعلوم را جداگانه ثبت کنید",
      distractors: [
        "لحن صعودی یا نزولی تیتر را به‌عنوان نتیجه نهایی بپذیرید",
        "یک نمودار همسو پیدا کنید و بررسی شواهد مخالف را متوقف کنید",
        "نظر پرتکرار کاربران را جایگزین داده و سند کنید",
      ],
      rationales: [
        "تفکیک ادعا، شاهد و مجهول، مرز دانسته‌ها و فرضیات را شفاف می‌کند.",
        "لحن رسانه‌ای داده نیست و ممکن است برای جلب توجه انتخاب شده باشد.",
        "انتخاب فقط شواهد همسو نمونه‌ای از سوگیری تأییدی است.",
        "تکرار اجتماعی بدون سند، کیفیت شواهد را افزایش نمی‌دهد.",
      ],
      explanation:
        "خبر حرفه‌ای باید به اجزای قابل آزمون شکسته شود. آنچه هنوز سند ندارد، نتیجه نیست؛ فرضیه‌ای برای پیگیری است.",
      mentorTakeaway: "قبل از نتیجه‌گیری بپرسید: دقیقاً چه چیزی ادعا شده، شاهد چیست و چه چیزی هنوز نمی‌دانیم؟",
      checklist: ["ادعای دقیق", "شاهد قابل بررسی", "مجهولات باقی‌مانده"],
      lessonHref: "/academy/term-1",
    },
    {
      objective: "سنجش ارتباط خبر با برنامه شخصی",
      prompt: (subject) =>
        `پس از تأیید اولیه خبر «${subject}»، کدام سؤال ارتباط آن را با تصمیم شخصی بهتر می‌سنجد؟`,
      correct: "این خبر کدام فرض برنامه من را تغییر می‌دهد و حد ابطال آن فرض چیست؟",
      distractors: [
        "آیا دیگران پیش از من خرید کرده‌اند؟",
        "چطور می‌توانم بدون تعیین حد ریسک سریع‌تر وارد شوم؟",
        "کدام اینفلوئنسر با قطعیت بیشتری جهت بازار را اعلام کرده است؟",
      ],
      rationales: [
        "تصمیم حرفه‌ای به فرضیه، معیار ابطال و محدودیت ریسک متصل است.",
        "رفتار جمع، تناسب تصمیم با هدف و ظرفیت ریسک شما را نشان نمی‌دهد.",
        "سرعت بدون حد ریسک، برنامه را به واکنش هیجانی تبدیل می‌کند.",
        "قطعیت لحن، جای تحلیل و پاسخ‌گویی شخصی را نمی‌گیرد.",
      ],
      explanation:
        "حتی خبر معتبر برای همه یک پیام ندارد. اثر آن باید در چارچوب هدف، افق زمانی، فرضیه و محدودیت ریسک هر فرد سنجیده شود.",
      mentorTakeaway: "خبر فقط زمانی تصمیم را تغییر می‌دهد که یکی از فرض‌های برنامه شما را با شاهد تازه تقویت یا باطل کند.",
      checklist: ["فرض تحت‌تأثیر", "حد ابطال", "سقف ریسک"],
      lessonHref: "/academy/term-1",
    },
    {
      objective: "کالیبره‌کردن شدت اثر خبر",
      prompt: (subject) =>
        `برای سنجش اثر احتمالی «${subject}»، کدام رویکرد از بزرگ‌نمایی یا کوچک‌نمایی خبر جلوگیری می‌کند؟`,
      correct: "اثر مستقیم، دامنه دارایی‌های درگیر و بازه زمانی را جداگانه امتیاز دهید",
      distractors: [
        "شدت واژه‌های تیتر را برابر با شدت اثر بازار فرض کنید",
        "اثر یک دارایی را بدون بررسی به کل بازار تعمیم دهید",
        "هر واکنش اولیه را روند پایدار و برگشت‌ناپذیر بدانید",
      ],
      rationales: [
        "تفکیک مسیر اثر، دامنه و زمان، تحلیل را قابل مقایسه و بازبینی می‌کند.",
        "لحن تیتر می‌تواند مستقل از اندازه واقعی اثر باشد.",
        "سرایت اثر باید با داده بررسی شود، نه با تعمیم خودکار.",
        "واکنش اولیه ممکن است با اطلاعات تکمیلی تغییر کند.",
      ],
      explanation:
        "کالیبراسیون یعنی اثر را در چند بُعد بسنجیم و عدم‌قطعیت را حفظ کنیم؛ نه اینکه از یک تیتر، نتیجه‌ای برای کل بازار بسازیم.",
      mentorTakeaway: "شدت خبر را با مسیر اثر، دامنه و زمان بسنجید؛ نه با اندازه فونت و هیجان تیتر.",
      checklist: ["اثر مستقیم", "دامنه دارایی‌ها", "بازه زمانی و عدم‌قطعیت"],
      lessonHref: "/academy/term-1",
    },
  ],
  en: [
    {
      objective: "Assess the freshness and traceability of a report",
      prompt: (subject, source, publishedAt) =>
        `Before interpreting the market impact of “${subject}” from ${source} at ${publishedAt}, which check comes first?`,
      correct: "Match the publication time to the primary source and any later update",
      distractors: [
        "Use repost count as a substitute for the primary source",
        "Treat the first few minutes of price action as proof that the report is accurate",
        "Ignore source details when the headline agrees with your prior view",
      ],
      rationales: [
        "Source and time checks distinguish a fresh report from an old repost or a corrected version.",
        "Popularity does not replace a traceable origin and primary evidence.",
        "Short-term price action can be noisy and does not prove the underlying claim.",
        "Agreement with a prior view increases confirmation-bias risk.",
      ],
      explanation:
        "Professional review starts with provenance and time because an old, corrected or superseded report can produce a completely different interpretation.",
      mentorTakeaway: "Trust begins with a traceable source and timestamp, not social-media velocity.",
      checklist: ["Primary source", "Publication time and version", "Correction or denial"],
      lessonHref: "/en/academy/curriculum",
    },
    {
      objective: "Separate a claim from verifiable evidence",
      prompt: (subject) =>
        `When reviewing “${subject}”, which method best prevents a claim from becoming an unsupported conclusion?`,
      correct: "Record the claim, supporting evidence and remaining unknowns separately",
      distractors: [
        "Accept the headline's bullish or bearish tone as the conclusion",
        "Find one supporting chart and stop looking for contrary evidence",
        "Replace documents and data with the most repeated user opinion",
      ],
      rationales: [
        "Separating claims, evidence and unknowns makes the boundary between fact and assumption visible.",
        "Editorial tone is not evidence and may be optimised for attention.",
        "Selecting only supporting evidence is confirmation bias.",
        "Repetition without a document or dataset does not improve evidence quality.",
      ],
      explanation:
        "A report should be decomposed into testable parts. An unsupported statement is not a result; it is a hypothesis to investigate.",
      mentorTakeaway: "Ask what is claimed, what proves it and what remains unknown before forming a view.",
      checklist: ["Exact claim", "Verifiable evidence", "Remaining unknowns"],
      lessonHref: "/en/academy/curriculum",
    },
    {
      objective: "Test whether news is relevant to a personal plan",
      prompt: (subject) =>
        `After an initial verification of “${subject}”, which question best tests its relevance to a personal decision?`,
      correct: "Which assumption in my plan changes, and what would invalidate that assumption?",
      distractors: [
        "Did other people buy before me?",
        "How can I enter faster without defining a risk limit?",
        "Which influencer sounds most certain about market direction?",
      ],
      rationales: [
        "A professional decision connects new evidence to a hypothesis, invalidation rule and risk limit.",
        "Crowd behaviour does not show whether a decision fits your objective or risk capacity.",
        "Speed without a risk limit converts a plan into an emotional reaction.",
        "Confident delivery does not replace analysis or personal accountability.",
      ],
      explanation:
        "Even verified news does not mean the same thing for everyone. Relevance depends on objective, horizon, hypothesis and risk constraints.",
      mentorTakeaway: "News should change a decision only when it strengthens or invalidates a defined assumption in your plan.",
      checklist: ["Affected assumption", "Invalidation rule", "Risk ceiling"],
      lessonHref: "/en/academy/curriculum",
    },
    {
      objective: "Calibrate the possible magnitude of an event",
      prompt: (subject) =>
        `Which approach best avoids overstating or understating the possible impact of “${subject}”?`,
      correct: "Score the direct effect, affected asset scope and time horizon separately",
      distractors: [
        "Treat dramatic headline language as the size of the market impact",
        "Extend an effect on one asset to the whole market without evidence",
        "Assume every initial reaction is a permanent trend",
      ],
      rationales: [
        "Separating transmission path, scope and time makes the assessment comparable and reviewable.",
        "Headline intensity can be unrelated to the actual size of an effect.",
        "Spillover must be tested with evidence rather than assumed.",
        "Initial reactions can change as more information arrives.",
      ],
      explanation:
        "Calibration preserves uncertainty and assesses impact across several dimensions instead of turning one headline into a market-wide conclusion.",
      mentorTakeaway: "Measure impact through transmission, scope and time—not headline volume.",
      checklist: ["Direct transmission", "Affected scope", "Time horizon and uncertainty"],
      lessonHref: "/en/academy/curriculum",
    },
  ],
};

function clean(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function difficultyFor(impact: number | undefined): QuizQuestion["difficulty"] {
  if (typeof impact !== "number" || Number.isNaN(impact)) return "medium";
  if (impact >= 8) return "hard";
  if (impact >= 5) return "medium";
  return "easy";
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hasCompleteProvenance(item: NewsQuizInput): boolean {
  const url = clean(item.sourceUrl);
  const publishedAt = clean(item.publishedAt);
  return Boolean(
    clean(item.id) &&
      clean(item.title) &&
      clean(item.source) &&
      (url.startsWith("https://") || url.startsWith("/")) &&
      publishedAt &&
      Number.isFinite(Date.parse(publishedAt)),
  );
}

function generateWithPlacement(
  item: NewsQuizInput,
  options: NewsQuizOptions,
  templateIndex: number,
  correctIndex: number,
): NewsQuizQuestion {
  if (!hasCompleteProvenance(item)) throw new Error("incomplete_news_quiz_provenance");

  const locale = options.locale;
  const templates = TEMPLATES[locale];
  const template = templates[templateIndex % templates.length];
  const rawTitle = clean(item.title);
  const subject = containsProhibitedClaim(rawTitle)
    ? locale === "fa"
      ? "این گزارش بازار"
      : "this market report"
    : rawTitle;
  const sourceName = clean(item.source);
  const sourceUrl = clean(item.sourceUrl);
  const publishedAt = new Date(clean(item.publishedAt)).toISOString();
  const choices = [...template.distractors];
  choices.splice(correctIndex % 4, 0, template.correct);
  const rationaleByChoice = Object.fromEntries(
    [template.correct, ...template.distractors].map((choice, index) => [
      choice,
      template.rationales[index],
    ]),
  );

  const question: NewsQuizQuestion = {
    id: `news-quiz-${clean(item.id)}-${locale}`,
    type: "single",
    question: template.prompt(subject, sourceName, publishedAt),
    options: choices,
    correctAnswer: template.correct,
    explanation: template.explanation,
    difficulty: difficultyFor(item.impact),
    conceptTag: clean(options.conceptTag) || "crypto-news-literacy",
    source: { name: sourceName, url: sourceUrl, publishedAt },
    learningObjective: template.objective,
    optionRationales: rationaleByChoice,
    mentorTakeaway: template.mentorTakeaway,
    checklist: [...template.checklist],
    lessonHref: template.lessonHref,
    provenanceStatus: "complete",
  };

  assertQuizQuestionValid(question);
  return question;
}

export function generateNewsQuizQuestion(
  item: NewsQuizInput,
  options: NewsQuizOptions,
): NewsQuizQuestion {
  const hash = stableHash(`${item.id}:${options.locale}`);
  return generateWithPlacement(item, options, hash % 4, Math.floor(hash / 4) % 4);
}

export function generateNewsQuizBank(
  items: NewsQuizInput[],
  options: NewsQuizOptions,
): NewsQuizQuestion[] {
  const seen = new Set<string>();
  const bank: NewsQuizQuestion[] = [];
  for (const item of items) {
    try {
      const question = generateWithPlacement(item, options, bank.length % 4, bank.length % 4);
      if (seen.has(question.id)) continue;
      seen.add(question.id);
      bank.push(question);
    } catch {
      // Fail closed: an incomplete or malformed feed item is not publishable.
    }
  }
  return bank;
}
