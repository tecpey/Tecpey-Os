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
  provider: "resend" | "sendgrid" | "dev";
  messageId?: string;
  error?: string;
};

const DEFAULT_FROM = process.env.EMAIL_FROM || "TecPey <noreply@tecpey.ir>";

function normalizeRecipients(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to];
}

async function sendViaResend(message: EmailMessage): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, provider: "resend", error: "RESEND_API_KEY not set" };
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
  if (!key) return { ok: false, provider: "sendgrid", error: "SENDGRID_API_KEY not set" };
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
 * Send an email via the configured provider.
 * Provider is selected by EMAIL_PROVIDER env var (resend | sendgrid | dev | none).
 * Defaults to "dev" in non-production environments and logs the message.
 * Returns EmailResult — callers must check result.ok and handle failures.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const provider = (process.env.EMAIL_PROVIDER ?? "").toLowerCase();

  if (provider === "resend") return sendViaResend(message);
  if (provider === "sendgrid") return sendViaSendGrid(message);

  // In production with no provider configured, log an error and return failure
  // rather than silently discarding emails.
  if (process.env.NODE_ENV === "production" && provider !== "none") {
    logger.error("[email] EMAIL_PROVIDER is not configured in production. Set EMAIL_PROVIDER=resend or EMAIL_PROVIDER=sendgrid and configure the corresponding API key.");
    return { ok: false, provider: "dev", error: "email_provider_not_configured" };
  }

  return sendViaDev(message);
}

export function isEmailConfigured(): boolean {
  const provider = (process.env.EMAIL_PROVIDER ?? "").toLowerCase();
  if (provider === "resend") return Boolean(process.env.RESEND_API_KEY);
  if (provider === "sendgrid") return Boolean(process.env.SENDGRID_API_KEY);
  return false;
}
