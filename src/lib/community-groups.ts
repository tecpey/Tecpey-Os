/**
 * Study Groups — Phase 18 foundation.
 * Static demo groups. No real-time chat. No DMs.
 * Students can express interest (stored locally) — ready for backend integration.
 */

export type GroupLevel = "beginner" | "intermediate" | "advanced";
export type GroupFocus = "bitcoin-basics" | "risk-management" | "trading-psychology" | "technical-analysis" | "behavioral-discipline";

export interface StudyGroup {
  id: string;
  name: string;
  level: GroupLevel;
  focusTopic: string;
  focus: GroupFocus;
  memberCount: number;        // demo count
  weeklyGoal: string;
  groupChallenge: string;
  disciplineScore: number;    // average group discipline (demo)
  description: string;
  isDemo: true;
}

export const STUDY_GROUPS: StudyGroup[] = [
  {
    id: "group-bitcoin-basics",
    name: "پایه‌های بیتکوین",
    level: "beginner",
    focusTopic: "درک ارزش و تکنولوژی بیتکوین",
    focus: "bitcoin-basics",
    memberCount: 24,
    weeklyGoal: "تکمیل درس‌های ترم ۱ و مرور فلش‌کارت‌ها",
    groupChallenge: "چالش سناریوی مبتدی این هفته",
    disciplineScore: 72,
    description: "گروه مناسب برای کسانی که تازه شروع به یادگیری بیتکوین کرده‌اند.",
    isDemo: true,
  },
  {
    id: "group-risk-masters",
    name: "استادان ریسک",
    level: "intermediate",
    focusTopic: "مدیریت ریسک و حد ضرر",
    focus: "risk-management",
    memberCount: 18,
    weeklyGoal: "نرخ حد ضرر بالای ۹۰٪ در تمام معاملات شبیه‌سازی‌شده",
    groupChallenge: "چالش انضباط ریسک این هفته",
    disciplineScore: 88,
    description: "برای کسانی که می‌خواهند مدیریت ریسک را جدی‌ترین مهارت معاملاتی خود کنند.",
    isDemo: true,
  },
  {
    id: "group-psychology",
    name: "روان‌شناسی معامله",
    level: "intermediate",
    focusTopic: "کنترل احساسات در معامله",
    focus: "trading-psychology",
    memberCount: 31,
    weeklyGoal: "ثبت ژورنال با وضعیت احساسی برای هر معامله",
    groupChallenge: "چالش بدون FOMO این هفته",
    disciplineScore: 81,
    description: "تمرکز بر FOMO، معاملات انتقامی، و کنترل ذهن در برابر نوسانات بازار.",
    isDemo: true,
  },
  {
    id: "group-discipline",
    name: "انضباط ۹۰ روزه",
    level: "beginner",
    focusTopic: "ایجاد عادات مطالعاتی پایدار",
    focus: "behavioral-discipline",
    memberCount: 42,
    weeklyGoal: "حداقل ۵ روز مطالعه در هفته + ۱ سناریو",
    groupChallenge: "چالش بازتاب ژورنال",
    disciplineScore: 76,
    description: "برای کسانی که می‌خواهند یک روتین یادگیری ۹۰ روزه بسازند.",
    isDemo: true,
  },
  {
    id: "group-advanced-analysis",
    name: "تحلیلگران پیشرفته",
    level: "advanced",
    focusTopic: "واکنش به اخبار و تحلیل بازار",
    focus: "technical-analysis",
    memberCount: 12,
    weeklyGoal: "پاس سناریوی واکنش به اخبار + بازتاب ژورنال",
    groupChallenge: "چالش واکنش به اخبار",
    disciplineScore: 91,
    description: "گروه پیشرفته برای دانش‌آموزانی که ترم ۱ را تکمیل کرده‌اند.",
    isDemo: true,
  },
];

export const LEVEL_LABEL: Record<GroupLevel, string> = {
  beginner: "مبتدی", intermediate: "متوسط", advanced: "پیشرفته",
};
