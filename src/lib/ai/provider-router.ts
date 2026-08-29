import {
  aiToolsForAgent,
  assertAiAgentProviderAllowed,
  type AiAgentId,
  type AiDataClass,
  type AiModelProviderId,
} from "./control-plane-catalog";
import { readBoundedResponseText } from "../bounded-http-body";

export type AiSourceReference = {
  url: string;
  title: string | null;
};

export type AiProviderFailureReason =
  | "provider_disabled"
  | "circuit_open"
  | "cancelled"
  | "timeout"
  | "network_error"
  | "quota_exhausted"
  | "rate_limited"
  | "provider_rejected"
  | "invalid_response"
  | "response_too_large";

export type AiProviderCallResult =
  | {
      ok: true;
      text: string;
      providerId: AiModelProviderId;
      model: string;
      requestedModel: string;
      sources: AiSourceReference[];
      inputTokens: number;
      outputTokens: number;
      costUsdMicros: number | null;
      attempts: number;
      durationMs: number;
    }
  | {
      ok: false;
      reason: AiProviderFailureReason;
      providerId: AiModelProviderId;
      model?: string;
      status?: number;
      attempts: number;
      durationMs: number;
    };

export type AiProviderCallInput = {
  providerId: AiModelProviderId;
  agentId: AiAgentId;
  apiKey: string;
  model: string;
  fallbackModel?: string | null;
  instructions: string;
  input: string;
  requestSignal?: AbortSignal;
  timeoutMs?: number;
  maxOutputTokens?: number;
  /** Trusted server scope used to keep availability failures tenant/workspace isolated. */
  circuitScope?: string;
  /** Internal connectivity checks may suppress tools; runtime agents cannot add tools beyond the catalog. */
  toolsEnabled?: boolean;
  /** Trusted classification. OpenRouter free routing is enforced outside this low-level adapter. */
  dataClass?: AiDataClass;
  /** OpenRouter requests default to the strictest provider privacy filters. */
  requireZeroDataRetention?: boolean;
};

export type AiProviderRouterDependencies = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
};

type CircuitState = { failures: number; openUntil: number };
const circuits = new Map<string, CircuitState>();
const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 60_000;
const MAX_RESPONSE_BYTES = 256_000;
const MAX_CONNECTOR_RESPONSE_BYTES = 32_768;
const AI_RESPONSE_TOO_LARGE = "ai_provider_response_too_large";
const OPENROUTER_FREE_MAX_ATTEMPTS = 3;
const OPENROUTER_FREE_RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);
const RETRY_BACKOFF_BASE_MS = 250;
const RETRY_BACKOFF_MAX_MS = 4_000;
const RETRY_COMPLETION_RESERVE_MS = 1_000;

type AiProviderAbortReason = "cancelled" | "timeout";

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function circuitKey(input: Pick<AiProviderCallInput, "providerId" | "circuitScope">): string {
  const scope = input.circuitScope?.trim().slice(0, 256) || "default";
  return `${input.providerId}:${scope}`;
}

function circuit(key: string): CircuitState {
  const current = circuits.get(key) ?? { failures: 0, openUntil: 0 };
  circuits.set(key, current);
  return current;
}

export function resetAiProviderCircuits(): void {
  circuits.clear();
}

function recordFailure(key: string, now: number): void {
  const current = circuit(key);
  current.failures += 1;
  if (current.failures >= FAILURE_THRESHOLD) current.openUntil = now + CIRCUIT_OPEN_MS;
}

function recordSuccess(key: string): void {
  circuits.set(key, { failures: 0, openUntil: 0 });
}

function isOpenRouterFreeRoute(input: AiProviderCallInput, model: string): boolean {
  return input.providerId === "openrouter" && model.trim().toLowerCase() === "openrouter/free";
}

function retryAfterMilliseconds(response: Response, now: number): number | null {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function retryDelayMilliseconds(input: {
  retryIndex: number;
  response?: Response;
  now: number;
  random: () => number;
}): number {
  const exponential = Math.min(
    RETRY_BACKOFF_MAX_MS,
    RETRY_BACKOFF_BASE_MS * 2 ** input.retryIndex,
  );
  const jitter = Math.floor(Math.max(0, Math.min(1, input.random())) * RETRY_BACKOFF_BASE_MS);
  const providerDelay = input.response
    ? retryAfterMilliseconds(input.response, input.now)
    : null;
  return Math.max(exponential + jitter, providerDelay ?? 0);
}

async function sleepWithSignal(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return;
  if (signal?.aborted) throw signal.reason ?? new DOMException("Request aborted", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timeout);
      reject(signal?.reason ?? new DOMException("Request aborted", "AbortError"));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

const SENSITIVE_SOURCE_QUERY_KEY = /(?:api[_-]?key|access[_-]?token|token|secret|password|passphrase|authorization|auth|credential|signature|session|code)/i;
const SIGNED_SOURCE_QUERY_KEY = /^(?:sig|awsaccesskeyid|googleaccessid|key-pair-id|policy)$/i;
const AZURE_SAS_QUERY_KEY = /^(?:sig|sv|ss|srt|sp|se|st|spr|sip|sr|si|skoid|sktid|skt|ske|sks|skv|ses|rscc|rscd|rsce|rscl|rsct)$/i;

function sensitiveSourceQueryKey(
  value: string,
  context: { azureSas: boolean; signedExpiry: boolean },
): boolean {
  return SENSITIVE_SOURCE_QUERY_KEY.test(value) ||
    SIGNED_SOURCE_QUERY_KEY.test(value) ||
    /^x-(?:amz|goog)-/i.test(value) ||
    (context.azureSas && AZURE_SAS_QUERY_KEY.test(value)) ||
    (context.signedExpiry && /^expires$/i.test(value));
}

export function safeAiSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4_096) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    const queryKeys = [...url.searchParams.keys()];
    const queryContext = {
      azureSas: queryKeys.some((key) => /^sig$/i.test(key)),
      signedExpiry: queryKeys.some((key) => /^(?:signature|policy|key-pair-id)$/i.test(key)),
    };
    for (const key of queryKeys) {
      if (sensitiveSourceQueryKey(key, queryContext)) url.searchParams.delete(key);
    }
    const normalized = url.toString();
    return normalized.length <= 2_048 ? normalized : null;
  } catch {
    return null;
  }
}

function collectSources(value: unknown): AiSourceReference[] {
  const sources = new Map<string, AiSourceReference>();
  const seen = new Set<unknown>();
  const walk = (candidate: unknown, depth: number, citationContext = false): void => {
    if (depth > 8 || sources.size >= 12 || candidate === null || candidate === undefined) return;
    // Some providers return citations as arrays of URL strings. A URL in an
    // arbitrary output/echo field is not citation evidence.
    const directUrl = citationContext ? safeAiSourceUrl(candidate) : null;
    if (directUrl) {
      if (!sources.has(directUrl)) sources.set(directUrl, { url: directUrl, title: null });
      return;
    }
    if (typeof candidate !== "object") return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      for (const item of candidate) walk(item, depth + 1, citationContext);
      return;
    }
    const object = candidate as Record<string, unknown>;
    const objectUrl = citationContext ? safeAiSourceUrl(object.url) : null;
    if (objectUrl) {
      const title = typeof object.title === "string" && object.title.trim()
        ? object.title.trim().slice(0, 300)
        : null;
      sources.set(objectUrl, { url: objectUrl, title });
    }
    for (const [key, nested] of Object.entries(object)) {
      const nestedCitationContext = citationContext ||
        /^(?:citations?|sources?|references?|annotations?)$/i.test(key);
      walk(nested, depth + 1, nestedCitationContext);
    }
  };
  walk(value, 0);
  return [...sources.values()];
}

function extractOpenResponsesText(value: unknown): string {
  const root = value as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown; value?: unknown }> }>;
  };
  if (typeof root?.output_text === "string") return root.output_text.trim();
  return root?.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => typeof content.text === "string"
      ? content.text
      : typeof content.value === "string" ? content.value : "")
    .filter(Boolean)
    .join("\n")
    .trim() ?? "";
}

function extractAnthropicText(value: unknown): string {
  const root = value as { content?: Array<{ type?: unknown; text?: unknown }> };
  return root?.content
    ?.filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => String(item.text))
    .join("\n")
    .trim() ?? "";
}

function extractOpenRouterText(value: unknown): string {
  const root = value as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = root?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function usage(value: unknown, providerId: AiModelProviderId, text: string, input: string) {
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
    root?.usage?.input_tokens ??
      root?.usage?.inputTokens ??
      root?.usage?.prompt_tokens,
  );
  const outputTokens = Number(
    root?.usage?.output_tokens ??
      root?.usage?.outputTokens ??
      root?.usage?.completion_tokens,
  );
  const costUsd = Number(root?.usage?.cost);
  return {
    inputTokens: Number.isFinite(inputTokens) ? Math.max(0, Math.trunc(inputTokens)) : Math.ceil(input.length / 3.2),
    outputTokens: Number.isFinite(outputTokens) ? Math.max(0, Math.trunc(outputTokens)) : Math.ceil(text.length / 3.2),
    costUsdMicros:
      Number.isFinite(costUsd) && costUsd >= 0
        ? Math.max(0, Math.round(costUsd * 1_000_000))
        : null,
    providerId,
  };
}

function responseTools(providerId: AiModelProviderId, agentId: AiAgentId): unknown[] {
  const tools = aiToolsForAgent(agentId, providerId);
  if (providerId === "anthropic") {
    return tools.includes("web_search")
      ? [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]
      : [];
  }
  if (providerId === "openrouter") {
    return tools.includes("web_search")
      ? [{ type: "openrouter:web_search" }]
      : [];
  }
  return tools.map((tool) => ({ type: tool }));
}

function requestForProvider(input: AiProviderCallInput, model: string): {
  url: string;
  init: RequestInit;
} {
  const maxOutputTokens = boundedInteger(input.maxOutputTokens, 1_200, 64, 100_000);
  const tools = input.toolsEnabled === false || isOpenRouterFreeRoute(input, model)
    ? []
    : responseTools(input.providerId, input.agentId);
  if (input.providerId === "openrouter") {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${input.apiKey}`,
          "HTTP-Referer": "https://tecpey.ir",
          "X-OpenRouter-Title": "TecPey AI Control Plane",
          "X-OpenRouter-Metadata": "enabled",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: input.instructions },
            { role: "user", content: input.input },
          ],
          max_tokens: maxOutputTokens,
          provider: {
            zdr: input.requireZeroDataRetention !== false,
            data_collection: "deny",
          },
          ...(tools.length ? { tools } : {}),
        }),
      },
    };
  }
  if (input.providerId === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "X-Api-Key": input.apiKey,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxOutputTokens,
          system: input.instructions,
          messages: [{ role: "user", content: input.input }],
          ...(tools.length ? { tools } : {}),
        }),
      },
    };
  }

  const url = input.providerId === "openai"
    ? "https://api.openai.com/v1/responses"
    : input.providerId === "xai"
      ? "https://api.x.ai/v1/responses"
      : "https://api.perplexity.ai/v1/agent";
  return {
    url,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions: input.instructions,
        input: input.input,
        store: false,
        max_output_tokens: maxOutputTokens,
        ...(tools.length ? { tools } : {}),
      }),
    },
  };
}

async function fetchWithDeadline(
  fetchImpl: typeof fetch,
  input: AiProviderCallInput,
  model: string,
  deadline: number,
  now: () => number,
): Promise<
  | {
      ok: true;
      response: Response;
      signal: AbortSignal;
      abortReason: () => AiProviderAbortReason | null;
      dispose: () => void;
    }
  | { ok: false; reason: AiProviderAbortReason | "network_error" }
> {
  const remaining = deadline - now();
  if (remaining <= 0) return { ok: false, reason: "timeout" };
  const controller = new AbortController();
  let terminalAbortReason: AiProviderAbortReason | null = null;
  const abort = (reason: AiProviderAbortReason, cause?: unknown) => {
    if (terminalAbortReason) return;
    terminalAbortReason = reason;
    controller.abort(
      cause ?? new DOMException(
        reason === "cancelled" ? "AI provider request cancelled" : "AI provider timeout",
        reason === "cancelled" ? "AbortError" : "TimeoutError",
      ),
    );
  };
  const timeout = setTimeout(
    () => abort("timeout"),
    remaining,
  );
  timeout.unref?.();
  const forwardAbort = () => abort("cancelled", input.requestSignal?.reason);
  if (input.requestSignal) {
    if (input.requestSignal.aborted) forwardAbort();
    else input.requestSignal.addEventListener("abort", forwardAbort, { once: true });
  }
  const dispose = () => {
    clearTimeout(timeout);
    input.requestSignal?.removeEventListener("abort", forwardAbort);
  };
  try {
    const request = requestForProvider(input, model);
    const response = await fetchImpl(request.url, { ...request.init, signal: controller.signal });
    return {
      ok: true,
      response,
      signal: controller.signal,
      abortReason: () => terminalAbortReason,
      dispose,
    };
  } catch {
    dispose();
    return {
      ok: false,
      reason: terminalAbortReason ?? "network_error",
    };
  }
}

class AiProviderBodyAbortError extends Error {
  constructor() {
    super("ai_provider_body_aborted");
    this.name = "AiProviderBodyAbortError";
  }
}

async function readBoundedProviderResponseText(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(AI_RESPONSE_TOO_LARGE);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let abortObserved = signal.aborted;
  let cancelRequested = false;
  const cancelReader = () => {
    abortObserved = true;
    if (cancelRequested) return;
    cancelRequested = true;
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  const onAbort = () => cancelReader();
  if (signal.aborted) cancelReader();
  else signal.addEventListener("abort", onAbort, { once: true });

  try {
    if (abortObserved) {
      throw new AiProviderBodyAbortError();
    }
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (signal.aborted || abortObserved) throw new AiProviderBodyAbortError();
        throw error;
      }
      if (signal.aborted || abortObserved) throw new AiProviderBodyAbortError();
      if (chunk.done) break;
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > MAX_RESPONSE_BYTES) {
        void reader.cancel(AI_RESPONSE_TOO_LARGE).catch(() => undefined);
        throw new Error(AI_RESPONSE_TOO_LARGE);
      }
      chunks.push(chunk.value);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    if (signal.aborted || abortObserved) {
      cancelReader();
    }
    reader.releaseLock();
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function parseResponse(
  response: Response,
  input: AiProviderCallInput,
  activeModel: string,
  signal: AbortSignal,
  abortReason: () => AiProviderAbortReason | null,
): Promise<
  | {
      ok: true;
      text: string;
      model: string;
      sources: AiSourceReference[];
      inputTokens: number;
      outputTokens: number;
      costUsdMicros: number | null;
    }
  | {
      ok: false;
      reason: "cancelled" | "timeout" | "invalid_response" | "response_too_large";
    }
> {
  let raw: string;
  try {
    raw = await readBoundedProviderResponseText(response, signal);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof AiProviderBodyAbortError || signal.aborted
        ? abortReason() ?? "timeout"
        : error instanceof Error && error.message === AI_RESPONSE_TOO_LARGE
          ? "response_too_large"
          : "invalid_response",
    };
  }
  if (signal.aborted) return { ok: false, reason: abortReason() ?? "timeout" };
  try {
    const data = JSON.parse(raw) as unknown;
    const text =
      input.providerId === "anthropic"
        ? extractAnthropicText(data)
        : input.providerId === "openrouter"
          ? extractOpenRouterText(data)
          : extractOpenResponsesText(data);
    if (!text) return { ok: false, reason: "invalid_response" };
    const tokenUsage = usage(data, input.providerId, text, input.input);
    const responseModel = (data as { model?: unknown })?.model;
    return {
      ok: true,
      text,
      sources: collectSources(data),
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      costUsdMicros: tokenUsage.costUsdMicros,
      model:
        typeof responseModel === "string" && responseModel.trim()
          ? responseModel.trim().slice(0, 160)
          : activeModel,
    };
  } catch {
    return { ok: false, reason: "invalid_response" };
  }
}

function statusAdvancesCircuit(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function failureAdvancesCircuit(reason: AiProviderFailureReason): boolean {
  return reason === "timeout" || reason === "network_error";
}

async function cancelUnconsumedResponse(response: Response): Promise<void> {
  if (!response.body || response.bodyUsed) return;
  try {
    await response.body.cancel();
  } catch {
    // The response is already terminal; cancellation is best-effort cleanup.
  }
}

export async function callAiProvider(
  input: AiProviderCallInput,
  dependencies: AiProviderRouterDependencies = {},
): Promise<AiProviderCallResult> {
  assertAiAgentProviderAllowed(input.agentId, input.providerId);
  const now = dependencies.now ?? Date.now;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const random = dependencies.random ?? Math.random;
  const sleep = dependencies.sleep ?? sleepWithSignal;
  const startedAt = now();
  const timeoutMs = boundedInteger(input.timeoutMs, 12_000, 2_000, 30_000);
  const deadline = startedAt + timeoutMs;
  const scopedCircuitKey = circuitKey(input);
  if (!input.apiKey.trim()) {
    return { ok: false, reason: "provider_disabled", providerId: input.providerId, attempts: 0, durationMs: 0 };
  }
  if (input.requestSignal?.aborted) {
    return { ok: false, reason: "cancelled", providerId: input.providerId, attempts: 0, durationMs: 0 };
  }
  if (circuit(scopedCircuitKey).openUntil > startedAt) {
    return { ok: false, reason: "circuit_open", providerId: input.providerId, attempts: 0, durationMs: 0 };
  }

  const fallback = input.fallbackModel?.trim();
  const models = fallback && fallback !== input.model ? [input.model, fallback] : [input.model];
  let attempts = 0;
  let lastStatus: number | undefined;
  let lastModel: string | undefined;
  for (const model of models) {
    lastModel = model;
    const maxModelAttempts = isOpenRouterFreeRoute(input, model)
      ? OPENROUTER_FREE_MAX_ATTEMPTS
      : 1;
    for (let retryIndex = 0; retryIndex < maxModelAttempts; retryIndex += 1) {
      attempts += 1;
      const called = await fetchWithDeadline(fetchImpl, input, model, deadline, now);
      if (!called.ok) {
        const retryable = isOpenRouterFreeRoute(input, model) &&
          called.reason === "network_error" &&
          retryIndex + 1 < maxModelAttempts;
        if (retryable) {
          const delay = retryDelayMilliseconds({ retryIndex, now: now(), random });
          if (deadline - now() >= delay + RETRY_COMPLETION_RESERVE_MS) {
            try {
              await sleep(delay, input.requestSignal);
              continue;
            } catch {
              const reason = input.requestSignal?.aborted ? "cancelled" : "timeout";
              return {
                ok: false,
                reason,
                providerId: input.providerId,
                model,
                attempts,
                durationMs: now() - startedAt,
              };
            }
          }
        }
        if (failureAdvancesCircuit(called.reason)) recordFailure(scopedCircuitKey, now());
        return {
          ok: false,
          reason: called.reason,
          providerId: input.providerId,
          model,
          attempts,
          durationMs: now() - startedAt,
        };
      }
      lastStatus = called.response.status;
      if (!called.response.ok) {
        called.dispose();
        await cancelUnconsumedResponse(called.response);
        const freeRouteRetry = isOpenRouterFreeRoute(input, model) &&
          OPENROUTER_FREE_RETRYABLE_STATUSES.has(called.response.status) &&
          retryIndex + 1 < maxModelAttempts;
        if (freeRouteRetry) {
          const delay = retryDelayMilliseconds({
            retryIndex,
            response: called.response,
            now: now(),
            random,
          });
          if (deadline - now() >= delay + RETRY_COMPLETION_RESERVE_MS) {
            try {
              await sleep(delay, input.requestSignal);
              continue;
            } catch {
              const reason = input.requestSignal?.aborted ? "cancelled" : "timeout";
              return {
                ok: false,
                reason,
                providerId: input.providerId,
                status: called.response.status,
                model,
                attempts,
                durationMs: now() - startedAt,
              };
            }
          }
        }
        const fallbackRetry = retryIndex + 1 === maxModelAttempts &&
          models.length > 1 && model !== models.at(-1) &&
          [400, 404, 408, 409, 429, 500, 502, 503, 504].includes(called.response.status) &&
          deadline - now() >= 1_000;
        if (fallbackRetry) break;
        if (statusAdvancesCircuit(called.response.status)) {
          recordFailure(scopedCircuitKey, now());
        }
        const failureReason =
          called.response.status === 402
            ? "quota_exhausted"
            : called.response.status === 429
              ? "rate_limited"
              : "provider_rejected";
        return {
          ok: false,
          reason: failureReason,
          providerId: input.providerId,
          status: called.response.status,
          model,
          attempts,
          durationMs: now() - startedAt,
        };
      }
      let parsed: Awaited<ReturnType<typeof parseResponse>>;
      try {
        parsed = await parseResponse(
          called.response,
          input,
          model,
          called.signal,
          called.abortReason,
        );
      } finally {
        called.dispose();
      }
      if (!parsed.ok) {
        const retryable = isOpenRouterFreeRoute(input, model) &&
          parsed.reason === "invalid_response" &&
          retryIndex + 1 < maxModelAttempts;
        if (retryable) {
          const delay = retryDelayMilliseconds({ retryIndex, now: now(), random });
          if (deadline - now() >= delay + RETRY_COMPLETION_RESERVE_MS) {
            try {
              await sleep(delay, input.requestSignal);
              continue;
            } catch {
              const reason = input.requestSignal?.aborted ? "cancelled" : "timeout";
              return {
                ok: false,
                reason,
                providerId: input.providerId,
                status: called.response.status,
                model,
                attempts,
                durationMs: now() - startedAt,
              };
            }
          }
        }
        if (failureAdvancesCircuit(parsed.reason)) recordFailure(scopedCircuitKey, now());
        return {
          ok: false,
          reason: parsed.reason,
          providerId: input.providerId,
          status: called.response.status,
          model,
          attempts,
          durationMs: now() - startedAt,
        };
      }
      recordSuccess(scopedCircuitKey);
      return {
        ok: true,
        text: parsed.text,
        providerId: input.providerId,
        model: parsed.model,
        requestedModel: model,
        sources: parsed.sources,
        inputTokens: parsed.inputTokens,
        outputTokens: parsed.outputTokens,
        costUsdMicros: parsed.costUsdMicros,
        attempts,
        durationMs: now() - startedAt,
      };
    }
  }

  if (lastStatus !== undefined && statusAdvancesCircuit(lastStatus)) {
    recordFailure(scopedCircuitKey, now());
  }
  return {
    ok: false,
    reason: "provider_rejected",
    providerId: input.providerId,
    status: lastStatus,
    model: lastModel,
    attempts,
    durationMs: now() - startedAt,
  };
}

export type OpenRouterKeyStatus =
  | {
      ok: true;
      limitUsdMicros: number | null;
      limitRemainingUsdMicros: number | null;
      usageMonthlyUsdMicros: number;
      isFreeTier: boolean;
      checkedAt: string;
    }
  | {
      ok: false;
      reason: "provider_disabled" | "timeout" | "network_error" | "provider_rejected" | "invalid_response";
      status?: number;
    };

function usdMicros(value: unknown, nullable = false): number | null {
  if (nullable && value === null) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return nullable ? null : 0;
  return Math.max(0, Math.min(1_000_000_000_000, Math.round(amount * 1_000_000)));
}

export async function inspectOpenRouterKey(
  input: {
    apiKey: string;
    requestSignal?: AbortSignal;
    timeoutMs?: number;
  },
  dependencies: AiProviderRouterDependencies = {},
): Promise<OpenRouterKeyStatus> {
  if (!input.apiKey.trim()) return { ok: false, reason: "provider_disabled" };
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("OpenRouter quota timeout", "TimeoutError")),
    boundedInteger(input.timeoutMs, 5_000, 1_000, 10_000),
  );
  timeout.unref?.();
  const forwardAbort = () => controller.abort(input.requestSignal?.reason);
  if (input.requestSignal) {
    if (input.requestSignal.aborted) forwardAbort();
    else input.requestSignal.addEventListener("abort", forwardAbort, { once: true });
  }
  try {
    const response = await fetchImpl("https://openrouter.ai/api/v1/key", {
      method: "GET",
      headers: { Authorization: `Bearer ${input.apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        reason: "provider_rejected",
        status: response.status,
      };
    }
    let raw: string;
    try {
      raw = await readBoundedResponseText(response, {
        maxBytes: MAX_CONNECTOR_RESPONSE_BYTES,
        errorCode: AI_RESPONSE_TOO_LARGE,
      });
    } catch {
      return { ok: false, reason: "invalid_response" };
    }
    let payload: {
      data?: {
        limit?: unknown;
        limit_remaining?: unknown;
        usage_monthly?: unknown;
        is_free_tier?: unknown;
      };
    };
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      return { ok: false, reason: "invalid_response" };
    }
    if (!payload.data || typeof payload.data.is_free_tier !== "boolean") {
      return { ok: false, reason: "invalid_response" };
    }
    return {
      ok: true,
      limitUsdMicros: usdMicros(payload.data.limit, true),
      limitRemainingUsdMicros: usdMicros(payload.data.limit_remaining, true),
      usageMonthlyUsdMicros: usdMicros(payload.data.usage_monthly) ?? 0,
      isFreeTier: payload.data.is_free_tier,
      checkedAt: new Date((dependencies.now ?? Date.now)()).toISOString(),
    };
  } catch (error) {
    const aborted = controller.signal.aborted ||
      (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name));
    return { ok: false, reason: aborted ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timeout);
    input.requestSignal?.removeEventListener("abort", forwardAbort);
  }
}

export async function testXApiConnector(
  apiKey: string,
  dependencies: Pick<AiProviderRouterDependencies, "fetchImpl"> = {},
): Promise<boolean> {
  if (!apiKey.trim()) return false;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  timeout.unref?.();
  try {
    const response = await fetchImpl("https://api.x.com/2/users/by/username/X?user.fields=id", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const text = await readBoundedResponseText(response, {
      maxBytes: MAX_CONNECTOR_RESPONSE_BYTES,
      errorCode: AI_RESPONSE_TOO_LARGE,
    });
    return Boolean((JSON.parse(text) as { data?: { id?: unknown } })?.data?.id);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
