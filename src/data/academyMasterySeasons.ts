export type AcademyMasterySeasonKind = "repair" | "market-update" | "arena-discipline" | "cohort-league";

export type AcademyMasterySeason = {
  id: string;
  kind: AcademyMasterySeasonKind;
  titleFa: string;
  titleEn: string;
  summaryFa: string;
  summaryEn: string;
  unlockFa: string;
  unlockEn: string;
  cadenceFa: string;
  cadenceEn: string;
  signalTags: string[];
  recommendedAfterTerm: number;
  missions: {
    titleFa: string;
    titleEn: string;
    methodFa: string;
    methodEn: string;
  }[];
};

export type LearnerMasterySignals = {
  completedTerms: number;
  weakConceptTags?: string[];
  arenaRiskFlags?: string[];
  mentorTopicTags?: string[];
  marketInterestTags?: string[];
};

export const forbiddenMasteryRankingInputs = [
  "real_exchange_pnl",
  "real_trade_volume",
  "deposited_amount",
  "leverage_used",
  "paid_plan_status",
  "speed_without_accuracy",
] as const;

export const allowedMasteryRankingInputs = [
  "assessment_accuracy",
  "mastery_improvement",
  "learning_consistency",
  "journal_quality",
  "rule_compliance",
  "repair_completion",
  "mentor_reviewed_reflection",
  "trading_dna_discipline",
] as const;

export const academyMasterySeasonPrinciples = [
  {
    titleFa: "آکادمی اصلی پایان دارد، رشد نه",
    titleEn: "Core Academy ends, growth does not",
    textFa: "۷ ترم اصلی مسیر پایه و قابل گواهی هستند؛ بعد از آن Seasonهای اختصاصی مسیر رشد را زنده نگه می‌دارند.",
    textEn: "The 7 core terms are the certifiable foundation; personalized seasons keep the growth path alive afterward.",
  },
  {
    titleFa: "رقابت باید سالم باشد",
    titleEn: "Competition must stay healthy",
    textFa: "رنکینگ با دقت، پیشرفت، نظم، ژورنال و رعایت ریسک ساخته می‌شود؛ نه سود واقعی، سرعت خام یا حجم معامله.",
    textEn: "Ranking is built from accuracy, improvement, discipline, journals and risk compliance, not real profit, raw speed or trade volume.",
  },
  {
    titleFa: "منتور پیشنهاد می‌دهد، سرور تأیید می‌کند",
    titleEn: "Mentor recommends, server verifies",
    textFa: "Mentor AI مسیر و تمرین پیشنهاد می‌دهد، اما پیشرفت رسمی، گواهی و رتبه باید از داده سرورمحور بیاید.",
    textEn: "Mentor AI recommends paths and practice, but official progress, certificates and ranking must come from server-backed data.",
  },
] as const;

export const academyMasterySeasons: AcademyMasterySeason[] = [
  {
    id: "risk-repair-season",
    kind: "repair",
    titleFa: "Season ترمیم مدیریت ریسک",
    titleEn: "Risk Repair Season",
    summaryFa: "برای کاربری که در اندازه موقعیت، حد ضرر، نسبت ریسک/بازده یا تصمیم‌های عجولانه ضعف نشان داده است.",
    summaryEn: "For learners showing weakness in position sizing, stop-loss, risk/reward or rushed decisions.",
    unlockFa: "بعد از ترم ۴ یا پس از مشاهده ضعف جدی در آزمون/آرنا",
    unlockEn: "After Term 4 or after serious quiz/Arena weakness",
    cadenceFa: "۷ تا ۱۴ روز، با مرور فاصله‌دار",
    cadenceEn: "7 to 14 days with spaced follow-up",
    signalTags: ["risk", "position-sizing", "stop-loss", "expectancy", "arena-risk"],
    recommendedAfterTerm: 4,
    missions: [
      {
        titleFa: "محاسبه اندازه موقعیت",
        titleEn: "Position-size calculation",
        methodFa: "تمرین بازیابی + ماشین حساب ریسک + بازخورد منتور",
        methodEn: "Retrieval practice + risk calculator + mentor feedback",
      },
      {
        titleFa: "سناریوی حد ضرر",
        titleEn: "Stop-loss scenario",
        methodFa: "چالش زمان‌دار سبک با توضیح نقطه ابطال",
        methodEn: "Soft timed challenge with invalidation explanation",
      },
      {
        titleFa: "ژورنال تصمیم اشتباه",
        titleEn: "Mistake journal",
        methodFa: "بازتاب رفتاری و اصلاح قانون شخصی",
        methodEn: "Behavioral reflection and personal rule repair",
      },
    ],
  },
  {
    id: "security-repair-season",
    kind: "repair",
    titleFa: "Season ترمیم امنیت دارایی",
    titleEn: "Asset Security Repair Season",
    summaryFa: "برای کاربری که در Seed Phrase، فیشینگ، شبکه انتقال، 2FA یا تشخیص پیام جعلی ضعف دارد.",
    summaryEn: "For learners weak in seed phrase safety, phishing, transfer networks, 2FA or fake-message detection.",
    unlockFa: "از ترم ۲ به بعد و همیشه با اولویت بالا",
    unlockEn: "From Term 2 onward, always high priority",
    cadenceFa: "۳ تا ۷ روز، تکرار تا تسلط",
    cadenceEn: "3 to 7 days, repeated until mastery",
    signalTags: ["security", "seed-phrase", "phishing", "transfer-network", "2fa"],
    recommendedAfterTerm: 2,
    missions: [
      {
        titleFa: "تشخیص دامنه جعلی",
        titleEn: "Fake-domain detection",
        methodFa: "سناریو کوتاه + توضیح Red Flag",
        methodEn: "Short scenario + red-flag explanation",
      },
      {
        titleFa: "چک‌لیست انتقال امن",
        titleEn: "Safe transfer checklist",
        methodFa: "تمرین مرحله‌ای بدون پول واقعی",
        methodEn: "Step-by-step practice without real funds",
      },
      {
        titleFa: "مرور Seed Phrase",
        titleEn: "Seed phrase review",
        methodFa: "کوییز بدون تایمر + مرور فاصله‌دار",
        methodEn: "Untimed quiz + spaced review",
      },
    ],
  },
  {
    id: "psychology-discipline-season",
    kind: "arena-discipline",
    titleFa: "Season نظم روانشناسی معامله",
    titleEn: "Trading Psychology Discipline Season",
    summaryFa: "برای الگوهای FOMO، انتقام از بازار، ورودهای زیاد، مکث بی‌دلیل یا اعتماد بیش از حد در تمرین‌ها.",
    summaryEn: "For FOMO, revenge decisions, overtrading, unexplained hesitation or overconfidence in practice.",
    unlockFa: "بعد از ترم ۵ و با اتصال به ژورنال/آرنا",
    unlockEn: "After Term 5 with journal/Arena connection",
    cadenceFa: "چرخه ماهانه",
    cadenceEn: "Monthly cycle",
    signalTags: ["psychology", "fomo", "revenge-trading", "overconfidence", "journal"],
    recommendedAfterTerm: 5,
    missions: [
      {
        titleFa: "قانون قبل از ورود",
        titleEn: "Pre-entry rule",
        methodFa: "ژورنال اجباری قبل از تصمیم تمرینی",
        methodEn: "Required journal before practice decision",
      },
      {
        titleFa: "روز بدون معامله",
        titleEn: "No-trade day",
        methodFa: "تشخیص موقعیت‌های کم‌کیفیت و تمرین صبر",
        methodEn: "Identify low-quality setups and practice patience",
      },
      {
        titleFa: "بازبینی اعتماد کاذب",
        titleEn: "Overconfidence review",
        methodFa: "مقایسه اعتماد اعلامی با نتیجه واقعی پاسخ",
        methodEn: "Compare stated confidence with actual answer outcome",
      },
    ],
  },
  {
    id: "market-intelligence-season",
    kind: "market-update",
    titleFa: "Season هوش بازار و اخبار مهم",
    titleEn: "Market Intelligence Update Season",
    summaryFa: "برای آموزش اتفاقات روز دنیا، روایت‌های مهم، ابزارهای جدید، کوین‌های ترند و ریسک‌های تازه بازار.",
    summaryEn: "For current market events, major narratives, new tools, trending coins and emerging risks.",
    unlockFa: "بعد از ترم ۳؛ نسخه عمیق‌تر بعد از ترم ۷",
    unlockEn: "After Term 3; deeper version after Term 7",
    cadenceFa: "هفتگی یا رویدادمحور",
    cadenceEn: "Weekly or event-driven",
    signalTags: ["market-news", "coin-trends", "tools", "regulation", "macro"],
    recommendedAfterTerm: 3,
    missions: [
      {
        titleFa: "خبر، روایت، اثر احتمالی",
        titleEn: "News, narrative, possible impact",
        methodFa: "خلاصه منبع‌دار + سؤال بازیابی + هشدار ریسک",
        methodEn: "Sourced brief + retrieval question + risk warning",
      },
      {
        titleFa: "کوین یا ابزار ترند",
        titleEn: "Trending coin or tool",
        methodFa: "تحلیل کاربرد، محدودیت، ریسک و لینک رسمی",
        methodEn: "Use case, limitation, risk and official-link review",
      },
      {
        titleFa: "اتصال به درس مرتبط",
        titleEn: "Related lesson bridge",
        methodFa: "برگشت به ترم و مفهوم مرتبط برای جلوگیری از هیجان",
        methodEn: "Return to related term concept to reduce hype",
      },
    ],
  },
  {
    id: "mastery-league-season",
    kind: "cohort-league",
    titleFa: "League رقابت یادگیری هم‌سطح",
    titleEn: "Peer-Level Learning League",
    summaryFa: "رقابت اختیاری میان کاربران هم‌سطح بر اساس دقت، پیشرفت، نظم، ژورنال و رعایت ریسک.",
    summaryEn: "Optional competition among comparable learners based on accuracy, improvement, discipline, journal quality and risk compliance.",
    unlockFa: "بعد از تکمیل ترم ۷ و رضایت نمایش رتبه",
    unlockEn: "After Term 7 completion and ranking visibility consent",
    cadenceFa: "Season ماهانه",
    cadenceEn: "Monthly season",
    signalTags: ["league", "ranking", "consistency", "mastery", "community"],
    recommendedAfterTerm: 7,
    missions: [
      {
        titleFa: "رقابت دقت",
        titleEn: "Accuracy challenge",
        methodFa: "کوییز ترکیبی با محدودیت ضدسرعت خام",
        methodEn: "Mixed quiz with anti-raw-speed limit",
      },
      {
        titleFa: "رقابت پیشرفت",
        titleEn: "Improvement challenge",
        methodFa: "امتیاز بیشتر برای اصلاح ضعف قبلی",
        methodEn: "Higher score for repairing prior weakness",
      },
      {
        titleFa: "رقابت نظم آرنا",
        titleEn: "Arena discipline challenge",
        methodFa: "رعایت قانون، ژورنال و ریسک، بدون رتبه‌بندی سود واقعی",
        methodEn: "Rule, journal and risk discipline, with no real-profit ranking",
      },
    ],
  },
];

function normalizedSet(values: string[] | undefined): Set<string> {
  return new Set((values || []).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export type AcademyMasterySeasonRecommendation = {
  season: AcademyMasterySeason;
  score: number;
  matchingSignals: string[];
  eligible: boolean;
};

export function scoreAcademyMasterySeasonRecommendations(
  signals: LearnerMasterySignals,
): AcademyMasterySeasonRecommendation[] {
  const completedTerms = Math.max(0, Math.min(7, Math.floor(Number(signals.completedTerms) || 0)));
  const tags = new Set([
    ...normalizedSet(signals.weakConceptTags),
    ...normalizedSet(signals.arenaRiskFlags),
    ...normalizedSet(signals.mentorTopicTags),
    ...normalizedSet(signals.marketInterestTags),
  ]);

  return academyMasterySeasons
    .map((season) => {
      const eligible = completedTerms >= season.recommendedAfterTerm;
      const matchingSignals = season.signalTags.filter((tag) => tags.has(tag));
      const termReadinessBoost = eligible ? 2 : 0;
      const graduationBoost = completedTerms >= 7 && season.kind !== "repair" ? 2 : 0;
      return {
        season,
        score: matchingSignals.length * 3 + termReadinessBoost + graduationBoost,
        matchingSignals,
        eligible,
      };
    })
    .filter((item) => {
      if (item.season.kind === "cohort-league") return item.eligible;
      return item.eligible || item.score >= 3;
    })
    .sort((a, b) => b.score - a.score || a.season.recommendedAfterTerm - b.season.recommendedAfterTerm);
}

export function recommendAcademyMasterySeasons(signals: LearnerMasterySignals, limit = 3): AcademyMasterySeason[] {
  return scoreAcademyMasterySeasonRecommendations(signals)
    .slice(0, Math.max(1, limit))
    .map((item) => item.season);
}
