import { NEWS_SOURCE_REGISTRY, isApprovedNewsSourceHost } from "./news-source-registry";

export type NewsEvidenceChannel = "factual_publisher" | "social_x" | "other";

export type NewsEvidenceRecord = {
  id: string;
  channel: NewsEvidenceChannel;
  url: string;
  publisher: string | null;
  author: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  threadId: string | null;
};

export type FactualCorroborationDecision = {
  eligible: boolean;
  reason:
    | "factual_publisher"
    | "social_is_narrative_only"
    | "unknown_channel";
};

export function classifyNewsEvidenceChannel(input: {
  channel?: string | null;
  url: string;
}): NewsEvidenceChannel {
  if (input.channel === "social_x") return "social_x";
  if (input.channel === "public_web" || input.channel === "factual_publisher") return "factual_publisher";
  try {
    const host = new URL(input.url).hostname.toLowerCase();
    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) {
      return "social_x";
    }
    return NEWS_SOURCE_REGISTRY.some((source) => isApprovedNewsSourceHost(host, source))
      ? "factual_publisher"
      : "other";
  } catch {
    return "other";
  }
}

export function factualCorroborationDecision(channel: NewsEvidenceChannel): FactualCorroborationDecision {
  if (channel === "factual_publisher") return { eligible: true, reason: "factual_publisher" };
  if (channel === "social_x") return { eligible: false, reason: "social_is_narrative_only" };
  return { eligible: false, reason: "unknown_channel" };
}

export function independentFactualSourceCount(records: readonly NewsEvidenceRecord[]): number {
  return new Set(
    records
      .filter((record) => factualCorroborationDecision(record.channel).eligible)
      .map((record) => record.publisher || new URL(record.url).hostname.toLowerCase()),
  ).size;
}
