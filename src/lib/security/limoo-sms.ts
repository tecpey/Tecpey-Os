type LimooResponse = {
  Success?: unknown;
  success?: unknown;
  Message?: unknown;
  message?: unknown;
};

import {
  resolveRuntimeCommunicationProvider,
  type RuntimeProviderResolution,
} from "@/lib/communication-provider-store";

export type LimooSmsResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "timeout" | "network_error" | "rejected" | "invalid_response" };

type Dependencies = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  tenantId?: string;
  workspaceId?: string;
};

async function callLimoo(
  endpoint: "sendcode" | "checkcode",
  body: Record<string, string>,
  dependencies: Dependencies = {},
  resolved?: RuntimeProviderResolution,
): Promise<LimooSmsResult> {
  const managed = resolved ?? await resolveRuntimeCommunicationProvider("limoo_sms", dependencies);
  const apiKey = managed.status === "configured"
    ? managed.config.apiKey
    : managed.status === "disabled"
      ? ""
      : process.env.LIMOO_SMS_API_KEY?.trim() ?? "";
  if (!apiKey) return { ok: false, reason: "disabled" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 6_000);
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
    if (text.length > 8_192) return { ok: false, reason: "invalid_response" };
    if (!response.ok) return { ok: false, reason: "rejected" };
    let payload: LimooResponse;
    try {
      payload = JSON.parse(text) as LimooResponse;
    } catch {
      return { ok: false, reason: "invalid_response" };
    }
    const success = payload.Success ?? payload.success;
    return success === true
      ? { ok: true }
      : { ok: false, reason: "rejected" };
  } catch (error) {
    const timeoutFailure = controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError");
    return { ok: false, reason: timeoutFailure ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timeout);
  }
}

export function sendLimooVerificationCode(
  mobile: string,
  dependencies?: Dependencies,
): Promise<LimooSmsResult> {
  return (async () => {
    const managed = await resolveRuntimeCommunicationProvider("limoo_sms", dependencies);
    const footer = managed.status === "configured"
      ? managed.config.settings.otpFooter
      : undefined;
    return callLimoo("sendcode", {
      Mobile: mobile,
      Footer: footer?.trim() || process.env.LIMOO_SMS_OTP_FOOTER?.trim() || "تک‌پی؛ کد ورود شما",
    }, dependencies, managed);
  })();
}

export function checkLimooVerificationCode(
  mobile: string,
  code: string,
  dependencies?: Dependencies,
): Promise<LimooSmsResult> {
  return callLimoo("checkcode", { Mobile: mobile, Code: code }, dependencies);
}
