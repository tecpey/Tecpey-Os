import type { AiModelProviderId } from "./control-plane-catalog";

export type AiProviderCostSource =
  | "usage.cost"
  | "usage.cost.total_cost"
  | "usage.cost_in_usd_ticks"
  | null;

export type AiProviderUsageTelemetry = Readonly<{
  providerId: AiModelProviderId;
  inputTokens: number;
  outputTokens: number;
  inputTokenSource: "provider" | "estimated";
  outputTokenSource: "provider" | "estimated";
  cachedInputTokens: number | null;
  cacheReadInputTokens: number | null;
  cacheCreationInputTokens: number | null;
  reasoningTokens: number | null;
  serverToolInvocations: number | null;
  costUsdMicros: number | null;
  costSource: AiProviderCostSource;
}>;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function finiteNonNegativeInteger(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.trunc(number);
}

function finiteNonNegativeNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function tokenEstimate(text: string): number {
  return Math.max(0, Math.ceil(text.length / 3.2));
}

function nestedInteger(root: UnknownRecord | null, path: readonly string[]): number | null {
  let current: unknown = root;
  for (const key of path) {
    current = record(current)?.[key];
  }
  return finiteNonNegativeInteger(current);
}

function providerCost(usage: UnknownRecord | null): {
  costUsdMicros: number | null;
  costSource: AiProviderCostSource;
} {
  if (!usage) return { costUsdMicros: null, costSource: null };

  const ticks = finiteNonNegativeNumber(usage.cost_in_usd_ticks);
  if (ticks !== null) {
    // xAI defines 1 USD = 10^10 ticks. Convert to integer micro-dollars.
    return {
      costUsdMicros: Math.max(0, Math.round(ticks / 10_000)),
      costSource: "usage.cost_in_usd_ticks",
    };
  }

  const cost = usage.cost;
  const directUsd = finiteNonNegativeNumber(cost);
  if (directUsd !== null) {
    return {
      costUsdMicros: Math.max(0, Math.round(directUsd * 1_000_000)),
      costSource: "usage.cost",
    };
  }

  const totalUsd = finiteNonNegativeNumber(record(cost)?.total_cost);
  if (totalUsd !== null) {
    return {
      costUsdMicros: Math.max(0, Math.round(totalUsd * 1_000_000)),
      costSource: "usage.cost.total_cost",
    };
  }

  return { costUsdMicros: null, costSource: null };
}

function toolInvocationCount(usage: UnknownRecord | null): number | null {
  if (!usage) return null;
  const direct = finiteNonNegativeInteger(usage.num_server_side_tools_used);
  if (direct !== null) return direct;

  const details = record(usage.tool_calls_details);
  if (!details) return null;
  let total = 0;
  let observed = false;
  for (const value of Object.values(details)) {
    const invocation = finiteNonNegativeInteger(record(value)?.invocation);
    if (invocation === null) continue;
    total += invocation;
    observed = true;
  }
  return observed ? total : null;
}

/**
 * Normalizes provider-reported usage while preserving the distinction between
 * "zero" and "not reported" for cache/tool telemetry. Token estimates are
 * only used when the provider omits total input/output token counts.
 */
export function normalizeAiProviderUsageTelemetry(input: {
  providerId: AiModelProviderId;
  response: unknown;
  inputText: string;
  outputText: string;
}): AiProviderUsageTelemetry {
  const root = record(input.response);
  const usage = record(root?.usage);

  const providerInputTokens = finiteNonNegativeInteger(
    usage?.input_tokens ?? usage?.inputTokens ?? usage?.prompt_tokens,
  );
  const providerOutputTokens = finiteNonNegativeInteger(
    usage?.output_tokens ?? usage?.outputTokens ?? usage?.completion_tokens,
  );

  const cachedInputTokens = nestedInteger(usage, ["input_tokens_details", "cached_tokens"])
    ?? nestedInteger(usage, ["prompt_tokens_details", "cached_tokens"]);
  const cacheReadInputTokens = nestedInteger(usage, ["input_tokens_details", "cache_read_input_tokens"])
    ?? finiteNonNegativeInteger(usage?.cache_read_input_tokens)
    ?? cachedInputTokens;
  const cacheCreationInputTokens = nestedInteger(
    usage,
    ["input_tokens_details", "cache_creation_input_tokens"],
  ) ?? finiteNonNegativeInteger(usage?.cache_creation_input_tokens);
  const reasoningTokens = nestedInteger(usage, ["output_tokens_details", "reasoning_tokens"])
    ?? nestedInteger(usage, ["completion_tokens_details", "reasoning_tokens"]);
  const cost = providerCost(usage);

  return Object.freeze({
    providerId: input.providerId,
    inputTokens: providerInputTokens ?? tokenEstimate(input.inputText),
    outputTokens: providerOutputTokens ?? tokenEstimate(input.outputText),
    inputTokenSource: providerInputTokens === null ? "estimated" : "provider",
    outputTokenSource: providerOutputTokens === null ? "estimated" : "provider",
    cachedInputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    reasoningTokens,
    serverToolInvocations: toolInvocationCount(usage),
    costUsdMicros: cost.costUsdMicros,
    costSource: cost.costSource,
  });
}
