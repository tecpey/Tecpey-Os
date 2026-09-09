import type { AiModelProviderId } from "./control-plane-catalog";
import {
  aiIntelligenceTaskDefinition,
  type AiIntelligenceTaskId,
} from "./intelligence-task-catalog";

export const AI_INTELLIGENCE_ENDPOINT_IDS = [
  "openai_responses",
  "anthropic_messages",
  "xai_responses",
  "perplexity_agent",
  "openrouter_chat_completions",
] as const;

export type AiIntelligenceEndpointId =
  (typeof AI_INTELLIGENCE_ENDPOINT_IDS)[number];

export type AiEndpointCombinationSupport =
  | "supported"
  | "unsupported"
  | "unverified";

export type AiEndpointCacheTelemetry =
  | "none"
  | "cached_tokens"
  | "cache_read_creation";

export type AiEndpointCostTelemetry =
  | "none"
  | "usd_total"
  | "usd_breakdown"
  | "usd_ticks";

export type AiIntelligenceEndpointProfile = Readonly<{
  id: AiIntelligenceEndpointId;
  providerId: AiModelProviderId;
  endpointPath: string;
  structuredOutput: boolean;
  webSearch: boolean;
  citations: boolean;
  structuredOutputWithWebSearch: AiEndpointCombinationSupport;
  cacheTelemetry: AiEndpointCacheTelemetry;
  costTelemetry: AiEndpointCostTelemetry;
}>;

export const AI_INTELLIGENCE_ENDPOINT_PROFILES = Object.freeze([
  {
    id: "openai_responses",
    providerId: "openai",
    endpointPath: "/v1/responses",
    structuredOutput: true,
    webSearch: true,
    citations: true,
    structuredOutputWithWebSearch: "supported",
    cacheTelemetry: "cached_tokens",
    costTelemetry: "none",
  },
  {
    id: "anthropic_messages",
    providerId: "anthropic",
    endpointPath: "/v1/messages",
    structuredOutput: true,
    webSearch: true,
    citations: true,
    // Structured output, server-side search and citations are each supported,
    // but TecPey does not admit the combined route until the exact endpoint /
    // model combination has provider evidence and a TecPey eval artifact.
    structuredOutputWithWebSearch: "unverified",
    cacheTelemetry: "cache_read_creation",
    costTelemetry: "none",
  },
  {
    id: "xai_responses",
    providerId: "xai",
    endpointPath: "/v1/responses",
    structuredOutput: true,
    webSearch: true,
    citations: true,
    structuredOutputWithWebSearch: "supported",
    cacheTelemetry: "cached_tokens",
    costTelemetry: "usd_ticks",
  },
  {
    id: "perplexity_agent",
    providerId: "perplexity",
    endpointPath: "/v1/agent",
    structuredOutput: true,
    webSearch: true,
    citations: true,
    structuredOutputWithWebSearch: "supported",
    cacheTelemetry: "cache_read_creation",
    costTelemetry: "usd_breakdown",
  },
  {
    id: "openrouter_chat_completions",
    providerId: "openrouter",
    endpointPath: "/api/v1/chat/completions",
    // Current TecPey adapter intentionally does not expose a governed strict
    // structured-output mapping for OpenRouter. Do not infer support from an
    // upstream model or silently degrade to prompt-only JSON.
    structuredOutput: false,
    webSearch: true,
    citations: false,
    structuredOutputWithWebSearch: "unsupported",
    cacheTelemetry: "none",
    costTelemetry: "usd_total",
  },
] as const satisfies readonly AiIntelligenceEndpointProfile[]);

const ENDPOINTS_BY_ID = new Map<AiIntelligenceEndpointId, AiIntelligenceEndpointProfile>(
  AI_INTELLIGENCE_ENDPOINT_PROFILES.map((profile) => [profile.id, profile]),
);

export const AI_INTELLIGENCE_ENDPOINT_REJECTION_CODES = [
  "endpoint_structured_output_missing",
  "endpoint_web_search_missing",
  "endpoint_citations_missing",
  "endpoint_combination_unsupported",
  "endpoint_combination_unverified",
] as const;

export type AiIntelligenceEndpointRejectionCode =
  (typeof AI_INTELLIGENCE_ENDPOINT_REJECTION_CODES)[number];

export type AiIntelligenceEndpointEligibility =
  | Readonly<{
      status: "eligible";
      reasons: readonly [];
      endpoint: AiIntelligenceEndpointProfile;
    }>
  | Readonly<{
      status: "rejected";
      reasons: readonly AiIntelligenceEndpointRejectionCode[];
      endpoint: AiIntelligenceEndpointProfile;
    }>;

export function aiIntelligenceEndpointProfile(
  endpointId: AiIntelligenceEndpointId,
): AiIntelligenceEndpointProfile {
  const profile = ENDPOINTS_BY_ID.get(endpointId);
  if (!profile) throw new Error(`ai_intelligence_endpoint_unknown:${endpointId}`);
  return profile;
}

export function evaluateAiIntelligenceEndpointEligibility(input: {
  taskId: AiIntelligenceTaskId;
  endpointId: AiIntelligenceEndpointId;
}): AiIntelligenceEndpointEligibility {
  const task = aiIntelligenceTaskDefinition(input.taskId);
  const endpoint = aiIntelligenceEndpointProfile(input.endpointId);
  const reasons: AiIntelligenceEndpointRejectionCode[] = [];
  const needsStructuredOutput = task.output.mode === "json_schema" ||
    task.requiredCapabilities.includes("structured_output");
  const needsWebSearch = task.requiredTools.includes("web_search") ||
    task.requiredCapabilities.includes("web_search");
  const needsCitations = task.evidencePolicy === "provider_citations" ||
    task.requiredCapabilities.includes("citations");

  if (needsStructuredOutput && !endpoint.structuredOutput) {
    reasons.push("endpoint_structured_output_missing");
  }
  if (needsWebSearch && !endpoint.webSearch) {
    reasons.push("endpoint_web_search_missing");
  }
  if (needsCitations && !endpoint.citations) {
    reasons.push("endpoint_citations_missing");
  }
  if (needsStructuredOutput && needsWebSearch) {
    if (endpoint.structuredOutputWithWebSearch === "unsupported") {
      reasons.push("endpoint_combination_unsupported");
    } else if (endpoint.structuredOutputWithWebSearch === "unverified") {
      reasons.push("endpoint_combination_unverified");
    }
  }

  const uniqueReasons = [...new Set(reasons)].sort() as AiIntelligenceEndpointRejectionCode[];
  if (uniqueReasons.length > 0) {
    return { status: "rejected", reasons: uniqueReasons, endpoint };
  }
  return { status: "eligible", reasons: [], endpoint };
}

export function validateAiIntelligenceEndpointProfiles(
  profiles: readonly AiIntelligenceEndpointProfile[] = AI_INTELLIGENCE_ENDPOINT_PROFILES,
): void {
  if (profiles.length !== AI_INTELLIGENCE_ENDPOINT_IDS.length) {
    throw new Error("ai_intelligence_endpoint_registry_incomplete");
  }
  const ids = new Set<string>();
  for (const profile of profiles) {
    if (ids.has(profile.id)) throw new Error(`ai_intelligence_endpoint_duplicate:${profile.id}`);
    ids.add(profile.id);
    if (!profile.endpointPath.startsWith("/")) {
      throw new Error(`ai_intelligence_endpoint_path_invalid:${profile.id}`);
    }
    if (
      profile.structuredOutputWithWebSearch === "supported" &&
      (!profile.structuredOutput || !profile.webSearch)
    ) {
      throw new Error(`ai_intelligence_endpoint_combination_invalid:${profile.id}`);
    }
  }
  for (const id of AI_INTELLIGENCE_ENDPOINT_IDS) {
    if (!ids.has(id)) throw new Error(`ai_intelligence_endpoint_missing:${id}`);
  }
}

validateAiIntelligenceEndpointProfiles();
