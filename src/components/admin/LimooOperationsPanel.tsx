"use client";

import { useState } from "react";

type OperationResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  data?: unknown;
  credit?: unknown;
  result?: unknown;
};

type Action =
  | "limoo_credit"
  | "limoo_send_sms"
  | "limoo_send_peer"
  | "limoo_send_pattern"
  | "limoo_status"
  | "limoo_received";

const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const errorLabels: Record<string, string> = {
  forbidden: "دسترسی لازم برای این عملیات را ندارید.",
  step_up_required: "برای عملیات حساس، احراز هویت مدیریتی را تازه‌سازی کنید.",
  rate_limited: "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.",
  invalid_phone: "شماره موبایل معتبر نیست.",
  invalid_limoo_sms_request: "فرستنده، گیرندگان یا متن پیام عادی معتبر نیست.",
  invalid_limoo_peer_request: "فرستنده و فهرست‌های همتا‌به‌همتا را بررسی کنید؛ تعداد پیام‌ها و گیرندگان باید برابر باشد.",
  invalid_limoo_pattern_request: "شناسه الگو، موبایل یا توکن‌های جایگزین معتبر نیست.",
  invalid_limoo_status_request: "شناسه‌های پیام معتبر نیستند.",
  invalid_limoo_received_request: "شماره خط، صفحه یا تعداد درخواستی معتبر نیست.",
  invalid_recipients: "فهرست گیرندگان معتبر نیست.",
  invalid_messages: "تعداد یا متن پیام‌ها معتبر نیست.",
  invalid_sender_number: "شماره فرستنده معتبر نیست.",
  invalid_pattern_id: "شناسه الگو معتبر نیست.",
  invalid_replace_tokens: "توکن‌های جایگزین معتبر نیستند.",
  invalid_message_ids: "شناسه‌های پیام معتبر نیستند.",
  limoo_operation_failed: "عملیات لیمو ناموفق بود. تنظیمات سرویس و پاسخ پنل را بررسی کنید.",
  communication_provider_not_configured: "ارائه‌دهنده لیمو هنوز کامل پیکربندی نشده است.",
};

export function LimooOperationsPanel() {
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<OperationResult | null>(null);
  const [senderNumber, setSenderNumber] = useState("");
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("");
  const [peerMessages, setPeerMessages] = useState("");
  const [sendToBlockedNumbers, setSendToBlockedNumbers] = useState(false);
  const [patternId, setPatternId] = useState("");
  const [patternMobile, setPatternMobile] = useState("");
  const [replaceTokens, setReplaceTokens] = useState("");
  const [messageIds, setMessageIds] = useState("");
  const [inboxNumber, setInboxNumber] = useState("");
  const [page, setPage] = useState("1");
  const [size, setSize] = useState("25");

  async function run(action: Action, payload: Record<string, unknown> = {}) {
    setBusy(action);
    setResult(null);
    try {
      const response = await fetch("/api/command-center/communications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = (await response.json().catch(() => ({}))) as OperationResult;
      if (!response.ok) {
        setResult({
          ...body,
          ok: false,
          message: errorLabels[body.error ?? ""] ?? body.message ?? "درخواست ناموفق بود.",
        });
        return;
      }
      setResult({ ...body, ok: true });
    } catch {
      setResult({ ok: false, message: "ارتباط با سرور برقرار نشد. دوباره تلاش کنید." });
    } finally {
      setBusy(null);
    }
  }

  const fieldClass =
    "min-h-12 w-full rounded-2xl border border-cyan-300/20 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/20";
  const buttonClass =
    "min-h-12 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50";
  const secondaryButtonClass =
    "min-h-12 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section className="space-y-5 rounded-[2rem] border border-cyan-300/15 bg-slate-950/55 p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur sm:p-6" dir="rtl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-wide text-cyan-300">LIMOO OPERATIONS</p>
          <h2 className="mt-1 text-xl font-black text-white">کنسول عملیاتی لیمو</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
            ارسال پیام، الگو، گزارش وضعیت و پیام‌های دریافتی از مسیر امن سرور انجام می‌شود؛ کلید API هرگز به مرورگر ارسال نمی‌شود.
          </p>
        </div>
        <button
          className={secondaryButtonClass}
          disabled={busy !== null}
          onClick={() => run("limoo_credit")}
          type="button"
        >
          {busy === "limoo_credit" ? "در حال دریافت…" : "دریافت اعتبار فعلی"}
        </button>
      </header>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
          <div>
            <h3 className="font-black text-white">ارسال پیام عادی یا همتا‌به‌همتا</h3>
            <p className="mt-1 text-xs leading-6 text-slate-400">هر شماره و در حالت همتا‌به‌همتا هر پیام را در یک خط وارد کنید؛ تعداد دو فهرست باید برابر باشد.</p>
          </div>
          <label className="block text-sm font-bold text-slate-200">
            شماره فرستنده
            <input className={`${fieldClass} mt-2`} dir="ltr" inputMode="numeric" onChange={(event) => setSenderNumber(event.target.value)} placeholder="مثلاً 3000…" value={senderNumber} />
          </label>
          <label className="block text-sm font-bold text-slate-200">
            گیرندگان، هر شماره در یک خط
            <textarea className={`${fieldClass} mt-2 min-h-28 resize-y`} dir="ltr" onChange={(event) => setRecipients(event.target.value)} placeholder={"0912…\n0935…"} value={recipients} />
          </label>
          <label className="block text-sm font-bold text-slate-200">
            متن پیام عادی
            <textarea className={`${fieldClass} mt-2 min-h-28 resize-y`} onChange={(event) => setMessage(event.target.value)} placeholder="متن پیام" value={message} />
          </label>
          <label className="block text-sm font-bold text-slate-200">
            پیام‌های همتا‌به‌همتا، هر پیام در یک خط
            <textarea className={`${fieldClass} mt-2 min-h-28 resize-y`} onChange={(event) => setPeerMessages(event.target.value)} placeholder={"پیام گیرنده اول\nپیام گیرنده دوم"} value={peerMessages} />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-slate-300">
            <input className="h-5 w-5 accent-cyan-400" checked={sendToBlockedNumbers} onChange={(event) => setSendToBlockedNumbers(event.target.checked)} type="checkbox" />
            ارسال به شماره‌های مسدود نیز درخواست شود
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className={buttonClass}
              disabled={busy !== null}
              onClick={() => run("limoo_send_sms", { senderNumber, mobileNumbers: splitLines(recipients), message, sendToBlockedNumbers })}
              type="button"
            >
              {busy === "limoo_send_sms" ? "در حال ارسال…" : "ارسال پیام عادی"}
            </button>
            <button
              className={secondaryButtonClass}
              disabled={busy !== null}
              onClick={() => run("limoo_send_peer", { senderNumber, mobileNumbers: splitLines(recipients), messages: splitLines(peerMessages), sendToBlockedNumbers })}
              type="button"
            >
              {busy === "limoo_send_peer" ? "در حال ارسال…" : "ارسال همتا‌به‌همتا"}
            </button>
          </div>
        </article>

        <article className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
          <div>
            <h3 className="font-black text-white">ارسال پیام الگو</h3>
            <p className="mt-1 text-xs leading-6 text-slate-400">شناسه الگوی تأییدشده پنل لیمو و توکن‌های جایگزین را به ترتیب الگو وارد کنید.</p>
          </div>
          <label className="block text-sm font-bold text-slate-200">
            شناسه الگو (OtpId)
            <input className={`${fieldClass} mt-2`} dir="ltr" inputMode="numeric" onChange={(event) => setPatternId(event.target.value)} value={patternId} />
          </label>
          <label className="block text-sm font-bold text-slate-200">
            شماره موبایل
            <input className={`${fieldClass} mt-2`} dir="ltr" inputMode="tel" onChange={(event) => setPatternMobile(event.target.value)} placeholder="0912…" value={patternMobile} />
          </label>
          <label className="block text-sm font-bold text-slate-200">
            توکن‌های جایگزین، هر توکن در یک خط
            <textarea className={`${fieldClass} mt-2 min-h-32 resize-y`} onChange={(event) => setReplaceTokens(event.target.value)} placeholder={"123456\nنام کاربر"} value={replaceTokens} />
          </label>
          <button
            className={`${buttonClass} w-full`}
            disabled={busy !== null}
            onClick={() => run("limoo_send_pattern", { patternId, mobileNumber: patternMobile, replaceTokens: splitLines(replaceTokens) })}
            type="button"
          >
            {busy === "limoo_send_pattern" ? "در حال ارسال…" : "ارسال پیام الگو"}
          </button>
          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-4 text-xs leading-6 text-slate-300">
            تست ارسال و بررسی کد OTP با متدهای <span dir="ltr">sendcode/checkcode</span> در کارت تنظیمات «Limoo SMS» بالای همین صفحه در دسترس است.
          </div>
        </article>

        <article className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
          <div>
            <h3 className="font-black text-white">وضعیت پیام‌ها</h3>
            <p className="mt-1 text-xs leading-6 text-slate-400">حداکثر ۱۰۰ شناسه پیام؛ هر شناسه در یک خط.</p>
          </div>
          <textarea className={`${fieldClass} min-h-32 resize-y`} dir="ltr" onChange={(event) => setMessageIds(event.target.value)} placeholder={"message-id-1\nmessage-id-2"} value={messageIds} />
          <button className={`${secondaryButtonClass} w-full`} disabled={busy !== null} onClick={() => run("limoo_status", { messageIds: splitLines(messageIds) })} type="button">
            {busy === "limoo_status" ? "در حال بررسی…" : "دریافت وضعیت ارسال"}
          </button>
        </article>

        <article className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
          <div>
            <h3 className="font-black text-white">پیام‌های دریافتی</h3>
            <p className="mt-1 text-xs leading-6 text-slate-400">پیام‌های ورودی خط اختصاصی را صفحه‌بندی‌شده دریافت کنید.</p>
          </div>
          <label className="block text-sm font-bold text-slate-200">
            شماره خط اختصاصی
            <input className={`${fieldClass} mt-2`} dir="ltr" inputMode="numeric" onChange={(event) => setInboxNumber(event.target.value)} value={inboxNumber} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-bold text-slate-200">
              صفحه
              <input className={`${fieldClass} mt-2`} inputMode="numeric" min="1" onChange={(event) => setPage(event.target.value)} type="number" value={page} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              تعداد
              <input className={`${fieldClass} mt-2`} inputMode="numeric" max="100" min="1" onChange={(event) => setSize(event.target.value)} type="number" value={size} />
            </label>
          </div>
          <button className={`${secondaryButtonClass} w-full`} disabled={busy !== null} onClick={() => run("limoo_received", { number: inboxNumber, page: Number(page), size: Number(size) })} type="button">
            {busy === "limoo_received" ? "در حال دریافت…" : "دریافت پیام‌ها"}
          </button>
        </article>
      </div>

      <div aria-live="polite" className={`min-h-14 rounded-2xl border p-4 text-sm ${result?.ok === false ? "border-rose-400/30 bg-rose-400/10 text-rose-100" : "border-white/10 bg-black/20 text-slate-300"}`}>
        {!result ? (
          <p>نتیجه عملیات در این بخش نمایش داده می‌شود؛ داده‌های حساس پیش از نمایش حذف می‌شوند.</p>
        ) : result.ok === false ? (
          <p>{result.message ?? "عملیات ناموفق بود."}</p>
        ) : (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-left text-xs leading-6" dir="ltr">
            {JSON.stringify(result.credit ?? result.data ?? result.result ?? result, null, 2)}
          </pre>
        )}
      </div>
    </section>
  );
}
