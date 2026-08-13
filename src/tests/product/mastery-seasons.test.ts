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
import {
  assertAcademyMasteryReviewDecisionAllowed,
  decideAcademyMasteryGenerationDraft,
  nextAcademyMasteryDraftStatus,
  parseAcademyMasteryReviewDecision,
  submitAcademyMasteryGenerationDraft,
} from "../../lib/academy-mastery-season-review-orchestrator";
import { ACADEMY_MASTERY_SEASONS_SQL } from "../../lib/db-migrate-academy-mastery-seasons";
import { validGeneratedMasteryDraft as validGeneratedDraft } from "./mastery-season-draft-fixture";

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
    assert.match(
      ACADEMY_MASTERY_SEASONS_SQL,
      /PRIMARY KEY \(tenant_id, workspace_id, student_id, locale\)/,
    );
    assert.match(
      ACADEMY_MASTERY_SEASONS_SQL,
      /academy_mastery_season_assignments\(tenant_id, workspace_id, student_id, locale, updated_at DESC\)/,
    );
    assert.match(ACADEMY_MASTERY_SEASONS_SQL, /publishCapability', 'mentor_governed_automation'/);
    assert.match(ACADEMY_MASTERY_SEASONS_SQL, /decision IN \('reject', 'request_changes'\) OR reviewer_type = 'mentor_ai'/);
    assert.match(ACADEMY_MASTERY_SEASONS_SQL, /catalog_authority IN \('code-catalog-v1', 'mentor_governed_generated_v1'\)/);
    assert.match(ACADEMY_MASTERY_SEASONS_SQL, /published_draft_id UUID/);
    assert.match(ACADEMY_MASTERY_SEASONS_SQL, /publication_review_id BIGINT/);
    assert.match(ACADEMY_MASTERY_SEASONS_SQL, /status NOT IN \('review_ready', 'approved', 'published'\)/);
    assert.match(ACADEMY_MASTERY_SEASONS_SQL, /academy_mastery_generation_reviews_publish_once_idx/);
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

  it("accepts only approved Mentor AI drafts with sources, challenge questions and governed automation", () => {
    const review = reviewGeneratedAcademyMasterySeasonDraft(validGeneratedDraft());

    assert.equal(review.policyVersion, ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION);
    assert.equal(review.status, "approved");
    assert.equal(review.publishCapability, "mentor_governed_automation");
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

  it("rejects malformed untrusted draft shapes without throwing", () => {
    const malformed = {
      ...validGeneratedDraft(),
      sources: undefined,
      objectives: "not-an-array",
      missions: [{ id: "bad-mission", questions: undefined }],
      riskControls: null,
    } as unknown as AcademyGeneratedMasterySeasonDraft;

    assert.doesNotThrow(() => reviewGeneratedAcademyMasterySeasonDraft(malformed));
    const review = reviewGeneratedAcademyMasterySeasonDraft(malformed);
    const codes = review.violations.map((violation) => violation.code);

    assert.equal(review.status, "rejected");
    assert.ok(codes.includes("sources_insufficient"));
    assert.ok(codes.includes("objectives_insufficient"));
    assert.ok(codes.includes("missions_insufficient"));
    assert.ok(codes.includes("risk_controls_insufficient"));
  });

  it("rejects generated drafts that try to bypass Mentor governance capability", () => {
    const bypass = {
      ...validGeneratedDraft(),
      publishCapability: "direct_publish",
    };

    const review = reviewGeneratedAcademyMasterySeasonDraft(bypass);
    const codes = review.violations.map((violation) => violation.code);

    assert.equal(review.status, "rejected");
    assert.ok(codes.includes("publish_capability_invalid"));
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
      newsCenterEventTags: ["fed-rate-decision", "btc-etf-flow"],
      exchangeReadinessFlags: ["pre-trade-risk-check"],
    });

    assert.match(instructions, /Return JSON only/);
    assert.match(instructions, /mentor_governed_automation/);
    assert.match(instructions, /Never include profit promises/);
    assert.match(instructions, /News Center market events/);
    assert.match(instructions, /pre-trade education/);
    assert.match(instructions, /Allowed kind values: repair, market-update, arena-discipline/);
    assert.doesNotMatch(instructions, /"paid_plan_status"/);
    assert.doesNotMatch(instructions, /"real_exchange_pnl"/);
  });

  it("deduplicates repeated season activation events with durable idempotency", () => {
    assert.match(ACADEMY_MASTERY_SEASONS_SQL, /idempotency_key TEXT/);
    assert.match(
      ACADEMY_MASTERY_SEASONS_SQL,
      /academy_mastery_season_progress_event_idempotency_idx/,
    );
    assert.match(
      ACADEMY_MASTERY_SEASONS_SQL,
      /ON academy_mastery_season_progress_events\(assignment_id, event_type, idempotency_key\)/,
    );
  });

  it("stores Mentor AI drafts as approved automation records with validation summaries", async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      async query(sql: string, values: unknown[] = []) {
        queries.push({ sql, values });
        return {
          rows: [{
            id: "00000000-0000-4000-8000-000000000010",
            tenant_id: "tecpey",
            workspace_id: "main",
            season_id: "ai-risk-scenario-season",
            locale: "fa",
            status: "approved",
            generated_by: "mentor_ai",
            model_name: "mentor-draft-simulator",
            policy_version: ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION,
            source_count: 2,
            question_count: 6,
            advanced_objective_count: 3,
            review_summary: {},
            generated_at: "2026-08-11T00:00:00.000Z",
            updated_at: "2026-08-11T00:00:00.000Z",
          }],
        };
      },
    };

    const saved = await submitAcademyMasteryGenerationDraft(
      client as never,
      {
        scope: { tenantId: "tecpey", workspaceId: "main" },
        locale: "fa",
        draft: validGeneratedDraft(),
      },
    );

    assert.equal(saved.draft.status, "approved");
    assert.equal(saved.review.publishCapability, "mentor_governed_automation");
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /academy_mastery_season_generation_drafts/);
    assert.equal(queries[0].values[0], "tecpey");
    assert.equal(queries[0].values[1], "main");
    assert.equal(queries[0].values[4], "approved");
    assert.deepEqual(
      JSON.parse(String(queries[0].values[12])),
      {
        policyVersion: ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION,
        status: "approved",
        publishCapability: "mentor_governed_automation",
        sourceCount: 2,
        questionCount: 6,
        advancedObjectiveCount: 3,
        violations: [],
      },
    );
  });

  it("allows only explicit review status transitions", () => {
    assert.equal(parseAcademyMasteryReviewDecision("approve_for_catalog"), "approve_for_catalog");
    assert.equal(parseAcademyMasteryReviewDecision("unknown"), null);
    assert.equal(
      nextAcademyMasteryDraftStatus({
        currentStatus: "review_ready",
        decision: "approve_for_catalog",
      }),
      "approved",
    );
    assert.equal(
      nextAcademyMasteryDraftStatus({
        currentStatus: "approved",
        decision: "publish",
      }),
      "published",
    );
    assert.throws(
      () => assertAcademyMasteryReviewDecisionAllowed({
        currentStatus: "review_ready",
        decision: "publish",
      }),
      /draft_not_approved_for_publish/,
    );
    assert.throws(
      () => assertAcademyMasteryReviewDecisionAllowed({
        currentStatus: "draft",
        decision: "publish",
      }),
      /draft_not_approved_for_publish/,
    );
    assert.throws(
      () => assertAcademyMasteryReviewDecisionAllowed({
        currentStatus: "draft",
        decision: "approve_for_catalog",
      }),
      /draft_not_review_ready/,
    );
  });

  it("blocks Mentor publication when governance evidence is too weak", async () => {
    const client = {
      async query(sql: string) {
        if (/SELECT id::text, tenant_id, workspace_id/.test(sql)) {
          return {
            rows: [{
              id: "00000000-0000-4000-8000-000000000010",
              tenant_id: "tecpey",
              workspace_id: "main",
              locale: "fa",
              season_id: "ai-risk-scenario-season",
              status: "approved",
              generated_by: "mentor_ai",
              model_name: "mentor-draft-simulator",
              policy_version: ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION,
              source_count: 2,
              question_count: 6,
              advanced_objective_count: 3,
              review_summary: {},
              draft_payload: validGeneratedDraft(),
              generated_at: "2026-08-11T00:00:00.000Z",
              updated_at: "2026-08-11T00:00:00.000Z",
            }],
          };
        }
        return { rows: [] };
      },
    };

    await assert.rejects(
      () => decideAcademyMasteryGenerationDraft(
        client as never,
        {
          scope: { tenantId: "tecpey", workspaceId: "main" },
          draftId: "00000000-0000-4000-8000-000000000010",
          decision: "publish",
          reviewerId: "mentor-governor",
          reviewerType: "mentor_ai",
          decisionNotes: "Mentor governance evidence is intentionally missing for this publication attempt.",
        },
      ),
      /mentor_policy_score_too_low/,
    );
  });

  it("records Mentor AI governance and publishes approved drafts to the catalog", async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      async query(sql: string, values: unknown[] = []) {
        queries.push({ sql, values });
        if (/SELECT id::text, tenant_id, workspace_id/.test(sql)) {
          return {
            rows: [{
              id: "00000000-0000-4000-8000-000000000010",
              tenant_id: "tecpey",
              workspace_id: "main",
              locale: "fa",
              season_id: "ai-risk-scenario-season",
              status: "approved",
              generated_by: "mentor_ai",
              model_name: "mentor-draft-simulator",
              policy_version: ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION,
              source_count: 2,
              question_count: 6,
              advanced_objective_count: 3,
              review_summary: {},
              draft_payload: validGeneratedDraft(),
              generated_at: "2026-08-11T00:00:00.000Z",
              updated_at: "2026-08-11T00:00:00.000Z",
            }],
          };
        }
        if (/INSERT INTO academy_mastery_season_generation_reviews/.test(sql)) {
          return { rows: [{ id: "42" }] };
        }
        if (/INSERT INTO academy_mastery_season_catalog/.test(sql)) {
          return { rows: [{ catalog_version: 3 }] };
        }
        if (/UPDATE academy_mastery_season_generation_drafts/.test(sql)) {
          return {
            rows: [{
              id: "00000000-0000-4000-8000-000000000010",
              tenant_id: "tecpey",
              workspace_id: "main",
              locale: "fa",
              season_id: "ai-risk-scenario-season",
              status: "published",
              generated_by: "mentor_ai",
              model_name: "mentor-draft-simulator",
              policy_version: ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION,
              source_count: 2,
              question_count: 6,
              advanced_objective_count: 3,
              review_summary: {},
              generated_at: "2026-08-11T00:00:00.000Z",
              updated_at: "2026-08-11T00:00:00.000Z",
            }],
          };
        }
        return { rows: [] };
      },
    };

    const result = await decideAcademyMasteryGenerationDraft(
      client as never,
      {
        scope: { tenantId: "tecpey", workspaceId: "main" },
        draftId: "00000000-0000-4000-8000-000000000010",
        decision: "publish",
        reviewerType: "mentor_ai",
        reviewerId: "mentor-governor",
        decisionNotes: "Mentor AI checked source freshness, learner weaknesses, Arena risk flags and safety controls.",
        mentorGovernance: {
          policyScore: 96,
          personalizationCoverage: 88,
          trustedNewsSourceCount: 2,
          academyWeaknessSignalCount: 3,
          arenaRiskSignalCount: 2,
          forbiddenSignalCount: 0,
          maxSourceAgeMinutes: 180,
          sampledForHumanQa: true,
        },
      },
    );

    assert.equal(result.nextStatus, "published");
    assert.equal(result.reviewId, "42");
    assert.equal(result.catalogVersion, 3);
    assert.ok(queries.some(({ sql }) => /academy_mastery_season_generation_reviews/.test(sql)));
    assert.ok(queries.some(({ sql }) => /academy_mastery_season_catalog/.test(sql)));
    assert.ok(queries.some(({ values }) => values.includes("mentor_governed_generated_v1")));
    assert.ok(queries.some(({ sql }) => /reviewer_type, reviewer_id/.test(sql)));
    assert.ok(queries.some(({ sql }) => /review_summary = review_summary \|\|/.test(sql)));
    assert.deepEqual(queries[1].values.slice(3, 7), [
      "publish",
      "mentor_ai",
      "mentor-governor",
      ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION,
    ]);
    assert.equal(
      JSON.parse(String(queries[1].values[8])).mentorGovernance.policyScore,
      96,
    );
    const update = queries.find(({ sql }) => /UPDATE academy_mastery_season_generation_drafts/.test(sql));
    assert.equal(update?.values[3], "published");
  });

});
