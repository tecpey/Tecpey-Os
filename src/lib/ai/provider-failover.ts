import {
  aiAgentDefinition,
  type AiAgentId,
  type AiDataClass,
  type AiModelProviderId,
} from "./control-plane-catalog";
import {
  callAiProvider,
  inspectOpenRouterKey,
  type AiProviderCallResult,
  type AiProviderFailureReason,
  type AiProviderRouterDependencies,
  type OpenRouterKeyStatus,
} from "./provider-router";

export type AiProviderRouteMode =
  | "primary"
  | "openrouter_paid"
  | "openrouter_free";

export type AiRoutedProviderResult = {
  result: AiProviderCallResult;
  routeMode: AiProviderRouteMode;
  fallbackAttempted: boolean;
  primaryFailureReason: AiProviderFailureReason | null;
  openRouterKeyStatus: OpenRouterKeyStatus | null;
};

export type AiProviderFailoverInput = {
  agentId: AiAgentId;
  primary: {
    providerId: AiModelProviderId;
    apiKey: string;
    model: string;
    fallbackModel?: string | null;
  };
  openRouter?: {
    apiKey: string;
    paidModel: string;
    freeFallbackEnabled: boolean;
    creditFloorUsdMicros: number;
  } | null;
  dataClass: AiDataClass;
  criticality: "noncritical" | "standard" | "critical";
  externalEffect: boolean;
  instructions: string;
  input: string;
  requestSignal?: AbortSignal;
  timeoutMs?: number;
  maxOutputTokens?: number;
  circuitScope?: string;
  toolsEnabled?: boolean;
};

const FALLBACK_REASONS = new Set<AiProviderFailureReason>([
  "circuit_open",
  "timeout",
  "network_error",
  "quota_exhausted",
  "rate_limited",
  "provider_rejected",
]);

function remainingTimeout(deadline: number, now: () => number): number {
  return Math.max(0, Math.min(30_000, deadline - now()));
}

function canUsePaidOpenRouter(input: AiProviderFailoverInput): boolean {
  const policy = aiAgentDefinition(input.agentId).openRouterFallback;
  return Boolean(
    input.openRouter &&
      input.primary.providerId !== "openrouter" &&
      policy.allowedDataClasses.includes(input.dataClass),
  );
}

function canUseFreeOpenRouter(input: AiProviderFailoverInput): boolean {
  const policy = aiAgentDefinition(input.agentId).openRouterFallback;
  return Boolean(
    input.openRouter?.freeFallbackEnabled &&
      policy.freeAllowed &&
      policy.allowedDataClasses.includes(input.dataClass) &&
      input.dataClass === "public" &&
      input.criticality === "noncritical" &&
      input.externalEffect === false,
  );
}

function fallbackCircuitScope(
  scope: string | undefined,
  route: "paid" | "free",
): string {
  return `${scope?.trim().slice(0, 220) || "default"}:openrouter-${route}`;
}

export async function callAiProviderWithFailover(
  input: AiProviderFailoverInput,
  dependencies: AiProviderRouterDependencies = {},
): Promise<AiRoutedProviderResult> {
  const now = dependencies.now ?? Date.now;
  const totalTimeoutMs = Math.max(
    2_000,
    Math.min(30_000, Math.trunc(input.timeoutMs ?? 12_000)),
  );
  const deadline = now() + totalTimeoutMs;
  const fallbackEligible =
    canUsePaidOpenRouter(input) || canUseFreeOpenRouter(input);
  const primaryTimeoutMs = fallbackEligible
    ? Math.max(2_000, Math.floor(totalTimeoutMs * 0.6))
    : totalTimeoutMs;
  const primary = await callAiProvider(
    {
      providerId: input.primary.providerId,
      agentId: input.agentId,
      apiKey: input.primary.apiKey,
      model: input.primary.model,
      fallbackModel: input.primary.fallbackModel,
      instructions: input.instructions,
      input: input.input,
      requestSignal: input.requestSignal,
      timeoutMs: Math.min(primaryTimeoutMs, remainingTimeout(deadline, now)),
      maxOutputTokens: input.maxOutputTokens,
      circuitScope: input.circuitScope,
      toolsEnabled: input.toolsEnabled,
      dataClass: input.dataClass,
      requireZeroDataRetention: true,
    },
    dependencies,
  );
  if (
    primary.ok ||
    !FALLBACK_REASONS.has(primary.reason) ||
    !fallbackEligible ||
    remainingTimeout(deadline, now) < 2_000
  ) {
    return {
      result: primary,
      routeMode: "primary",
      fallbackAttempted: false,
      primaryFailureReason: primary.ok ? null : primary.reason,
      openRouterKeyStatus: null,
    };
  }

  const openRouter = input.openRouter;
  if (!openRouter) {
    return {
      result: primary,
      routeMode: "primary",
      fallbackAttempted: false,
      primaryFailureReason: primary.reason,
      openRouterKeyStatus: null,
    };
  }

  const keyStatus = await inspectOpenRouterKey(
    {
      apiKey: openRouter.apiKey,
      requestSignal: input.requestSignal,
      timeoutMs: Math.max(
        1_000,
        Math.min(3_000, remainingTimeout(deadline, now) - 2_000),
      ),
    },
    dependencies,
  );
  const paidCreditAvailable =
    !keyStatus.ok ||
    keyStatus.limitRemainingUsdMicros === null ||
    keyStatus.limitRemainingUsdMicros > openRouter.creditFloorUsdMicros;

  let paidResult: AiProviderCallResult | null = null;
  if (
    input.primary.providerId !== "openrouter" &&
    paidCreditAvailable &&
    remainingTimeout(deadline, now) >= 2_000
  ) {
    paidResult = await callAiProvider(
      {
        providerId: "openrouter",
        agentId: input.agentId,
        apiKey: openRouter.apiKey,
        model: openRouter.paidModel,
        instructions: input.instructions,
        input: input.input,
        requestSignal: input.requestSignal,
        timeoutMs: remainingTimeout(deadline, now),
        maxOutputTokens: input.maxOutputTokens,
        circuitScope: fallbackCircuitScope(input.circuitScope, "paid"),
        toolsEnabled: input.toolsEnabled,
        dataClass: input.dataClass,
        requireZeroDataRetention: true,
      },
      dependencies,
    );
    if (paidResult.ok || !canUseFreeOpenRouter(input)) {
      return {
        result: paidResult,
        routeMode: "openrouter_paid",
        fallbackAttempted: true,
        primaryFailureReason: primary.reason,
        openRouterKeyStatus: keyStatus,
      };
    }
  }

  if (canUseFreeOpenRouter(input) && remainingTimeout(deadline, now) >= 2_000) {
    const freeResult = await callAiProvider(
      {
        providerId: "openrouter",
        agentId: input.agentId,
        apiKey: openRouter.apiKey,
        model: "openrouter/free",
        instructions: input.instructions,
        input: input.input,
        requestSignal: input.requestSignal,
        timeoutMs: remainingTimeout(deadline, now),
        maxOutputTokens: input.maxOutputTokens,
        circuitScope: fallbackCircuitScope(input.circuitScope, "free"),
        toolsEnabled: input.toolsEnabled,
        dataClass: "public",
        requireZeroDataRetention: true,
      },
      dependencies,
    );
    return {
      result: freeResult,
      routeMode: "openrouter_free",
      fallbackAttempted: true,
      primaryFailureReason: primary.reason,
      openRouterKeyStatus: keyStatus,
    };
  }

  return {
    result: paidResult ?? primary,
    routeMode: paidResult ? "openrouter_paid" : "primary",
    fallbackAttempted: Boolean(paidResult),
    primaryFailureReason: primary.reason,
    openRouterKeyStatus: keyStatus,
  };
}
