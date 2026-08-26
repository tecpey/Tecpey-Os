import {
  resolveRuntimeCommunicationProvider,
  type RuntimeProviderResolution,
} from "@/lib/communication-provider-store";
import { normalizeLimooPatternId } from "@/lib/security/limoo-pattern-id";

type LimooEndpoint =
  | "sendsms"
  | "sendpeertopeersms"
  | "sendpatternmessage"
  | "getcurrentcredit"
  | "getstatus"
  | "getreceivedmessage";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type LimooResponse = {
  Success?: unknown;
  success?: unknown;
  Message?: unknown;
  message?: unknown;
  [key: string]: unknown;
};

export type LimooFailureReason =
  | "disabled"
  | "timeout"
  | "network_error"
  | "rejected"
  | "invalid_response";

export type LimooSmsResult =
  | { ok: true }
  | { ok: false; reason: LimooFailureReason };

export type LimooOperationResult =
  | { ok: true; data: JsonValue }
  | { ok: false; reason: LimooFailureReason };

type Dependencies = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  tenantId?: string;
  workspaceId?: string;
};

const BLOCKED_RESPONSE_KEYS = /(?:api.?key|authorization|token|secret|password|credential)/i;

function mayUseEnvironmentFallback(resolved: RuntimeProviderResolution): boolean {
  return resolved.status === "unconfigured" ||
    (resolved.status === "unavailable" && process.env.NODE_ENV !== "production");
}

function sanitizeProviderPayload(
  value: unknown,
  depth = 0,
  budget = { keys: 0 },
): JsonValue {
  if (depth > 6 || budget.keys > 400) return "[truncated]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 2_000);
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeProviderPayload(item, depth + 1, budget));
  }
  if (!value || typeof value !== "object") return String(value ?? "").slice(0, 2_000);

  const output: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    budget.keys += 1;
    output[key.slice(0, 100)] = BLOCKED_RESPONSE_KEYS.test(key)
      ? "[redacted]"
      : sanitizeProviderPayload(child, depth + 1, budget);
  }
  return output;
}

async function callLimoo(
  endpoint: LimooEndpoint,
  body: Record<string, unknown>,
  dependencies: Dependencies = {},
  resolved?: RuntimeProviderResolution,
  maxResponseBytes = 8_192,
): Promise<LimooOperationResult> {
  const managed = resolved ?? await resolveRuntimeCommunicationProvider("limoo_sms", dependencies);
  const apiKey = managed.status === "configured"
    ? managed.config.apiKey
    : mayUseEnvironmentFallback(managed)
      ? process.env.LIMOO_SMS_API_KEY?.trim() ?? ""
      : "";
  if (!apiKey) return { ok: false, reason: "disabled" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 8_000);
  timeout.unref?.();
  try {
    const response = await (dependencies.fetchImpl ?? fetch)(
      `https://api.limosms.com/api/${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ApiKey: apiKey,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const text = await response.text();
    if (text.length > maxResponseBytes) return { ok: false, reason: "invalid_response" };
    if (!response.ok) return { ok: false, reason: "rejected" };

    let payload: LimooResponse;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, reason: "invalid_response" };
      }
      payload = parsed as LimooResponse;
    } catch {
      return { ok: false, reason: "invalid_response" };
    }

    const success = payload.Success ?? payload.success;
    return success === true
      ? { ok: true, data: sanitizeProviderPayload(payload) }
      : { ok: false, reason: "rejected" };
  } catch (error) {
    const timeoutFailure = controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError");
    return { ok: false, reason: timeoutFailure ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timeout);
  }
}

function otpResult(result: LimooOperationResult): LimooSmsResult {
  return result.ok ? { ok: true } : result;
}

export function sendLimooVerificationCode(
  mobile: string,
  code: string,
  dependencies?: Dependencies,
): Promise<LimooSmsResult> {
  return (async () => {
    const managed = await resolveRuntimeCommunicationProvider("limoo_sms", dependencies);
    const configuredPatternId = normalizeLimooPatternId(managed.status === "configured"
      ? managed.config.settings.otpPatternId
      : mayUseEnvironmentFallback(managed)
        ? process.env.LIMOO_SMS_PATTERN_ID
        : undefined);
    if (!configuredPatternId) {
      return { ok: false, reason: "disabled" };
    }
    if (!/^\d{6}$/.test(code)) return { ok: false, reason: "invalid_response" };
    return otpResult(await callLimoo("sendpatternmessage", {
      OtpId: configuredPatternId,
      ReplaceToken: [code],
      MobileNumber: mobile,
    }, dependencies, managed));
  })();
}

export function sendLimooSms(input: {
  senderNumber: string;
  message: string;
  mobileNumbers: string[];
  sendToBlockedNumbers?: boolean;
}, dependencies?: Dependencies): Promise<LimooOperationResult> {
  return callLimoo("sendsms", {
    SenderNumber: input.senderNumber,
    Message: input.message,
    MobileNumber: input.mobileNumbers,
    SendToBlocksNumber: Boolean(input.sendToBlockedNumbers),
  }, dependencies);
}

export function sendLimooPeerToPeerSms(input: {
  senderNumber: string;
  messages: string[];
  mobileNumbers: string[];
  sendToBlockedNumbers?: boolean;
}, dependencies?: Dependencies): Promise<LimooOperationResult> {
  return callLimoo("sendpeertopeersms", {
    SenderNumber: input.senderNumber,
    Message: input.messages,
    MobileNumber: input.mobileNumbers,
    SendToBlocksNumber: Boolean(input.sendToBlockedNumbers),
  }, dependencies);
}

export async function sendLimooPatternMessage(input: {
  patternId: string | number;
  replaceTokens: string[];
  mobileNumber: string;
}, dependencies?: Dependencies): Promise<LimooOperationResult> {
  const patternId = normalizeLimooPatternId(input.patternId);
  if (!patternId) return { ok: false, reason: "invalid_response" };
  return callLimoo("sendpatternmessage", {
    OtpId: patternId,
    ReplaceToken: input.replaceTokens,
    MobileNumber: input.mobileNumber,
  }, dependencies);
}

export function getLimooCurrentCredit(
  dependencies?: Dependencies,
): Promise<LimooOperationResult> {
  return callLimoo("getcurrentcredit", {}, dependencies);
}

export function getLimooMessageStatus(
  messageIds: string[],
  dependencies?: Dependencies,
): Promise<LimooOperationResult> {
  return callLimoo("getstatus", { MessageId: messageIds }, dependencies, undefined, 65_536);
}

export function getLimooReceivedMessages(input: {
  number: string;
  page: number;
  size: number;
}, dependencies?: Dependencies): Promise<LimooOperationResult> {
  return callLimoo("getreceivedmessage", {
    Number: input.number,
    Page: input.page,
    Size: input.size,
  }, dependencies, undefined, 65_536);
}
