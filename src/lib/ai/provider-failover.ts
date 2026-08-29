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
import {
  planEnterpriseAiRoute,
  type AiEnterpriseRouteCandidate,
} from "./enterprise-routing-policy";

export type AiProviderRouteMode =
  | "primary"
  | "alternate"
  | "openrouter_paid"
  | "openrouter_free"
  | "blocked";

export type AiRoutedSpendAccounting = {
  /** The single reservation made available to this routed execution. */
  authorizedUsdMicros: number;
  /** Cumulative worst-case authority consumed by paid attempts. */
  consumedAuthorizationUsdMicros: number;
  /** Sum of provider-reported costs that were present and valid. */
  reportedCostUsdMicros: number;
  /**
   * Conservative cumulative amount that the caller must settle. A provider-
   * reported overrun can exceed the reservation and must remain visible.
   */
  chargeCostUsdMicros: number;
  /** Attempted paid routes whose exact provider cost was unavailable. */
  ambiguousPaidAttemptCount: number;
};

export type AiRoutedProviderResult = {
  result: AiProviderCallResult;
  routeMode: AiProviderRouteMode;
  fallbackAttempted: boolean;
  primaryFailureReason: AiProviderFailureReason | null;
  openRouterKeyStatus: OpenRouterKeyStatus | null;
  decisionHash: string | null;
  candidateCount: number;
  /** Cumulative cost callers must settle; null means charge the full reservation. */
  accountedCostUsdMicros: number | null;
  spendAccounting: AiRoutedSpendAccounting;
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
  routeCandidates?: ReadonlyArray<
    AiEnterpriseRouteCandidate & { apiKey: string | null }
  >;
  approvalSatisfied?: boolean;
  requiredCapabilities?: readonly string[];
  authorizedSpendUsdMicros?: number;
};

const FALLBACK_REASONS = new Set<AiProviderFailureReason>([
  "circuit_open",
  "timeout",
  "network_error",
  "quota_exhausted",
  "rate_limited",
  "provider_rejected",
]);
const MIN_PROVIDER_ATTEMPT_MS = 2_000;
const MAX_EXPECTED_ATTEMPT_MS = 10_000;

type MutableSpendAccounting = AiRoutedSpendAccounting;

function authorizedSpend(input: AiProviderFailoverInput): number {
  const value = input.authorizedSpendUsdMicros ?? 0;
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function createSpendAccounting(input: AiProviderFailoverInput): MutableSpendAccounting {
  return {
    authorizedUsdMicros: authorizedSpend(input),
    consumedAuthorizationUsdMicros: 0,
    reportedCostUsdMicros: 0,
    chargeCostUsdMicros: 0,
    ambiguousPaidAttemptCount: 0,
  };
}

function snapshotSpendAccounting(
  accounting: MutableSpendAccounting,
): AiRoutedSpendAccounting {
  return { ...accounting };
}

function safeReportedCost(result: AiProviderCallResult): number | null {
  if (!result.ok || result.costUsdMicros === null) return null;
  return Number.isSafeInteger(result.costUsdMicros) && result.costUsdMicros >= 0
    ? result.costUsdMicros
    : null;
}

function addUsdMicros(current: number, increment: number): number {
  if (increment <= 0) return current;
  return Math.min(Number.MAX_SAFE_INTEGER, current + increment);
}

function accountProviderAttempt(
  accounting: MutableSpendAccounting,
  result: AiProviderCallResult,
  worstCaseUsdMicros: number,
  paidRoute: boolean,
): void {
  if (result.attempts <= 0 || !paidRoute) return;
  const worstCase = Number.isSafeInteger(worstCaseUsdMicros) && worstCaseUsdMicros > 0
    ? worstCaseUsdMicros
    : 0;
  accounting.consumedAuthorizationUsdMicros = addUsdMicros(
    accounting.consumedAuthorizationUsdMicros,
    worstCase,
  );
  const reported = safeReportedCost(result);
  if (reported !== null) {
    accounting.reportedCostUsdMicros = addUsdMicros(
      accounting.reportedCostUsdMicros,
      reported,
    );
    accounting.chargeCostUsdMicros = addUsdMicros(
      accounting.chargeCostUsdMicros,
      reported,
    );
    return;
  }
  accounting.chargeCostUsdMicros = addUsdMicros(
    accounting.chargeCostUsdMicros,
    worstCase,
  );
  accounting.ambiguousPaidAttemptCount += 1;
}

function withSpendAccounting<
  T extends Omit<AiRoutedProviderResult, "spendAccounting" | "accountedCostUsdMicros">,
>(
  result: T,
  accounting: MutableSpendAccounting,
  accountedCostUsdMicros: number | null = accounting.chargeCostUsdMicros,
): AiRoutedProviderResult {
  return {
    ...result,
    accountedCostUsdMicros,
    spendAccounting: snapshotSpendAccounting(accounting),
  };
}

function legacyAccountedCost(accounting: MutableSpendAccounting): number | null {
  return accounting.ambiguousPaidAttemptCount > 0
    ? null
    : accounting.reportedCostUsdMicros;
}

function remainingTimeout(deadline: number, now: () => number): number {
  return Math.max(0, Math.min(30_000, deadline - now()));
}

function isZeroCostRoute(candidate: AiEnterpriseRouteCandidate): boolean {
  return candidate.free;
}

function isLegacyZeroCostRoute(providerId: AiModelProviderId, model: string): boolean {
  return providerId === "openrouter" &&
    (model.trim().toLowerCase() === "openrouter/free" || /:free$/i.test(model.trim()));
}

function paidWorstCase(candidate: AiEnterpriseRouteCandidate): number {
  return isZeroCostRoute(candidate) ? 0 : candidate.estimatedMaxCostUsdMicros;
}

function candidateTimeoutMilliseconds(input: {
  deadline: number;
  now: () => number;
  candidate: AiEnterpriseRouteCandidate;
  alternateCount: number;
}): number {
  const remaining = remainingTimeout(input.deadline, input.now);
  const alternateReserve = input.alternateCount > 0 ? MIN_PROVIDER_ATTEMPT_MS : 0;
  const available = remaining - alternateReserve;
  if (available < MIN_PROVIDER_ATTEMPT_MS) return 0;
  if (input.alternateCount === 0) return available;
  const expectedBudget = Math.max(
    MIN_PROVIDER_ATTEMPT_MS,
    Math.min(
      MAX_EXPECTED_ATTEMPT_MS,
      Math.trunc(input.candidate.expectedLatencyMs) * 3,
    ),
  );
  return Math.min(available, expectedBudget);
}

function openRouterQuotaTimeoutMilliseconds(input: {
  deadline: number;
  now: () => number;
  hasAlternate: boolean;
}): number {
  const requiredAttemptTime = MIN_PROVIDER_ATTEMPT_MS * (input.hasAlternate ? 2 : 1);
  const available = remainingTimeout(input.deadline, input.now) - requiredAttemptTime;
  return available >= 1_000 ? Math.min(3_000, available) : 0;
}

function preservesOpenRouterCreditFloor(input: {
  status: OpenRouterKeyStatus | null;
  creditFloorUsdMicros: number;
  alreadyAuthorizedUsdMicros: number;
  nextWorstCaseUsdMicros: number;
}): boolean {
  if (
    input.nextWorstCaseUsdMicros <= 0 ||
    !Number.isSafeInteger(input.nextWorstCaseUsdMicros) ||
    !Number.isSafeInteger(input.creditFloorUsdMicros) ||
    input.creditFloorUsdMicros < 0 ||
    input.status?.ok !== true
  ) return false;
  const keyStatus = input.status;
  if (!(keyStatus.ok && keyStatus.limitRemainingUsdMicros !== null)) return false;
  const limitRemainingUsdMicros = keyStatus.limitRemainingUsdMicros;
  const required = addUsdMicros(
    input.creditFloorUsdMicros,
    addUsdMicros(input.alreadyAuthorizedUsdMicros, input.nextWorstCaseUsdMicros),
  );
  return limitRemainingUsdMicros >= required;
}

function openRouterAuthorityFailureReason(
  status: OpenRouterKeyStatus | null,
): AiProviderFailureReason {
  if (status?.ok === true) return "quota_exhausted";
  if (status?.ok === false && status.reason === "timeout") return "timeout";
  if (status?.ok === false && status.reason === "network_error") return "network_error";
  return "provider_rejected";
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
  if (input.routeCandidates?.length) {
    return callPlannedProviderRoute(input, dependencies);
  }
  const accounting = createSpendAccounting(input);
  const now = dependencies.now ?? Date.now;
  const totalTimeoutMs = Math.max(
    2_000,
    Math.min(30_000, Math.trunc(input.timeoutMs ?? 12_000)),
  );
  const deadline = now() + totalTimeoutMs;
  const paidFallbackEligible = canUsePaidOpenRouter(input);
  const freeFallbackEligible = canUseFreeOpenRouter(input);
  const fallbackEligible = paidFallbackEligible || freeFallbackEligible;
  const primaryTimeoutMs = freeFallbackEligible
    ? Math.max(2_000, Math.floor(totalTimeoutMs * 0.6))
    : totalTimeoutMs;
  const primaryIsPaidOpenRouter = input.primary.providerId === "openrouter" &&
    !isLegacyZeroCostRoute(input.primary.providerId, input.primary.model);
  let keyStatus: OpenRouterKeyStatus | null = null;
  let primarySpendAuthorized = !primaryIsPaidOpenRouter;
  if (
    primaryIsPaidOpenRouter &&
    input.openRouter &&
    accounting.authorizedUsdMicros > 0
  ) {
    const quotaTimeout = openRouterQuotaTimeoutMilliseconds({
      deadline,
      now,
      hasAlternate: freeFallbackEligible,
    });
    if (quotaTimeout > 0) {
      keyStatus = await inspectOpenRouterKey(
        {
          apiKey: input.primary.apiKey,
          requestSignal: input.requestSignal,
          timeoutMs: quotaTimeout,
        },
        dependencies,
      );
      primarySpendAuthorized = preservesOpenRouterCreditFloor({
        status: keyStatus,
        creditFloorUsdMicros: input.openRouter.creditFloorUsdMicros,
        alreadyAuthorizedUsdMicros: 0,
        nextWorstCaseUsdMicros: accounting.authorizedUsdMicros,
      });
    }
  }
  const primary = primarySpendAuthorized
    ? await callAiProvider(
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
      )
    : {
        ok: false as const,
        reason: openRouterAuthorityFailureReason(keyStatus),
        providerId: input.primary.providerId,
        model: input.primary.model,
        attempts: 0,
        durationMs: 0,
      };
  let totalAttempts = primary.attempts;
  const primaryWorstCase = isLegacyZeroCostRoute(
    input.primary.providerId,
    input.primary.model,
  )
    ? 0
    : accounting.authorizedUsdMicros;
  accountProviderAttempt(
    accounting,
    primary,
    primaryWorstCase,
    !isLegacyZeroCostRoute(input.primary.providerId, input.primary.model),
  );
  if (
    primary.ok ||
    !FALLBACK_REASONS.has(primary.reason) ||
    !fallbackEligible ||
    remainingTimeout(deadline, now) < 2_000
  ) {
    return withSpendAccounting({
      result: { ...primary, attempts: totalAttempts },
      routeMode: "primary",
      fallbackAttempted: false,
      primaryFailureReason: primary.ok ? null : primary.reason,
      openRouterKeyStatus: keyStatus,
      decisionHash: null,
      candidateCount: input.openRouter ? 2 : 1,
    }, accounting, legacyAccountedCost(accounting));
  }

  const openRouter = input.openRouter;
  if (!openRouter) {
    return withSpendAccounting({
      result: { ...primary, attempts: totalAttempts },
      routeMode: "primary",
      fallbackAttempted: false,
      primaryFailureReason: primary.reason,
      openRouterKeyStatus: keyStatus,
      decisionHash: null,
      candidateCount: 1,
    }, accounting, legacyAccountedCost(accounting));
  }

  // Legacy bindings do not carry a model-specific worst-case estimate. Once
  // the primary made any egress attempt, the one reservation is ambiguous and
  // cannot safely authorize a second paid attempt. A zero-cost public fallback
  // remains an independent degradation lane.
  const mayAttemptPaidFallback =
    primary.attempts === 0 &&
    accounting.authorizedUsdMicros > 0 &&
    input.primary.providerId !== "openrouter" &&
    paidFallbackEligible;
  if (mayAttemptPaidFallback && remainingTimeout(deadline, now) >= 3_000) {
    const quotaTimeout = Math.max(
      1_000,
      Math.min(3_000, remainingTimeout(deadline, now) - MIN_PROVIDER_ATTEMPT_MS),
    );
    keyStatus = await inspectOpenRouterKey(
      {
        apiKey: openRouter.apiKey,
        requestSignal: input.requestSignal,
        timeoutMs: quotaTimeout,
      },
      dependencies,
    );
  }
  const paidCreditAvailable = mayAttemptPaidFallback &&
    preservesOpenRouterCreditFloor({
      status: keyStatus,
      creditFloorUsdMicros: openRouter.creditFloorUsdMicros,
      alreadyAuthorizedUsdMicros: 0,
      nextWorstCaseUsdMicros: accounting.authorizedUsdMicros,
    });

  let paidResult: AiProviderCallResult | null = null;
  if (
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
    totalAttempts += paidResult.attempts;
    accountProviderAttempt(
      accounting,
      paidResult,
      accounting.authorizedUsdMicros,
      true,
    );
    if (paidResult.ok || !canUseFreeOpenRouter(input)) {
      return withSpendAccounting({
        result: { ...paidResult, attempts: totalAttempts },
        routeMode: "openrouter_paid",
        fallbackAttempted: true,
        primaryFailureReason: primary.reason,
        openRouterKeyStatus: keyStatus,
        decisionHash: null,
        candidateCount: input.openRouter ? 2 : 1,
      }, accounting, legacyAccountedCost(accounting));
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
    totalAttempts += freeResult.attempts;
    accountProviderAttempt(accounting, freeResult, 0, false);
    return withSpendAccounting({
      result: { ...freeResult, attempts: totalAttempts },
      routeMode: "openrouter_free",
      fallbackAttempted: true,
      primaryFailureReason: primary.reason,
      openRouterKeyStatus: keyStatus,
      decisionHash: null,
      candidateCount: input.openRouter ? 3 : 2,
    }, accounting, legacyAccountedCost(accounting));
  }

  return withSpendAccounting({
    result: { ...(paidResult ?? primary), attempts: totalAttempts },
    routeMode: paidResult ? "openrouter_paid" : "primary",
    fallbackAttempted: Boolean(paidResult),
    primaryFailureReason: primary.reason,
    openRouterKeyStatus: keyStatus,
    decisionHash: null,
    candidateCount: input.openRouter ? 2 : 1,
  }, accounting, legacyAccountedCost(accounting));
}

async function callPlannedProviderRoute(
  input: AiProviderFailoverInput,
  dependencies: AiProviderRouterDependencies,
): Promise<AiRoutedProviderResult> {
  const accounting = createSpendAccounting(input);
  const now = dependencies.now ?? Date.now;
  const totalTimeoutMs = Math.max(
    2_000,
    Math.min(30_000, Math.trunc(input.timeoutMs ?? 12_000)),
  );
  const deadline = now() + totalTimeoutMs;
  const configuredCandidates = input.routeCandidates ?? [];
  // Provider readiness is static policy input. OpenRouter credit is checked
  // lazily only if execution actually reaches an eligible paid OpenRouter lane.
  const candidates = configuredCandidates.map((candidate) => ({
    ...candidate,
    health: candidate.apiKey ? candidate.health : "unavailable" as const,
  }));
  const runtimeByPolicyCandidate = new Map<
    AiEnterpriseRouteCandidate,
    (typeof candidates)[number]
  >(candidates.map((candidate) => [candidate, candidate]));
  const decision = planEnterpriseAiRoute({
    agentId: input.agentId,
    dataClass: input.dataClass,
    criticality: input.criticality,
    externalEffect: input.externalEffect,
    approvalSatisfied: input.approvalSatisfied ?? !input.externalEffect,
    requiredCapabilities: input.requiredCapabilities,
    maxRequestCostUsdMicros: accounting.authorizedUsdMicros,
    monthlyBudgetRemainingUsdMicros: accounting.authorizedUsdMicros,
    candidates,
  });
  if (decision.status === "blocked") {
    return withSpendAccounting({
      result: {
        ok: false,
        reason: "provider_disabled",
        providerId: input.primary.providerId,
        attempts: 0,
        durationMs: 0,
      },
      routeMode: "blocked",
      fallbackAttempted: false,
      primaryFailureReason: null,
      openRouterKeyStatus: null,
      decisionHash: decision.decisionHash,
      candidateCount: candidates.length,
    }, accounting);
  }

  let firstFailure: AiProviderFailureReason | null = null;
  let lastResult: AiProviderCallResult | null = null;
  let lastCandidate = decision.selected;
  let totalAttempts = 0;
  let openRouterKeyStatus: OpenRouterKeyStatus | null = null;
  let openRouterInspectionPerformed = false;
  let openRouterConsumedAuthorizationUsdMicros = 0;
  for (const [index, candidate] of decision.eligible.entries()) {
    const runtime = runtimeByPolicyCandidate.get(candidate);
    if (!runtime?.apiKey || remainingTimeout(deadline, now) < MIN_PROVIDER_ATTEMPT_MS) {
      continue;
    }
    const worstCaseUsdMicros = paidWorstCase(candidate);
    const remainingAuthorizedUsdMicros = Math.max(
      0,
      accounting.authorizedUsdMicros - accounting.consumedAuthorizationUsdMicros,
    );
    if (
      !candidate.free &&
      (!Number.isSafeInteger(worstCaseUsdMicros) ||
        worstCaseUsdMicros <= 0 ||
        worstCaseUsdMicros > remainingAuthorizedUsdMicros)
    ) {
      continue;
    }

    if (candidate.providerId === "openrouter" && !candidate.free) {
      const creditFloorUsdMicros = input.openRouter?.creditFloorUsdMicros;
      if (
        typeof creditFloorUsdMicros !== "number" ||
        !Number.isSafeInteger(creditFloorUsdMicros) ||
        creditFloorUsdMicros < 0
      ) {
        continue;
      }
      if (!openRouterInspectionPerformed) {
        const quotaTimeout = openRouterQuotaTimeoutMilliseconds({
          deadline,
          now,
          hasAlternate: index + 1 < decision.eligible.length,
        });
        if (quotaTimeout <= 0) continue;
        openRouterInspectionPerformed = true;
        openRouterKeyStatus = await inspectOpenRouterKey(
          {
            apiKey: runtime.apiKey,
            requestSignal: input.requestSignal,
            timeoutMs: quotaTimeout,
          },
          dependencies,
        );
      }
      if (!preservesOpenRouterCreditFloor({
        status: openRouterKeyStatus,
        creditFloorUsdMicros,
        alreadyAuthorizedUsdMicros: openRouterConsumedAuthorizationUsdMicros,
        nextWorstCaseUsdMicros: worstCaseUsdMicros,
      })) {
        continue;
      }
    }

    const attemptTimeoutMs = candidateTimeoutMilliseconds({
      deadline,
      now,
      candidate,
      alternateCount: decision.eligible.length - index - 1,
    });
    if (attemptTimeoutMs < MIN_PROVIDER_ATTEMPT_MS) continue;
    const result = await callAiProvider(
      {
        providerId: candidate.providerId,
        agentId: input.agentId,
        apiKey: runtime.apiKey,
        model: candidate.model,
        instructions: input.instructions,
        input: input.input,
        requestSignal: input.requestSignal,
        timeoutMs: attemptTimeoutMs,
        maxOutputTokens: input.maxOutputTokens,
        circuitScope: `${input.circuitScope?.trim().slice(0, 180) || "default"}:route-${index + 1}`,
        toolsEnabled: input.toolsEnabled,
        dataClass: input.dataClass,
        requireZeroDataRetention: true,
      },
      dependencies,
    );
    lastResult = result;
    lastCandidate = candidate;
    totalAttempts += result.attempts;
    accountProviderAttempt(accounting, result, worstCaseUsdMicros, !candidate.free);
    if (
      candidate.providerId === "openrouter" &&
      !candidate.free &&
      result.attempts > 0
    ) {
      openRouterConsumedAuthorizationUsdMicros = addUsdMicros(
        openRouterConsumedAuthorizationUsdMicros,
        worstCaseUsdMicros,
      );
    }
    if (result.ok || !FALLBACK_REASONS.has(result.reason)) {
      return plannedResult(
        input,
        { ...result, attempts: totalAttempts },
        candidate,
        index,
        firstFailure,
        decision,
        openRouterKeyStatus,
        accounting,
      );
    }
    firstFailure ??= result.reason;
  }

  if (!lastResult) {
    return withSpendAccounting({
      result: {
        ok: false,
        reason: "provider_disabled",
        providerId: decision.selected.providerId,
        model: decision.selected.model,
        attempts: 0,
        durationMs: 0,
      },
      routeMode: "blocked",
      fallbackAttempted: false,
      primaryFailureReason: null,
      openRouterKeyStatus,
      decisionHash: decision.decisionHash,
      candidateCount: decision.eligible.length + decision.rejected.length,
    }, accounting);
  }

  const result = lastResult ?? {
    ok: false as const,
    reason: "provider_disabled" as const,
    providerId: input.primary.providerId,
    attempts: 0,
    durationMs: 0,
  };
  return plannedResult(
    input,
    { ...result, attempts: totalAttempts },
    lastCandidate,
    Math.max(0, decision.eligible.indexOf(lastCandidate)),
    firstFailure,
    decision,
    openRouterKeyStatus,
    accounting,
  );
}

function plannedResult(
  input: AiProviderFailoverInput,
  result: AiProviderCallResult,
  candidate: AiEnterpriseRouteCandidate,
  index: number,
  firstFailure: AiProviderFailureReason | null,
  decision: Extract<ReturnType<typeof planEnterpriseAiRoute>, { status: "selected" }>,
  openRouterKeyStatus: OpenRouterKeyStatus | null,
  accounting: MutableSpendAccounting,
): AiRoutedProviderResult {
  const routeMode: AiProviderRouteMode = candidate.free
    ? "openrouter_free"
    : candidate.providerId === input.primary.providerId &&
        candidate.model === input.primary.model && index === 0
      ? "primary"
      : candidate.providerId === "openrouter"
        ? "openrouter_paid"
        : "alternate";
  return withSpendAccounting({
    result,
    routeMode,
    fallbackAttempted: index > 0,
    primaryFailureReason: firstFailure,
    openRouterKeyStatus,
    decisionHash: decision.decisionHash,
    candidateCount: decision.eligible.length + decision.rejected.length,
  }, accounting);
}
