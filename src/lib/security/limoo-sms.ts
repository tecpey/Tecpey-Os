type LimooResponse = {
  Success?: unknown;
  success?: unknown;
  Message?: unknown;
  message?: unknown;
};

export type LimooSmsResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "timeout" | "network_error" | "rejected" | "invalid_response" };

type Dependencies = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

async function callLimoo(
  endpoint: "sendcode" | "checkcode",
  body: Record<string, string>,
  dependencies: Dependencies = {},
): Promise<LimooSmsResult> {
  const apiKey = process.env.LIMOO_SMS_API_KEY?.trim() ?? "";
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
  return callLimoo("sendcode", {
    Mobile: mobile,
    Footer: process.env.LIMOO_SMS_OTP_FOOTER?.trim() || "تک‌پی؛ کد ورود شما",
  }, dependencies);
}

export function checkLimooVerificationCode(
  mobile: string,
  code: string,
  dependencies?: Dependencies,
): Promise<LimooSmsResult> {
  return callLimoo("checkcode", { Mobile: mobile, Code: code }, dependencies);
}
