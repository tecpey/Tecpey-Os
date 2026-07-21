/**
 * Community leaderboard presentation vocabulary.
 *
 * This module intentionally contains no score calculation, browser storage,
 * demo peers, rank generation, reward eligibility or Mentor/Instructor input.
 * Official Community reputation facts come only from the PostgreSQL-backed
 * reputation evidence ledger. Ranking policy remains disabled until a separate
 * governed authority is approved.
 */

export type LeaderboardCategory =
  | "discipline"
  | "consistency"
  | "scenario-mastery"
  | "journal-quality"
  | "risk-management"
  | "overall";

export const CATEGORY_LABEL: Record<LeaderboardCategory, string> = {
  discipline: "انضباط",
  consistency: "ثبات",
  "scenario-mastery": "تسلط سناریو",
  "journal-quality": "کیفیت ژورنال",
  "risk-management": "مدیریت ریسک",
  overall: "امتیاز کلی",
};

export const CATEGORY_DESCRIPTION: Record<LeaderboardCategory, string> = {
  discipline: "نیازمند سیاست شفاف و شواهد معتبر سرور",
  consistency: "نیازمند سیاست شفاف و شواهد معتبر سرور",
  "scenario-mastery": "تا ایجاد Scenario Authority رسمی غیرفعال است",
  "journal-quality": "Evidence فعلی فقط پوشش Reflection معتبر را گزارش می‌کند",
  "risk-management": "تا ایجاد Risk Evidence Policy رسمی غیرفعال است",
  overall: "هیچ امتیاز کلی یا رتبه رسمی در نسخه Evidence v1 وجود ندارد",
};

export const COMMUNITY_SAFETY_RULES: string[] = [
  "هیچ سیگنال معاملاتی در اینجا ارائه نمی‌شود.",
  "هیچ ادعای سود تضمین‌شده وجود ندارد.",
  "کپی‌کردن معاملات دیگران ممنوع است.",
  "این جامعه مشاوره مالی نیست.",
  "رتبه‌بندی فقط پس از تصویب سیاست شفاف و مبتنی بر شواهد سرور فعال می‌شود.",
  "تحقیر یا قضاوت منفی دیگران ممنوع است.",
  "هیچ معامله واقعی توصیه نمی‌شود.",
];
