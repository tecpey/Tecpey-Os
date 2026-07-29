/**
 * Community challenge catalogue.
 *
 * This module contains presentation-only definitions. Participation,
 * completion, score, time, XP, badges and rewards are never authoritative
 * here. Official challenge state is owned by the server challenge authority.
 */

export const OFFICIAL_PILOT_CHALLENGE_ID = "journal-reflection-week" as const;

export type ChallengeDifficulty = "beginner" | "intermediate" | "advanced";
export type ChallengeFocus = "discipline" | "patience" | "risk" | "reflection" | "consistency" | "knowledge";

export interface Challenge {
  id: string;
  title: string;
  objective: string;
  rules: string[];
  scoringMethod: string;
  responsibleTradingNote: string;
  reward: { badge: string; xpBonus: number; label: string };
  difficulty: ChallengeDifficulty;
  focus: ChallengeFocus;
  completionCriteria: ChallengeCompletionCriteria;
  estimatedMinutes: number;
}

export type ChallengeCompletionCriteria =
  | { type: "scenario-pass"; scenarioId: string }
  | { type: "stop-loss-rate"; minRate: number }
  | { type: "journal-rate"; minRate: number }
  | { type: "streak"; minDays: number }
  | { type: "lesson-complete"; count: number };

export const WEEKLY_CHALLENGES: Challenge[] = [
  {
    id: "beginner-scenario-week",
    title: "چالش سناریوی مبتدی",
    objective: "سناریوی اول آرنای معاملاتی را با موفقیت پاس کنید.",
    rules: [
      "سناریوی «اولین معامله با بیتکوین» را تکمیل کنید.",
      "معامله باید با حد ضرر باشد.",
      "ریسک هر معامله زیر ۵٪ موجودی باشد.",
    ],
    scoringMethod: "هنوز رسمی نیست؛ تا اتصال سناریو به شواهد سرور هیچ امتیازی صادر نمی‌شود.",
    responsibleTradingNote: "این چالش شبیه‌سازی‌شده است. هیچ سرمایه واقعی درگیر نیست. هدف یادگیری انضباط است.",
    reward: { badge: "first-trade-champion", xpBonus: 150, label: "قهرمان اولین معامله" },
    difficulty: "beginner",
    focus: "discipline",
    completionCriteria: { type: "scenario-pass", scenarioId: "beginner-btc" },
    estimatedMinutes: 10,
  },
  {
    id: "risk-discipline-week",
    title: "چالش انضباط ریسک",
    objective: "در این هفته ۸۰٪ از معاملاتتان باید حد ضرر داشته باشد.",
    rules: [
      "حداقل ۳ معامله شبیه‌سازی‌شده انجام دهید.",
      "۸۰٪ از آن‌ها باید با حد ضرر باشد.",
      "هیچ معامله‌ای با بیش از ۵٪ ریسک انجام ندهید.",
    ],
    scoringMethod: "هنوز رسمی نیست؛ نرخ ریسک تا اتصال کامل به Evidence سرور محاسبه نمی‌شود.",
    responsibleTradingNote: "فقط با شبیه‌ساز تمرین کنید. در بازار واقعی همیشه حد ضرر داشته باشید.",
    reward: { badge: "risk-guardian", xpBonus: 200, label: "نگهبان ریسک" },
    difficulty: "intermediate",
    focus: "risk",
    completionCriteria: { type: "stop-loss-rate", minRate: 0.8 },
    estimatedMinutes: 20,
  },
  {
    id: "no-fomo-week",
    title: "چالش بدون FOMO",
    objective: "سناریوی مقاومت در برابر FOMO را پاس کنید.",
    rules: [
      "سناریوی FOMO را با انتخاب «هیچ معامله‌ای نکن» پاس کنید.",
      "در بازار شبیه‌سازی‌شده، وقتی قیمت سریع بالا می‌رود وارد نشوید.",
      "بهترین پاسخ: صبر و انتظار.",
    ],
    scoringMethod: "هنوز رسمی نیست؛ نتیجه سناریوی مرورگر به‌عنوان Completion پذیرفته نمی‌شود.",
    responsibleTradingNote: "FOMO یکی از مهم‌ترین دشمنان معامله‌گر است. کنترل آن ارزش بیشتری از سود دارد.",
    reward: { badge: "fomo-conqueror", xpBonus: 250, label: "فاتح FOMO" },
    difficulty: "intermediate",
    focus: "patience",
    completionCriteria: { type: "scenario-pass", scenarioId: "fomo-scenario" },
    estimatedMinutes: 15,
  },
  {
    id: OFFICIAL_PILOT_CHALLENGE_ID,
    title: "چالش بازتاب ژورنال",
    objective: "پس از عضویت رسمی، حداقل ۸۰٪ معاملات بسته‌شده واجد شرایط را با Reflection معتبر پوشش دهید.",
    rules: [
      "عضویت از زمان ثبت‌شده سرور آغاز می‌شود و فعالیت قبلی محاسبه نمی‌شود.",
      "حداقل ۳ معامله بسته‌شده معتبر لازم است.",
      "Reflection باید به همان معامله و Attempt معتبر متصل باشد.",
      "تکمیل فقط پس از ارزیابی Evidence سرور ثبت می‌شود.",
    ],
    scoringMethod: "تکمیل رسمی: حداقل ۳ معامله و پوشش Reflection برابر یا بیشتر از ۸۰٪. امتیاز عددی صادر نمی‌شود.",
    responsibleTradingNote: "این چالش کیفیت فرایند و بازتاب را می‌سنجد، نه سود یا زیان معامله را.",
    reward: { badge: "journal-master", xpBonus: 200, label: "استاد ژورنال" },
    difficulty: "beginner",
    focus: "reflection",
    completionCriteria: { type: "journal-rate", minRate: 0.8 },
    estimatedMinutes: 15,
  },
  {
    id: "news-reaction-week",
    title: "چالش واکنش به اخبار",
    objective: "سناریوی واکنش به اخبار را با تحلیل آگاهانه پاس کنید.",
    rules: [
      "سناریوی «واکنش به اخبار» را تکمیل کنید.",
      "تصمیمات باید بر اساس تحلیل باشد، نه هیجان.",
      "از ورود در اوج قیمت پس از اخبار خودداری کنید.",
    ],
    scoringMethod: "هنوز رسمی نیست؛ نتیجه سناریو تا اتصال به Evidence سرور پذیرفته نمی‌شود.",
    responsibleTradingNote: "اخبار مثبت لزوماً به معنای صعود قیمت نیست. تحلیل آرام، بهتر از واکنش سریع است.",
    reward: { badge: "news-analyst-pro", xpBonus: 300, label: "تحلیل‌گر اخبار" },
    difficulty: "advanced",
    focus: "discipline",
    completionCriteria: { type: "scenario-pass", scenarioId: "news-reaction" },
    estimatedMinutes: 20,
  },
];

export const OFFICIAL_PILOT_CHALLENGE = WEEKLY_CHALLENGES.find(
  (challenge) => challenge.id === OFFICIAL_PILOT_CHALLENGE_ID,
)!;

export const PREVIEW_ONLY_CHALLENGES = WEEKLY_CHALLENGES.filter(
  (challenge) => challenge.id !== OFFICIAL_PILOT_CHALLENGE_ID,
);

export const DIFFICULTY_LABEL: Record<ChallengeDifficulty, string> = {
  beginner: "مبتدی", intermediate: "متوسط", advanced: "پیشرفته",
};

export const FOCUS_LABEL: Record<ChallengeFocus, string> = {
  discipline: "انضباط", patience: "صبر", risk: "مدیریت ریسک",
  reflection: "بازتاب", consistency: "ثبات", knowledge: "دانش",
};
