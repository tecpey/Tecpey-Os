"use client";

import Image from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CommandCenterDashboard } from "@/components/admin/CommandCenterDashboard";

export type CommandCenterAdmin = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  authenticationMethods?: string[];
  stepUpAt?: string | null;
};

type AccessState =
  | { kind: "checking" }
  | { kind: "unavailable"; message: string }
  | { kind: "bootstrap" }
  | { kind: "login" }
  | { kind: "authenticated"; admin: CommandCenterAdmin };

type CreationOptionsPayload = {
  challenge: string;
  rp: PublicKeyCredentialRpEntity;
  user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  excludeCredentials?: Array<{
    id: string;
    type: PublicKeyCredentialType;
    transports?: AuthenticatorTransport[];
  }>;
};

type RequestOptionsPayload = {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: UserVerificationRequirement;
  allowCredentials?: Array<{
    id: string;
    type: PublicKeyCredentialType;
    transports?: AuthenticatorTransport[];
  }>;
};

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function arrayBufferToBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toCreationOptions(payload: CreationOptionsPayload): PublicKeyCredentialCreationOptions {
  return {
    ...payload,
    challenge: base64UrlToArrayBuffer(payload.challenge),
    user: {
      ...payload.user,
      id: base64UrlToArrayBuffer(payload.user.id),
    },
    excludeCredentials: payload.excludeCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToArrayBuffer(credential.id),
    })),
  };
}

function toRequestOptions(payload: RequestOptionsPayload): PublicKeyCredentialRequestOptions {
  return {
    ...payload,
    challenge: base64UrlToArrayBuffer(payload.challenge),
    allowCredentials: payload.allowCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToArrayBuffer(credential.id),
    })),
  };
}

function serializeRegistrationCredential(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
    },
    transports: typeof response.getTransports === "function" ? response.getTransports() : [],
  };
}

function serializeAuthenticationCredential(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: response.userHandle ? arrayBufferToBase64Url(response.userHandle) : undefined,
    },
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "عملیات Passkey لغو شد یا در زمان مجاز تکمیل نشد.";
  }
  if (error instanceof Error) return error.message;
  return "عملیات امنیتی تکمیل نشد.";
}

function apiErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const code = typeof data.error === "string" ? data.error : "";
  const messages: Record<string, string> = {
    admin_bootstrap_unauthorized: "کلید Bootstrap معتبر نیست.",
    admin_bootstrap_closed: "Bootstrap قبلاً تکمیل شده است. با Passkey وارد شو.",
    admin_bootstrap_required: "ابتدا مدیر اصلی را به‌صورت امن ثبت کن.",
    admin_service_unavailable: "سرویس هویت مدیر یا دیتابیس در دسترس نیست.",
    admin_webauthn_unavailable: "سرویس Passkey یا Redis در دسترس نیست.",
    admin_passkey_verification_failed: "Passkey تأیید نشد. دوباره تلاش کن.",
    invalid_email: "ایمیل مدیر معتبر نیست.",
    invalid_display_name: "نام نمایشی مدیر باید حداقل دو نویسه باشد.",
    rate_limited: "تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کن.",
    forbidden: "درخواست از مبدأ مجاز ارسال نشده است.",
  };
  return messages[code] ?? fallback;
}

function SecurityStatusStrip() {
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
      {[
        [Fingerprint, "Passkey", "بدون رمز عبور"],
        [ServerCog, "Server session", "قابل ابطال فوری"],
        [ShieldCheck, "Audit trail", "منتسب به مدیر"],
      ].map(([Icon, title, detail]) => {
        const StatusIcon = Icon as typeof Fingerprint;
        return (
          <div key={String(title)} className="bg-[#07111f] px-4 py-4">
            <StatusIcon className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-black text-white">{String(title)}</p>
            <p className="mt-1 text-xs font-bold text-slate-400">{String(detail)}</p>
          </div>
        );
      })}
    </div>
  );
}

export function AdminPasskeyAccessGate() {
  const [access, setAccess] = useState<AccessState>({ kind: "checking" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [bootstrap, setBootstrap] = useState({
    email: "",
    displayName: "",
    token: "",
    deviceLabel: "دستگاه اصلی مدیر",
  });

  const refreshStatus = useCallback(async () => {
    setMessage("");
    setAccess({ kind: "checking" });
    try {
      const response = await fetch("/api/command-center/auth/status", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await readJson(response);
      if (!response.ok) {
        setAccess({
          kind: "unavailable",
          message: apiErrorMessage(data, "وضعیت سرویس مدیریت قابل دریافت نیست."),
        });
        return;
      }

      if (data.authenticated && data.admin && typeof data.admin === "object") {
        setAccess({ kind: "authenticated", admin: data.admin as CommandCenterAdmin });
        return;
      }
      setAccess(data.bootstrapRequired ? { kind: "bootstrap" } : { kind: "login" });
    } catch {
      setAccess({ kind: "unavailable", message: "ارتباط امن با Command Center برقرار نشد." });
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const completeBootstrap = async () => {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      setMessage("این مرورگر از Passkey پشتیبانی نمی‌کند.");
      return;
    }
    if (!bootstrap.email.trim() || !bootstrap.displayName.trim() || !bootstrap.token) {
      setMessage("ایمیل، نام مدیر و کلید Bootstrap را کامل کن.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const challengeResponse = await fetch("/api/command-center/auth/bootstrap/challenge", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-tecpey-admin-token": bootstrap.token,
        },
        body: JSON.stringify({
          email: bootstrap.email,
          displayName: bootstrap.displayName,
        }),
      });
      const challengeData = await readJson(challengeResponse);
      if (!challengeResponse.ok) {
        throw new Error(apiErrorMessage(challengeData, "ساخت Challenge امن انجام نشد."));
      }

      const publicKey = toCreationOptions(
        (challengeData.publicKey ?? {}) as CreationOptionsPayload,
      );
      const credential = await navigator.credentials.create({ publicKey });
      if (!(credential instanceof PublicKeyCredential)) {
        throw new Error("مرورگر credential معتبر برنگرداند.");
      }

      const verifyResponse = await fetch("/api/command-center/auth/bootstrap/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-tecpey-admin-token": bootstrap.token,
        },
        body: JSON.stringify({
          adminId: challengeData.adminId,
          deviceLabel: bootstrap.deviceLabel,
          response: serializeRegistrationCredential(credential),
        }),
      });
      const verifyData = await readJson(verifyResponse);
      if (!verifyResponse.ok) {
        throw new Error(apiErrorMessage(verifyData, "ثبت Passkey مدیر انجام نشد."));
      }

      setBootstrap((current) => ({ ...current, token: "" }));
      await refreshStatus();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const loginWithPasskey = async () => {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      setMessage("این مرورگر از Passkey پشتیبانی نمی‌کند.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const challengeResponse = await fetch("/api/command-center/auth/passkey/challenge", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const challengeData = await readJson(challengeResponse);
      if (!challengeResponse.ok) {
        throw new Error(apiErrorMessage(challengeData, "Challenge ورود ساخته نشد."));
      }

      const publicKey = toRequestOptions(
        (challengeData.publicKey ?? {}) as RequestOptionsPayload,
      );
      const credential = await navigator.credentials.get({ publicKey });
      if (!(credential instanceof PublicKeyCredential)) {
        throw new Error("مرورگر credential معتبر برنگرداند.");
      }

      const verifyResponse = await fetch("/api/command-center/auth/passkey/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: serializeAuthenticationCredential(credential),
        }),
      });
      const verifyData = await readJson(verifyResponse);
      if (!verifyResponse.ok) {
        throw new Error(apiErrorMessage(verifyData, "ورود با Passkey تأیید نشد."));
      }

      await refreshStatus();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/command-center/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } finally {
      setBusy(false);
      setAccess({ kind: "login" });
    }
  };

  if (access.kind === "authenticated") {
    return (
      <CommandCenterDashboard
        admin={access.admin}
        busy={busy}
        onLogout={logout}
        onSessionExpired={refreshStatus}
      />
    );
  }

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#030914] px-4 py-8 text-white sm:px-6 lg:px-10"
    >
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(56,189,248,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[32px] border border-cyan-300/15 bg-[#06101d]/95 shadow-[0_32px_90px_rgba(0,0,0,0.55)] lg:grid-cols-[0.86fr_1.14fr]">
        <aside className="flex flex-col justify-between border-b border-white/10 bg-[#071522] p-6 sm:p-9 lg:border-b-0 lg:border-l">
          <div>
            <div className="flex items-center gap-4">
              <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-cyan-300/20 bg-white/5 p-2">
                <Image
                  src="/images/tecpey-logo.png"
                  alt="TecPey"
                  fill
                  sizes="48px"
                  className="object-contain p-2"
                  priority
                />
              </div>
              <div>
                <p className="text-xs font-black tracking-[0.18em] text-cyan-300">TECPEY</p>
                <p className="mt-1 text-sm font-black text-slate-200">Enterprise Command Center</p>
              </div>
            </div>

            <div className="mt-12">
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-black text-emerald-200">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Identity-bound access
              </p>
              <h1 className="mt-6 text-3xl font-black leading-[1.5] sm:text-4xl">
                کنترل عملیاتی، فقط با هویت مستقل مدیر
              </h1>
              <p className="mt-5 max-w-md text-sm font-bold leading-8 text-slate-400">
                ورود با Passkey، نشست قابل‌ابطال سمت سرور و ثبت تغییرناپذیر رویدادها؛ بدون ذخیره کلید یا داده ماندگار در مرورگر.
              </p>
            </div>
          </div>

          <div className="mt-10">
            <SecurityStatusStrip />
            <p className="mt-5 text-xs font-bold leading-6 text-slate-500">
              دسترسی‌های هر مدیر در Backend و بر اساس Role/Permission ارزیابی می‌شوند؛ پنهان‌کردن دکمه‌ها جایگزین Authorization نیست.
            </p>
          </div>
        </aside>

        <section className="flex items-center p-6 sm:p-10 lg:p-14">
          <div className="mx-auto w-full max-w-xl">
            {access.kind === "checking" && (
              <div role="status" className="rounded-[28px] border border-white/10 bg-white/[0.035] p-8 text-center">
                <LoaderCircle className="mx-auto h-9 w-9 animate-spin text-cyan-300" aria-hidden="true" />
                <h2 className="mt-5 text-xl font-black">در حال بررسی وضعیت امنیتی</h2>
                <p className="mt-3 text-sm font-bold leading-7 text-slate-400">نشست، دیتابیس و وضعیت Bootstrap از سرور خوانده می‌شوند.</p>
              </div>
            )}

            {access.kind === "unavailable" && (
              <div className="rounded-[28px] border border-rose-300/20 bg-rose-300/[0.06] p-7">
                <AlertTriangle className="h-8 w-8 text-rose-300" aria-hidden="true" />
                <h2 className="mt-5 text-xl font-black">سرویس مدیریت در دسترس نیست</h2>
                <p className="mt-3 text-sm font-bold leading-7 text-rose-100/75">{access.message}</p>
                <button
                  type="button"
                  onClick={() => void refreshStatus()}
                  className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-5 text-sm font-black transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> تلاش دوباره
                </button>
              </div>
            )}

            {access.kind === "bootstrap" && (
              <div>
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-200">
                    <KeyRound className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-black tracking-[0.12em] text-amber-300">ONE-TIME BOOTSTRAP</p>
                    <h2 className="mt-2 text-2xl font-black">ثبت مدیر اصلی و Passkey</h2>
                    <p className="mt-3 text-sm font-bold leading-7 text-slate-400">
                      این مسیر بعد از ایجاد اولین مدیر فعال بسته می‌شود. کلید Bootstrap فقط برای همین مراسم استفاده خواهد شد.
                    </p>
                  </div>
                </div>

                <div className="mt-8 grid gap-4">
                  <label className="grid gap-2 text-sm font-black text-slate-200">
                    نام مدیر
                    <input
                      value={bootstrap.displayName}
                      onChange={(event) => setBootstrap((current) => ({ ...current, displayName: event.target.value }))}
                      autoComplete="name"
                      className="min-h-12 rounded-xl border border-white/10 bg-[#030914] px-4 text-sm font-bold outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-black text-slate-200">
                    ایمیل سازمانی
                    <input
                      type="email"
                      value={bootstrap.email}
                      onChange={(event) => setBootstrap((current) => ({ ...current, email: event.target.value }))}
                      autoComplete="email"
                      inputMode="email"
                      dir="ltr"
                      className="min-h-12 rounded-xl border border-white/10 bg-[#030914] px-4 text-left text-sm font-bold outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-black text-slate-200">
                    برچسب دستگاه
                    <input
                      value={bootstrap.deviceLabel}
                      onChange={(event) => setBootstrap((current) => ({ ...current, deviceLabel: event.target.value }))}
                      className="min-h-12 rounded-xl border border-white/10 bg-[#030914] px-4 text-sm font-bold outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-black text-slate-200">
                    کلید Bootstrap
                    <input
                      type="password"
                      value={bootstrap.token}
                      onChange={(event) => setBootstrap((current) => ({ ...current, token: event.target.value }))}
                      autoComplete="new-password"
                      dir="ltr"
                      className="min-h-12 rounded-xl border border-white/10 bg-[#030914] px-4 text-left font-mono text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void completeBootstrap()}
                  className="mt-6 inline-flex min-h-13 w-full items-center justify-center gap-3 rounded-xl bg-cyan-300 px-5 text-sm font-black text-[#03101a] transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Fingerprint className="h-5 w-5" aria-hidden="true" />}
                  ثبت مدیر و ساخت Passkey
                </button>
              </div>
            )}

            {access.kind === "login" && (
              <div>
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-200">
                    <LockKeyhole className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-black tracking-[0.12em] text-cyan-300">PASSKEY AUTHENTICATION</p>
                    <h2 className="mt-2 text-2xl font-black">ورود امن به مرکز فرماندهی</h2>
                    <p className="mt-3 text-sm font-bold leading-7 text-slate-400">
                      ایمیل یا رمز عبور ارسال نمی‌شود. مرورگر Passkey مجاز را روی همین دستگاه یا دستگاه همگام‌شده پیدا می‌کند.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void loginWithPasskey()}
                  className="mt-8 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-cyan-300 px-6 text-sm font-black text-[#03101a] transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Fingerprint className="h-5 w-5" aria-hidden="true" />}
                  ورود با Passkey
                </button>

                <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4 text-sm font-bold leading-7 text-emerald-100/80">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
                  نشست جدید در سرور ثبت می‌شود و با خروج، ابطال امنیتی یا تغییر Permission فوراً نامعتبر خواهد شد.
                </div>
              </div>
            )}

            {message && access.kind !== "checking" && access.kind !== "unavailable" && (
              <div role="alert" className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-300/[0.07] p-4 text-sm font-bold leading-7 text-rose-100">
                {message}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
