"use client";

import Link from "next/link";
import {
  Apple,
  Chrome,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type AuthProviderId = "passkey" | "google" | "apple" | "telegram" | "email_otp";
type AuthProviderStatus = "configured" | "locked" | "planned" | "needs_evidence" | "disabled";
type AuthProviderRiskLevel = "standard" | "sensitive" | "critical";

type AuthProviderGate = {
  id: string;
  ready: boolean;
  labelFa: string;
};

type AuthProviderControl = {
  id: AuthProviderId;
  labelFa: string;
  providerFa: string;
  descriptionFa: string;
  status: AuthProviderStatus;
  riskLevel: AuthProviderRiskLevel;
  requiredPermission: string;
  stepUpRequired: boolean;
  adminLocked: boolean;
  callbackPath: string | null;
  gates: AuthProviderGate[];
  readinessPercent: number;
  missingGateIds: string[];
};

type AuthProviderSnapshot = {
  generatedAt: string;
  summary: {
    totalProviders: number;
    configuredProviders: number;
    lockedProviders: number;
    criticalProviders: number;
    stepUpProviders: number;
  };
  providers: AuthProviderControl[];
  safetyCopyFa: string;
};

const statusLabelFa: Record<AuthProviderStatus, string> = {
  configured: "Configured",
  locked: "قفل",
  planned: "در نقشه راه",
  needs_evidence: "نیازمند evidence",
  disabled: "خاموش",
};

const statusClassName: Record<AuthProviderStatus, string> = {
  configured: "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100",
  locked: "border-amber-300/20 bg-amber-300/[0.08] text-amber-100",
  planned: "border-violet-300/20 bg-violet-300/[0.08] text-violet-100",
  needs_evidence: "border-orange-300/20 bg-orange-300/[0.08] text-orange-100",
  disabled: "border-slate-300/15 bg-slate-300/[0.06] text-slate-300",
};

const riskClassName: Record<AuthProviderRiskLevel, string> = {
  standard: "border-slate-300/15 bg-slate-300/[0.05] text-slate-300",
  sensitive: "border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100",
  critical: "border-rose-300/20 bg-rose-300/[0.08] text-rose-100",
};

const providerIcons: Record<AuthProviderId, typeof KeyRound> = {
  passkey: KeyRound,
  google: Chrome,
  apple: Apple,
  telegram: MessageCircle,
  email_otp: Mail,
};

function StatusBadge({ status }: { status: AuthProviderStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClassName[status]}`}>
      {statusLabelFa[status]}
    </span>
  );
}

function RiskBadge({ risk }: { risk: AuthProviderRiskLevel }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${riskClassName[risk]}`}>
      {risk}
    </span>
  );
}

function providerActionLabel(provider: AuthProviderControl): string {
  if (provider.status === "configured") return "فعال و read-only";
  if (provider.adminLocked || provider.status === "locked" || provider.status === "needs_evidence") return "قفل تا تکمیل evidence";
  return "ارسال برای بازبینی";
}

export function AuthProviderControlPanel() {
  const [snapshot, setSnapshot] = useState<AuthProviderSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyProvider, setBusyProvider] = useState<AuthProviderId | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/command-center/auth-providers", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setSnapshot(null);
        setError("ابتدا از مسیر Command Center با Passkey وارد شو.");
        return;
      }
      if (response.status === 403) {
        setSnapshot(null);
        setError("برای مشاهده Provider Control، Permission ادمین admin.roles.read لازم است.");
        return;
      }
      if (!response.ok || !data?.ok) {
        setSnapshot(null);
        setError("Snapshot Provider Control در حال حاضر قابل دریافت نیست.");
        return;
      }
      setSnapshot((data.snapshot ?? null) as AuthProviderSnapshot | null);
    } catch {
      setSnapshot(null);
      setError("ارتباط با سرویس Provider Control برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const configuredText = useMemo(() => {
    if (!snapshot) return "—";
    return `${snapshot.summary.configuredProviders}/${snapshot.summary.totalProviders}`;
  }, [snapshot]);

  const requestEnable = async (providerId: AuthProviderId) => {
    setBusyProvider(providerId);
    setNotice("");
    try {
      const response = await fetch("/api/command-center/auth-providers", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, requestedState: "enabled" }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setNotice("Session ادمین منقضی شده؛ دوباره از Command Center وارد شو.");
        return;
      }
      if (data?.error === "step_up_required") {
        setNotice("فعال‌سازی Provider نیازمند ورود دوباره با Passkey و Step-up تازه است.");
        return;
      }
      if (data?.error === "auth_provider_control_locked") {
        const missing = Array.isArray(data.details?.missingGateIds) ? data.details.missingGateIds.length : 0;
        setNotice(`Provider هنوز قفل است؛ ${missing.toLocaleString("fa-IR")} گیت evidence کامل نشده است.`);
        return;
      }
      setNotice(response.ok ? "درخواست برای بازبینی پذیرفته شد." : "درخواست Provider Control پذیرفته نشد.");
    } catch {
      setNotice("ارتباط با سرویس Provider Control برقرار نشد.");
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <section dir="rtl" className="rounded-[30px] border border-white/10 bg-[#07111e] p-5 text-white md:p-6" aria-labelledby="auth-provider-control-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1.5 text-xs font-black text-cyan-100">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Auth Provider Control
          </p>
          <h1 id="auth-provider-control-title" className="mt-4 text-2xl font-black md:text-4xl">تنظیم Providerهای ورود از پنل ادمین</h1>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-8 text-slate-400">
            Google، Apple و گزینه‌های مکمل از همین سطح دیده می‌شوند، اما تا تکمیل Secret سمت سرور، callback allowlist، domain verification، account-linking و audit فعال نمی‌شوند.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/command-center/control-plane#identity"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] px-4 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            ماتریس کنترل‌پلین
          </Link>
          <Link
            href="/command-center"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-cyan-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            بازگشت به Command Center
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-cyan-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> تازه‌سازی
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm font-bold leading-7 text-amber-100">
          {error}
        </p>
      )}

      {notice && (
        <p role="status" className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] p-4 text-sm font-bold leading-7 text-cyan-100">
          {notice}
        </p>
      )}

      {loading && !snapshot && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-52 animate-pulse rounded-[24px] border border-white/10 bg-white/[0.035]" />
          ))}
        </div>
      )}

      {snapshot && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Providerها", snapshot.summary.totalProviders],
              ["Configured", configuredText],
              ["قفل/نیازمند evidence", snapshot.summary.lockedProviders],
              ["Step-up", snapshot.summary.stepUpProviders],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-[22px] border border-white/10 bg-[#030914] p-4">
                <p className="text-xs font-bold text-slate-500">{String(label)}</p>
                <p className="mt-2 font-mono text-2xl font-black text-white">{String(value)}</p>
              </div>
            ))}
          </div>

          <p className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4 text-sm font-bold leading-7 text-amber-100">
            {snapshot.safetyCopyFa}
          </p>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {snapshot.providers.map((provider) => {
              const Icon = providerIcons[provider.id];
              const activationLocked = provider.adminLocked || provider.status === "locked" || provider.status === "needs_evidence";
              const activationDisabled = busyProvider === provider.id || provider.status === "configured" || activationLocked;
              return (
                <article key={provider.id} className="rounded-[24px] border border-white/10 bg-[#030914] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.08]">
                        <Icon className="h-5 w-5 text-cyan-100" aria-hidden="true" />
                      </div>
                      <div>
                        <h2 className="text-base font-black text-white">{provider.labelFa}</h2>
                        <p className="mt-1 text-xs font-bold text-slate-500">{provider.providerFa}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={provider.status} />
                      <RiskBadge risk={provider.riskLevel} />
                    </div>
                  </div>

                  <p className="mt-4 text-sm font-bold leading-7 text-slate-400">{provider.descriptionFa}</p>

                  <div className="mt-4 grid gap-2 text-[11px] font-bold text-slate-400 sm:grid-cols-2">
                    <span className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">Permission: {provider.requiredPermission}</span>
                    <span className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">Readiness: {provider.readinessPercent}%</span>
                    <span className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">{provider.stepUpRequired ? "Step-up required" : "Standard"}</span>
                    <span dir="ltr" className="truncate rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left">{provider.callbackPath ?? "No callback"}</span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {provider.gates.map((gate) => (
                      <div key={gate.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs font-bold text-slate-400">
                        <span className="flex items-center gap-2">
                          {gate.ready ? <CheckCircle2 className="h-4 w-4 text-emerald-200" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4 text-amber-200" aria-hidden="true" />}
                          {gate.labelFa}
                        </span>
                        <span className={gate.ready ? "text-emerald-100" : "text-amber-100"}>{gate.ready ? "Ready" : "Locked"}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => void requestEnable(provider.id)}
                    disabled={activationDisabled}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] px-4 text-sm font-black text-amber-100 transition hover:bg-amber-300/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyProvider === provider.id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />}
                    {providerActionLabel(provider)}
                  </button>

                  {activationLocked && provider.status !== "configured" && (
                    <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-xs font-bold leading-6 text-amber-100">
                      این Provider تا تکمیل تمام evidence gateها و Step-up معتبر غیرقابل فعال‌سازی است.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
