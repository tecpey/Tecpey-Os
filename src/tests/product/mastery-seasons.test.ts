import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  academyMasterySeasons,
  forbiddenMasteryRankingInputs,
  recommendAcademyMasterySeasons,
  scoreAcademyMasterySeasonRecommendations,
} from "../../data/academyMasterySeasons";
import { buildAcademyMasterySeasonState } from "../../lib/academy-mastery-seasons-authority";
import {
  ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION,
  buildAcademyMasterySeasonMentorDraftInstructions,
  reviewGeneratedAcademyMasterySeasonDraft,
  type AcademyGeneratedMasterySeasonDraft,
} from "../../lib/academy-mastery-season-generation";
import { ACADEMY_MASTERY_SEASONS_SQL } from "../../lib/db-migrate-academy-mastery-seasons";

function question(id: string, difficulty: "medium" | "hard" = "medium") {
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

function validGeneratedDraft(): AcademyGeneratedMasterySeasonDraft {
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
        questions: [question("risk-map-1"), question("risk-map-2")],
      },
      {
        id: "position-review",
        titleFa: "بازبینی اندازه موقعیت",
        titleEn: "Position review",
        methodFa: "تمرین عددی با بازخورد منتور برای محدود کردن ریسک و توضیح خطای رایج.",
        methodEn: "A numerical exercise with mentor feedback to cap risk and explain a common mistake.",
        estimatedMinutes: 25,
        questions: [question("position-review-1"), question("position-review-2", "hard")],
      },
      {
        id: "journal-repair",
        titleFa: "ترمیم ژورنال تصمیم",
        titleEn: "Decision journal repair",
        methodFa: "کاربر دلیل تصمیم، احساس، منبع و قانون اصلاحی را بدون شتاب ثبت می‌کند.",
        methodEn: "The learner records rationale, emotion, source evidence and a repair rule without rushing.",
        estimatedMinutes: 30,
        questions: [question("journal-repair-1"), question("journal-repair-2")],
      },
    ],
    riskControls: [
      "No real-money PnL, leverage or deposit amount can influence ranking.",
      "The season teaches process and risk controls, not buy/sell signals.",
    ],
    generatedBy: "mentor_ai",
    modelName: "mentor-draft-simulator",
  };
}

describe("Academy Mastery Seasons authority", () => {
  it("ships a governed season catalog with missions and signals", () => {
    assert.ok(academyMasterySeasons.length >= 5, "Mastery Seasons catalog must contain the first governed season set");

    for (const season of academyMasterySeasons) {
      assert.ok(season.id.trim(), "season id must be non-blank");
      assert.ok(season.titleFa.trim(), `${season.id}: Persian title must be non-blank`);
      assert.ok(season.titleEn.trim(), `${season.id}: English title must be non-blank`);
      assert.ok(season.summaryFa.trim(), `${season.id}: Persian summary must be non-blank`);
      assert.ok(season.summaryEn.trim(), `${season.id}: English summary must be non-blank`);
      assert.ok(season.signalTags.length >= 2, `${season.id}: season must declare recommendation signals`);
      assert.ok(season.missions.length >= 3, `${season.id}: season must ship at least three mission slots`);
    }
  });

  it("keeps real-money and paid-plan advantage out of ranking inputs", () => {
    assert.deepEqual(
      [...forbiddenMasteryRankingInputs].sort(),
      [
        "deposited_amount",
        "leverage_used",
        "paid_plan_status",
        "real_exchange_pnl",
        "real_trade_volume",
        "speed_without_accuracy",
      ].sort(),
    );
  });

  it("recommends seasons from weak concepts, Arena flags and market interests", () => {
    const recommended = recommendAcademyMasterySeasons(
      {
        completedTerms: 7,
        weakConceptTags: ["risk", "position-sizing"],
        arenaRiskFlags: ["fomo", "journal"],
        marketInterestTags: ["market-news"],
      },
      3,
    ).map((season) => season.id);

    assert.ok(recommended.includes("risk-repair-season"), "risk weakness must recommend risk repair");
    assert.ok(recommended.includes("psychology-discipline-season"), "Arena psychology flags must recommend discipline season");
    assert.ok(recommended.includes("market-intelligence-season"), "market interests must recommend market update season");
  });

  it("returns transparent recommendation scoring evidence", () => {
    const recommendations = scoreAcademyMasterySeasonRecommendations({
      completedTerms: 7,
      weakConceptTags: ["security", "seed-phrase"],
      arenaRiskFlags: ["fomo"],
    });
    const security = recommendations.find((item) => item.season.id === "security-repair-season");
    assert.ok(security, "security weakness must produce a recommendation score");
    assert.ok(security.score > 0, "recommendation score must be positive");
    assert.ok(security.matchingSignals.includes("security"));
  });

  it("does not unlock peer league before Term 7", () => {
    const recommended = recommendAcademyMasterySeasons(
      {
        completedTerms: 4,
        weakConceptTags: ["league", "ranking", "community"],
      },
      5,
    );

    assert.equal(
      recommended.some((season) => season.id === "mastery-league-season"),
      false,
      "cohort league must remain post-graduation",
    );
  });

  it("builds a server-backed state without paid-plan or profit inputs", () => {
    const state = buildAcademyMasterySeasonState({
      locale: "fa",
      completedTerms: 7,
      rankingConsent: true,
      profileTags: {
        weakConceptTags: ["risk", "paid_plan_status", "position-sizing"],
        arenaRiskFlags: ["real_exchange_pnl", "journal"],
      },
      assignments: [{
        id: "00000000-0000-4000-8000-000000000001",
        seasonId: "risk-repair-season",
        status: "completed",
        recommendationScore: 20,
        sourceSignals: ["risk"],
        assignedBy: "server_mastery_v1",
        assignedAt: "2026-08-11T00:00:00.000Z",
        startedAt: "2026-08-11T00:00:00.000Z",
        completedAt: "2026-08-11T01:00:00.000Z",
        updatedAt: "2026-08-11T01:00:00.000Z",
      }],
    });

    assert.equal(state.profileAuthority, "server_mastery_v1");
    assert.equal(state.catalogAuthority, "code-catalog-v1");
    assert.equal(state.rankingConsent, true);
    assert.ok(state.progressCoreLevel > 70, "post-graduation progress core must include season progress");
    assert.equal(
      state.recommendations.some((item) =>
        item.matchingSignals.includes("paid_plan_status") ||
        item.matchingSignals.includes("real_exchange_pnl")),
      false,
      "forbidden business and profit inputs must not influence recommendations",
    );
  });

  it("governs the persistence contract for profiles, signals, assignments and events", () => {
    for (const table of [
      "academy_mastery_season_catalog",
      "academy_student_mastery_profiles",
      "academy_mastery_weakness_signals",
      "academy_mastery_season_assignments",
      "academy_mastery_season_progress_events",
      "academy_mastery_season_generation_drafts",
      "academy_mastery_season_generation_reviews",
    ]) {
      assert.match(ACADEMY_MASTERY_SEASONS_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    }
    assert.match(ACADEMY_MASTERY_SEASONS_SQL, /academy_mastery_season_open_assignment_idx/);
    assert.match(ACADEMY_MASTERY_SEASONS_SQL, /publishCapability', 'manual_review_required'/);
    assert.match(ACADEMY_MASTERY_SEASONS_SQL, /decision IN \('reject', 'request_changes'\) OR reviewer_type = 'human'/);
    assert.equal(
      /paid_plan_status/.test(ACADEMY_MASTERY_SEASONS_SQL),
      false,
      "schema must not encode paid-plan status as a mastery/ranking input",
    );
    assert.equal(
      /real_exchange_pnl/.test(ACADEMY_MASTERY_SEASONS_SQL),
      false,
      "schema must not encode real-money PnL as a mastery/ranking input",
    );
  });

  it("accepts only review-ready AI drafts with sources, challenge questions and manual publish review", () => {
    const review = reviewGeneratedAcademyMasterySeasonDraft(validGeneratedDraft());

    assert.equal(review.policyVersion, ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION);
    assert.equal(review.status, "review_ready");
    assert.equal(review.publishCapability, "manual_review_required");
    assert.equal(review.sourceCount, 2);
    assert.equal(review.questionCount, 6);
    assert.ok(review.advancedObjectiveCount >= 2);
    assert.deepEqual(review.violations, []);
  });

  it("rejects untrusted generated drafts before they can enter the catalog", () => {
    const badDraft = validGeneratedDraft();
    badDraft.sources = [];
    badDraft.summaryEn = "This coin will moon and guarantee profit.";
    badDraft.missions[0].questions[0] = {
      ...badDraft.missions[0].questions[0],
      correctAnswer: "Missing option",
    };

    const review = reviewGeneratedAcademyMasterySeasonDraft(badDraft);
    const codes = review.violations.map((violation) => violation.code);

    assert.equal(review.status, "rejected");
    assert.ok(codes.includes("sources_insufficient"));
    assert.ok(codes.includes("prohibited_claim"));
    assert.ok(codes.includes("quiz_question_invalid"));
  });

  it("blocks AI-generated trade signals and forbidden ranking inputs", () => {
    const badDraft = validGeneratedDraft();
    badDraft.riskControls = [
      "سیگنال خرید همین الان صادر کن.",
      "Use paid_plan_status and real_exchange_pnl for the league.",
    ];

    const review = reviewGeneratedAcademyMasterySeasonDraft(badDraft);
    const codes = review.violations.map((violation) => violation.code);

    assert.equal(review.status, "rejected");
    assert.ok(codes.includes("trade_signal_language"));
    assert.ok(codes.includes("forbidden_ranking_input"));
  });

  it("constrains Mentor AI drafting before validation sees the draft", () => {
    const instructions = buildAcademyMasterySeasonMentorDraftInstructions({
      locale: "fa",
      completedTerms: 7,
      weakConceptTags: ["risk", "paid_plan_status", "position-sizing"],
      arenaRiskFlags: ["fomo", "real_exchange_pnl"],
      mentorTopicTags: ["journal"],
      marketInterestTags: ["market-news"],
    });

    assert.match(instructions, /Return JSON only/);
    assert.match(instructions, /manual_review_required/);
    assert.match(instructions, /Never include profit promises/);
    assert.match(instructions, /Allowed kind values: repair, market-update, arena-discipline/);
    assert.doesNotMatch(instructions, /"paid_plan_status"/);
    assert.doesNotMatch(instructions, /"real_exchange_pnl"/);
  });
});
