"use client";

import { Fingerprint, KeyRound, LoaderCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  authenticationOptionsFromJSON,
  passkeySupported,
  registrationOptionsFromJSON,
  serializeAuthenticationCredential,
  serializeRegistrationCredential,
} from "@/lib/admin-webauthn-client";

type AdminIdentity = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
};

type AuthStatus = {
  authenticated: boolean;
  bootstrapRequired: boolean;
  admin: AdminIdentity | null;
};

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
  code?: string;
} & Partial<T>;

function payload<T>(value: ApiEnvelope<T>): T {
  return (value.data ?? value) as T;
}

function errorText(code: string | undefined): string {
  switch (code) {
    case "admin_bootstrap_unauthorized":
      return "کلید راه‌اندازی اولیه معتبر نیست.";
    case "admin_bootstrap_closed":
      return "راه‌اندازی اولیه قبلاً بسته شده است. با Passkey وارد شوید.";
    case "admin_webauthn_unavailable":
    case "admin_service_unavailable":
      return "سرویس امنیت مدیریت در دسترس نیست؛ دسترسی به‌صورت امن مسدود شد.";
    case "admin_passkey_verification_failed":
      return "تأیید Passkey ناموفق بود. دوباره تلاش کنید.";
    case "rate_limited":
      return "تعداد تلاش‌ها بیش از حد مجاز است. کمی بعد دوباره امتحان کنید.";
    default:
      return "عملیات احراز هویت کامل نشد.";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || body.ok === false) {
    throw new Error(body.error ?? body.code ?? `http_${response.status}`);
  }
  return payload(body);
}

export function AdminPasskeyGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [bootstrap, setBootstrap] = useState({
    email: "",
    displayName: "",
    token: "",
  });

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/command-center/auth/status", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const next = await readJson<AuthStatus>(response);
    setStatus(next);
  }, []);

  useEffect(() => {
    setSupported(passkeySupported());
    refreshStatus().catch((error) => {
      setMessage(errorText(error instanceof Error ? error.message : undefined));
      setStatus({ authenticated: false, bootstrapRequired: false, admin: null });
    });
  }, [refreshStatus]);

  const login = async () => {
    if (!supported) return;
    setBusy(true);
    setMessage("");
    try {
      const challengeResponse = await fetch("/api/command-center/auth/passkey/challenge", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const challenge = await readJson<{ publicKey: PublicKeyCredentialRequestOptionsJSON }>(challengeResponse);
      const credential = await navigator.credentials.get({
        publicKey: authenticationOptionsFromJSON(challenge.publicKey),
      });
      if (!(credential instanceof PublicKeyCredential)) throw new Error("admin_passkey_cancelled");

      const verifyResponse = await fetch("/api/command-center/auth/passkey/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: serializeAuthenticationCredential(credential) }),
      });
      await readJson<{ authenticated: true; admin: AdminIdentity }>(verifyResponse);
      await refreshStatus();
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(code === "NotAllowedError" || code === "admin_passkey_cancelled"
        ? "درخواست Passkey لغو شد یا زمان آن پایان یافت."
        : errorText(code));
    } finally {
      setBusy(false);
    }
  };

  const completeBootstrap = async () => {
    if (!supported) return;
    if (!bootstrap.email.trim() || bootstrap.displayName.trim().length < 2 || bootstrap.token.length < 24) {
      setMessage("نام، ایمیل و کلید راه‌اندازی اولیه را کامل وارد کنید.");
      return;
    }

    setBusy(true);
    setMessage("");
    const bootstrapHeaders = {
      "Content-Type": "application/json",
      "x-tecpey-admin-token": bootstrap.token,
    };

    try {
      const challengeResponse = await fetch("/api/command-center/auth/bootstrap/challenge", {
        method: "POST",
        credentials: "same-origin",
        headers: bootstrapHeaders,
        body: JSON.stringify({
          email: bootstrap.email.trim(),
          displayName: bootstrap.displayName.trim(),
        }),
      });
      const challenge = await readJson<{
        adminId: string;
        publicKey: PublicKeyCredentialCreationOptionsJSON;
      }>(challengeResponse);

      const credential = await navigator.credentials.create({
        publicKey: registrationOptionsFromJSON(challenge.publicKey),
      });
      if (!(credential instanceof PublicKeyCredential)) throw new Error("admin_passkey_cancelled");

      const verifyResponse = await fetch("/api/command-center/auth/bootstrap/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: bootstrapHeaders,
        body: JSON.stringify({
          adminId: challenge.adminId,
          deviceLabel: "Primary administrator Passkey",
          response: serializeRegistrationCredential(credential),
        }),
      });
      await readJson<{ authenticated: true; admin: AdminIdentity }>(verifyResponse);
      setBootstrap({ email: "", displayName: "", token: "" });
      await refreshStatus();
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(code === "NotAllowedError" || code === "admin_passkey_cancelled"
        ? "ساخت Passkey لغو شد یا زمان آن پایان یافت."
        : errorText(code));
    } finally {
      setBusy(false);
    }
  };

  if (status?.authenticated) return <>{children}</>;

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-white">
      <section className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-cyan-300/20 bg-slate-900 shadow-2xl shadow-cyan-950/40">
        <div className="border-b border-white/10 bg-cyan-400/5 px-6 py-7 md:px-9">
          <div className="flex items-center gap-3 text-cyan-100">
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-black tracking-[0.18em] text-cyan-200">TECPEY CONTROL PLANE</p>
              <h1 className="mt-1 text-2xl font-black">ورود امن مرکز فرماندهی</h1>
            </div>
          </div>
          <p className="mt-5 text-sm font-bold leading-7 text-slate-300">
            دسترسی مدیریتی فقط با هویت فردی، Passkey تأییدشده و نشست قابل‌لغو انجام می‌شود. هیچ کلید مدیریتی در مرورگر ذخیره نمی‌شود.
          </p>
        </div>

        <div className="p-6 md:p-9">
          {!supported && (
            <div className="flex gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-bold leading-7 text-amber-100">
              <ShieldAlert className="mt-1 h-5 w-5 shrink-0" />
              این مرورگر یا محیط امن، WebAuthn/Passkey را پشتیبانی نمی‌کند.
            </div>
          )}

          {status === null && !message && (
            <div className="flex items-center justify-center gap-3 py-10 text-sm font-bold text-slate-300">
              <LoaderCircle className="h-5 w-5 animate-spin" /> بررسی وضعیت امنیتی...
            </div>
          )}

          {status?.bootstrapRequired ? (
            <div>
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-violet-300/20 bg-violet-300/10 p-4">
                <KeyRound className="mt-1 h-5 w-5 shrink-0 text-violet-200" />
                <div>
                  <h2 className="font-black">راه‌اندازی اولین مدیر</h2>
                  <p className="mt-1 text-xs font-bold leading-6 text-slate-300">این مرحله فقط یک‌بار انجام می‌شود و پس از فعال‌شدن اولین مدیر به‌صورت خودکار بسته خواهد شد.</p>
                </div>
              </div>
              <div className="grid gap-3">
                <input
                  autoComplete="name"
                  value={bootstrap.displayName}
                  onChange={(event) => setBootstrap((current) => ({ ...current, displayName: event.target.value }))}
                  placeholder="نام نمایشی مدیر"
                  className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold outline-none focus:border-cyan-300"
                />
                <input
                  autoComplete="email"
                  inputMode="email"
                  value={bootstrap.email}
                  onChange={(event) => setBootstrap((current) => ({ ...current, email: event.target.value }))}
                  placeholder="ایمیل سازمانی مدیر"
                  className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-left text-sm font-bold outline-none focus:border-cyan-300"
                />
                <input
                  type="password"
                  autoComplete="off"
                  value={bootstrap.token}
                  onChange={(event) => setBootstrap((current) => ({ ...current, token: event.target.value }))}
                  placeholder="کلید موقت راه‌اندازی اولیه"
                  className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-left text-sm font-bold outline-none focus:border-cyan-300"
                />
                <button
                  type="button"
                  disabled={busy || !supported}
                  onClick={completeBootstrap}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3.5 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Fingerprint className="h-5 w-5" />}
                  ساخت هویت مدیر و Passkey
                </button>
              </div>
            </div>
          ) : status ? (
            <div className="text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                <Fingerprint className="h-8 w-8" />
              </span>
              <h2 className="mt-5 text-xl font-black">ورود با Passkey</h2>
              <p className="mx-auto mt-3 max-w-md text-sm font-bold leading-7 text-slate-300">
                از Face ID، Touch ID، Windows Hello یا کلید امنیتی ثبت‌شده استفاده کنید.
              </p>
              <button
                type="button"
                disabled={busy || !supported}
                onClick={login}
                className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3.5 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Fingerprint className="h-5 w-5" />}
                تأیید هویت و ورود
              </button>
            </div>
          ) : null}

          {message && (
            <p role="alert" className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm font-bold leading-7 text-rose-100">
              {message}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
