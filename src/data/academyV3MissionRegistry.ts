import type { AcademyV3EvidenceKind } from "./academyV3CriticalLearningRegistry";

export type AcademyV3LocaleText = { fa: string; en: string };
export type AcademyV3MissionStage =
  | "orient" | "mental-model" | "misconception" | "retrieval"
  | "decision" | "feedback" | "transfer" | "reassessment";

export type AcademyV3MissionStep = {
  id: string;
  stage: AcademyV3MissionStage;
  title: AcademyV3LocaleText;
  prompt: AcademyV3LocaleText;
  evidenceKind?: AcademyV3EvidenceKind;
  objectiveIds?: readonly string[];
  misconceptionIds?: readonly string[];
};

export type AcademyV3Mission = {
  id: string;
  version: 1;
  conceptId: string;
  objectiveIds: readonly string[];
  misconceptionIds: readonly string[];
  estimatedMinutes: number;
  stages: readonly AcademyV3MissionStep[];
  awardsMasteryDirectly: false;
  awardsLeagueScoreDirectly: false;
  awardsFinancialValue: false;
};

export const academyV3ReferenceMissions = [
  {
    id: "MISSION.T6.NO_TRADE.01",
    version: 1,
    conceptId: "T6.NO_TRADE",
    objectiveIds: ["O.NOTRADE.IDENTIFY", "O.NOTRADE.DEFEND"],
    misconceptionIds: ["M.NOTRADE.MISSED", "M.NOTRADE.ALWAYSOPPORTUNITY", "M.NOTRADE.FOMO"],
    estimatedMinutes: 12,
    awardsMasteryDirectly: false,
    awardsLeagueScoreDirectly: false,
    awardsFinancialValue: false,
    stages: [
      {
        id: "orient", stage: "orient",
        title: { fa: "گاهی بهترین تصمیم، صبر است", en: "Sometimes the best decision is to wait" },
        prompt: {
          fa: "هدف این مأموریت تشخیص زمانی است که شواهد، محدودیت‌ها یا وضعیت تصمیم هنوز کیفیت لازم برای اقدام را ندارند.",
          en: "This mission is about recognizing when evidence, constraints, or decision conditions are not yet strong enough to justify action.",
        },
      },
      {
        id: "mental-model", stage: "mental-model",
        title: { fa: "اقدام، وظیفه نیست", en: "Action is not an obligation" },
        prompt: {
          fa: "یک تصمیم منضبط می‌تواند به اقدام، اقدام محدودتر یا عدم اقدام برسد. صبر زمانی معتبر است که دلیل آن قابل توضیح و با شواهد جدید قابل بازبینی باشد.",
          en: "A disciplined decision can end in action, reduced action, or no action. Waiting is valid when its rationale is explainable and can be reassessed when evidence changes.",
        },
      },
      {
        id: "misconception", stage: "misconception",
        title: { fa: "دام فعالیت", en: "The activity trap" },
        prompt: {
          fa: "فعال بودن همیشه به معنی تصمیم بهتر نیست. هدف، کیفیت فرآیند است نه پر کردن زمان با اقدام.",
          en: "Being active does not automatically mean making a better decision. The goal is process quality, not filling time with action.",
        },
        misconceptionIds: ["M.NOTRADE.MISSED", "M.NOTRADE.ALWAYSOPPORTUNITY"],
      },
      {
        id: "retrieval", stage: "retrieval",
        title: { fa: "بازیابی", en: "Retrieval" },
        prompt: {
          fa: "بدون برگشت به متن، سه شرایطی را بیان کنید که می‌توانند صبر را به یک تصمیم منضبط تبدیل کنند.",
          en: "Without looking back, state three conditions that can make waiting a disciplined decision.",
        },
        evidenceKind: "retrieval", objectiveIds: ["O.NOTRADE.IDENTIFY"],
      },
      {
        id: "decision", stage: "decision",
        title: { fa: "تصمیم با اطلاعات ناقص", en: "Decision with incomplete information" },
        prompt: {
          fa: "اطلاعات مهم هنوز تأیید نشده، معیار روشن برای تغییر تصمیم ندارید و احساس عجله می‌کنید. اقدام، اقدام محدود یا صبر را انتخاب کنید و دلیل خود را با اطلاعات موجود توضیح دهید.",
          en: "Important information is still unverified, you lack a clear condition for changing the decision, and you feel urgency. Choose action, reduced action, or waiting and justify it using the available information.",
        },
        evidenceKind: "scenario", objectiveIds: ["O.NOTRADE.IDENTIFY", "O.NOTRADE.DEFEND"],
        misconceptionIds: ["M.NOTRADE.FOMO"],
      },
      {
        id: "feedback", stage: "feedback",
        title: { fa: "بازخورد فرآیند", en: "Process feedback" },
        prompt: {
          fa: "کیفیت تصمیم را با اطلاعاتی بسنجید که هنگام تصمیم در دسترس بود، نه با نتیجه‌ای که بعداً معلوم شد.",
          en: "Judge decision quality using information available at decision time, not an outcome revealed later.",
        },
      },
      {
        id: "transfer", stage: "transfer",
        title: { fa: "انتقال به سناریوی شبیه‌سازی", en: "Transfer to a simulation scenario" },
        prompt: {
          fa: "در یک سناریوی شبیه‌سازی با داده ناقص، یک شرط برای عدم اقدام و یک شرط برای بازبینی دوباره تعریف کنید. ارزیابی باید به انضباط فرآیند وابسته باشد، نه نتیجه تصادفی.",
          en: "In a simulation with incomplete evidence, define one no-action condition and one condition that triggers reassessment. Evaluation should depend on process discipline, not a lucky outcome.",
        },
        evidenceKind: "arena", objectiveIds: ["O.NOTRADE.DEFEND"],
      },
      {
        id: "reassessment", stage: "reassessment",
        title: { fa: "بازبینی با شواهد جدید", en: "Reassess with changed evidence" },
        prompt: {
          fa: "حالا شواهد معتبر جدید اضافه شده و معیار تصمیم روشن‌تر است. بررسی کنید آیا تصمیم قبلی باید تغییر کند و دقیقاً بگویید کدام شواهد باعث تغییر یا حفظ تصمیم شدند.",
          en: "Now credible new evidence is available and decision criteria are clearer. Reassess the earlier decision and identify exactly which evidence supports changing or keeping it.",
        },
        evidenceKind: "reassessment", objectiveIds: ["O.NOTRADE.IDENTIFY", "O.NOTRADE.DEFEND"],
      },
    ],
  },
] as const satisfies readonly AcademyV3Mission[];
