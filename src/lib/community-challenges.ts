/**
 * Community Challenges — Phase 18: Weekly educational challenges.
 * Challenges rotate weekly. No gambling, no profit races.
 * All challenges focus on behavioral discipline and process quality.
 */

export const CHALLENGE_PARTICIPATION_KEY = "tecpey-challenge-participation";

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

export interface ChallengeParticipation {
  challengeId: string;
  weekNumber: number;
  startedAt: number;
  completedAt: number | null;
  score: number;
}

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
    objective: "تمام معاملات این هفته را با بازتاب کامل ثبت کنید.",
    rules: [
      "هر معامله باید برنامه پیش از معامله داشته باشد.",
      "بعد از هر بسته شدن موقعیت، بازتاب بنویسید.",
      "حداقل یک درس کلیدی در هر بازتاب ثبت شود.",
    ],
    scoringMethod: "نرخ تکمیل ژورنال × ۱۰۰. حداقل ۸۰٪ برای قبولی.",
    responsibleTradingNote: "بهترین معامله‌گران ژورنال می‌نویسند. این عادت را از همین ابتدا شکل دهید.",
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
    scoringMethod: "پاس سناریو = ۱۰۰ امتیاز. عدم ورود FOMO = ۳۰ امتیاز اضافه.",
    responsibleTradingNote: "اخبار مثبت لزوماً به معنای صعود قیمت نیست. تحلیل آرام، بهتر از واکنش سریع است.",
    reward: { badge: "news-analyst-pro", xpBonus: 300, label: "تحلیل‌گر اخبار" },
    difficulty: "advanced",
    focus: "discipline",
    completionCriteria: { type: "scenario-pass", scenarioId: "news-reaction" },
    estimatedMinutes: 20,
  },
];

export function getCurrentWeekNumber(): number {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function getCurrentChallenge(): Challenge {
  const week = getCurrentWeekNumber();
  return WEEKLY_CHALLENGES[week % WEEKLY_CHALLENGES.length]!;
}

export function getNextChallenge(): Challenge {
  const week = getCurrentWeekNumber();
  return WEEKLY_CHALLENGES[(week + 1) % WEEKLY_CHALLENGES.length]!;
}

export function loadParticipation(): ChallengeParticipation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHALLENGE_PARTICIPATION_KEY);
    if (raw) return JSON.parse(raw) as ChallengeParticipation[];
  } catch { /* ignore */ }
  return [];
}

function saveParticipation(entries: ChallengeParticipation[]): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CHALLENGE_PARTICIPATION_KEY, JSON.stringify(entries)); } catch { /* quota */ }
}

export function joinChallenge(challengeId: string): void {
  const entries = loadParticipation();
  const week = getCurrentWeekNumber();
  if (entries.find((e) => e.challengeId === challengeId && e.weekNumber === week)) return;
  entries.push({ challengeId, weekNumber: week, startedAt: Date.now(), completedAt: null, score: 0 });
  saveParticipation(entries);
}

export function markChallengeComplete(challengeId: string, score: number): void {
  const entries = loadParticipation();
  const week = getCurrentWeekNumber();
  const idx = entries.findIndex((e) => e.challengeId === challengeId && e.weekNumber === week);
  if (idx >= 0) {
    entries[idx] = { ...entries[idx]!, completedAt: Date.now(), score };
  }
  saveParticipation(entries);
}

export const DIFFICULTY_LABEL: Record<ChallengeDifficulty, string> = {
  beginner: "مبتدی", intermediate: "متوسط", advanced: "پیشرفته",
};

export const FOCUS_LABEL: Record<ChallengeFocus, string> = {
  discipline: "انضباط", patience: "صبر", risk: "مدیریت ریسک",
  reflection: "بازتاب", consistency: "ثبات", knowledge: "دانش",
};
