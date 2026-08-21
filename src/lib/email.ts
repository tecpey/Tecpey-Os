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
  // Same rule isEmailConfigured() reports on. If sending accepted a key that
  // health calls unusable, the two would describe different systems: health
  // warning that email is down while every send still burned a round-trip to
  // collect a 401 the caller sees only as a generic HTTP error.
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
 * Send an email via the configured provider.
 * Provider is selected by EMAIL_PROVIDER env var (resend | sendgrid | dev | none).
 * Defaults to "dev" in non-production environments and logs the message.
 * Returns EmailResult — callers must check result.ok and handle failures.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const provider = resolveEmailProvider();

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

/**
 * Whether an API key is something the provider could actually accept.
 *
 * Placeholder detection comes from the environment contract rather than a local
 * list, so a value the deployment preflight calls unfinished is not one this
 * module calls a credential.
 */
function isUsableKey(raw: string | undefined): boolean {
  const value = (raw ?? "").trim();
  if (!value) return false;
  return !containsEnvPlaceholder(value);
}

/**
 * The single place EMAIL_PROVIDER is interpreted.
 *
 * sendEmail and isEmailConfigured each used to lowercase the variable
 * independently, and neither trimmed it. A quoted .env value like " resend "
 * therefore selected no provider while /api/health reported email as
 * unconfigured — consistent by luck, since both were wrong in the same way, but
 * any future caller resolving it correctly would have disagreed with both.
 */
function resolveEmailProvider(): string {
  return (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
}

/**
 * Whether email can actually be sent.
 *
 * /api/health reports this, and the deployment contract routes traffic on that
 * response, so a placeholder API key answering true would let the health signal
 * vouch for a delivery path that rejects every message.
 */
export function isEmailConfigured(): boolean {
  const provider = resolveEmailProvider();
  if (provider === "resend") return isUsableKey(process.env.RESEND_API_KEY);
  if (provider === "sendgrid") return isUsableKey(process.env.SENDGRID_API_KEY);
  return false;
}
