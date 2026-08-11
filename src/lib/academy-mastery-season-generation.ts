import type { QuizQuestion } from "@/data/academy/term1Curriculum";
import {
  forbiddenMasteryRankingInputs,
  type AcademyMasterySeasonKind,
} from "@/data/academyMasterySeasons";
import { containsProhibitedClaim } from "@/lib/academy-news-quiz-generator";
import { findInvalidQuizQuestions } from "@/lib/academy-quiz-authority";

export const ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION = "2026-08-11.1";

export type AcademyMasterySeasonSourceTrust =
  | "official"
  | "research"
  | "educational"
  | "market-data";

export type AcademyMasterySeasonDraftSource = {
  title: string;
  publisher: string;
  url: string;
  trust: AcademyMasterySeasonSourceTrust;
};

export type AcademyMasterySeasonBloomLevel =
  | "understand"
  | "apply"
  | "analyze"
  | "evaluate";

export type AcademyMasterySeasonObjective = {
  conceptTag: string;
  titleFa: string;
  titleEn: string;
  bloomLevel: AcademyMasterySeasonBloomLevel;
};

export type AcademyGeneratedMasteryMission = {
  id: string;
  titleFa: string;
  titleEn: string;
  methodFa: string;
  methodEn: string;
  estimatedMinutes: number;
  questions: QuizQuestion[];
};

export type AcademyGeneratedMasterySeasonDraft = {
  id: string;
  kind: Exclude<AcademyMasterySeasonKind, "cohort-league">;
  titleFa: string;
  titleEn: string;
  summaryFa: string;
  summaryEn: string;
  recommendedAfterTerm: number;
  signalTags: string[];
  sources: AcademyMasterySeasonDraftSource[];
  objectives: AcademyMasterySeasonObjective[];
  missions: AcademyGeneratedMasteryMission[];
  riskControls: string[];
  generatedBy: "mentor_ai" | "system" | "human";
  modelName?: string;
};

export type AcademyMasterySeasonDraftViolation = {
  code: string;
  detail: string;
};

export type AcademyMasterySeasonDraftReview = {
  policyVersion: typeof ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION;
  status: "review_ready" | "rejected";
  publishCapability: "manual_review_required";
  sourceCount: number;
  questionCount: number;
  advancedObjectiveCount: number;
  violations: AcademyMasterySeasonDraftViolation[];
};

export type AcademyMasterySeasonGenerationContext = {
  locale: "fa" | "en";
  completedTerms: number;
  weakConceptTags: string[];
  arenaRiskFlags: string[];
  mentorTopicTags: string[];
  marketInterestTags: string[];
};

const ALLOWED_KIND = new Set<AcademyGeneratedMasterySeasonDraft["kind"]>([
  "repair",
  "market-update",
  "arena-discipline",
]);
const ALLOWED_TRUST = new Set<AcademyMasterySeasonSourceTrust>([
  "official",
  "research",
  "educational",
  "market-data",
]);
const ALLOWED_BLOOM = new Set<AcademyMasterySeasonBloomLevel>([
  "understand",
  "apply",
  "analyze",
  "evaluate",
]);

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,80}$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const DIRECT_SIGNAL_PATTERN =
  /\b(?:buy|sell|long|short)\s+(?:now|immediately|today|this coin|this token)\b|(?:همین\s*الان|فوراً|فورا).{0,24}(?:بخر|بخرید|بفروش|بفروشید)|سیگنال\s+(?:خرید|فروش)/i;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function add(violations: AcademyMasterySeasonDraftViolation[], code: string, detail: string): void {
  violations.push({ code, detail });
}

function boundedTags(values: readonly string[]): string[] {
  const forbidden = new Set<string>(forbiddenMasteryRankingInputs);
  return [...new Set(values.map((value) => text(value).toLowerCase()).filter((value) => TAG_PATTERN.test(value)))]
    .filter((value) => !forbidden.has(value))
    .slice(0, 12);
}

function arrayOfUnknown(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function buildAcademyMasterySeasonMentorDraftInstructions(
  context: AcademyMasterySeasonGenerationContext,
): string {
  const completedTerms = Math.max(0, Math.min(7, Math.floor(Number(context.completedTerms) || 0)));
  const safeContext = {
    locale: context.locale === "en" ? "en" : "fa",
    completedTerms,
    weakConceptTags: boundedTags(context.weakConceptTags),
    arenaRiskFlags: boundedTags(context.arenaRiskFlags),
    mentorTopicTags: boundedTags(context.mentorTopicTags),
    marketInterestTags: boundedTags(context.marketInterestTags),
  };

  return [
    "You are drafting an untrusted TecPey Academy Mastery Season candidate.",
    "Return JSON only. Do not include markdown, prose wrappers, or hidden comments.",
    `Policy version: ${ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION}.`,
    "The draft is not allowed to publish itself. Set publishCapability to manual_review_required.",
    "Allowed kind values: repair, market-update, arena-discipline. Do not draft cohort leagues.",
    "The draft must include at least two trusted HTTPS sources, three measurable objectives, three missions, and six total validated quiz questions.",
    "Every quiz question must be answerable: correctAnswer must exactly match one option for single/scenario questions.",
    "Never include profit promises, price targets, buy/sell/long/short signals, leverage culture, real_exchange_pnl, real_trade_volume, deposited_amount, leverage_used, paid_plan_status, or speed_without_accuracy.",
    "Teach source review, risk controls, reflection, retrieval practice, and decision quality.",
    `Learner signal summary: ${JSON.stringify(safeContext)}.`,
  ].join("\n");
}

function allDraftText(draft: AcademyGeneratedMasterySeasonDraft): string {
  const sources = arrayOfUnknown(draft.sources).map(record);
  const objectives = arrayOfUnknown(draft.objectives).map(record);
  const missions = arrayOfUnknown(draft.missions).map(record);
  return [
    draft.id,
    draft.kind,
    draft.titleFa,
    draft.titleEn,
    draft.summaryFa,
    draft.summaryEn,
    ...arrayOfUnknown(draft.signalTags),
    ...arrayOfUnknown(draft.riskControls),
    ...sources.flatMap((source) => [source.title, source.publisher, source.url, source.trust]),
    ...objectives.flatMap((objective) => [
      objective.conceptTag,
      objective.titleFa,
      objective.titleEn,
      objective.bloomLevel,
    ]),
    ...missions.flatMap((mission) => [
      mission.id,
      mission.titleFa,
      mission.titleEn,
      mission.methodFa,
      mission.methodEn,
      ...arrayOfUnknown(mission.questions).map(record).flatMap((question) => [
        question.id,
        question.type,
        question.question,
        question.explanation,
        question.conceptTag,
        ...arrayOfUnknown(question.options),
        ...(Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer]),
      ]),
    ]),
  ].map((value) => text(value)).join("\n");
}

function validateSources(
  draft: AcademyGeneratedMasterySeasonDraft,
  violations: AcademyMasterySeasonDraftViolation[],
): number {
  if (!Array.isArray(draft.sources) || draft.sources.length < 2) {
    add(violations, "sources_insufficient", "generated seasons need at least two independent sources");
    return 0;
  }
  const urls = new Set<string>();
  for (const [index, sourceValue] of draft.sources.entries()) {
    const source = record(sourceValue);
    const sourceUrl = text(source.url);
    const sourceTrust = text(source.trust) as AcademyMasterySeasonSourceTrust;
    if (!text(source.title)) add(violations, "source_title_blank", `source ${index + 1} title is blank`);
    if (!text(source.publisher)) add(violations, "source_publisher_blank", `source ${index + 1} publisher is blank`);
    if (!isHttpsUrl(sourceUrl)) add(violations, "source_url_invalid", `source ${index + 1} must be an https URL`);
    if (!ALLOWED_TRUST.has(sourceTrust)) {
      add(violations, "source_trust_invalid", `source ${index + 1} has unsupported trust level`);
    }
    if (urls.has(sourceUrl)) add(violations, "source_url_duplicate", `source ${index + 1} duplicates a prior URL`);
    urls.add(sourceUrl);
  }
  return urls.size;
}

function validateObjectives(
  draft: AcademyGeneratedMasterySeasonDraft,
  violations: AcademyMasterySeasonDraftViolation[],
): number {
  if (!Array.isArray(draft.objectives) || draft.objectives.length < 3) {
    add(violations, "objectives_insufficient", "generated seasons need at least three measurable objectives");
    return 0;
  }
  let advanced = 0;
  for (const [index, objectiveValue] of draft.objectives.entries()) {
    const objective = record(objectiveValue);
    if (!TAG_PATTERN.test(text(objective.conceptTag))) {
      add(violations, "objective_concept_invalid", `objective ${index + 1} concept tag is invalid`);
    }
    if (text(objective.titleFa).length < 8) {
      add(violations, "objective_title_fa_weak", `objective ${index + 1} needs a Persian title`);
    }
    if (text(objective.titleEn).length < 8) {
      add(violations, "objective_title_en_weak", `objective ${index + 1} needs an English title`);
    }
    const bloomLevel = text(objective.bloomLevel) as AcademyMasterySeasonBloomLevel;
    if (!ALLOWED_BLOOM.has(bloomLevel)) {
      add(violations, "objective_bloom_invalid", `objective ${index + 1} has an unsupported Bloom level`);
    }
    if (["apply", "analyze", "evaluate"].includes(bloomLevel)) advanced += 1;
  }
  if (advanced < 2) {
    add(violations, "objectives_not_challenging", "generated seasons need at least two apply/analyze/evaluate objectives");
  }
  return advanced;
}

function validateMissions(
  draft: AcademyGeneratedMasterySeasonDraft,
  violations: AcademyMasterySeasonDraftViolation[],
): number {
  if (!Array.isArray(draft.missions) || draft.missions.length < 3) {
    add(violations, "missions_insufficient", "generated seasons need at least three missions");
    return 0;
  }
  const questions: QuizQuestion[] = [];
  for (const [index, missionValue] of draft.missions.entries()) {
    const mission = record(missionValue);
    if (!ID_PATTERN.test(text(mission.id))) add(violations, "mission_id_invalid", `mission ${index + 1} id is invalid`);
    if (text(mission.titleFa).length < 8) add(violations, "mission_title_fa_weak", `mission ${index + 1} needs a Persian title`);
    if (text(mission.titleEn).length < 8) add(violations, "mission_title_en_weak", `mission ${index + 1} needs an English title`);
    if (text(mission.methodFa).length < 20) add(violations, "mission_method_fa_weak", `mission ${index + 1} needs a Persian method`);
    if (text(mission.methodEn).length < 20) add(violations, "mission_method_en_weak", `mission ${index + 1} needs an English method`);
    const estimatedMinutes = Number(mission.estimatedMinutes);
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 90) {
      add(violations, "mission_duration_invalid", `mission ${index + 1} duration must be 5-90 minutes`);
    }
    if (!Array.isArray(mission.questions) || mission.questions.length < 2) {
      add(violations, "mission_questions_insufficient", `mission ${index + 1} needs at least two validated questions`);
    } else {
      questions.push(...mission.questions);
    }
  }
  for (const report of findInvalidQuizQuestions(questions)) {
    add(
      violations,
      "quiz_question_invalid",
      `${report.id || "<no-id>"}:${report.violations.map((violation) => violation.code).join(",")}`,
    );
  }
  if (questions.length < 6) {
    add(violations, "question_bank_insufficient", "generated seasons need at least six validated questions");
  }
  if (!questions.some((question) => question.difficulty === "hard")) {
    add(violations, "question_bank_not_challenging", "generated seasons need at least one hard challenge question");
  }
  return questions.length;
}

export function reviewGeneratedAcademyMasterySeasonDraft(
  draft: AcademyGeneratedMasterySeasonDraft,
): AcademyMasterySeasonDraftReview {
  const violations: AcademyMasterySeasonDraftViolation[] = [];

  if (!ID_PATTERN.test(text(draft.id))) add(violations, "season_id_invalid", "season id is invalid");
  if (!ALLOWED_KIND.has(draft.kind)) {
    add(violations, "season_kind_invalid", "AI generation may only draft repair, market-update or arena-discipline seasons");
  }
  if (text(draft.titleFa).length < 8) add(violations, "title_fa_weak", "Persian title is too weak");
  if (text(draft.titleEn).length < 8) add(violations, "title_en_weak", "English title is too weak");
  if (text(draft.summaryFa).length < 40) add(violations, "summary_fa_weak", "Persian summary is too weak");
  if (text(draft.summaryEn).length < 40) add(violations, "summary_en_weak", "English summary is too weak");
  if (!Number.isInteger(draft.recommendedAfterTerm) || draft.recommendedAfterTerm < 1 || draft.recommendedAfterTerm > 7) {
    add(violations, "recommended_after_term_invalid", "recommendedAfterTerm must be 1-7");
  }
  if (!Array.isArray(draft.signalTags) || draft.signalTags.length < 2) {
    add(violations, "signal_tags_insufficient", "generated seasons need at least two signal tags");
  } else {
    for (const tag of draft.signalTags) {
      if (!TAG_PATTERN.test(text(tag))) add(violations, "signal_tag_invalid", `invalid signal tag ${String(tag)}`);
    }
  }
  if (!Array.isArray(draft.riskControls) || draft.riskControls.length < 2) {
    add(violations, "risk_controls_insufficient", "generated seasons need explicit risk and safety controls");
  }
  if (!["mentor_ai", "system", "human"].includes(draft.generatedBy)) {
    add(violations, "generated_by_invalid", "generatedBy must identify mentor_ai, system or human");
  }

  const combined = allDraftText(draft);
  if (containsProhibitedClaim(combined)) {
    add(violations, "prohibited_claim", "draft contains profit-promise or price-prediction language");
  }
  if (DIRECT_SIGNAL_PATTERN.test(combined)) {
    add(violations, "trade_signal_language", "draft contains direct buy/sell/long/short signal language");
  }
  for (const input of forbiddenMasteryRankingInputs) {
    if (combined.toLowerCase().includes(input)) {
      add(violations, "forbidden_ranking_input", `draft references forbidden ranking input ${input}`);
    }
  }

  const sourceCount = validateSources(draft, violations);
  const advancedObjectiveCount = validateObjectives(draft, violations);
  const questionCount = validateMissions(draft, violations);

  return {
    policyVersion: ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION,
    status: violations.length === 0 ? "review_ready" : "rejected",
    publishCapability: "manual_review_required",
    sourceCount,
    questionCount,
    advancedObjectiveCount,
    violations,
  };
}
