/**
 * Community Leaderboard — Phase 18.
 * Scores students on behavioral discipline — NOT raw profit.
 * Leaderboard entries include the student's own scores plus simulated demo peers.
 * Demo peers are deterministically generated so the board is stable.
 */

import { loadProgress } from "@/lib/academy-progress";
import { loadArenaState, computeArenaStats } from "@/lib/trading-arena";
import { getJournalCompletionRate } from "@/lib/trading-journal";

export type LeaderboardCategory =
  | "discipline"
  | "consistency"
  | "scenario-mastery"
  | "journal-quality"
  | "risk-management"
  | "overall";

export interface LeaderboardEntry {
  rank: number;
  anonymousId: string;
  displayName: string;
  avatarInitials: string;
  score: number;
  badge?: string;
  isMe: boolean;
  isDemo: boolean;   // clearly flag simulated peers
}

export interface MyLeaderboardScores {
  discipline: number;
  consistency: number;
  scenarioMastery: number;
  journalQuality: number;
  riskManagement: number;
  overall: number;
}

export function computeMyLeaderboardScores(): MyLeaderboardScores {
  if (typeof window === "undefined") {
    return { discipline: 0, consistency: 0, scenarioMastery: 0, journalQuality: 0, riskManagement: 0, overall: 0 };
  }

  const progress = loadProgress();
  const arena = loadArenaState();
  const stats = computeArenaStats(arena);
  const journalRate = getJournalCompletionRate();

  // Discipline: stop-loss rate + no over-risk (trading) + streak (learning)
  const slScore = stats.totalTrades > 0 ? Math.round(stats.stopLossRate * 60) : 30;
  const streakBonus = Math.min(40, progress.streak * 4);
  const discipline = Math.min(100, slScore + streakBonus);

  // Consistency: days active + streak
  const daysActive = Math.min(7, progress.streak > 0 ? Math.min(progress.streak, 7) : 0);
  const consistency = Math.min(100, Math.round(
    (daysActive / 7) * 50 +
    Math.min(50, progress.xp / 100),
  ));

  // Scenario mastery: scenarios passed / total * 100
  const scenarioPassed = stats.scenariosPassed;
  const scenarioMastery = Math.min(100, Math.round((scenarioPassed / 6) * 100));

  // Journal quality: completion rate
  const journalQuality = Math.round(journalRate * 100);

  // Risk management: anti-overrisk + stop-loss + low drawdown
  const overRiskPenalty = stats.totalTrades > 0 ? Math.round(stats.overRiskRate * 50) : 0;
  const revengeRiskPenalty = stats.totalTrades > 0 ? Math.round(stats.revengeTradeRate * 30) : 0;
  const riskBase = stats.totalTrades > 0 ? Math.round(stats.stopLossRate * 80) : 40;
  const riskManagement = Math.max(0, Math.min(100, riskBase - overRiskPenalty - revengeRiskPenalty));

  // Overall: weighted composite
  const overall = Math.round(
    discipline * 0.25 +
    consistency * 0.20 +
    scenarioMastery * 0.20 +
    journalQuality * 0.15 +
    riskManagement * 0.20,
  );

  return { discipline, consistency, scenarioMastery, journalQuality, riskManagement, overall };
}

// Deterministic demo peer generator (seed-based so peers are stable)
function lcgNext(state: number): number {
  return ((state * 1664525 + 1013904223) >>> 0);
}
function lcgFloat(state: number): [number, number] {
  const next = lcgNext(state);
  return [next / 0xffffffff, next];
}

const DEMO_DISPLAY_NAMES = [
  "آریا.تریدر", "نگین.م", "رضا.ک", "سارا.ه", "امید.ب",
  "فاطمه.ن", "محمد.ع", "زهرا.ت", "علی.ش", "مریم.ر",
  "سینا.د", "پریسا.ف", "کامران.م", "لیلا.خ", "بهراد.ج",
];

function generateDemoPeers(category: LeaderboardCategory, _myScore: number): LeaderboardEntry[] {
  const peers: LeaderboardEntry[] = [];
  const rng = { state: category.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7) };

  for (let i = 0; i < 12; i++) {
    const [f1, s1] = lcgFloat(rng.state);
    const [f2, s2] = lcgFloat(s1);
    rng.state = s2;

    // Generate scores that cluster around realistic ranges (not artificially perfect)
    const baseScore = Math.round(30 + f1 * 65);
    const nameIdx = Math.floor(f2 * DEMO_DISPLAY_NAMES.length);
    const name = DEMO_DISPLAY_NAMES[nameIdx] ?? "تریدر.ناشناس";

    const [, idState] = lcgFloat(rng.state);
    rng.state = idState;
    const idChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let anonId = "T-";
    let idRng = idState;
    for (let j = 0; j < 4; j++) {
      const [f3, s3] = lcgFloat(idRng);
      idRng = s3;
      anonId += idChars[Math.floor(f3 * idChars.length)];
    }

    peers.push({
      rank: 0, // set after sort
      anonymousId: anonId,
      displayName: name,
      avatarInitials: name.slice(0, 1),
      score: baseScore,
      isMe: false,
      isDemo: true,
    });
  }

  return peers;
}

export function getLeaderboard(
  category: LeaderboardCategory,
  myId: string,
  myDisplay: string,
  myInitials: string,
): LeaderboardEntry[] {
  const scores = computeMyLeaderboardScores();
  const scoreMap: Record<LeaderboardCategory, number> = {
    discipline: scores.discipline,
    consistency: scores.consistency,
    "scenario-mastery": scores.scenarioMastery,
    "journal-quality": scores.journalQuality,
    "risk-management": scores.riskManagement,
    overall: scores.overall,
  };
  const myScore = scoreMap[category];

  const me: LeaderboardEntry = {
    rank: 0,
    anonymousId: myId,
    displayName: myDisplay,
    avatarInitials: myInitials,
    score: myScore,
    isMe: true,
    isDemo: false,
  };

  const peers = generateDemoPeers(category, myScore);
  const all = [...peers, me].sort((a, b) => b.score - a.score);

  // Assign ranks
  let rank = 1;
  for (const entry of all) {
    entry.rank = rank++;
  }

  return all;
}

export const CATEGORY_LABEL: Record<LeaderboardCategory, string> = {
  discipline: "انضباط",
  consistency: "ثبات",
  "scenario-mastery": "تسلط سناریو",
  "journal-quality": "کیفیت ژورنال",
  "risk-management": "مدیریت ریسک",
  overall: "امتیاز کلی",
};

export const CATEGORY_DESCRIPTION: Record<LeaderboardCategory, string> = {
  discipline: "براساس نرخ حد ضرر و پیوستگی مطالعه — نه سود",
  consistency: "براساس روزهای فعال و streak هفتگی",
  "scenario-mastery": "براساس سناریوهای پاس‌شده از ۶ سناریو",
  "journal-quality": "براساس نرخ تکمیل ژورنال معاملاتی",
  "risk-management": "براساس کنترل ریسک — کمترین over-risk و بیشترین SL",
  overall: "ترکیب وزن‌دار همه ابعاد رفتاری",
};

// Safety rules for community
export const COMMUNITY_SAFETY_RULES: string[] = [
  "هیچ سیگنال معاملاتی در اینجا ارائه نمی‌شود.",
  "هیچ ادعای سود تضمین‌شده وجود ندارد.",
  "کپی‌کردن معاملات دیگران ممنوع است.",
  "این جامعه مشاوره مالی نیست.",
  "رتبه‌بندی فقط براساس انضباط و رفتار — نه سود خام.",
  "تحقیر یا قضاوت منفی دیگران ممنوع است.",
  "هیچ معامله واقعی توصیه نمی‌شود.",
];
