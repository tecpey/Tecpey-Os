"use client";

import { AlertTriangle, CheckCircle2, Clipboard, KeyRound, LoaderCircle, LockKeyhole, RefreshCw, ServerCog, ShieldCheck, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CommandCenterDashboard } from "@/components/admin/CommandCenterDashboard";
import { TecpeyMark } from "@/components/brand/TecpeyMark";

export type CommandCenterAdmin = { id: string; email: string; displayName: string; roles: string[]; authenticationMethods?: string[]; stepUpAt?: string | null };
type AccessState = { kind: "checking" } | { kind: "unavailable"; message: string } | { kind: "bootstrap" } | { kind: "login" } | { kind: "authenticated"; admin: CommandCenterAdmin };

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function apiErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const messages: Record<string, string> = {
    admin_bootstrap_unauthorized: "کلید Bootstrap معتبر نیست.",
    admin_bootstrap_closed: "ثبت اولیه قبلاً تکمیل شده است؛ از فرم ورود استفاده کن.",
    admin_bootstrap_pending_for_another_identity: "یک ثبت اولیه برای ایمیل دیگری در انتظار تکمیل است.",
    admin_bootstrap_identity_not_found: "درخواست ثبت اولیه پیدا نشد؛ مرحله را از ابتدا انجام بده.",
    admin_password_policy_failed: "رمز باید حداقل ۱۵ نویسه و حداکثر ۱۲۸ نویسه باشد و با ایمیل یکسان نباشد.",
    invalid_totp_code: "کد شش‌رقمی معتبر نیست یا قبلاً استفاده شده است.",
    admin_login_failed: "ایمیل، رمز یا کد امنیتی صحیح نیست.",
    admin_login_locked: "ورود به‌دلیل تلاش‌های ناموفق موقتاً قفل شده است؛ ۱۵ دقیقه بعد دوباره تلاش کن.",
    admin_service_unavailable: "سرویس هویت مدیر یا دیتابیس در دسترس نیست.",
    rate_limited: "تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کن.",
    forbidden: "درخواست از مبدأ مجاز ارسال نشده است.",
  };
  return messages[typeof data.error === "string" ? data.error : ""] ?? fallback;
}

const inputClass = "min-h-12 rounded-xl border border-white/10 bg-[#030914] px-4 text-sm font-bold outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20";

function SecurityStatusStrip() {
  return <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
    {[[Smartphone, "Authenticator", "بدون نیاز به Apple ID"], [ServerCog, "Server session", "قابل ابطال فوری"], [ShieldCheck, "Audit trail", "منتسب به مدیر"]].map(([Icon, title, detail]) => {
      const StatusIcon = Icon as typeof Smartphone;
      return <div key={String(title)} className="bg-[#07111f] px-4 py-4"><StatusIcon className="h-5 w-5 text-cyan-300" /><p className="mt-3 text-sm font-black text-white">{String(title)}</p><p className="mt-1 text-xs font-bold text-slate-400">{String(detail)}</p></div>;
    })}
  </div>;
}

export function AdminPasskeyAccessGate() {
  const [access, setAccess] = useState<AccessState>({ kind: "checking" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [adminId, setAdminId] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [bootstrap, setBootstrap] = useState({ email: "", displayName: "", token: "", password: "", confirmPassword: "", code: "" });
  const [login, setLogin] = useState({ email: "", password: "", code: "" });

  const refreshStatus = useCallback(async () => {
    setMessage(""); setAccess({ kind: "checking" });
    try {
      const response = await fetch("/api/command-center/auth/status", { cache: "no-store", credentials: "same-origin" });
      const data = await readJson(response);
      if (!response.ok) setAccess({ kind: "unavailable", message: apiErrorMessage(data, "وضعیت سرویس مدیریت قابل دریافت نیست.") });
      else if (data.authenticated && data.admin && typeof data.admin === "object") setAccess({ kind: "authenticated", admin: data.admin as CommandCenterAdmin });
      else setAccess(data.bootstrapRequired ? { kind: "bootstrap" } : { kind: "login" });
    } catch { setAccess({ kind: "unavailable", message: "ارتباط امن با مرکز فرماندهی برقرار نشد." }); }
  }, []);
  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  const startBootstrap = async () => {
    if (!bootstrap.email.trim() || !bootstrap.displayName.trim() || !bootstrap.token || !bootstrap.password) return setMessage("نام، ایمیل، رمز و کلید Bootstrap را کامل کن.");
    if (bootstrap.password !== bootstrap.confirmPassword) return setMessage("تکرار رمز با رمز اصلی یکسان نیست.");
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/command-center/auth/totp/bootstrap/setup", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "x-tecpey-admin-token": bootstrap.token }, body: JSON.stringify({ email: bootstrap.email, displayName: bootstrap.displayName, password: bootstrap.password }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(apiErrorMessage(data, "ساخت کلید Authenticator انجام نشد."));
      setAdminId(String(data.adminId ?? "")); setManualKey(String(data.manualKey ?? ""));
      setBootstrap((current) => ({ ...current, password: "", confirmPassword: "" }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ثبت اولیه تکمیل نشد."); }
    finally { setBusy(false); }
  };

  const verifyBootstrap = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/command-center/auth/totp/bootstrap/verify", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "x-tecpey-admin-token": bootstrap.token }, body: JSON.stringify({ adminId, code: bootstrap.code }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(apiErrorMessage(data, "تأیید Authenticator انجام نشد."));
      setRecoveryCodes(Array.isArray(data.recoveryCodes) ? data.recoveryCodes.filter((item): item is string => typeof item === "string") : []);
      setBootstrap((current) => ({ ...current, token: "", code: "" }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "تأیید کد تکمیل نشد."); }
    finally { setBusy(false); }
  };

  const loginWithTotp = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/command-center/auth/totp/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(login) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(apiErrorMessage(data, "ورود تأیید نشد."));
      setLogin({ email: "", password: "", code: "" }); await refreshStatus();
    } catch (error) { setMessage(error instanceof Error ? error.message : "ورود تکمیل نشد."); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try { await fetch("/api/command-center/auth/logout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" }); }
    finally { setBusy(false); setAccess({ kind: "login" }); }
  };
  if (access.kind === "authenticated") return <CommandCenterDashboard admin={access.admin} busy={busy} onLogout={logout} onSessionExpired={refreshStatus} />;

  return <main dir="rtl" className="relative min-h-screen overflow-hidden bg-[#030914] px-4 py-8 text-white sm:px-6 lg:px-10">
    <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(56,189,248,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
    <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[32px] border border-cyan-300/15 bg-[#06101d]/95 shadow-[0_32px_90px_rgba(0,0,0,0.55)] lg:grid-cols-[0.86fr_1.14fr]">
      <aside className="flex flex-col justify-between border-b border-white/10 bg-[#071522] p-6 sm:p-9 lg:border-b-0 lg:border-l">
        <div><div className="flex items-center gap-4"><div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-cyan-300/20 bg-white/5 p-2"><TecpeyMark alt="TecPey" fill sizes="48px" className="object-contain p-2" priority /></div><div><p className="text-xs font-black tracking-[0.18em] text-cyan-300">TECPEY</p><p className="mt-1 text-sm font-black text-slate-200">Enterprise Command Center</p></div></div>
          <div className="mt-12"><p className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-black text-emerald-200"><ShieldCheck className="h-4 w-4" /> دسترسی چندعاملی مستقل</p><h1 className="mt-6 text-3xl font-black leading-[1.5] sm:text-4xl">کنترل عملیاتی، بدون وابستگی به Apple Passkey</h1><p className="mt-5 max-w-md text-sm font-bold leading-8 text-slate-400">رمز قوی، کد زمان‌دار Google Authenticator و نشست قابل‌ابطال سمت سرور؛ مناسب دسترسی مدیران و کاربران داخل ایران.</p></div></div>
        <div className="mt-10"><SecurityStatusStrip /><p className="mt-5 text-xs font-bold leading-6 text-slate-500">دسترسی در Backend و براساس Role/Permission ارزیابی می‌شود. Passkey فقط در بازارهای پشتیبانی‌شده می‌تواند بعداً اختیاری فعال شود.</p></div>
      </aside>
      <section className="flex items-center p-6 sm:p-10 lg:p-14"><div className="mx-auto w-full max-w-xl">
        {access.kind === "checking" && <div role="status" className="rounded-[28px] border border-white/10 bg-white/[0.035] p-8 text-center"><LoaderCircle className="mx-auto h-9 w-9 animate-spin text-cyan-300" /><h2 className="mt-5 text-xl font-black">در حال بررسی وضعیت امنیتی</h2></div>}
        {access.kind === "unavailable" && <div className="rounded-[28px] border border-rose-300/20 bg-rose-300/[0.06] p-7"><AlertTriangle className="h-8 w-8 text-rose-300" /><h2 className="mt-5 text-xl font-black">سرویس مدیریت در دسترس نیست</h2><p className="mt-3 text-sm font-bold leading-7 text-rose-100/75">{access.message}</p><button type="button" onClick={() => void refreshStatus()} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white/10 px-5 text-sm font-black"><RefreshCw className="h-4 w-4" /> تلاش دوباره</button></div>}
        {access.kind === "bootstrap" && recoveryCodes.length > 0 && <div><div className="flex items-start gap-4"><CheckCircle2 className="h-8 w-8 text-emerald-300" /><div><p className="text-xs font-black tracking-[0.12em] text-emerald-300">ثبت مدیر تکمیل شد</p><h2 className="mt-2 text-2xl font-black">کدهای بازیابی را همین حالا ذخیره کن</h2></div></div><p className="mt-4 text-sm font-bold leading-7 text-slate-400">هر کد فقط یک‌بار قابل استفاده است و دیگر نمایش داده نمی‌شود. آن‌ها را خارج از گوشی و در محل امن نگه دار.</p><div dir="ltr" className="mt-6 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-[#030914] p-5 font-mono text-sm font-bold">{recoveryCodes.map((code) => <span key={code}>{code}</span>)}</div><button type="button" onClick={() => void navigator.clipboard.writeText(recoveryCodes.join("\n"))} className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-5 text-sm font-black"><Clipboard className="h-4 w-4" /> کپی همه کدها</button><button type="button" onClick={() => { setRecoveryCodes([]); void refreshStatus(); }} className="mt-4 min-h-13 w-full rounded-xl bg-cyan-300 px-5 text-sm font-black text-[#03101a]">ذخیره کردم؛ ورود به مرکز فرماندهی</button></div>}
        {access.kind === "bootstrap" && recoveryCodes.length === 0 && manualKey && <div><div className="flex items-start gap-4"><Smartphone className="h-8 w-8 text-cyan-300" /><div><p className="text-xs font-black tracking-[0.12em] text-cyan-300">GOOGLE AUTHENTICATOR</p><h2 className="mt-2 text-2xl font-black">افزودن با کلید دستی؛ بدون QR</h2></div></div><ol className="mt-5 list-decimal space-y-2 pr-5 text-sm font-bold leading-7 text-slate-300"><li>در Google Authenticator دکمه + را بزن.</li><li>گزینه Enter a setup key را انتخاب کن.</li><li>نام را TecPey Admin و نوع کلید را Time based قرار بده.</li></ol><div dir="ltr" className="mt-5 flex items-center gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"><code className="min-w-0 flex-1 break-all font-mono font-black tracking-wider text-cyan-100">{manualKey}</code><button type="button" aria-label="کپی کلید" onClick={() => void navigator.clipboard.writeText(manualKey)} className="rounded-lg bg-white/10 p-3"><Clipboard className="h-5 w-5" /></button></div><label className="mt-5 grid gap-2 text-sm font-black">اولین کد شش‌رقمی<input dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={bootstrap.code} onChange={(event) => setBootstrap((current) => ({ ...current, code: event.target.value.replace(/\D/g, "").slice(0, 6) }))} className={`${inputClass} text-left font-mono tracking-[0.35em]`} /></label><button type="button" disabled={busy || bootstrap.code.length !== 6} onClick={() => void verifyBootstrap()} className="mt-6 min-h-13 w-full rounded-xl bg-cyan-300 px-5 text-sm font-black text-[#03101a] disabled:opacity-60">{busy ? "در حال تأیید…" : "تأیید کد و فعال‌سازی مدیر"}</button></div>}
        {access.kind === "bootstrap" && recoveryCodes.length === 0 && !manualKey && <div><div className="flex items-start gap-4"><KeyRound className="h-8 w-8 text-amber-300" /><div><p className="text-xs font-black tracking-[0.12em] text-amber-300">ONE-TIME BOOTSTRAP</p><h2 className="mt-2 text-2xl font-black">ثبت مدیر با رمز و Authenticator</h2></div></div><div className="mt-7 grid gap-4"><label className="grid gap-2 text-sm font-black">نام مدیر<input value={bootstrap.displayName} onChange={(e) => setBootstrap((v) => ({ ...v, displayName: e.target.value }))} autoComplete="name" className={inputClass} /></label><label className="grid gap-2 text-sm font-black">ایمیل سازمانی<input dir="ltr" type="email" value={bootstrap.email} onChange={(e) => setBootstrap((v) => ({ ...v, email: e.target.value }))} autoComplete="email" className={`${inputClass} text-left`} /></label><label className="grid gap-2 text-sm font-black">رمز قوی (حداقل ۱۵ نویسه)<input dir="ltr" type="password" value={bootstrap.password} onChange={(e) => setBootstrap((v) => ({ ...v, password: e.target.value }))} autoComplete="new-password" className={`${inputClass} text-left`} /></label><label className="grid gap-2 text-sm font-black">تکرار رمز<input dir="ltr" type="password" value={bootstrap.confirmPassword} onChange={(e) => setBootstrap((v) => ({ ...v, confirmPassword: e.target.value }))} autoComplete="new-password" className={`${inputClass} text-left`} /></label><label className="grid gap-2 text-sm font-black">کلید Bootstrap<input dir="ltr" type="password" value={bootstrap.token} onChange={(e) => setBootstrap((v) => ({ ...v, token: e.target.value }))} autoComplete="off" className={`${inputClass} text-left font-mono`} /></label></div><button type="button" disabled={busy} onClick={() => void startBootstrap()} className="mt-6 min-h-13 w-full rounded-xl bg-cyan-300 px-5 text-sm font-black text-[#03101a] disabled:opacity-60">{busy ? "در حال ساخت…" : "ساخت کلید Google Authenticator"}</button></div>}
        {access.kind === "login" && <div><div className="flex items-start gap-4"><LockKeyhole className="h-8 w-8 text-cyan-300" /><div><p className="text-xs font-black tracking-[0.12em] text-cyan-300">PASSWORD + TOTP</p><h2 className="mt-2 text-2xl font-black">ورود امن به مرکز فرماندهی</h2><p className="mt-3 text-sm font-bold leading-7 text-slate-400">کد شش‌رقمی Authenticator یا یکی از کدهای بازیابی را وارد کن.</p></div></div><div className="mt-7 grid gap-4"><label className="grid gap-2 text-sm font-black">ایمیل<input dir="ltr" type="email" value={login.email} onChange={(e) => setLogin((v) => ({ ...v, email: e.target.value }))} autoComplete="username" className={`${inputClass} text-left`} /></label><label className="grid gap-2 text-sm font-black">رمز<input dir="ltr" type="password" value={login.password} onChange={(e) => setLogin((v) => ({ ...v, password: e.target.value }))} autoComplete="current-password" className={`${inputClass} text-left`} /></label><label className="grid gap-2 text-sm font-black">کد امنیتی<input dir="ltr" value={login.code} onChange={(e) => setLogin((v) => ({ ...v, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) }))} autoComplete="one-time-code" inputMode="numeric" className={`${inputClass} text-left font-mono tracking-[0.25em]`} /></label></div><button type="button" disabled={busy} onClick={() => void loginWithTotp()} className="mt-6 min-h-13 w-full rounded-xl bg-cyan-300 px-5 text-sm font-black text-[#03101a] disabled:opacity-60">{busy ? "در حال ورود…" : "ورود با رمز و Authenticator"}</button><div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4 text-sm font-bold leading-7 text-emerald-100/80"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-300" /> نشست در سرور ثبت می‌شود و با خروج یا تغییر Permission فوراً قابل ابطال است.</div></div>}
        {message && access.kind !== "checking" && access.kind !== "unavailable" && <div role="alert" className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-300/[0.07] p-4 text-sm font-bold leading-7 text-rose-100">{message}</div>}
      </div></section>
    </div>
  </main>;
}
