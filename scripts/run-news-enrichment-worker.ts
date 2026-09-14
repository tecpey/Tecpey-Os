import { hostname } from "node:os";
import type { PoolClient } from "pg";

import {
  createNewsAiCostGovernedFetch,
  newsAiCostConfigFromEnv,
} from "../src/lib/ops/news-ai-cost-authority";
import {
  persistNewsEnrichmentFailure,
  readNewsEnrichmentCandidatesFromAuthority,
  withNewsEnrichmentLease,
  type NewsEnrichmentCandidate,
} from "../src/lib/ops/news-enrichment-authority";
import { classifyFeedSourceCoverage } from "../src/lib/news-feed-evidence";
import { persistNewsArchiveTranslationTx } from "../src/lib/news-growth-authority";
import { validatePersianNewsEditorialQuality } from "../src/lib/ai/news-editorial-quality";
import {
  translateNewsFeedToPersian,
  type NewsTranslationProviderConfig,
} from "../src/lib/news-translation";
import { resolveAiProviderSecretForNewsTranslation } from "../src/lib/ai/control-plane-store";
import { PLATFORM } from "../src/lib/platform-config";

function boundedIntegerEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name.toLowerCase()}_invalid`);
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return value;
}

function sourceCoverage(sourceLead: string, sourceBody: string): "feed_full" | "feed_summary" {
  const lead = sourceLead.replace(/\s+/g, " ").trim();
  const body = sourceBody.replace(/\s+/g, " ").trim();
  return classifyFeedSourceCoverage({
    fullContent: body && body !== lead ? body : "",
    description: lead,
  });
}

async function resolveProviderReady(): Promise<NewsTranslationProviderConfig> {
  const provider = (process.env.NEWS_TRANSLATION_PROVIDER ?? "openai").trim().toLowerCase();
  const fallbackModel = process.env.NEWS_TRANSLATION_FALLBACK_MODEL?.trim() ?? "";
  const secretSource = (process.env.NEWS_PROVIDER_SECRET_SOURCE ?? "environment")
    .trim()
    .toLowerCase();

  if (fallbackModel) {
    throw new Error("news_enrichment_fallback_model_disabled_for_initial_activation");
  }

  if (provider === "openrouter") {
    throw new Error("news_enrichment_openrouter_requires_provider_call_ledger");
  }

  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error("news_enrichment_provider_not_allowed");
  }

  const model =
    provider === "openai"
      ? process.env.NEWS_TRANSLATION_MODEL?.trim() || "gpt-4.1-mini"
      : process.env.NEWS_TRANSLATION_MODEL?.trim() ?? "";

  if (!model) {
    throw new Error("news_enrichment_anthropic_model_missing");
  }

  if (secretSource === "control_plane") {
    if (provider !== "openai") {
      throw new Error("news_enrichment_control_plane_provider_not_allowed");
    }

    const secret = await resolveAiProviderSecretForNewsTranslation({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
      providerId: provider,
    });

    if (!secret?.apiKey) {
      throw new Error("news_enrichment_control_plane_secret_unavailable");
    }

    return {
      providerId: provider,
      apiKey: secret.apiKey,
      model,
    };
  }

  if (secretSource !== "environment") {
    throw new Error("news_enrichment_secret_source_invalid");
  }

  const apiKey =
    provider === "openai"
      ? process.env.OPENAI_API_KEY?.trim() ?? ""
      : process.env.ANTHROPIC_API_KEY?.trim() ?? "";

  if (!apiKey) {
    throw new Error(
      provider === "openai"
        ? "news_enrichment_openai_key_missing"
        : "news_enrichment_anthropic_key_missing",
    );
  }

  return {
    providerId: provider,
    apiKey,
    model,
  };
}

type CostAuthorityBlockReason =
  | "budget_exhausted"
  | "duplicate_attempt"
  | "authority_unavailable";

function costAuthorityBlockReason(response: Response): CostAuthorityBlockReason | null {
  const reason = response.headers.get("x-tecpey-news-ai-authority");
  return reason === "budget_exhausted" ||
    reason === "duplicate_attempt" ||
    reason === "authority_unavailable"
    ? reason
    : null;
}

// The immutable provider-attempt ledger allocates translation_attempt identities
// from 1..20. This sequence capacity is accounting identity, not retry policy:
// transient retry eligibility remains bounded by maximumFailures in the lease,
// while recoverable provider/key incidents may resume after their cooldown.
const NEWS_AI_TRANSLATION_ATTEMPT_SEQUENCE_MAX = 20;

async function nextTranslationAttempt(input: {
  client: PoolClient;
  candidate: NewsEnrichmentCandidate;
  locale: "fa";
}): Promise<number | null> {
  const result = await input.client.query<{ previous_attempt: string | number }>(
    `SELECT COALESCE(MAX(translation_attempt), 0)::int AS previous_attempt
       FROM platform_news_ai_provider_attempts
      WHERE archive_id = $1::uuid
        AND locale = $2
        AND source_content_hash = $3`,
    [input.candidate.archiveId, input.locale, input.candidate.contentHash],
  );
  const previousAttempt = Number(result.rows[0]?.previous_attempt ?? 0);
  if (
    !Number.isSafeInteger(previousAttempt)
    || previousAttempt < 0
    || previousAttempt > NEWS_AI_TRANSLATION_ATTEMPT_SEQUENCE_MAX
  ) {
    throw new Error("news_ai_translation_attempt_state_invalid");
  }
  if (previousAttempt >= NEWS_AI_TRANSLATION_ATTEMPT_SEQUENCE_MAX) return null;
  return previousAttempt + 1;
}

let providerCallsMayHaveStarted = false;

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const locale = "fa" as const;
  const limit = boundedIntegerEnv("NEWS_ENRICHMENT_LIMIT", 4, 1, 12);
  const retryMinutes = boundedIntegerEnv("NEWS_TRANSLATION_RETRY_MINUTES", 2, 1, 24 * 60);
  const maximumFailures = boundedIntegerEnv("NEWS_TRANSLATION_MAX_FAILURES_PER_VERSION", 3, 1, 5);
  const aiEnabled = process.env.NEWS_AI_ENABLED?.trim() === "1";

  const candidates = await readNewsEnrichmentCandidatesFromAuthority({ locale, limit });
  if (!aiEnabled) {
    console.log(JSON.stringify({
      status: "ai_disabled",
      host: hostname(),
      locale,
      candidates: candidates.length,
      aiCalls: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
    }));
    return;
  }

  if (candidates.length === 0) {
    console.log(JSON.stringify({
      status: "no_work",
      host: hostname(),
      locale,
      candidates: 0,
      aiCalls: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
    }));
    return;
  }

  const provider = await resolveProviderReady();
  const costConfig = newsAiCostConfigFromEnv();

  let processed = 0;
  let completed = 0;
  let failed = 0;
  let deferred = 0;
  let exhausted = 0;
  let terminal = 0;
  let skippedCompleted = 0;
  let providerNetworkCalls = 0;
  let costBudgetDeferred = 0;
  let costReplayBlocked = 0;
  let costAuthorityUnavailable = 0;
  let editorialQualityRejected = 0;

  for (const candidate of candidates) {
    const leased = await withNewsEnrichmentLease({
      candidate,
      locale,
      retryMinutes,
      maximumFailures,
      run: async (client) => {
        const generatedAt = new Date().toISOString();
        let translationAttempt: number | null;
        try {
          translationAttempt = await nextTranslationAttempt({
            client,
            candidate,
            locale,
          });
        } catch {
          costAuthorityUnavailable += 1;
          return { ok: false as const, reason: "cost_authority_unavailable" as const };
        }
        if (translationAttempt === null) {
          exhausted += 1;
          return { ok: false as const, reason: "cost_attempt_sequence_exhausted" as const };
        }

        processed += 1;
        let authorityBlock: CostAuthorityBlockReason | null = null;
        const networkCallsBefore = providerNetworkCalls;
        const actualNetworkFetch: typeof fetch = async (request, init) => {
          providerCallsMayHaveStarted = true;
          providerNetworkCalls += 1;
          return fetch(request, init);
        };
        const governedFetch = createNewsAiCostGovernedFetch({
          client,
          candidate,
          locale,
          translationAttempt,
          primaryModel: provider.model,
          config: costConfig,
          fetchImpl: actualNetworkFetch,
        });
        const observedGovernedFetch: typeof fetch = async (request, init) => {
          const response = await governedFetch(request, init);
          authorityBlock = costAuthorityBlockReason(response) ?? authorityBlock;
          return response;
        };

        try {
          const translation = await translateNewsFeedToPersian(
            {
              title: candidate.sourceTitle,
              lead: candidate.sourceLead,
              body: candidate.sourceBody,
              sourceName: candidate.sourceName,
              sourceUrl: candidate.articleUrl,
              sourceCoverage:
                candidate.sourceCoverage
                ?? sourceCoverage(candidate.sourceLead, candidate.sourceBody),
            },
            {
              fetchImpl: observedGovernedFetch,
              providerConfig: provider,
            },
          );

          if (authorityBlock) {
            if (authorityBlock === "budget_exhausted") costBudgetDeferred += 1;
            else if (authorityBlock === "duplicate_attempt") costReplayBlocked += 1;
            else costAuthorityUnavailable += 1;
            return { ok: false as const, reason: `cost_${authorityBlock}` as const };
          }

          if (!translation.ok) {
            failed += 1;
            await persistNewsEnrichmentFailure({
              client,
              candidate,
              locale,
              generatedAt,
              providerId: translation.providerId ?? null,
              model: translation.model ?? null,
              reason: translation.reason,
              evidence: {
                translationAttempt,
                providerNetworkCalls: providerNetworkCalls - networkCallsBefore,
                numericFailureKind: translation.numericFailureKind ?? null,
                numericFailureFactKey: translation.numericFailureFactKey ?? null,
                unsupportedLatinEntities: translation.unsupportedLatinEntities?.slice(0, 12) ?? null,
              },
            });
            return { ok: false as const, reason: "translation_failed" as const };
          }

          const editorialQuality = validatePersianNewsEditorialQuality({
            sourceTitle: candidate.sourceTitle,
            sourceLead: candidate.sourceLead,
            sourceBody: candidate.sourceBody,
            translatedTitle: translation.translation.title,
            translatedLead: translation.translation.lead,
            translatedBody: translation.translation.body,
          });
          if (!editorialQuality.ok) {
            failed += 1;
            editorialQualityRejected += 1;
            await persistNewsEnrichmentFailure({
              client,
              candidate,
              locale,
              generatedAt,
              providerId: translation.translation.providerId,
              model: translation.translation.model,
              reason: `editorial_quality_${editorialQuality.reason}`,
              evidence: {
                translationAttempt,
                providerNetworkCalls: providerNetworkCalls - networkCallsBefore,
                editorialQuality: editorialQuality.evidence,
              },
            });
            return { ok: false as const, reason: "editorial_quality_rejected" as const };
          }

          const finalRoute = translation.route?.ok ? translation.route : null;
          await persistNewsArchiveTranslationTx(client, {
            archiveId: candidate.archiveId,
            locale,
            status: "completed",
            providerId: translation.translation.providerId,
            model: translation.translation.model,
            translatedTitle: translation.translation.title,
            translatedLead: translation.translation.lead,
            translatedBody: translation.translation.body,
            sourceContentHash: candidate.contentHash,
            generatedAt,
            evidence: {
              sourceCoverage: translation.translation.sourceCoverage,
              numericIntegrity: translation.translation.quality.numericIntegrity,
              noAddedAdvice: translation.translation.quality.noAddedAdvice,
              editorialQuality: editorialQuality.evidence,
              translationAttempt,
              providerNetworkCalls: providerNetworkCalls - networkCallsBefore,
              finalProviderCall: finalRoute
                ? {
                    requestedModel: finalRoute.requestedModel,
                    inputTokens: finalRoute.inputTokens,
                    outputTokens: finalRoute.outputTokens,
                    costUsdMicros: finalRoute.costUsdMicros,
                    attempts: finalRoute.attempts,
                    durationMs: finalRoute.durationMs,
                  }
                : null,
            },
          });
          completed += 1;
          return { ok: true as const, reason: "completed" as const };
        } catch (error) {
          failed += 1;
          await persistNewsEnrichmentFailure({
            client,
            candidate,
            locale,
            generatedAt,
            reason: "translation_worker_exception",
            evidence: {
              translationAttempt,
              providerNetworkCalls: providerNetworkCalls - networkCallsBefore,
              errorCode: error instanceof Error
                ? error.message.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 160)
                : "unknown",
            },
          });
          return { ok: false as const, reason: "worker_exception" as const };
        }
      },
    });

    switch (leased.decision.action) {
      case "defer":
        deferred += 1;
        break;
      case "attempt_budget_exhausted":
        exhausted += 1;
        break;
      case "terminal_failure":
        terminal += 1;
        break;
      case "skip_completed":
        skippedCompleted += 1;
        break;
      case "process":
        break;
    }
  }

  console.log(JSON.stringify({
    status: "ok",
    host: hostname(),
    locale,
    provider: provider.providerId,
    model: provider.model,
    candidates: candidates.length,
    processed,
    completed,
    failed,
    deferred,
    exhausted,
    terminal,
    skippedCompleted,
    providerNetworkCalls,
    costBudgetDeferred,
    costReplayBlocked,
    costAuthorityUnavailable,
    editorialQualityRejected,
    retryMinutes,
    maximumFailures,
    translationAttemptSequenceMax: NEWS_AI_TRANSLATION_ATTEMPT_SEQUENCE_MAX,
    maximumProviderCallsPerRun: limit * 2,
    startedAt,
    finishedAt: new Date().toISOString(),
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "failed_closed",
    error: error instanceof Error ? error.message : String(error),
    providerCallState: providerCallsMayHaveStarted ? "may_have_started" : "none",
  }));
  process.exitCode = 1;
});
