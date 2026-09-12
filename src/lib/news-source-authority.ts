import {
  NEWS_SOURCE_REGISTRY,
  type NewsSourceRegistryEntry,
  type NewsSourceTrustTier,
} from "./news-source-registry";
import {
  providerReadinessSummaryForDomain,
  type NewsProviderReadinessDecision,
} from "./news-provider-readiness";

export const TECPEY_NEWS_SOURCE_AUTHORITY_VERSION = "tecpey-news-source-authority-v1";

export type GovernedNewsSourceIdentity = {
  authorityVersion: typeof TECPEY_NEWS_SOURCE_AUTHORITY_VERSION;
  id: string;
  name: string;
  domain: string;
  registryKnown: true;
  category: NewsSourceRegistryEntry["category"];
  trustTier: NewsSourceTrustTier;
  firstParty: boolean;
  allowFullArticleFetch: boolean;
  corroborationWeight: number;
  continuityMode: "required" | "quarantined";
  providerReadiness: NewsProviderReadinessDecision;
  publicationDisposition: "auto_publish_eligible" | "human_review" | "blocked";
  reasons: string[];
};

export type UnknownNewsSourceIdentity = {
  authorityVersion: typeof TECPEY_NEWS_SOURCE_AUTHORITY_VERSION;
  id: "unknown";
  name: "Unknown Source";
  domain: string;
  registryKnown: false;
  publicationDisposition: "blocked";
  reasons: ["source_not_in_registry"];
  providerReadiness: NewsProviderReadinessDecision;
};

export type NewsSourceAuthorityDecision = GovernedNewsSourceIdentity | UnknownNewsSourceIdentity;

function normalizeDomain(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^www\./, "").split("/")[0] ?? "";
  }
}

function sourceDomain(source: NewsSourceRegistryEntry): string {
  return normalizeDomain(source.canonicalDomains[0] ?? "");
}

export function findGovernedNewsSource(value: string): NewsSourceRegistryEntry | undefined {
  const domain = normalizeDomain(value);
  if (!domain) return undefined;
  return NEWS_SOURCE_REGISTRY.find((source) =>
    source.canonicalDomains.some((candidate) => {
      const canonical = normalizeDomain(candidate);
      return domain === canonical || domain.endsWith(`.${canonical}`);
    }),
  );
}

export function resolveNewsSourceAuthority(value: string): NewsSourceAuthorityDecision {
  const domain = normalizeDomain(value);
  const source = findGovernedNewsSource(domain);
  const providerReadiness = providerReadinessSummaryForDomain(domain);

  if (!source) {
    return {
      authorityVersion: TECPEY_NEWS_SOURCE_AUTHORITY_VERSION,
      id: "unknown",
      name: "Unknown Source",
      domain,
      registryKnown: false,
      publicationDisposition: "blocked",
      reasons: ["source_not_in_registry"],
      providerReadiness,
    };
  }

  const reasons: string[] = [];
  if ((source.continuityMode ?? "required") === "quarantined") reasons.push("source_quarantined");
  if (providerReadiness.status === "blocked") reasons.push("provider_readiness_missing_or_blocked");
  if (providerReadiness.status === "degraded") reasons.push("provider_readiness_degraded");
  if (!providerReadiness.autoIngestionAllowed) reasons.push("auto_ingestion_not_allowed");

  const publicationDisposition =
    (source.continuityMode ?? "required") === "quarantined"
      ? "blocked"
      : providerReadiness.status === "ready" && providerReadiness.autoIngestionAllowed
        ? "auto_publish_eligible"
        : "human_review";

  return {
    authorityVersion: TECPEY_NEWS_SOURCE_AUTHORITY_VERSION,
    id: source.id,
    name: source.name,
    domain: sourceDomain(source),
    registryKnown: true,
    category: source.category,
    trustTier: source.trustTier,
    firstParty: source.firstParty,
    allowFullArticleFetch: source.allowFullArticleFetch,
    corroborationWeight: source.corroborationWeight,
    continuityMode: source.continuityMode ?? "required",
    providerReadiness,
    publicationDisposition,
    reasons,
  };
}

export function newsSourceAuthorityDrift(): Array<{
  id: string;
  domain: string;
  publicationDisposition: GovernedNewsSourceIdentity["publicationDisposition"];
  providerStatus: NewsProviderReadinessDecision["status"];
}> {
  return NEWS_SOURCE_REGISTRY.map((source) => {
    const decision = resolveNewsSourceAuthority(sourceDomain(source));
    if (!decision.registryKnown) {
      return {
        id: source.id,
        domain: sourceDomain(source),
        publicationDisposition: "blocked" as const,
        providerStatus: decision.providerReadiness.status,
      };
    }
    return {
      id: source.id,
      domain: decision.domain,
      publicationDisposition: decision.publicationDisposition,
      providerStatus: decision.providerReadiness.status,
    };
  });
}
