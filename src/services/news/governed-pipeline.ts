import {
  buildNewsAutomationBatch,
  type NewsAutomationDecision,
  type RawNewsInput,
} from "../../lib/news-automation";
import {
  materializeNewsAutomationDecisions,
  type MaterializedNewsSnapshot,
  type MaterializeNewsAutomationOptions,
} from "../../lib/news-materialization";
import {
  approvedNewsAutomationSources,
  resolveNewsSourceAuthority,
  type NewsSourceAuthorityDecision,
} from "./source-authority";
import { resolveNewsEntities } from "./entity-resolution";
import type {
  NewsEntityReference,
  NewsIntelligenceGateReason,
  NewsIntelligenceGraphEdge,
  TecPeyCLevelAIReview,
} from "../../lib/news-intelligence-graph";

export const TECPEY_GOVERNED_NEWS_PIPELINE_VERSION = "tecpey-governed-news-pipeline-v1";

export type GovernedNewsAutomationDecision = NewsAutomationDecision & {
  sourceAuthority: NewsSourceAuthorityDecision;
};

function sourceAuthorityFor(decision: NewsAutomationDecision): NewsSourceAuthorityDecision {
  return resolveNewsSourceAuthority(decision.article.sourceUrl || decision.article.canonicalUrl);
}

function governedAutomationStatus(
  decision: NewsAutomationDecision,
  authority: NewsSourceAuthorityDecision,
): NewsAutomationDecision["status"] {
  if (authority.publicationDisposition === "blocked") return "rejected";
  if (authority.publicationDisposition === "human_review") return "needs_review";
  return decision.status;
}

export function buildGovernedNewsAutomationBatch(inputs: RawNewsInput[]): GovernedNewsAutomationDecision[] {
  const decisions = buildNewsAutomationBatch(inputs, approvedNewsAutomationSources());
  return decisions.map((decision) => {
    const sourceAuthority = sourceAuthorityFor(decision);
    return {
      ...decision,
      status: governedAutomationStatus(decision, sourceAuthority),
      sourceAuthority,
    };
  });
}

const HARD_INTELLIGENCE_REASONS = new Set<NewsIntelligenceGateReason>([
  "source_not_authorized",
  "source_too_weak",
  "canonical_url_not_https",
  "source_url_not_https",
  "invalid_publication_time",
  "persian_summary_missing",
  "thumbnail_rights_blocked",
  "duplicate_news",
  "financial_advice_or_signal",
  "hype_or_profit_promise",
]);

function uniqueEntities(entities: NewsEntityReference[]): NewsEntityReference[] {
  const byKey = new Map<string, NewsEntityReference>();
  for (const entity of entities) {
    const key = `${entity.type}:${entity.id.trim().toLowerCase()}`;
    const previous = byKey.get(key);
    if (!previous || entity.confidence > previous.confidence) byKey.set(key, entity);
  }
  return [...byKey.values()].sort(
    (left, right) => left.type.localeCompare(right.type) || left.id.localeCompare(right.id),
  );
}

function entityEdge(entity: NewsEntityReference, dossierId: string): NewsIntelligenceGraphEdge {
  const typeByEntity: Record<NewsEntityReference["type"], NewsIntelligenceGraphEdge["type"]> = {
    coin: "mentions_coin",
    tool: "mentions_tool",
    project: "mentions_project",
    network: "mentions_network",
    exchange: "mentions_exchange",
    regulator: "mentions_regulator",
  };
  return {
    fromId: dossierId,
    toId: `${entity.type}:${entity.id.trim().toUpperCase()}`,
    type: typeByEntity[entity.type],
    confidence: Math.max(0, Math.min(1, entity.confidence)),
  };
}

function enrichReviews(
  reviews: TecPeyCLevelAIReview[],
  entities: NewsEntityReference[],
  authority: NewsSourceAuthorityDecision,
): TecPeyCLevelAIReview[] {
  return reviews.map((review) => {
    if (review.role === "chief_market_intelligence_ai") {
      return {
        ...review,
        signedOff: entities.length > 0,
        score: entities.length > 0 ? Math.max(review.score, 0.78) : review.score,
        notes: [...review.notes.filter((note) => !note.startsWith("entities:")), `entities:${entities.length}`],
      };
    }
    if (review.role === "chief_data_officer_ai") {
      const signedOff = authority.publicationDisposition === "auto_publish_eligible";
      return {
        ...review,
        signedOff,
        notes: [
          ...review.notes.filter((note) => !note.startsWith("provider:")),
          `provider:${authority.providerReadiness.status}`,
          `source-authority:${authority.publicationDisposition}`,
        ],
      };
    }
    return review;
  });
}

function governedIntelligenceStatus(
  authority: NewsSourceAuthorityDecision,
  reasons: NewsIntelligenceGateReason[],
  reviews: TecPeyCLevelAIReview[],
): "publishable" | "human_review" | "rejected" {
  if (authority.publicationDisposition === "blocked") return "rejected";
  if (reasons.some((reason) => HARD_INTELLIGENCE_REASONS.has(reason))) return "rejected";
  if (authority.publicationDisposition === "human_review") return "human_review";
  if (reasons.length > 0) return "human_review";
  return reviews.every((review) => review.signedOff) ? "publishable" : "human_review";
}

export function materializeGovernedNewsAutomationDecisions(
  decisions: GovernedNewsAutomationDecision[],
  options: MaterializeNewsAutomationOptions = {},
): MaterializedNewsSnapshot {
  const snapshot = materializeNewsAutomationDecisions(decisions, options);
  const byId = new Map(decisions.map((decision) => [decision.article.id, decision]));

  const materializedDecisions = snapshot.decisions.map((materialized) => {
    const sourceDecision = byId.get(materialized.id);
    if (!sourceDecision) return materialized;

    const authority = sourceDecision.sourceAuthority;
    const text = `${sourceDecision.article.title} ${sourceDecision.article.summary}`;
    const entities = uniqueEntities(resolveNewsEntities(text, materialized.intelligence.entities));
    let reasons = [...materialized.intelligence.reasons];

    if (authority.registryKnown) reasons = reasons.filter((reason) => reason !== "source_not_authorized");
    if (entities.length > 0) reasons = reasons.filter((reason) => reason !== "missing_entities");
    if (authority.publicationDisposition === "auto_publish_eligible") {
      reasons = reasons.filter((reason) => reason !== "provider_not_enterprise_ready");
    }

    reasons = [...new Set(reasons)];
    const existingEdgeKeys = new Set(
      materialized.intelligence.graphEdges.map((edge) => `${edge.type}:${edge.toId}`),
    );
    const extraEdges = entities
      .map((entity) => entityEdge(entity, materialized.intelligence.dossierId))
      .filter((edge) => !existingEdgeKeys.has(`${edge.type}:${edge.toId}`));
    const reviews = enrichReviews(materialized.intelligence.reviews, entities, authority);
    const intelligenceStatus = governedIntelligenceStatus(authority, reasons, reviews);

    return {
      ...materialized,
      status: sourceDecision.status,
      intelligence: {
        ...materialized.intelligence,
        status: intelligenceStatus,
        reasons,
        entities,
        graphEdges: [...materialized.intelligence.graphEdges, ...extraEdges],
        reviews,
      },
    };
  });

  return {
    ...snapshot,
    publishable: decisions.filter((decision) => decision.status === "publishable").length,
    needsReview: decisions.filter((decision) => decision.status === "needs_review").length,
    rejected: decisions.filter((decision) => decision.status === "rejected").length,
    decisions: materializedDecisions,
  };
}

export function buildGovernedNewsSnapshot(
  inputs: RawNewsInput[],
  options: MaterializeNewsAutomationOptions = {},
): MaterializedNewsSnapshot {
  const decisions = buildGovernedNewsAutomationBatch(inputs);
  return materializeGovernedNewsAutomationDecisions(decisions, options);
}
