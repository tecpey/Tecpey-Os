/**
 * Community challenge catalogue.
 *
 * This module is intentionally pure: it defines educational challenges and a
 * deterministic UTC cycle only. Participation, completion, score, XP and
 * badges are server-authoritative and must never be persisted by the browser.
 */

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
  | { type: "journal-rate"; minRate: number; minTrades: number }
  | { type: "streak"; minDays: number }
  | { type: "lesson-complete"; count: number };

export type ChallengeCycle = {
  year: number;
  weekNumber: number;
  weekKey: string;
  startsAt: string;
  endsAt: string;
  challenge: Challenge;
};

const CHALLENGE_CYCLE_MS = 7 * 24 * 60 * 60 * 1000;

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
    scoringMethod: "قبولی در سناریو = ۱۰۰ امتیاز. حد ضرر داشتن = ۲۰ امتیاز اضافه.",
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
    scoringMethod: "نرخ حد ضرر × ۱۰۰. اگر نرخ زیر ۵۰٪ باشد، امتیاز صفر.",
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
    scoringMethod: "پاس سناریو بدون معامله = ۱۰۰ امتیاز. اگر معامله کردید = ۰ امتیاز.",
    responsibleTradingNote: "FOMO یکی از مهم‌ترین دشمنان معامله‌گر است. کنترل آن ارزش بیشتری از سود دارد.",
    reward: { badge: "fomo-conqueror", xpBonus: 250, label: "فاتح FOMO" },
    difficulty: "intermediate",
    focus: "patience",
    completionCriteria: { type: "scenario-pass", scenarioId: "fomo-scenario" },
    estimatedMinutes: 15,
  },
  {
    id: "journal-reflection-week",
    title: "چالش بازتاب ژورنال",
    objective: "حداقل ۳ معامله این هفته را ببندید و برای دست‌کم ۸۰٪ آن‌ها بازتاب معتبر ثبت کنید.",
    rules: [
      "حداقل ۳ معامله باید در Trading Arena معتبر بسته شده باشد.",
      "پس از بسته‌شدن هر موقعیت، Reflection سرورمحور ثبت کنید.",
      "دست‌کم ۸۰٪ معاملات بسته‌شده هفته باید Reflection معتبر داشته باشند.",
    ],
    scoringMethod: "تعداد Reflectionهای معتبر ÷ معاملات بسته‌شده معتبر × ۱۰۰؛ حداقل ۳ معامله و امتیاز ۸۰ برای قبولی.",
    responsibleTradingNote: "هدف چالش، ساخت عادت بازتاب و یادگیری است؛ سود یا زیان خام در امتیاز و پاداش نقشی ندارد.",
    reward: { badge: "journal-master", xpBonus: 200, label: "استاد ژورنال" },
    difficulty: "beginner",
    focus: "reflection",
    completionCriteria: { type: "journal-rate", minRate: 0.8, minTrades: 3 },
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
    scoringMethod: "پاس سناریو = ۱۰۰ امتیاز. عدم ورود FOMO = ۳۰ امتیاز اضافه.",
    responsibleTradingNote: "اخبار مثبت لزوماً به معنای صعود قیمت نیست. تحلیل آرام، بهتر از واکنش سریع است.",
    reward: { badge: "news-analyst-pro", xpBonus: 300, label: "تحلیل‌گر اخبار" },
    difficulty: "advanced",
    focus: "discipline",
    completionCriteria: { type: "scenario-pass", scenarioId: "news-reaction" },
    estimatedMinutes: 20,
  },
];

export function getChallengeCycle(now = new Date()): ChallengeCycle {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp)) throw new Error("challenge_cycle_time_invalid");
  const year = now.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const weekNumber = Math.max(0, Math.floor((timestamp - yearStart) / CHALLENGE_CYCLE_MS));
  const startsAtMs = yearStart + weekNumber * CHALLENGE_CYCLE_MS;
  const endsAtMs = startsAtMs + CHALLENGE_CYCLE_MS;
  const challenge = WEEKLY_CHALLENGES[weekNumber % WEEKLY_CHALLENGES.length];
  if (!challenge) throw new Error("challenge_catalogue_empty");
  return {
    year,
    weekNumber,
    weekKey: `${year}-cycle-${String(weekNumber).padStart(2, "0")}`,
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    challenge,
  };
}

export function getCurrentWeekNumber(now = new Date()): number {
  return getChallengeCycle(now).weekNumber;
}

export function getCurrentChallenge(now = new Date()): Challenge {
  return getChallengeCycle(now).challenge;
}

export function getNextChallenge(now = new Date()): Challenge {
  const cycle = getChallengeCycle(now);
  return WEEKLY_CHALLENGES[(cycle.weekNumber + 1) % WEEKLY_CHALLENGES.length]!;
}

export const DIFFICULTY_LABEL: Record<ChallengeDifficulty, string> = {
  beginner: "مبتدی", intermediate: "متوسط", advanced: "پیشرفته",
};

export const FOCUS_LABEL: Record<ChallengeFocus, string> = {
  discipline: "انضباط", patience: "صبر", risk: "مدیریت ریسک",
  reflection: "بازتاب", consistency: "ثبات", knowledge: "دانش",
};
