import { containsEnvPlaceholder } from "./env-placeholders";
import { logger } from "./logger";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
};

export type EmailResult = {
  ok: boolean;
  provider: "resend" | "sendgrid" | "dev" | "none";
  messageId?: string;
  error?: string;
};

export type EmailDeliveryEnvironment = {
  NODE_ENV?: string;
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  SENDGRID_API_KEY?: string;
};

type SafeEmailProvider = "resend" | "sendgrid" | "dev" | "none" | "unsupported" | null;

export type EmailDeliveryReadiness =
  | {
      status: "configured";
      provider: "resend" | "sendgrid";
      mode: "live";
      reason: null;
    }
  | {
      status: "development";
      provider: "dev";
      mode: "simulated";
      reason: "development_provider" | "development_default";
    }
  | {
      status: "unconfigured";
      provider: "none" | null;
      mode: "disabled";
      reason: "delivery_disabled" | "provider_not_configured";
    }
  | {
      status: "misconfigured";
      provider: SafeEmailProvider;
      mode: "blocked";
      reason:
        | "unsupported_provider"
        | "provider_key_missing"
        | "provider_key_placeholder"
        | "development_provider_forbidden_in_production"
        | "disabled_provider_forbidden_in_production";
    };

const DEFAULT_FROM = process.env.EMAIL_FROM || "TecPey <noreply@tecpey.ir>";

function normalizeRecipients(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to];
}

function normalizeProvider(raw: string | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

function isUsableKey(raw: string | undefined): boolean {
  const value = (raw ?? "").trim();
  if (!value) return false;
  return !containsEnvPlaceholder(value);
}

/**
 * Single authority for email-delivery readiness.
 *
 * The same decision is consumed by the send path, /api/health (through
 * isEmailConfigured) and the production preflight. This prevents a deployment
 * gate from vouching for a delivery path that the runtime later refuses.
 *
 * Arbitrary provider input is never returned. A credential accidentally pasted
 * into EMAIL_PROVIDER must not become a value in logs, health diagnostics or
 * deployment output, so unknown input is collapsed to the fixed "unsupported"
 * marker at this boundary.
 */
export function emailDeliveryReadiness(
  env: EmailDeliveryEnvironment = process.env,
  runtimeEnvironment = env.NODE_ENV,
): EmailDeliveryReadiness {
  const provider = normalizeProvider(env.EMAIL_PROVIDER);
  const isProduction = normalizeProvider(runtimeEnvironment) === "production";

  if (provider === "resend" || provider === "sendgrid") {
    const key = provider === "resend" ? env.RESEND_API_KEY : env.SENDGRID_API_KEY;
    const trimmed = (key ?? "").trim();
    if (!trimmed) {
      return {
        status: "misconfigured",
        provider,
        mode: "blocked",
        reason: "provider_key_missing",
      };
    }
    if (containsEnvPlaceholder(trimmed)) {
      return {
        status: "misconfigured",
        provider,
        mode: "blocked",
        reason: "provider_key_placeholder",
      };
    }
    return { status: "configured", provider, mode: "live", reason: null };
  }

  if (!provider) {
    if (isProduction) {
      return {
        status: "unconfigured",
        provider: null,
        mode: "disabled",
        reason: "provider_not_configured",
      };
    }
    return {
      status: "development",
      provider: "dev",
      mode: "simulated",
      reason: "development_default",
    };
  }

  if (provider === "dev") {
    if (isProduction) {
      return {
        status: "misconfigured",
        provider,
        mode: "blocked",
        reason: "development_provider_forbidden_in_production",
      };
    }
    return {
      status: "development",
      provider: "dev",
      mode: "simulated",
      reason: "development_provider",
    };
  }

  if (provider === "none") {
    if (isProduction) {
      return {
        status: "misconfigured",
        provider,
        mode: "blocked",
        reason: "disabled_provider_forbidden_in_production",
      };
    }
    return {
      status: "unconfigured",
      provider: "none",
      mode: "disabled",
      reason: "delivery_disabled",
    };
  }

  return {
    status: "misconfigured",
    provider: "unsupported",
    mode: "blocked",
    reason: "unsupported_provider",
  };
}

async function sendViaResend(message: EmailMessage): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!isUsableKey(key)) return { ok: false, provider: "resend", error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: message.from ?? DEFAULT_FROM,
        to: normalizeRecipients(message.to),
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, provider: "resend", error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = await res.json().catch(() => ({})) as { id?: string };
    return { ok: true, provider: "resend", messageId: data.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, provider: "resend", error: msg };
  }
}

async function sendViaSendGrid(message: EmailMessage): Promise<EmailResult> {
  const key = process.env.SENDGRID_API_KEY;
  if (!isUsableKey(key)) return { ok: false, provider: "sendgrid", error: "SENDGRID_API_KEY not set" };
  try {
    const personalizations = normalizeRecipients(message.to).map((email) => ({ to: [{ email }] }));
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations,
        from: { email: (message.from ?? DEFAULT_FROM).replace(/^.*<(.+)>.*$/, "$1") },
        subject: message.subject,
        content: [
          ...(message.html ? [{ type: "text/html", value: message.html }] : []),
          ...(message.text ? [{ type: "text/plain", value: message.text }] : []),
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, provider: "sendgrid", error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const msgId = res.headers.get("x-message-id") ?? undefined;
    return { ok: true, provider: "sendgrid", messageId: msgId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, provider: "sendgrid", error: msg };
  }
}

function sendViaDev(message: EmailMessage): EmailResult {
  logger.info("[email:dev] Sending email (dev mode — not delivered)", {
    to: message.to,
    subject: message.subject,
    from: message.from ?? DEFAULT_FROM,
  });
  return { ok: true, provider: "dev", messageId: `dev-${Date.now()}` };
}

/**
 * Send an email through the delivery mode selected by the shared readiness
 * authority. Production never falls back to a simulated success.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const readiness = emailDeliveryReadiness();

  if (readiness.status === "configured") {
    return readiness.provider === "resend" ? sendViaResend(message) : sendViaSendGrid(message);
  }

  if (readiness.status === "development") {
    return sendViaDev(message);
  }

  const provider =
    readiness.provider === "resend" ||
    readiness.provider === "sendgrid" ||
    readiness.provider === "dev"
      ? readiness.provider
      : "none";
  logger.error("[email] Email delivery is unavailable", {
    status: readiness.status,
    provider: readiness.provider ?? "unset",
    reason: readiness.reason,
  });
  return {
    ok: false,
    provider,
    error: readiness.reason,
  };
}

/** Whether a live delivery provider with a usable credential is configured. */
export function isEmailConfigured(): boolean {
  return emailDeliveryReadiness().status === "configured";
}
