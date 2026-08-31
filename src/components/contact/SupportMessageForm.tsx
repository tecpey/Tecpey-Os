"use client";

import { useId, useState } from "react";

// SB-013 — the form that actually sends.
//
// What it replaces was four inputs and a button labelled "ارسال پیام به
// پشتیبانی" wired to `mailto:`, which opened an empty draft and discarded
// everything typed. The rule this component is built around is that the sender
// is never told something happened that did not: every outcome below reports
// what the server actually answered.

/**
 * The privacy notice this consent is given against.
 *
 * Sent with the submission and stored beside it, so a later change to the
 * notice cannot retroactively reinterpret what someone agreed to.
 */
const PRIVACY_NOTICE_VERSION = "2026-08-01";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

/** Server error codes turned into something a person can act on. */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_name: "لطفاً نام خود را کامل وارد کنید.",
  invalid_email: "ایمیل واردشده معتبر نیست.",
  invalid_phone: "شماره تماس واردشده معتبر نیست.",
  contact_required: "برای پاسخ دادن به شما، ایمیل یا شماره تماس لازم است.",
  invalid_subject: "لطفاً موضوع پیام را وارد کنید.",
  invalid_message: "متن پیام باید کمی کامل‌تر باشد.",
  privacy_consent_required: "برای ارسال پیام، پذیرش حریم خصوصی لازم است.",
  rate_limited: "پیام‌های زیادی ارسال شده است. کمی بعد دوباره تلاش کنید.",
  support_storage_unavailable:
    "پیام شما ذخیره نشد. لطفاً بعداً دوباره تلاش کنید یا به info@tecpey.ir ایمیل بزنید.",
  payload_too_large: "متن پیام بیش از حد طولانی است.",
  idempotency_conflict:
    "پیام قبلی با همین شناسه ثبت شده بود. صفحه را تازه کنید و پیام جدید را دوباره بفرستید.",
};

export function SupportMessageForm() {
  const fieldId = useId();
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
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
          locale: "fa",
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
      setStatus({
        kind: "error",
        message:
          ERROR_MESSAGES[code] ??
          "ارسال پیام ممکن نشد. لطفاً دوباره تلاش کنید یا به info@tecpey.ir ایمیل بزنید.",
      });
    } catch {
      setStatus({
        kind: "error",
        message: "ارتباط با سرور برقرار نشد. اتصال خود را بررسی کنید و دوباره تلاش کنید.",
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
          <label className={label} htmlFor={`${fieldId}-name`}>نام و نام خانوادگی</label>
          <input id={`${fieldId}-name`} name="name" className={field} required minLength={2} maxLength={120} autoComplete="name" />
        </div>
        <div className="flex flex-col">
          <label className={label} htmlFor={`${fieldId}-contact`}>ایمیل یا شماره تماس</label>
          <input id={`${fieldId}-contact`} name="contact" className={field} required maxLength={160} autoComplete="email" />
        </div>
        <div className="flex flex-col md:col-span-2">
          <label className={label} htmlFor={`${fieldId}-subject`}>موضوع پیام</label>
          <input id={`${fieldId}-subject`} name="subject" className={field} required minLength={2} maxLength={160} />
        </div>
        <div className="flex flex-col md:col-span-2">
          <label className={label} htmlFor={`${fieldId}-message`}>متن پیام</label>
          <textarea id={`${fieldId}-message`} name="message" className={`min-h-36 ${field}`} required minLength={10} maxLength={4000} />
        </div>
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm leading-7">
        <input type="checkbox" name="consent" required className="mt-1.5 h-4 w-4" />
        <span>
          با ارسال این پیام موافقم که نام و راه ارتباطی من برای پاسخ‌گویی نگهداری شود.
          این اطلاعات رمزنگاری‌شده ذخیره می‌شود و پس از شش ماه پاک می‌شود.
        </span>
      </label>

      <button
        type="submit"
        disabled={status.kind === "sending"}
        className="mt-6 inline-flex rounded-2xl bg-primary px-6 py-3 font-black text-white disabled:opacity-60"
      >
        {status.kind === "sending" ? "در حال ارسال…" : "ارسال پیام به پشتیبانی"}
      </button>

      {/* aria-live so the outcome reaches someone who cannot see the change. */}
      <p role="status" aria-live="polite" className="mt-4 text-sm leading-7">
        {status.kind === "sent" && (
          <span className="text-emerald-400">پیام شما ثبت شد. پشتیبانی تک‌پی پاسخ می‌دهد.</span>
        )}
        {status.kind === "error" && <span className="text-rose-400">{status.message}</span>}
      </p>
    </form>
  );
}
