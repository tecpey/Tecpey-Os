"use client";

import { useId, useState } from "react";
import { SUPPORT_PRIVACY_NOTICE_VERSION } from "@/lib/crm/support-message-input";

// SB-013 — the form that actually sends.
//
// What it replaces was four inputs and a button labelled "ارسال پیام به
// پشتیبانی" wired to `mailto:`, which opened an empty draft and discarded
// everything typed. The rule this component is built around is that the sender
// is never told something happened that did not: every outcome below reports
// what the server actually answered.

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

/** Server error codes turned into something a person can act on. */
const ERROR_MESSAGES: Record<"fa" | "en", Record<string, string>> = {
  fa: {
    invalid_name: "لطفاً نام خود را کامل وارد کنید.",
    name_too_long: "نام واردشده بیش از حد طولانی است.",
    contact_too_long: "ایمیل یا شماره تماس بیش از حد طولانی است.",
    subject_too_long: "موضوع پیام بیش از حد طولانی است.",
    message_too_long: "متن پیام بیش از حد طولانی است.",
    invalid_email: "ایمیل واردشده معتبر نیست.",
    invalid_phone: "شماره تماس واردشده معتبر نیست.",
    contact_required: "برای پاسخ دادن به شما، ایمیل یا شماره تماس لازم است.",
    invalid_subject: "لطفاً موضوع پیام را وارد کنید.",
    invalid_message: "متن پیام باید کمی کامل‌تر باشد.",
    privacy_consent_required: "برای ارسال پیام، پذیرش حریم خصوصی لازم است.",
    privacy_notice_invalid:
      "اطلاعیه حریم خصوصی این صفحه قدیمی شده است. صفحه را تازه کنید، اطلاعیه جدید را بخوانید و دوباره ارسال کنید.",
    rate_limited: "پیام‌های زیادی ارسال شده است. کمی بعد دوباره تلاش کنید.",
    support_storage_unavailable:
      "پیام شما ذخیره نشد. لطفاً بعداً دوباره تلاش کنید یا به info@tecpey.ir ایمیل بزنید.",
    payload_too_large: "متن پیام بیش از حد طولانی است.",
    idempotency_conflict:
      "پیام ویرایش‌شده با ارسال قبلی تداخل داشت. دوباره «ارسال» را بزنید تا همین متن با شناسه تازه ثبت شود.",
    support_message_expired:
      "نسخه قدیمی این پیام دیگر نگهداری نمی‌شود. پیام را دوباره ارسال کنید.",
  },
  en: {
    invalid_name: "Please enter your full name.",
    name_too_long: "The name is too long.",
    contact_too_long: "The email address or phone number is too long.",
    subject_too_long: "The subject is too long.",
    message_too_long: "The message is too long.",
    invalid_email: "Please enter a valid email address.",
    invalid_phone: "Please enter a valid phone number.",
    contact_required: "An email address or phone number is required so we can reply.",
    invalid_subject: "Please enter a subject.",
    invalid_message: "Please provide a little more detail in your message.",
    privacy_consent_required: "Privacy consent is required before sending.",
    privacy_notice_invalid:
      "This page has an outdated privacy notice. Reload the page, review the current notice, and send again.",
    rate_limited: "Too many messages were sent. Please try again shortly.",
    support_storage_unavailable:
      "Your message was not stored. Please try again later or email info@tecpey.ir.",
    payload_too_large: "The message is too long.",
    idempotency_conflict:
      "The edited message conflicted with the prior submission. Select Send again to submit this text with a fresh ID.",
    support_message_expired:
      "The retained copy of this message has expired. Please send the message again.",
  },
};

const COPY = {
  fa: {
    name: "نام و نام خانوادگی",
    contact: "ایمیل یا شماره تماس",
    subject: "موضوع پیام",
    message: "متن پیام",
    consent:
      "با ارسال این پیام موافقم که نام و راه ارتباطی من برای پاسخ‌گویی نگهداری شود. این اطلاعات رمزنگاری‌شده ذخیره می‌شود و پس از شش ماه پاک می‌شود.",
    sending: "در حال ارسال…",
    send: "ارسال پیام به پشتیبانی",
    sent: "پیام شما ثبت شد. پشتیبانی تک‌پی پاسخ می‌دهد.",
    fallback:
      "ارسال پیام ممکن نشد. لطفاً دوباره تلاش کنید یا به info@tecpey.ir ایمیل بزنید.",
    networkError:
      "ارتباط با سرور برقرار نشد. اتصال خود را بررسی کنید و دوباره تلاش کنید.",
  },
  en: {
    name: "Full name",
    contact: "Email or phone",
    subject: "Subject",
    message: "Your message",
    consent:
      "I agree that my name and contact detail may be retained so TecPey can reply. This information is stored encrypted and deleted after six months.",
    sending: "Sending…",
    send: "Send message to support",
    sent: "Your message was stored. TecPey support will respond.",
    fallback:
      "Your message could not be sent. Please try again or email info@tecpey.ir.",
    networkError: "Could not reach the server. Check your connection and try again.",
  },
} as const;

export function SupportMessageForm({ locale = "fa" }: { locale?: "fa" | "en" }) {
  const fieldId = useId();
  const copy = COPY[locale];
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Generated once per filled-in form, so a double click or a retry is one
  // message rather than two — and a genuinely new message gets a new key.
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === "sending") return;
    setStatus({ kind: "sending" });

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/support-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `contact-us-${submissionId}`,
        },
        body: JSON.stringify({
          name: form.get("name"),
          contact: form.get("contact"),
          subject: form.get("subject"),
          message: form.get("message"),
          consent: form.get("consent") === "on",
          privacyNoticeVersion: SUPPORT_PRIVACY_NOTICE_VERSION,
          locale,
        }),
      });

      if (response.ok) {
        setStatus({ kind: "sent" });
        // A new key for whatever they send next, so a second message is not
        // mistaken for a replay of this one.
        setSubmissionId(crypto.randomUUID());
        (event.target as HTMLFormElement).reset();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      const code = response.status === 429 ? "rate_limited" : body.error ?? "";
      // A tab left open beyond retention needs a fresh key before retrying.
      if (
        code === "support_message_expired" ||
        code === "idempotency_conflict"
      ) {
        setSubmissionId(crypto.randomUUID());
      }
      setStatus({
        kind: "error",
        message:
          ERROR_MESSAGES[locale][code] ?? copy.fallback,
      });
    } catch {
      setStatus({
        kind: "error",
        message: copy.networkError,
      });
    }
  }

  const field = "rounded-2xl border border-primary/20 bg-bg px-4 py-3 outline-none focus:border-primary";
  const label = "mb-2 block text-sm font-bold";

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {/* Real labels, not placeholders: a placeholder disappears as soon as
            you type and is not reliably announced by a screen reader. */}
        <div className="flex flex-col">
          <label className={label} htmlFor={`${fieldId}-name`}>{copy.name}</label>
          <input id={`${fieldId}-name`} name="name" className={field} required minLength={2} maxLength={120} autoComplete="name" />
        </div>
        <div className="flex flex-col">
          <label className={label} htmlFor={`${fieldId}-contact`}>{copy.contact}</label>
          <input id={`${fieldId}-contact`} name="contact" className={field} required maxLength={160} autoComplete="email" />
        </div>
        <div className="flex flex-col md:col-span-2">
          <label className={label} htmlFor={`${fieldId}-subject`}>{copy.subject}</label>
          <input id={`${fieldId}-subject`} name="subject" className={field} required minLength={2} maxLength={160} />
        </div>
        <div className="flex flex-col md:col-span-2">
          <label className={label} htmlFor={`${fieldId}-message`}>{copy.message}</label>
          <textarea id={`${fieldId}-message`} name="message" className={`min-h-36 ${field}`} required minLength={10} maxLength={4000} />
        </div>
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm leading-7">
        <input type="checkbox" name="consent" required className="mt-1.5 h-4 w-4" />
        <span>{copy.consent}</span>
      </label>

      <button
        type="submit"
        disabled={status.kind === "sending"}
        className="mt-6 inline-flex rounded-2xl bg-primary px-6 py-3 font-black text-white disabled:opacity-60"
      >
        {status.kind === "sending" ? copy.sending : copy.send}
      </button>

      {/* aria-live so the outcome reaches someone who cannot see the change. */}
      <p role="status" aria-live="polite" className="mt-4 text-sm leading-7">
        {status.kind === "sent" && (
          <span className="text-emerald-400">{copy.sent}</span>
        )}
        {status.kind === "error" && <span className="text-rose-400">{status.message}</span>}
      </p>
    </form>
  );
}
