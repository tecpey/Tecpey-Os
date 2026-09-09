import { hostname } from "node:os";

import {
  persistNewsEnrichmentFailure,
  readNewsEnrichmentCandidatesFromAuthority,
  withNewsEnrichmentLease,
} from "../src/lib/ops/news-enrichment-authority";
import { classifyFeedSourceCoverage } from "../src/lib/news-feed-evidence";
import { persistNewsArchiveTranslationTx } from "../src/lib/news-growth-authority";
import { translateNewsFeedToPersian } from "../src/lib/news-translation";

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

function assertProviderReady(): { provider: "openai" | "anthropic"; model: string } {
  const provider = (process.env.NEWS_TRANSLATION_PROVIDER ?? "openai").trim().toLowerCase();
  const fallbackModel = process.env.NEWS_TRANSLATION_FALLBACK_MODEL?.trim() ?? "";
  if (fallbackModel && process.env.NEWS_ENRICHMENT_ALLOW_FALLBACK?.trim() !== "1") {
    throw new Error("news_enrichment_fallback_model_forbidden_without_explicit_authority");
  }

  // OpenRouter can perform multiple provider attempts inside one routed call.
  // Keep it disabled for the initial news launch until the provider-call ledger
  // can reserve spend per underlying attempt rather than per article.
  if (provider === "openrouter") {
    throw new Error("news_enrichment_openrouter_requires_provider_call_ledger");
  }

  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("news_enrichment_openai_key_missing");
    return {
      provider: "openai",
      model: process.env.NEWS_TRANSLATION_MODEL?.trim() || "gpt-4.1-mini",
    };
  }

  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("news_enrichment_anthropic_key_missing");
    const model = process.env.NEWS_TRANSLATION_MODEL?.trim() ?? "";
    if (!model) throw new Error("news_enrichment_anthropic_model_missing");
    return { provider: "anthropic", model };
  }

  throw new Error("news_enrichment_provider_not_allowed");
}

let providerCallsMayHaveStarted = false;

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const locale = "fa" as const;
  const limit = boundedIntegerEnv("NEWS_ENRICHMENT_LIMIT", 4, 1, 12);
  const retryMinutes = boundedIntegerEnv("NEWS_TRANSLATION_RETRY_MINUTES", 2, 1, 24 * 60);
  const maximumFailures = boundedIntegerEnv("NEWS_TRANSLATION_MAX_FAILURES_PER_VERSION", 3, 1, 5);
  const aiEnabled = process.env.NEWS_AI_ENABLED?.trim() === "1";

  // Authority lookup happens before any provider readiness or paid work. A DB
  // failure throws here and cannot be mistaken for an empty reusable state.
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

  const provider = assertProviderReady();
  let processed = 0;
  let completed = 0;
  let failed = 0;
  let deferred = 0;
  let exhausted = 0;
  let terminal = 0;
  let skippedCompleted = 0;

  // Intentionally sequential. With OpenAI/Anthropic and fallback disabled,
  // translateNewsFeedToPersian performs at most one initial call plus one
  // governed repair call per article. Therefore this run has a deterministic
  // upper bound of limit * 2 provider calls until the spend ledger lands.
  for (const candidate of candidates) {
    const leased = await withNewsEnrichmentLease({
      candidate,
      locale,
      retryMinutes,
      maximumFailures,
      run: async (client) => {
        const generatedAt = new Date().toISOString();
        processed += 1;
        try {
          providerCallsMayHaveStarted = true;
          const translation = await translateNewsFeedToPersian({
            title: candidate.sourceTitle,
            lead: candidate.sourceLead,
            body: candidate.sourceBody,
            sourceName: candidate.sourceName,
            sourceUrl: candidate.articleUrl,
            sourceCoverage: sourceCoverage(candidate.sourceLead, candidate.sourceBody),
          });

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
                numericFailureKind: translation.numericFailureKind ?? null,
                numericFailureFactKey: translation.numericFailureFactKey ?? null,
                unsupportedLatinEntities: translation.unsupportedLatinEntities?.slice(0, 12) ?? null,
              },
            });
            return { ok: false as const };
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
          return { ok: true as const };
        } catch (error) {
          failed += 1;
          await persistNewsEnrichmentFailure({
            client,
            candidate,
            locale,
            generatedAt,
            reason: "translation_worker_exception",
            evidence: {
              errorCode: error instanceof Error
                ? error.message.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 160)
                : "unknown",
            },
          });
          return { ok: false as const };
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
    provider: provider.provider,
    model: provider.model,
    candidates: candidates.length,
    processed,
    completed,
    failed,
    deferred,
    exhausted,
    terminal,
    skippedCompleted,
    retryMinutes,
    maximumFailures,
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
