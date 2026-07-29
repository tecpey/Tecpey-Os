export const AI_MENTOR_PROVIDER_POLICY_VERSION = "2026-07-20.1";

export type MentorProviderFailureReason =
  | "provider_disabled"
  | "circuit_open"
  | "timeout"
  | "network_error"
  | "provider_rejected"
  | "invalid_response"
  | "response_too_large";

export type MentorProviderResult =
  | {
      ok: true;
      answer: string;
      model: string;
      estimatedOutputTokens: number;
      attempts: number;
      durationMs: number;
    }
  | {
      ok: false;
      reason: MentorProviderFailureReason;
      status?: number;
      model?: string;
      attempts: number;
      durationMs: number;
    };

export type MentorProviderInput = {
  apiKey: string;
  primaryModel: string;
  fallbackModel: string;
  instructions: string;
  input: string;
  requestSignal?: AbortSignal;
  timeoutMs?: number;
  maxOutputTokens?: number;
};

export type MentorProviderDependencies = {
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type CircuitState = {
  failures: number;
  openUntil: number;
};

const circuit: CircuitState = { failures: 0, openUntil: 0 };
const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 60_000;
const MAX_RESPONSE_CHARS = 64_000;

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function resetMentorProviderCircuit(): void {
  circuit.failures = 0;
  circuit.openUntil = 0;
}

export function getMentorProviderCircuitState(now = Date.now()): {
  open: boolean;
  failures: number;
  retryAfterMs: number;
} {
  return {
    open: circuit.openUntil > now,
    failures: circuit.failures,
    retryAfterMs: Math.max(0, circuit.openUntil - now),
  };
}

function recordFailure(now: number): void {
  circuit.failures += 1;
  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.openUntil = now + CIRCUIT_OPEN_MS;
  }
}

function recordSuccess(): void {
  circuit.failures = 0;
  circuit.openUntil = 0;
}

function extractResponseText(data: unknown): string {
  const root = data as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{ text?: unknown; value?: unknown }>;
    }>;
  };
  if (typeof root?.output_text === "string") return root.output_text.trim();
  const parts = root?.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => {
      if (typeof content.text === "string") return content.text;
      if (typeof content.value === "string") return content.value;
      return "";
    })
    .filter(Boolean);
  return parts?.join("\n").trim() ?? "";
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 3.2));
}

async function fetchWithDeadline(
  fetchImpl: typeof fetch,
  input: MentorProviderInput,
  model: string,
  deadline: number,
  now: () => number,
): Promise<
  | { ok: true; response: Response }
  | { ok: false; reason: "timeout" | "network_error" }
> {
  const remaining = deadline - now();
  if (remaining <= 0) return { ok: false, reason: "timeout" };

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("AI mentor provider timeout", "TimeoutError")),
    remaining,
  );
  timeout.unref?.();
  const forwardAbort = () => controller.abort(input.requestSignal?.reason);
  if (input.requestSignal) {
    if (input.requestSignal.aborted) forwardAbort();
    else input.requestSignal.addEventListener("abort", forwardAbort, { once: true });
  }

  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions: input.instructions,
        input: input.input,
        temperature: 0.2,
        max_output_tokens: boundedInteger(input.maxOutputTokens, 800, 128, 1200),
      }),
      signal: controller.signal,
    });
    return { ok: true, response };
  } catch (error) {
    const aborted = controller.signal.aborted ||
      (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name));
    return { ok: false, reason: aborted ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timeout);
    input.requestSignal?.removeEventListener("abort", forwardAbort);
  }
}

async function parseProviderResponse(
  response: Response,
): Promise<
  | { ok: true; answer: string }
  | { ok: false; reason: "invalid_response" | "response_too_large" }
> {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARS) {
    return { ok: false, reason: "response_too_large" };
  }
  try {
    const answer = extractResponseText(JSON.parse(text) as unknown);
    return answer
      ? { ok: true, answer }
      : { ok: false, reason: "invalid_response" };
  } catch {
    return { ok: false, reason: "invalid_response" };
  }
}

/**
 * Calls the external model under one total wall-clock budget. A fallback model
 * is attempted at most once and only for provider model/retryable failures;
 * timeouts and network failures are never multiplied by an unbounded retry.
 */
export async function callMentorProvider(
  input: MentorProviderInput,
  dependencies: MentorProviderDependencies = {},
): Promise<MentorProviderResult> {
  const now = dependencies.now ?? Date.now;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const startedAt = now();
  const timeoutMs = boundedInteger(input.timeoutMs, 9_000, 2_000, 15_000);
  const deadline = startedAt + timeoutMs;

  if (!input.apiKey.trim()) {
    return {
      ok: false,
      reason: "provider_disabled",
      attempts: 0,
      durationMs: now() - startedAt,
    };
  }
  if (circuit.openUntil > startedAt) {
    return {
      ok: false,
      reason: "circuit_open",
      attempts: 0,
      durationMs: now() - startedAt,
    };
  }

  const models = input.primaryModel === input.fallbackModel
    ? [input.primaryModel]
    : [input.primaryModel, input.fallbackModel];
  let attempts = 0;
  let lastStatus: number | undefined;
  let lastModel: string | undefined;

  for (const model of models) {
    lastModel = model;
    attempts += 1;
    const called = await fetchWithDeadline(fetchImpl, input, model, deadline, now);
    if (!called.ok) {
      recordFailure(now());
      return {
        ok: false,
        reason: called.reason,
        model,
        attempts,
        durationMs: now() - startedAt,
      };
    }

    lastStatus = called.response.status;
    if (!called.response.ok) {
      const retryableModelFailure =
        attempts === 1 &&
        models.length > 1 &&
        [400, 404, 408, 409, 429, 500, 502, 503, 504].includes(called.response.status) &&
        deadline - now() >= 1_000;
      if (retryableModelFailure) continue;
      recordFailure(now());
      return {
        ok: false,
        reason: "provider_rejected",
        status: called.response.status,
        model,
        attempts,
        durationMs: now() - startedAt,
      };
    }

    const parsed = await parseProviderResponse(called.response);
    if (!parsed.ok) {
      recordFailure(now());
      return {
        ok: false,
        reason: parsed.reason,
        status: called.response.status,
        model,
        attempts,
        durationMs: now() - startedAt,
      };
    }

    recordSuccess();
    return {
      ok: true,
      answer: parsed.answer,
      model,
      estimatedOutputTokens: estimateTokens(parsed.answer),
      attempts,
      durationMs: now() - startedAt,
    };
  }

  recordFailure(now());
  return {
    ok: false,
    reason: "provider_rejected",
    status: lastStatus,
    model: lastModel,
    attempts,
    durationMs: now() - startedAt,
  };
}
