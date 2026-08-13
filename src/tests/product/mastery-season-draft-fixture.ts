import type { AcademyGeneratedMasterySeasonDraft } from "../../lib/academy-mastery-season-generation";

// A Mentor-generated Mastery Season draft that satisfies every governance rule
// in reviewGeneratedAcademyMasterySeasonDraft: two trusted sources, three Bloom
// objectives with at least two advanced levels, six challenge questions and
// explicit risk controls. Shared by the product suite and by the cross-tenant
// isolation proof so both exercise the same approved shape.

export function masteryDraftQuestion(id: string, difficulty: "medium" | "hard" = "medium") {
  return {
    id,
    type: "single" as const,
    question: `What is the safest educational response for challenge ${id}?`,
    options: [
      "Pause, review the source evidence, and write the risk before acting",
      "Ignore the source evidence and rush into a decision",
      "Copy a social media opinion without checking context",
      "Skip the decision journal because the answer feels obvious",
    ],
    correctAnswer: "Pause, review the source evidence, and write the risk before acting",
    explanation: "The safe answer checks evidence, risk and process before any market action.",
    difficulty,
    conceptTag: "risk",
  };
}

export function validGeneratedMasteryDraft(
  overrides: Partial<AcademyGeneratedMasterySeasonDraft> = {},
): AcademyGeneratedMasterySeasonDraft {
  return {
    id: "ai-risk-scenario-season",
    kind: "repair",
    titleFa: "Season سناریوهای پیشرفته ریسک",
    titleEn: "Advanced Risk Scenario Season",
    summaryFa: "یک Season منبع‌دار برای تمرین محاسبه ریسک، سنجش سناریو و اصلاح تصمیم‌های عجولانه در محیط آموزشی امن.",
    summaryEn: "A sourced season for practicing risk calculation, scenario review and repairing rushed decisions in a safe learning context.",
    recommendedAfterTerm: 5,
    signalTags: ["risk", "position-sizing", "journal"],
    sources: [
      {
        title: "Investor risk education",
        publisher: "SEC Investor.gov",
        url: "https://www.investor.gov/introduction-investing/investing-basics/assessing-your-risk-tolerance",
        trust: "official",
      },
      {
        title: "Responsible trading education",
        publisher: "CFA Institute",
        url: "https://www.cfainstitute.org/insights",
        trust: "educational",
      },
    ],
    objectives: [
      {
        conceptTag: "risk",
        titleFa: "تشخیص ریسک قبل از تصمیم",
        titleEn: "Identify risk before a decision",
        bloomLevel: "apply",
      },
      {
        conceptTag: "position-sizing",
        titleFa: "تحلیل اندازه موقعیت",
        titleEn: "Analyze position sizing",
        bloomLevel: "analyze",
      },
      {
        conceptTag: "journal",
        titleFa: "ارزیابی ژورنال تصمیم",
        titleEn: "Evaluate the decision journal",
        bloomLevel: "evaluate",
      },
    ],
    missions: [
      {
        id: "risk-map",
        titleFa: "نقشه ریسک",
        titleEn: "Risk map",
        methodFa: "کاربر قبل از پاسخ، منبع، سناریو، نقطه ابطال و اندازه ریسک را می‌نویسد.",
        methodEn: "The learner writes the source, scenario, invalidation point and risk size before answering.",
        estimatedMinutes: 20,
        questions: [masteryDraftQuestion("risk-map-1"), masteryDraftQuestion("risk-map-2")],
      },
      {
        id: "position-review",
        titleFa: "بازبینی اندازه موقعیت",
        titleEn: "Position review",
        methodFa: "تمرین عددی با بازخورد منتور برای محدود کردن ریسک و توضیح خطای رایج.",
        methodEn: "A numerical exercise with mentor feedback to cap risk and explain a common mistake.",
        estimatedMinutes: 25,
        questions: [masteryDraftQuestion("position-review-1"), masteryDraftQuestion("position-review-2", "hard")],
      },
      {
        id: "journal-repair",
        titleFa: "ترمیم ژورنال تصمیم",
        titleEn: "Decision journal repair",
        methodFa: "کاربر دلیل تصمیم، احساس، منبع و قانون اصلاحی را بدون شتاب ثبت می‌کند.",
        methodEn: "The learner records rationale, emotion, source evidence and a repair rule without rushing.",
        estimatedMinutes: 30,
        questions: [masteryDraftQuestion("journal-repair-1"), masteryDraftQuestion("journal-repair-2")],
      },
    ],
    riskControls: [
      "No real-money PnL, leverage or deposit amount can influence ranking.",
      "The season teaches process and risk controls, not buy/sell signals.",
    ],
    generatedBy: "mentor_ai",
    modelName: "mentor-draft-simulator",
    ...overrides,
  };
}
