import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import type { ContentLocale } from "../content-growth";
import type { NewsEnrichmentCandidate } from "./news-enrichment-authority";

export type NewsAiCostConfig = Readonly<{
  dailyBudgetUsdMicros: number;
  maxCallCostUsdMicros: number;
  inputCostUsdMicrosPerMillionTokens: number;
  outputCostUsdMicrosPerMillionTokens: number;
  costMaxInputTokens: number;
  costMaxOutputTokens: number;
  reservationTtlSeconds: number;
}>;

type NewsAiCallReason = "fresh" | "repair" | "retry" | "fallback";
type NewsAiCostSource = "provider" | "configured_estimate" | "reservation_fallback";
type AdmissionFailureReason = "budget_exhausted" | "duplicate_attempt" | "authority_unavailable";

type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  providerCostUsdMicros: number | null;
};

type StartedAttempt = {
  attemptId: string;
  reservedUsdMicros: number;
};

type Admission =
  | { ok: true; attempt: StartedAttempt }
  | { ok: false; reason: AdmissionFailureReason };

function requiredIntegerEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) throw new Error(`${name.toLowerCase()}_required`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return parsed;
}

function optionalIntegerEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name.toLowerCase()}_invalid`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return parsed;
}

export function estimateConfiguredCostUsdMicros(
  inputTokens: number,
  outputTokens: number,
  inputRateUsdMicrosPerMillionTokens: number,
  outputRateUsdMicrosPerMillionTokens: number,
): number {
  const input = Math.max(0, Math.trunc(inputTokens));
  const output = Math.max(0, Math.trunc(outputTokens));
  return Math.max(
    0,
    Math.ceil(
      (
        input * inputRateUsdMicrosPerMillionTokens +
        output * outputRateUsdMicrosPerMillionTokens
      ) / 1_000_000,
    ),
  );
}

export function newsAiCostConfigFromEnv(env: NodeJS.ProcessEnv = process.env): NewsAiCostConfig {
  const dailyBudgetUsdMicros = requiredIntegerEnv(
    env,
    "NEWS_AI_DAILY_BUDGET_USD_MICROS",
    1_000,
    100_000_000_000,
  );
  const maxCallCostUsdMicros = requiredIntegerEnv(
    env,
    "NEWS_AI_MAX_CALL_COST_USD_MICROS",
    1_000,
    100_000_000_000,
  );
  const inputCostUsdMicrosPerMillionTokens = requiredIntegerEnv(
    env,
    "NEWS_AI_INPUT_COST_USD_MICROS_PER_MILLION_TOKENS",
    1,
    100_000_000_000,
  );
  const outputCostUsdMicrosPerMillionTokens = requiredIntegerEnv(
    env,
    "NEWS_AI_OUTPUT_COST_USD_MICROS_PER_MILLION_TOKENS",
    1,
    100_000_000_000,
  );
  const costMaxInputTokens = optionalIntegerEnv(
    env,
    "NEWS_AI_COST_MAX_INPUT_TOKENS",
    20_000,
    1_000,
    100_000,
  );
  const costMaxOutputTokens = optionalIntegerEnv(
    env,
    "NEWS_AI_COST_MAX_OUTPUT_TOKENS",
    3_200,
    64,
    100_000,
  );
  const reservationTtlSeconds = optionalIntegerEnv(
    env,
    "NEWS_AI_RESERVATION_TTL_SECONDS",
    300,
    60,
    900,
  );

  if (maxCallCostUsdMicros > dailyBudgetUsdMicros) {
    throw new Error("news_ai_max_call_cost_exceeds_daily_budget");
  }
  const worstCaseEstimate = estimateConfiguredCostUsdMicros(
    costMaxInputTokens,
    costMaxOutputTokens,
    inputCostUsdMicrosPerMillionTokens,
    outputCostUsdMicrosPerMillionTokens,
  );
  if (maxCallCostUsdMicros < worstCaseEstimate) {
    throw new Error("news_ai_max_call_cost_below_configured_token_ceiling");
  }

  return Object.freeze({
    dailyBudgetUsdMicros,
    maxCallCostUsdMicros,
    inputCostUsdMicrosPerMillionTokens,
    outputCostUsdMicrosPerMillionTokens,
    costMaxInputTokens,
    costMaxOutputTokens,
    reservationTtlSeconds,
  });
}

function requestedModelFromRequest(init: RequestInit | undefined, fallback: string): string {
  if (typeof init?.body !== "string") return fallback;
  try {
    const body = JSON.parse(init.body) as { model?: unknown };
    return typeof body.model === "string" && body.model.trim()
      ? body.model.trim().slice(0, 160)
      : fallback;
  } catch {
    return fallback;
  }
}

function providerFromUrl(value: RequestInfo | URL): string {
  const url = typeof value === "string"
    ? value
    : value instanceof URL
      ? value.toString()
      : value.url;
  const host = new URL(url).hostname.toLowerCase();
  if (host === "api.openai.com") return "openai";
  if (host === "api.anthropic.com") return "anthropic";
  if (host === "openrouter.ai") return "openrouter";
  if (host === "api.x.ai") return "xai";
  if (host === "api.perplexity.ai") return "perplexity";
  return "unknown";
}

function callReason(input: {
  translationAttempt: number;
  networkOrdinal: number;
  requestedModel: string;
  primaryModel: string;
}): NewsAiCallReason {
  if (input.requestedModel !== input.primaryModel) return "fallback";
  if (input.networkOrdinal > 1) return "repair";
  return input.translationAttempt > 1 ? "retry" : "fresh";
}

function safeFailureReason(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (normalized || "unknown").slice(0, 160);
}

async function transaction<T>(client: PoolClient, work: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const value = await work();
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function reconcileExpiredAttempts(client: PoolClient, budgetDay: string): Promise<void> {
  const expired = await client.query<{
    attempt_id: string;
    reserved_usd_micros: string | number;
  }>(
    `SELECT attempt_id::text, reserved_usd_micros
       FROM platform_news_ai_provider_attempts
      WHERE budget_day = $1::date
        AND status = 'egress_started'
        AND expires_at <= NOW()
      ORDER BY attempt_id
      FOR UPDATE`,
    [budgetDay],
  );
  if (expired.rows.length === 0) return;

  let reservedTotal = 0;
  for (const row of expired.rows) {
    const reserved = Number(row.reserved_usd_micros);
    reservedTotal += reserved;
    await client.query(
      `UPDATE platform_news_ai_provider_attempts
          SET status = 'settled',
              settled_usd_micros = reserved_usd_micros,
              cost_source = 'reservation_fallback',
              failure_reason = 'reservation_expired_after_egress',
              reconciliation_required = TRUE,
              settled_at = NOW(),
              updated_at = NOW()
        WHERE attempt_id = $1::uuid AND status = 'egress_started'`,
      [row.attempt_id],
    );
  }

  const updated = await client.query(
    `UPDATE platform_news_ai_budget_daily
        SET active_reserved_usd_micros = active_reserved_usd_micros - $2,
            settled_usd_micros = settled_usd_micros + $2,
            updated_at = NOW()
      WHERE budget_day = $1::date
        AND active_reserved_usd_micros >= $2`,
    [budgetDay, reservedTotal],
  );
  if (updated.rowCount !== 1) throw new Error("news_ai_expired_budget_invariant");
}

async function beginProviderAttempt(input: {
  client: PoolClient;
  candidate: NewsEnrichmentCandidate;
  locale: ContentLocale;
  translationAttempt: number;
  networkOrdinal: number;
  providerId: string;
  requestedModel: string;
  callReason: NewsAiCallReason;
  config: NewsAiCostConfig;
}): Promise<Admission> {
  try {
    return await transaction(input.client, async () => {
      const day = await input.client.query<{ budget_day: string | Date }>(
        `SELECT (NOW() AT TIME ZONE 'UTC')::date AS budget_day`,
      );
      const budgetDayValue = day.rows[0]?.budget_day;
      if (!budgetDayValue) throw new Error("news_ai_budget_day_unavailable");
      const budgetDay = budgetDayValue instanceof Date
        ? budgetDayValue.toISOString().slice(0, 10)
        : String(budgetDayValue).slice(0, 10);

      await input.client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`news-ai-budget:${budgetDay}`],
      );
      await input.client.query(
        `INSERT INTO platform_news_ai_budget_daily
           (budget_day, daily_budget_usd_micros)
         VALUES ($1::date, $2)
         ON CONFLICT (budget_day) DO UPDATE SET
           daily_budget_usd_micros = EXCLUDED.daily_budget_usd_micros,
           updated_at = NOW()`,
        [budgetDay, input.config.dailyBudgetUsdMicros],
      );
      await reconcileExpiredAttempts(input.client, budgetDay);

      const idempotencyKey = [
        "news-ai",
        input.locale,
        input.candidate.archiveId,
        input.candidate.contentHash.slice(0, 16),
        `t${input.translationAttempt}`,
        `n${input.networkOrdinal}`,
      ].join(":");
      const existing = await input.client.query<{ present: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM platform_news_ai_provider_attempts
            WHERE idempotency_key = $1
         ) AS present`,
        [idempotencyKey],
      );
      if (existing.rows[0]?.present) {
        return { ok: false, reason: "duplicate_attempt" } as const;
      }

      const admitted = await input.client.query(
        `UPDATE platform_news_ai_budget_daily
            SET active_reserved_usd_micros = active_reserved_usd_micros + $2,
                updated_at = NOW()
          WHERE budget_day = $1::date
            AND active_reserved_usd_micros + settled_usd_micros + $2
                <= daily_budget_usd_micros`,
        [budgetDay, input.config.maxCallCostUsdMicros],
      );
      if (admitted.rowCount !== 1) {
        return { ok: false, reason: "budget_exhausted" } as const;
      }

      const attemptId = randomUUID();
      await input.client.query(
        `INSERT INTO platform_news_ai_provider_attempts
           (attempt_id, budget_day, archive_id, locale, source_content_hash,
            translation_attempt, network_ordinal, provider_id, requested_model,
            call_reason, idempotency_key, reserved_usd_micros, status,
            egress_started_at, expires_at)
         VALUES ($1::uuid, $2::date, $3::uuid, $4, $5, $6, $7, $8, $9,
                 $10, $11, $12, 'egress_started', NOW(),
                 NOW() + make_interval(secs => $13))`,
        [
          attemptId,
          budgetDay,
          input.candidate.archiveId,
          input.locale,
          input.candidate.contentHash,
          input.translationAttempt,
          input.networkOrdinal,
          input.providerId,
          input.requestedModel,
          input.callReason,
          idempotencyKey,
          input.config.maxCallCostUsdMicros,
          input.config.reservationTtlSeconds,
        ],
      );
      return {
        ok: true,
        attempt: {
          attemptId,
          reservedUsdMicros: input.config.maxCallCostUsdMicros,
        },
      } as const;
    });
  } catch {
    return { ok: false, reason: "authority_unavailable" };
  }
}

async function settleProviderAttempt(input: {
  client: PoolClient;
  attempt: StartedAttempt;
  chargedUsdMicros: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costSource: NewsAiCostSource;
  httpStatus: number | null;
  failureReason: string | null;
  durationMs: number;
  reconciliationRequired: boolean;
}): Promise<void> {
  await transaction(input.client, async () => {
    const selected = await input.client.query<{
      budget_day: string | Date;
      reserved_usd_micros: string | number;
      status: "egress_started" | "settled";
    }>(
      `SELECT budget_day, reserved_usd_micros, status
         FROM platform_news_ai_provider_attempts
        WHERE attempt_id = $1::uuid
        FOR UPDATE`,
      [input.attempt.attemptId],
    );
    const row = selected.rows[0];
    if (!row) throw new Error("news_ai_attempt_missing");
    if (row.status === "settled") return;

    const budgetDay = row.budget_day instanceof Date
      ? row.budget_day.toISOString().slice(0, 10)
      : String(row.budget_day).slice(0, 10);
    await input.client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`news-ai-budget:${budgetDay}`],
    );
    const reserved = Number(row.reserved_usd_micros);
    const charged = Math.max(0, Math.trunc(input.chargedUsdMicros));

    const updated = await input.client.query(
      `UPDATE platform_news_ai_provider_attempts
          SET status = 'settled',
              settled_usd_micros = $2,
              input_tokens = $3,
              output_tokens = $4,
              cost_source = $5,
              http_status = $6,
              failure_reason = $7,
              duration_ms = $8,
              reconciliation_required = $9,
              settled_at = NOW(),
              updated_at = NOW()
        WHERE attempt_id = $1::uuid AND status = 'egress_started'`,
      [
        input.attempt.attemptId,
        charged,
        input.inputTokens,
        input.outputTokens,
        input.costSource,
        input.httpStatus,
        input.failureReason,
        Math.max(0, Math.min(600_000, Math.trunc(input.durationMs))),
        input.reconciliationRequired,
      ],
    );
    if (updated.rowCount !== 1) throw new Error("news_ai_attempt_settlement_invariant");

    const budget = await input.client.query(
      `UPDATE platform_news_ai_budget_daily
          SET active_reserved_usd_micros = active_reserved_usd_micros - $2,
              settled_usd_micros = settled_usd_micros + $3,
              updated_at = NOW()
        WHERE budget_day = $1::date
          AND active_reserved_usd_micros >= $2`,
      [budgetDay, reserved, charged],
    );
    if (budget.rowCount !== 1) throw new Error("news_ai_budget_settlement_invariant");
  });
}

function providerUsage(value: unknown): ProviderUsage {
  const root = value as {
    usage?: {
      input_tokens?: unknown;
      output_tokens?: unknown;
      inputTokens?: unknown;
      outputTokens?: unknown;
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      cost?: unknown;
    };
  };
  const inputTokens = Number(
    root?.usage?.input_tokens ?? root?.usage?.inputTokens ?? root?.usage?.prompt_tokens,
  );
  const outputTokens = Number(
    root?.usage?.output_tokens ?? root?.usage?.outputTokens ?? root?.usage?.completion_tokens,
  );
  const providerCost = Number(root?.usage?.cost);
  return {
    inputTokens: Number.isFinite(inputTokens) ? Math.max(0, Math.trunc(inputTokens)) : null,
    outputTokens: Number.isFinite(outputTokens) ? Math.max(0, Math.trunc(outputTokens)) : null,
    providerCostUsdMicros:
      Number.isFinite(providerCost) && providerCost >= 0
        ? Math.max(0, Math.round(providerCost * 1_000_000))
        : null,
  };
}

function settlementFromUsage(
  usage: ProviderUsage,
  config: NewsAiCostConfig,
  reservedUsdMicros: number,
): {
  chargedUsdMicros: number;
  costSource: NewsAiCostSource;
  reconciliationRequired: boolean;
} {
  if (usage.providerCostUsdMicros !== null) {
    return {
      chargedUsdMicros: usage.providerCostUsdMicros,
      costSource: "provider",
      reconciliationRequired: false,
    };
  }
  if (usage.inputTokens !== null && usage.outputTokens !== null) {
    return {
      chargedUsdMicros: estimateConfiguredCostUsdMicros(
        usage.inputTokens,
        usage.outputTokens,
        config.inputCostUsdMicrosPerMillionTokens,
        config.outputCostUsdMicrosPerMillionTokens,
      ),
      costSource: "configured_estimate",
      reconciliationRequired: false,
    };
  }
  return {
    chargedUsdMicros: reservedUsdMicros,
    costSource: "reservation_fallback",
    reconciliationRequired: true,
  };
}

async function boundedUsageFromResponse(response: Response): Promise<ProviderUsage> {
  try {
    const clone = response.clone();
    const text = await Promise.race([
      clone.text(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("news_ai_usage_read_timeout")), 1_500),
      ),
    ]);
    if (text.length > 256_000) return providerUsage(null);
    return providerUsage(JSON.parse(text));
  } catch {
    return providerUsage(null);
  }
}

function blockedResponse(reason: AdmissionFailureReason): Response {
  return new Response(JSON.stringify({ error: { code: `news_ai_${reason}` } }), {
    status: 402,
    headers: {
      "content-type": "application/json",
      "x-tecpey-news-ai-authority": reason,
    },
  });
}

/**
 * Returns a fetch implementation for one immutable article-version/locale.
 * Every actual network invocation gets its own durable pre-egress reservation.
 * Budget/duplicate/authority failures return a local 402 response and never
 * touch the provider network; the existing provider adapter maps this to a
 * terminal quota failure rather than a retryable network failure.
 */
export function createNewsAiCostGovernedFetch(input: {
  client: PoolClient;
  candidate: NewsEnrichmentCandidate;
  locale: ContentLocale;
  translationAttempt: number;
  primaryModel: string;
  config: NewsAiCostConfig;
  fetchImpl?: typeof fetch;
}): typeof fetch {
  const fetchImpl = input.fetchImpl ?? fetch;
  let networkOrdinal = 0;

  return async (request: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    networkOrdinal += 1;
    const requestedModel = requestedModelFromRequest(init, input.primaryModel);
    const providerId = providerFromUrl(request);
    if (providerId === "unknown") {
      return blockedResponse("authority_unavailable");
    }
    const reason = callReason({
      translationAttempt: input.translationAttempt,
      networkOrdinal,
      requestedModel,
      primaryModel: input.primaryModel,
    });
    const admission = await beginProviderAttempt({
      client: input.client,
      candidate: input.candidate,
      locale: input.locale,
      translationAttempt: input.translationAttempt,
      networkOrdinal,
      providerId,
      requestedModel,
      callReason: reason,
      config: input.config,
    });
    if (!admission.ok) return blockedResponse(admission.reason);

    const startedAt = Date.now();
    try {
      const response = await fetchImpl(request, init);
      const usage = await boundedUsageFromResponse(response);
      const settlement = settlementFromUsage(
        usage,
        input.config,
        admission.attempt.reservedUsdMicros,
      );
      await settleProviderAttempt({
        client: input.client,
        attempt: admission.attempt,
        chargedUsdMicros: settlement.chargedUsdMicros,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costSource: settlement.costSource,
        httpStatus: response.status,
        failureReason: response.ok ? null : safeFailureReason(`http_${response.status}`),
        durationMs: Date.now() - startedAt,
        reconciliationRequired: settlement.reconciliationRequired,
      });
      return response;
    } catch (error) {
      try {
        await settleProviderAttempt({
          client: input.client,
          attempt: admission.attempt,
          chargedUsdMicros: admission.attempt.reservedUsdMicros,
          inputTokens: null,
          outputTokens: null,
          costSource: "reservation_fallback",
          httpStatus: null,
          failureReason: safeFailureReason(
            error instanceof Error ? error.name || error.message : "network_error",
          ),
          durationMs: Date.now() - startedAt,
          reconciliationRequired: true,
        });
      } catch {
        // The committed egress_started row remains recoverable. The next
        // admission reconciles it conservatively at the full reservation.
      }
      throw error;
    }
  };
}
