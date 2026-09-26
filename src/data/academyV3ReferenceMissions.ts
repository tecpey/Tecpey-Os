import type { AcademyV3EvidenceKind } from "./academyV3CriticalLearningRegistry";

export type AcademyV3MissionChoice = {
  id: string;
  text: { fa: string; en: string };
  misconceptionId?: string;
  feedback?: { fa: string; en: string };
};

export type AcademyV3ReferenceMission = {
  id: string;
  version: 1;
  conceptId: string;
  objectiveIds: readonly string[];
  title: { fa: string; en: string };
  mentalModel: { fa: string; en: string };
  scenario: {
    context: { fa: string; en: string };
    knownEvidence: readonly { fa: string; en: string }[];
    uncertainty: readonly { fa: string; en: string }[];
    choices: readonly AcademyV3MissionChoice[];
    correctChoiceId: string;
    rationale: { fa: string; en: string };
    evidenceThatCouldChangeDecision: { fa: string; en: string };
  };
  evidenceKinds: readonly AcademyV3EvidenceKind[];
  reassessment: {
    strategy: "changed-context";
    minimumDelayHours: number;
  };
};

export const academyV3ReferenceMissions: readonly AcademyV3ReferenceMission[] = [
  {
    id: "MISSION.T6.NO_TRADE.INSUFFICIENT_EVIDENCE",
    version: 1,
    conceptId: "T6.NO_TRADE",
    objectiveIds: ["O.NOTRADE.IDENTIFY", "O.NOTRADE.DEFEND"],
    title: {
      fa: "وقتی بهترین تصمیم، معامله نکردن است",
      en: "When the best decision is not to trade",
    },
    mentalModel: {
      fa: "تصمیم حرفه‌ای الزاماً خرید یا فروش نیست. وقتی شواهد، شرایط عملیاتی یا بودجه ریسک برای یک تصمیم قابل دفاع کافی نیستند، «فعلاً اقدام نکردن» یک انتخاب فعال و قابل توضیح است.",
      en: "A professional decision does not have to be a buy or sell. When evidence, operating conditions, or the risk budget are insufficient for a defensible decision, choosing not to act yet is an active, explainable choice.",
    },
    scenario: {
      context: {
        fa: "یک دارایی در چند ساعت اخیر به‌شدت رشد کرده است. شبکه‌های اجتماعی پر از پیام‌های صعودی‌اند و شما احساس می‌کنید فرصت در حال از دست رفتن است.",
        en: "An asset has risen sharply over the last few hours. Social feeds are strongly bullish and you feel the opportunity is disappearing.",
      },
      knownEvidence: [
        { fa: "حرکت قیمت اخیر شدید بوده است.", en: "The recent price move has been sharp." },
        { fa: "شما هنوز نقطه ابطال سناریو را تعریف نکرده‌اید.", en: "You have not defined an invalidation condition." },
        { fa: "اندازه موقعیت متناسب با بودجه ریسک محاسبه نشده است.", en: "Position size has not been calculated from a risk budget." },
      ],
      uncertainty: [
        { fa: "منبع و پایداری روایت صعودی بررسی نشده است.", en: "The source and durability of the bullish narrative have not been verified." },
        { fa: "نقدشوندگی و هزینه اجرای موقعیت هنوز بررسی نشده‌اند.", en: "Liquidity and execution cost have not yet been checked." },
      ],
      choices: [
        {
          id: "enter-now",
          text: { fa: "همین حالا وارد شوم تا فرصت از دست نرود.", en: "Enter now so I do not miss the move." },
          misconceptionId: "M.NOTRADE.FOMO",
          feedback: { fa: "احساس از دست‌دادن فرصت، جای شواهد و معیار تصمیم را نمی‌گیرد. قبل از اقدام، thesis، ابطال و بودجه ریسک را روشن کنید.", en: "Fear of missing out cannot replace evidence or decision criteria. Define the thesis, invalidation, and risk budget before acting." },
        },
        {
          id: "always-position",
          text: { fa: "با حجم کوچک وارد شوم چون معامله‌گر جدی باید همیشه در بازار باشد.", en: "Enter with a small position because a serious trader should always be in the market." },
          misconceptionId: "M.NOTRADE.ALWAYSOPPORTUNITY",
          feedback: { fa: "حضور دائمی در بازار نشانه حرفه‌ای‌بودن نیست. وقتی شرایط تصمیم کامل نیست، حتی موقعیت کوچک هم می‌تواند یک اقدام بدون منطق کافی باشد.", en: "Constant market exposure is not a sign of professionalism. When decision conditions are incomplete, even a small position can still be an unjustified action." },
        },
        {
          id: "no-trade-yet",
          text: { fa: "فعلاً معامله نکنم؛ ابتدا شواهد، ابطال، نقدشوندگی و بودجه ریسک را کامل کنم.", en: "Do not trade yet; first complete the evidence, invalidation, liquidity, and risk-budget checks." },
        },
      ],
      correctChoiceId: "no-trade-yet",
      rationale: {
        fa: "داده موجود برای یک تصمیم قابل دفاع کافی نیست. رشد اخیر به‌تنهایی thesis، ابطال یا اندازه ریسک را تعریف نمی‌کند. صبر در این وضعیت حذف فرصت نیست؛ جلوگیری از تبدیل FOMO به تصمیم مالی است.",
        en: "The available information is insufficient for a defensible decision. Recent price appreciation alone does not define a thesis, invalidation, or risk size. Waiting here is not failure to act; it prevents FOMO from becoming a financial decision.",
      },
      evidenceThatCouldChangeDecision: {
        fa: "یک thesis قابل بررسی، منبع معتبر، نقطه ابطال روشن، نقدشوندگی قابل قبول و اندازه موقعیت سازگار با بودجه ریسک می‌تواند تصمیم را دوباره قابل ارزیابی کند.",
        en: "A testable thesis, credible source evidence, clear invalidation, acceptable liquidity, and position size consistent with the risk budget could make the decision worth reassessing.",
      },
    },
    evidenceKinds: ["scenario", "transfer", "reassessment"],
    reassessment: { strategy: "changed-context", minimumDelayHours: 24 },
  },
];
