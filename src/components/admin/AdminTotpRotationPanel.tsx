"use client";

import {
  AlertTriangle,
  Check,
  Clipboard,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import { type FormEvent, useState } from "react";

type RotationStage = "idle" | "reauthenticate" | "enroll" | "recovery";

type RotationResponse = {
  ok?: boolean;
  error?: string;
  manualKey?: string;
  expiresAt?: string;
  recoveryCodes?: unknown;
};

type AdminTotpRotationPanelProps = {
  onSessionExpired: () => Promise<void> | void;
};

const buttonMotion =
  "transition-[background-color,border-color,transform,opacity] duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none";

function errorMessage(code: string | undefined): string {
  switch (code) {
    case "admin_login_locked":
      return "به‌دلیل تلاش‌های ناموفق، عامل مدیریتی ۱۵ دقیقه قفل شده است.";
    case "admin_totp_rotation_reauthentication_failed":
      return "رمز عبور یا کد عامل فعلی درست نیست.";
    case "invalid_totp_code":
      return "کد شش‌رقمی عامل جدید معتبر نیست؛ کد تازه را وارد کن.";
    case "admin_totp_rotation_challenge_invalid":
      return "مهلت تعویض تمام شده است؛ فرایند را دوباره شروع کن.";
    case "admin_totp_rotation_stale":
      return "اطلاعات امنیتی در حین فرایند تغییر کرده است؛ دوباره احراز هویت کن.";
    case "admin_totp_rotation_identity_not_found":
      return "عامل فعالی برای این مدیر پیدا نشد؛ از نشست خارج شو و وضعیت دسترسی را بررسی کن.";
    case "rate_limited":
      return "تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کن.";
    case "admin_service_unavailable":
      return "سرویس امنیتی موقتاً در دسترس نیست؛ هیچ تغییری ذخیره نشده است.";
    default:
      return "تعویض Authenticator انجام نشد؛ دوباره تلاش کن.";
  }
}

function isSessionFailure(code: string | undefined): boolean {
  return code === "admin_session_required" || code === "admin_session_invalid";
}

function normalizeVisibleCode(value: string): string {
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return value
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[\s-]+/g, "")
    .toUpperCase();
}

export function AdminTotpRotationPanel({
  onSessionExpired,
}: AdminTotpRotationPanelProps) {
  const [stage, setStage] = useState<RotationStage>("idle");
  const [password, setPassword] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"key" | "recovery" | "">("");

  const forgetSensitiveState = () => {
    setPassword("");
    setCurrentCode("");
    setNewCode("");
    setManualKey("");
    setExpiresAt("");
    setRecoveryCodes([]);
    setCopied("");
  };

  const close = () => {
    forgetSensitiveState();
    setError("");
    setStage("idle");
  };

  const restart = (message?: string) => {
    forgetSensitiveState();
    setError(message ?? "");
    setStage("reauthenticate");
  };

  const copyText = async (value: string, kind: "key" | "recovery") => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setError("");
    } catch {
      setError("کپی خودکار ممکن نیست؛ متن را به‌صورت دستی انتخاب کن.");
    }
  };

  const beginRotation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCopied("");
    try {
      const response = await fetch("/api/command-center/auth/totp/rotate", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "setup",
          password,
          currentCode: normalizeVisibleCode(currentCode),
        }),
      });
      const data = await response.json().catch(() => ({})) as RotationResponse;
      if (isSessionFailure(data.error)) {
        forgetSensitiveState();
        await onSessionExpired();
        return;
      }
      if (
        !response.ok
        || !data.ok
        || typeof data.manualKey !== "string"
        || !/^[A-Z2-7]{32}$/.test(data.manualKey)
        || typeof data.expiresAt !== "string"
        || !Number.isFinite(Date.parse(data.expiresAt))
      ) {
        setError(errorMessage(data.error));
        return;
      }
      setPassword("");
      setCurrentCode("");
      setManualKey(data.manualKey);
      setExpiresAt(data.expiresAt);
      setStage("enroll");
    } catch {
      setError("ارتباط با سرویس امنیتی برقرار نشد؛ هیچ تغییری ذخیره نشده است.");
    } finally {
      setBusy(false);
    }
  };

  const verifyRotation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCopied("");
    try {
      const response = await fetch("/api/command-center/auth/totp/rotate", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "verify",
          code: normalizeVisibleCode(newCode),
        }),
      });
      const data = await response.json().catch(() => ({})) as RotationResponse;
      if (isSessionFailure(data.error)) {
        forgetSensitiveState();
        await onSessionExpired();
        return;
      }
      if (!response.ok || !data.ok) {
        if (
          data.error === "admin_totp_rotation_challenge_invalid"
          || data.error === "admin_totp_rotation_stale"
        ) {
          restart(errorMessage(data.error));
          return;
        }
        setError(errorMessage(data.error));
        return;
      }

      const codes = Array.isArray(data.recoveryCodes)
        ? data.recoveryCodes.filter(
            (code): code is string => typeof code === "string" && /^[A-Z2-9]{8}$/.test(code),
          )
        : [];
      setNewCode("");
      setManualKey("");
      setExpiresAt("");
      setRecoveryCodes(codes);
      setStage("recovery");
      if (codes.length !== 10) {
        setError("عامل جدید فعال شد، اما کدهای بازیابی کامل دریافت نشد؛ پنل را ببند و با عامل جدید یک‌بار دیگر تعویض را انجام بده.");
      }
    } catch {
      setError("پاسخ نهایی دریافت نشد و نتیجه نامشخص است؛ هیچ‌کدام از دو ورودی Authenticator را حذف نکن. صفحه را تازه کن و ابتدا ورود با عامل جدید را امتحان کن.");
    } finally {
      setBusy(false);
    }
  };

  const expiryLabel = expiresAt
    ? new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(expiresAt))
    : "";

  return (
    <section className="mt-6 overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[#07111e] shadow-[0_20px_55px_rgba(0,0,0,0.25)]">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08]">
            <KeyRound className="h-5 w-5 text-cyan-100" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-white">تعویض امن Google Authenticator</h2>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 text-[10px] font-black text-emerald-100">
                Self-service
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-slate-400">
              عامل فعلی را با رمز و کد جاری تأیید کن؛ عامل قبلی فقط پس از تأیید کد عامل جدید باطل می‌شود.
            </p>
          </div>
        </div>

        {stage === "idle" ? (
          <button
            type="button"
            onClick={() => setStage("reauthenticate")}
            className={`${buttonMotion} inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-black text-[#03111b] hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200`}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            شروع تعویض
          </button>
        ) : stage !== "recovery" ? (
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="بستن فرایند تعویض Authenticator"
            className={`${buttonMotion} flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {stage !== "idle" && (
        <div className="border-t border-white/10 bg-[#050d18] p-5 md:p-6">
          {stage !== "recovery" && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-amber-100">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="text-xs font-bold leading-6">
                ورودی فعلی Authenticator را حذف نکن و از کلید جدید اسکرین‌شات نگیر. تا تأیید نهایی، عامل فعلی معتبر می‌ماند.
              </p>
            </div>
          )}

          {stage === "reauthenticate" && (
            <form onSubmit={beginRotation} className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black text-slate-300">رمز عبور فعلی</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  maxLength={1_024}
                  required
                  className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/15"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black text-slate-300">کد عامل فعلی یا Recovery Code</span>
                <input
                  type="text"
                  value={currentCode}
                  onChange={(event) => setCurrentCode(event.target.value)}
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={32}
                  dir="ltr"
                  required
                  className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-4 text-left font-mono text-base font-black tracking-[0.2em] text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/15"
                />
              </label>
              <button
                type="submit"
                disabled={busy || password.length === 0 || currentCode.length === 0}
                className={`${buttonMotion} inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 text-sm font-black text-[#03111b] hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 lg:col-span-2`}
              >
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                تأیید هویت و ساخت کلید جدید
              </button>
            </form>
          )}

          {stage === "enroll" && (
            <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
              <div>
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-cyan-200" aria-hidden="true" />
                  <div>
                    <h3 className="font-black text-white">عامل جدید را اضافه کن</h3>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      Google Authenticator ← دکمه + ← Enter a setup key ← Time based
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
                  <p className="text-xs font-black text-slate-400">Setup key جدید</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <code dir="ltr" className="break-all text-left font-mono text-base font-black tracking-[0.12em] text-cyan-100 md:text-lg">
                      {manualKey}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyText(manualKey, "key")}
                      className={`${buttonMotion} inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] px-3 text-xs font-black text-cyan-100 hover:bg-cyan-300/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300`}
                    >
                      {copied === "key" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Clipboard className="h-4 w-4" aria-hidden="true" />}
                      {copied === "key" ? "کپی شد" : "کپی کلید"}
                    </button>
                  </div>
                  {expiryLabel && (
                    <p className="mt-3 text-[11px] font-bold text-slate-500">مهلت این کلید تا ساعت {expiryLabel} است.</p>
                  )}
                </div>
              </div>

              <form onSubmit={verifyRotation} className="rounded-2xl border border-white/10 bg-[#030914] p-4">
                <label className="block">
                  <span className="text-xs font-black text-slate-300">اولین کد شش‌رقمی عامل جدید</span>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(event) => setNewCode(event.target.value)}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={16}
                    dir="ltr"
                    required
                    className="mt-3 min-h-14 w-full rounded-xl border border-white/10 bg-[#07111e] px-4 text-left font-mono text-xl font-black tracking-[0.35em] text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/15"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || !/^\d{6}$/.test(normalizeVisibleCode(newCode))}
                  className={`${buttonMotion} mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 text-sm font-black text-[#03111b] hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {busy ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                  تأیید عامل جدید
                </button>
              </form>
            </div>
          )}

          {stage === "recovery" && (
            <div>
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4 text-emerald-100">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <h3 className="font-black">عامل جدید فعال شد</h3>
                  <p className="mt-1 text-xs font-bold leading-6 text-emerald-100/75">
                    عامل و کدهای بازیابی قبلی باطل شدند؛ تمام نشست‌های قبلی هم بسته و برای همین مرورگر یک نشست تازه ساخته شد.
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-[#030914] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-black text-white">کدهای بازیابی جدید</h4>
                    <p className="mt-1 text-xs font-bold text-slate-500">فقط همین یک‌بار نمایش داده می‌شوند؛ آفلاین ذخیره‌شان کن.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyText(recoveryCodes.join("\n"), "recovery")}
                    disabled={recoveryCodes.length === 0}
                    className={`${buttonMotion} inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-black text-slate-200 hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50`}
                  >
                    {copied === "recovery" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Clipboard className="h-4 w-4" aria-hidden="true" />}
                    {copied === "recovery" ? "کپی شد" : "کپی همه"}
                  </button>
                </div>
                <div dir="ltr" className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {recoveryCodes.map((code) => (
                    <code key={code} className="rounded-xl border border-white/10 bg-[#07111e] px-3 py-2 text-center font-mono text-sm font-black tracking-[0.12em] text-cyan-100">
                      {code}
                    </code>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className={`${buttonMotion} mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 text-sm font-black text-[#042016] hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                کدها را آفلاین ذخیره کردم؛ بستن
              </button>
            </div>
          )}

          {error && (
            <p role="alert" aria-live="assertive" className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/[0.07] p-4 text-xs font-bold leading-6 text-rose-100">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
