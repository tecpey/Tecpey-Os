/**
 * Trading Arena V2 — Guided Scenario Definitions.
 * Each scenario has a deterministic price sequence and educational objective.
 */

import type { Asset, MentorFlag } from "@/lib/trading-arena";

export type ScenarioDifficulty = "beginner" | "intermediate" | "advanced";
export type ScenarioAction = "buy" | "close" | "set-sl" | "hold" | "wait";

export interface ScenarioSuccessCriteria {
  type: "pnl-positive" | "pnl-pct" | "stop-loss-set" | "hold-through-dip" | "no-trade";
  value?: number; // threshold for pnl-pct
}

export interface ScenarioFailureCriteria {
  type: "pnl-pct" | "panic-close" | "revenge-trade" | "no-stop-loss" | "over-risk";
  value?: number;
}

export interface MentorFeedback {
  passHeadline: string;
  passBody: string;
  failHeadline: string;
  failBody: string;
  keyLesson: string;
}

export interface TradingDNAImpact {
  discipline: number;       // +/- on dimension
  patience: number;
  risk_management: number;
  fomo_risk: number;
  revenge_risk: number;
  decision_quality: number;
}

export interface Scenario {
  id: string;
  title: string;
  titleEn: string;
  difficulty: ScenarioDifficulty;
  estimatedMinutes: number;
  objective: string;
  marketContext: string;
  concept: string;          // the behavioral concept being trained
  allowedActions: ScenarioAction[];
  initialBalance: number;   // USDT for this scenario
  targetAsset: Asset;
  startPrice: number;
  priceSequence: number[];  // one price per step (every 2 seconds)
  successCriteria: ScenarioSuccessCriteria;
  failureCriteria: ScenarioFailureCriteria;
  successHint: string;
  warningFlags: MentorFlag[];  // flags that trigger failure
  mentorFeedback: MentorFeedback;
  dnaImpact: TradingDNAImpact;
  badgeId: string;
}

// ─── Deterministic price generators ──────────────────────────────────────────

function lcgWalk(seed: number, start: number, steps: number, volPct: number): number[] {
  let rng = (seed >>> 0) || 1;
  const prices = [start];
  for (let i = 1; i < steps; i++) {
    rng = ((rng * 1664525 + 1013904223) >>> 0);
    const rand = rng / 0xffffffff;
    const delta = (rand - 0.5) * 2 * volPct;
    prices.push(+(prices[i - 1] * (1 + delta)).toFixed(2));
  }
  return prices;
}

function riseAndFall(start: number, upSteps: number, upPct: number, downSteps: number, downPct: number): number[] {
  const prices = [start];
  for (let i = 0; i < upSteps; i++) prices.push(+(prices[prices.length - 1] * (1 + upPct)).toFixed(2));
  for (let i = 0; i < downSteps; i++) prices.push(+(prices[prices.length - 1] * (1 - downPct)).toFixed(2));
  return prices;
}

function steadyDown(start: number, steps: number, downPct: number, recovery: number): number[] {
  const prices = [start];
  for (let i = 0; i < Math.floor(steps * 0.4); i++) prices.push(+(prices[prices.length - 1] * (1 - downPct)).toFixed(2));
  for (let i = 0; i < Math.ceil(steps * 0.6); i++) prices.push(+(prices[prices.length - 1] * (1 + recovery)).toFixed(2));
  return prices;
}

// ─── Scenario definitions ─────────────────────────────────────────────────────

export const SCENARIOS: Scenario[] = [
  {
    id: "beginner-btc",
    title: "اولین معامله با بیتکوین",
    titleEn: "First BTC Trade",
    difficulty: "beginner",
    estimatedMinutes: 3,
    objective: "یاد بگیرید چطور یک موقعیت خرید باز کنید، حد ضرر تنظیم کنید، و با سود ببندید.",
    marketContext: "بازار در حال صعود آرام است. قیمت بیتکوین ثبات دارد و فرصت یادگیری ایمنی وجود دارد.",
    concept: "آشنایی با ابزار و اهمیت حد ضرر",
    allowedActions: ["buy", "close", "set-sl"],
    initialBalance: 5_000,
    targetAsset: "BTC",
    startPrice: 65_000,
    priceSequence: lcgWalk(42, 65_000, 30, 0.004),
    successCriteria: { type: "pnl-positive" },
    failureCriteria: { type: "no-stop-loss" },
    successHint: "یک معامله با حد ضرر باز کنید و صبر کنید تا سود کنید.",
    warningFlags: ["no-stop-loss", "over-risk"],
    mentorFeedback: {
      passHeadline: "عالی — اولین قدم را برداشتید",
      passBody: "باز کردن معامله با حد ضرر نشانه‌ای از انضباط است. این الگو را در هر معامله‌ای حفظ کنید.",
      failHeadline: "بدون حد ضرر — ریسک کنترل نشده",
      failBody: "در این سناریو بدون حد ضرر معامله کردید. در بازار واقعی، یک حرکت ناگهانی می‌توانست سرمایه‌تان را نابود کند.",
      keyLesson: "هر معامله باید قبل از ورود حد ضرر داشته باشد — نه بعد از آن.",
    },
    dnaImpact: { discipline: +5, patience: +3, risk_management: +8, fomo_risk: 0, revenge_risk: 0, decision_quality: +5 },
    badgeId: "first-trade",
  },
  {
    id: "volatility",
    title: "مدیریت نوسان",
    titleEn: "Volatility Management",
    difficulty: "beginner",
    estimatedMinutes: 4,
    objective: "در نوسانات شدید قیمتی با آرامش تصمیم بگیرید. اجازه ندهید قیمت به صورت احساسی شما را تکان دهد.",
    marketContext: "بازار بی‌ثبات است. قیمت ETH بالا و پایین می‌رود. هدف: حفظ آرامش و رعایت برنامه.",
    concept: "صبر و تحمل نوسان",
    allowedActions: ["buy", "close", "hold", "wait"],
    initialBalance: 5_000,
    targetAsset: "ETH",
    startPrice: 3_500,
    priceSequence: lcgWalk(123, 3_500, 30, 0.012),
    successCriteria: { type: "hold-through-dip" },
    failureCriteria: { type: "panic-close" },
    successHint: "اگر موقعیت باز کردید، با حد ضرر منتظر بمانید — نوسان‌ها طبیعی هستند.",
    warningFlags: ["impulse-entry", "no-stop-loss"],
    mentorFeedback: {
      passHeadline: "صبر در نوسان — مهارت ارزشمند",
      passBody: "توانستید در برابر نوسانات قیمت آرامش خود را حفظ کنید. این صبر در معاملات واقعی تفاوت بزرگی ایجاد می‌کند.",
      failHeadline: "واکنش عجولانه به نوسان",
      failBody: "بستن موقعیت در پایین‌ترین نقطه نوسان به جای انتظار برای برگشت، نشانه‌ای از نبود صبر است.",
      keyLesson: "نوسان طبیعی است. حد ضرر خود را تنظیم کنید و اجازه دهید برنامه عمل کند.",
    },
    dnaImpact: { discipline: +5, patience: +10, risk_management: +5, fomo_risk: +5, revenge_risk: 0, decision_quality: +5 },
    badgeId: "volatility-master",
  },
  {
    id: "fomo-scenario",
    title: "مقاومت در برابر FOMO",
    titleEn: "FOMO Resistance",
    difficulty: "intermediate",
    estimatedMinutes: 5,
    objective: "قیمت بیتکوین با سرعت بالا می‌رود. وظیفه شما خودداری از ورود عجولانه است.",
    marketContext: "BTC 20٪ در 10 مرحله بالا رفته. همه در حال خرید هستند. آیا می‌توانید در مقابل FOMO مقاومت کنید؟",
    concept: "کنترل FOMO",
    allowedActions: ["wait", "hold"],
    initialBalance: 5_000,
    targetAsset: "BTC",
    startPrice: 65_000,
    priceSequence: riseAndFall(65_000, 12, 0.018, 10, 0.025),
    successCriteria: { type: "no-trade" },
    failureCriteria: { type: "panic-close" },
    successHint: "در این سناریو بهترین اقدام، هیچ اقدامی نیست. فقط نگاه کنید.",
    warningFlags: ["fomo-entry", "impulse-entry"],
    mentorFeedback: {
      passHeadline: "FOMO را شکست دادید",
      passBody: "توانستید با وجود صعود سریع قیمت، وارد بازار نشوید. این یکی از سخت‌ترین مهارت‌های معامله‌گری است.",
      failHeadline: "FOMO شما را گرفت",
      failBody: "دیدیم که در بالاترین نقطه قیمت وارد شدید — و بعد قیمت سقوط کرد. این الگوی کلاسیک FOMO است.",
      keyLesson: "وقتی همه می‌خرند و قیمت تند رفته، معمولاً دیر است. صبر کنید برای اصلاح.",
    },
    dnaImpact: { discipline: +5, patience: +5, risk_management: 0, fomo_risk: +15, revenge_risk: +5, decision_quality: +10 },
    badgeId: "fomo-fighter",
  },
  {
    id: "revenge-trading",
    title: "کنترل معامله انتقامی",
    titleEn: "Revenge Trading Control",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    objective: "بعد از یک ضرر، آیا می‌توانید صبر کنید و با برنامه وارد شوید؟",
    marketContext: "ETH ابتدا 8٪ ریزش کرده و موقعیت اول شما با ضرر بسته شد. بازار کمی بعد شروع به ریکاوری می‌کند.",
    concept: "کنترل انتقام‌جویی",
    allowedActions: ["wait", "buy", "close", "set-sl"],
    initialBalance: 5_000,
    targetAsset: "ETH",
    startPrice: 3_500,
    priceSequence: steadyDown(3_500, 28, 0.010, 0.007),
    successCriteria: { type: "pnl-pct", value: -3 }, // staying above -3% is a win
    failureCriteria: { type: "revenge-trade" },
    successHint: "اگر ضرر کردید، چند دقیقه صبر کنید و منطقی تصمیم بگیرید.",
    warningFlags: ["revenge-trade", "over-risk", "no-stop-loss"],
    mentorFeedback: {
      passHeadline: "کنترل خود را حفظ کردید",
      passBody: "بعد از ضرر، وارد معامله انتقامی نشدید. این یکی از نشانه‌های بلوغ معامله‌گری است.",
      failHeadline: "معامله انتقامی شناسایی شد",
      failBody: "بعد از ضرر، سریع دوباره وارد شدید بدون برنامه مشخص. این رفتار معمولاً ضررها را دو چندان می‌کند.",
      keyLesson: "بعد از ضرر: متوقف شوید. نفس بکشید. بپرسید آیا این معامله بعدی واقعاً منطقی است یا فقط می‌خواهم ضررم را جبران کنم؟",
    },
    dnaImpact: { discipline: +8, patience: +8, risk_management: +5, fomo_risk: +5, revenge_risk: +15, decision_quality: +8 },
    badgeId: "no-revenge",
  },
  {
    id: "risk-management",
    title: "مدیریت ریسک با حد ضرر",
    titleEn: "Stop-Loss Discipline",
    difficulty: "intermediate",
    estimatedMinutes: 5,
    objective: "هر معامله باید با حد ضرر مشخص باشد. ریسک هر معامله نباید بیش از ۲٪ سرمایه باشد.",
    marketContext: "بازار BTC نوسان دارد. شما باید ۳ معامله با مدیریت ریسک صحیح انجام دهید.",
    concept: "حد ضرر اجباری و اندازه‌گیری موقعیت",
    allowedActions: ["buy", "close", "set-sl"],
    initialBalance: 10_000,
    targetAsset: "BTC",
    startPrice: 65_000,
    priceSequence: lcgWalk(789, 65_000, 35, 0.008),
    successCriteria: { type: "stop-loss-set" },
    failureCriteria: { type: "no-stop-loss" },
    successHint: "هر معامله‌ای که باز می‌کنید باید حد ضرر داشته باشد و مبلغ آن زیر ۵٪ موجودی باشد.",
    warningFlags: ["no-stop-loss", "over-risk"],
    mentorFeedback: {
      passHeadline: "انضباط ریسک — سنگ بنای معامله‌گری",
      passBody: "در همه معاملات این سناریو از حد ضرر استفاده کردید. این یعنی شما ریسک را مدیریت می‌کنید، نه برعکس.",
      failHeadline: "بدون حد ضرر — خطرناک",
      failBody: "یک یا چند معامله بدون حد ضرر باز کردید. در بازار واقعی، این می‌تواند کل سرمایه را از بین ببرد.",
      keyLesson: "قانون طلایی: اگر می‌توانی ضرر را تحمل نکنی، اصلاً وارد معامله نشو.",
    },
    dnaImpact: { discipline: +10, patience: +5, risk_management: +15, fomo_risk: 0, revenge_risk: 0, decision_quality: +10 },
    badgeId: "risk-manager",
  },
  {
    id: "news-reaction",
    title: "واکنش به اخبار",
    titleEn: "News Reaction",
    difficulty: "advanced",
    estimatedMinutes: 6,
    objective: "یک خبر مثبت منتشر شده. آیا می‌توانید بدون پانیک یا FOMO تصمیم منطقی بگیرید؟",
    marketContext: "خبر: یک صندوق بزرگ سرمایه‌گذاری اعلام کرد که ۵٪ از دارایی‌هایش را به BTC تبدیل می‌کند. قیمت شروع به رشد کرد.",
    concept: "تصمیم‌گیری آگاهانه در برابر اخبار",
    allowedActions: ["buy", "close", "wait", "set-sl"],
    initialBalance: 10_000,
    targetAsset: "BTC",
    startPrice: 65_000,
    priceSequence: riseAndFall(65_000, 8, 0.022, 14, 0.014),
    successCriteria: { type: "pnl-pct", value: 0 },
    failureCriteria: { type: "pnl-pct", value: -8 },
    successHint: "اگر وارد شدید، زودتر از سقف خارج شوید. قیمت پس از اخبار معمولاً اصلاح می‌کند.",
    warningFlags: ["fomo-entry", "no-stop-loss", "over-risk"],
    mentorFeedback: {
      passHeadline: "تحلیل آگاهانه خبر",
      passBody: "توانستید بدون هیجان‌زدگی به اخبار واکنش نشان دهید و با برنامه عمل کنید.",
      failHeadline: "هیجان خبر شما را گمراه کرد",
      failBody: "پس از خبر مثبت، بدون تحلیل وارد شدید و در بالاترین قیمت گیر کردید. این الگوی کلاسیک 'خرید در اوج' است.",
      keyLesson: "خبر خوب ≠ قیمت بالا می‌رود برای همیشه. بازار اغلب قبل از خبر اوج می‌گیرد و بعد از آن اصلاح می‌کند.",
    },
    dnaImpact: { discipline: +5, patience: +8, risk_management: +5, fomo_risk: +12, revenge_risk: 0, decision_quality: +12 },
    badgeId: "news-analyst",
  },
];

export function getScenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function getScenariosByDifficulty(difficulty: ScenarioDifficulty): Scenario[] {
  return SCENARIOS.filter((s) => s.difficulty === difficulty);
}

export const DIFFICULTY_LABEL: Record<ScenarioDifficulty, string> = {
  beginner: "مبتدی",
  intermediate: "متوسط",
  advanced: "پیشرفته",
};
