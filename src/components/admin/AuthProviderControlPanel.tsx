"use client";

import Link from "next/link";
import {
  Apple,
  CheckCircle2,
  Clock3,
  CircleUserRound,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthProviderControlSnapshot } from "@/lib/admin-auth-provider-control-plane";
import type {
  AuthProviderReviewRequest,
  AuthProviderReviewRequestsByProvider,
  AuthProviderReviewRequestStatus,
} from "@/lib/admin-auth-provider-evidence-store";

type AuthProviderSnapshot = AuthProviderControlSnapshot;
type AuthProviderControl = AuthProviderSnapshot["providers"][number];
type AuthProviderId = AuthProviderControl["id"];
type AuthProviderStatus = AuthProviderControl["status"];
type AuthProviderRiskLevel = AuthProviderControl["riskLevel"];
type AuthProviderConfigStorage = AuthProviderControl["configurationFields"][number]["storage"];
type AuthProviderConfigStatus = AuthProviderControl["configurationFields"][number]["status"];
type AuthProviderAction = AuthProviderControl["adminActions"][number];
type AuthProviderEvidenceGateId = AuthProviderControl["gates"][number]["id"];
type AuthProviderReviewRequestedState = AuthProviderReviewRequest["requestedState"];
type EvidenceAction = "mark_missing" | "mark_ready" | "reject" | "expire";
type ReviewDecisionAction = "approve" | "reject";
type EvidenceFormState = {
  gateId: AuthProviderEvidenceGateId;
  action: EvidenceAction;
  evidenceRef: string;
  evidenceSha256: string;
  expiresAt: string;
  decisionNote: string;
};
type ReviewDecisionFormState = {
  decisionNote: string;
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

const storageLabelFa: Record<AuthProviderConfigStorage, string> = {
  admin_metadata: "Admin metadata",
  secret_store: "Secret store",
  callback_allowlist: "Callback allowlist",
  domain_verification: "Domain verification",
  policy: "Policy",
};

const fieldStatusLabelFa: Record<AuthProviderConfigStatus, string> = {
  configured: "Configured",
  missing: "Missing",
  managed: "Managed",
  planned: "Planned",
};

const fieldStatusClassName: Record<AuthProviderConfigStatus, string> = {
  configured: "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100",
  missing: "border-amber-300/20 bg-amber-300/[0.08] text-amber-100",
  managed: "border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100",
  planned: "border-violet-300/20 bg-violet-300/[0.08] text-violet-100",
};

const reviewStatusLabelFa: Record<AuthProviderReviewRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
  executed: "Executed",
};

const reviewStatusClassName: Record<AuthProviderReviewRequestStatus, string> = {
  pending: "border-amber-300/20 bg-amber-300/[0.08] text-amber-100",
  approved: "border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100",
  rejected: "border-rose-300/20 bg-rose-300/[0.08] text-rose-100",
  expired: "border-slate-300/15 bg-slate-300/[0.06] text-slate-300",
  cancelled: "border-slate-300/15 bg-slate-300/[0.06] text-slate-300",
  executed: "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100",
};

const reviewRequestedStateLabelFa: Record<AuthProviderReviewRequestedState, string> = {
  enabled: "فعال‌سازی",
  disabled: "خاموش‌سازی",
};

const evidenceActionLabelFa: Record<EvidenceAction, string> = {
  mark_ready: "Mark ready",
  reject: "Reject",
  expire: "Expire",
  mark_missing: "Mark missing",
};

const providerIcons: Record<AuthProviderId, typeof KeyRound> = {
  passkey: KeyRound,
  google: CircleUserRound,
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

function FieldStatusBadge({ status }: { status: AuthProviderConfigStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${fieldStatusClassName[status]}`}>
      {fieldStatusLabelFa[status]}
    </span>
  );
}

function ReviewStatusBadge({ status }: { status: AuthProviderReviewRequestStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${reviewStatusClassName[status]}`}>
      {reviewStatusLabelFa[status]}
    </span>
  );
}

function formatIsoDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function shortAuditHash(hash: string | null): string {
  if (!hash) return "—";
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function evidenceFormKey(providerId: AuthProviderId): string {
  return providerId;
}

function reviewDecisionFormKey(requestId: string): string {
  return requestId;
}

function defaultEvidenceForm(provider: AuthProviderControl): EvidenceFormState {
  return {
    gateId: provider.gates.find((gate) => !gate.ready)?.id ?? provider.gates[0]?.id ?? "client_registered",
    action: "mark_ready",
    evidenceRef: "",
    evidenceSha256: "",
    expiresAt: "",
    decisionNote: "",
  };
}

export function AuthProviderControlPanel() {
  const [snapshot, setSnapshot] = useState<AuthProviderSnapshot | null>(null);
  const [reviewRequestsByProvider, setReviewRequestsByProvider] = useState<AuthProviderReviewRequestsByProvider>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyProvider, setBusyProvider] = useState<AuthProviderId | null>(null);
  const [busyEvidenceKey, setBusyEvidenceKey] = useState<string | null>(null);
  const [evidenceForms, setEvidenceForms] = useState<Record<string, EvidenceFormState>>({});
  const [busyReviewRequestId, setBusyReviewRequestId] = useState<string | null>(null);
  const [reviewDecisionForms, setReviewDecisionForms] = useState<Record<string, ReviewDecisionFormState>>({});

  const fetchSnapshot = useCallback(async () => {
    try {
      const response = await fetch("/api/command-center/auth-providers", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setSnapshot(null);
        setReviewRequestsByProvider({});
        setError("ابتدا از مسیر Command Center با Passkey وارد شو.");
        return;
      }
      if (response.status === 403) {
        setSnapshot(null);
        setReviewRequestsByProvider({});
        setError("برای مشاهده Provider Control، Permission ادمین admin.roles.read لازم است.");
        return;
      }
      if (response.status === 503 && data?.error === "auth_provider_evidence_unavailable") {
        setSnapshot(null);
        setReviewRequestsByProvider({});
        setError("Evidence store ورود اجتماعی در دسترس نیست؛ schema یا اتصال دیتابیس باید بررسی شود.");
        return;
      }
      if (response.status === 503 && data?.error === "auth_provider_review_requests_unavailable") {
        setSnapshot(null);
        setReviewRequestsByProvider({});
        setError("Approval queue ورود اجتماعی در دسترس نیست؛ schema کنترل‌پلین یا اتصال audit باید بررسی شود.");
        return;
      }
      if (!response.ok || !data?.ok) {
        setSnapshot(null);
        setReviewRequestsByProvider({});
        setError("Snapshot Provider Control در حال حاضر قابل دریافت نیست.");
        return;
      }
      setSnapshot((data.snapshot ?? null) as AuthProviderSnapshot | null);
      setReviewRequestsByProvider((data.reviewRequestsByProvider ?? {}) as AuthProviderReviewRequestsByProvider);
      setError("");
    } catch {
      setSnapshot(null);
      setReviewRequestsByProvider({});
      setError("ارتباط با سرویس Provider Control برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    await fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchSnapshot();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchSnapshot]);

  const configuredText = useMemo(() => {
    if (!snapshot) return "—";
    return `${snapshot.summary.configuredProviders}/${snapshot.summary.totalProviders}`;
  }, [snapshot]);

  const pendingReviewCount = useMemo(
    () => Object.values(reviewRequestsByProvider)
      .flat()
      .filter((request) => request.status === "pending")
      .length,
    [reviewRequestsByProvider],
  );

  const runProviderAction = async (provider: AuthProviderControl, action: AuthProviderAction) => {
    if (!action.enabled) return;
    if (action.id === "open_setup") {
      setNotice(`Setup ${provider.labelFa} در همین کارت قابل بررسی است؛ مقدار Secret نمایش داده نمی‌شود.`);
      return;
    }
    const requestedState = action.id === "request_disable" ? "disabled" : action.id === "request_enable" ? "enabled" : null;
    if (!requestedState) {
      setNotice("این عملیات هنوز به endpoint اجرایی audit شده وصل نشده است.");
      return;
    }

    setBusyProvider(provider.id);
    setNotice("");
    try {
      const response = await fetch("/api/command-center/auth-providers", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider.id, requestedState }),
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
      if (data?.error === "auth_provider_evidence_unavailable") {
        setNotice("Evidence store در دسترس نیست؛ بدون evidence سمت سرور هیچ Provider فعال نمی‌شود.");
        return;
      }
      if (!response.ok || !data?.ok) {
        setNotice("درخواست Provider Control پذیرفته نشد.");
        return;
      }
      const reviewRequestId = typeof data.reviewRequest?.approvalRequestId === "string"
        ? data.reviewRequest.approvalRequestId
        : null;
      setNotice(reviewRequestId
        ? `درخواست برای بازبینی پذیرفته شد. Approval ID: ${reviewRequestId}`
        : "درخواست برای بازبینی پذیرفته شد.");
      await fetchSnapshot();
    } catch {
      setNotice("ارتباط با سرویس Provider Control برقرار نشد.");
    } finally {
      setBusyProvider(null);
    }
  };

  const resolveEvidenceForm = (provider: AuthProviderControl): EvidenceFormState =>
    evidenceForms[evidenceFormKey(provider.id)] ?? defaultEvidenceForm(provider);

  const resolveReviewDecisionForm = (request: AuthProviderReviewRequest): ReviewDecisionFormState =>
    reviewDecisionForms[reviewDecisionFormKey(request.id)] ?? { decisionNote: "" };

  const updateEvidenceForm = (provider: AuthProviderControl, patch: Partial<EvidenceFormState>) => {
    setEvidenceForms((current) => {
      const key = evidenceFormKey(provider.id);
      return {
        ...current,
        [key]: {
          ...(current[key] ?? defaultEvidenceForm(provider)),
          ...patch,
        },
      };
    });
  };

  const updateReviewDecisionForm = (request: AuthProviderReviewRequest, patch: Partial<ReviewDecisionFormState>) => {
    setReviewDecisionForms((current) => {
      const key = reviewDecisionFormKey(request.id);
      return {
        ...current,
        [key]: {
          ...(current[key] ?? { decisionNote: "" }),
          ...patch,
        },
      };
    });
  };

  const submitEvidenceMutation = async (provider: AuthProviderControl) => {
    if (provider.id === "passkey") return;
    const form = resolveEvidenceForm(provider);
    const key = evidenceFormKey(provider.id);
    setBusyEvidenceKey(key);
    setNotice("");
    try {
      const response = await fetch("/api/command-center/auth-providers", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.id,
          gateId: form.gateId,
          action: form.action,
          evidenceRef: form.action === "mark_ready" ? form.evidenceRef : null,
          evidenceSha256: form.action === "mark_ready" ? form.evidenceSha256 : null,
          expiresAt: form.action === "mark_ready" ? form.expiresAt : null,
          decisionNote: form.decisionNote,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setNotice("Session ادمین منقضی شده؛ دوباره از Command Center وارد شو.");
        return;
      }
      if (data?.error === "step_up_required") {
        setNotice("ثبت evidence نیازمند ورود دوباره با Passkey و Step-up تازه است.");
        return;
      }
      if (data?.error === "auth_provider_evidence_secret_like_input") {
        setNotice("ورودی شبیه Secret/Token خام است؛ فقط reference و SHA-256 مجاز است.");
        return;
      }
      if (data?.error === "auth_provider_evidence_ready_requires_reference") {
        setNotice("برای Mark ready باید Evidence reference و SHA-256 معتبر وارد شود.");
        return;
      }
      if (data?.error === "auth_provider_evidence_reason_required") {
        setNotice("برای Reject/Expire/Mark missing باید دلیل کوتاه audit-ready وارد شود.");
        return;
      }
      if (data?.error === "auth_provider_evidence_expiry_invalid") {
        setNotice("تاریخ انقضا باید معتبر و در آینده باشد.");
        return;
      }
      if (data?.error === "auth_provider_evidence_unavailable") {
        setNotice("Evidence store در دسترس نیست؛ schema یا اتصال دیتابیس باید بررسی شود.");
        return;
      }
      if (!response.ok || !data?.ok) {
        setNotice("ثبت evidence پذیرفته نشد.");
        return;
      }
      if (data.snapshot) {
        setSnapshot(data.snapshot as AuthProviderSnapshot);
      }
      setNotice("Evidence gate با audit append-only ثبت شد.");
    } catch {
      setNotice("ارتباط با سرویس Evidence Control برقرار نشد.");
    } finally {
      setBusyEvidenceKey(null);
    }
  };

  const submitReviewDecision = async (request: AuthProviderReviewRequest, decision: ReviewDecisionAction) => {
    const form = resolveReviewDecisionForm(request);
    setBusyReviewRequestId(request.id);
    setNotice("");
    try {
      const response = await fetch("/api/command-center/auth-providers/review-requests", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalRequestId: request.id,
          decision,
          decisionNote: form.decisionNote,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setNotice("Session ادمین منقضی شده؛ دوباره از Command Center وارد شو.");
        return;
      }
      if (data?.error === "step_up_required") {
        setNotice("تصمیم روی Approval queue نیازمند ورود دوباره با Passkey و Step-up تازه است.");
        return;
      }
      if (data?.error === "auth_provider_review_decision_reason_required") {
        setNotice("برای approve/reject باید دلیل audit-ready حداقل ۱۰ کاراکتری وارد شود.");
        return;
      }
      if (data?.error === "auth_provider_review_decision_secret_like_input") {
        setNotice("Decision reason نباید Secret/Token خام داشته باشد.");
        return;
      }
      if (data?.error === "auth_provider_review_request_self_review_forbidden") {
        setNotice("Dual-control فعال است؛ درخواست‌دهنده نمی‌تواند همان درخواست را approve/reject کند.");
        return;
      }
      if (data?.error === "auth_provider_review_request_expired") {
        setNotice("این درخواست منقضی شده و برای تصمیم جدید باید request تازه ثبت شود.");
        await fetchSnapshot();
        return;
      }
      if (data?.error === "auth_provider_review_request_not_pending") {
        setNotice("این درخواست دیگر pending نیست؛ queue تازه‌سازی می‌شود.");
        await fetchSnapshot();
        return;
      }
      if (data?.error === "auth_provider_review_request_not_found") {
        setNotice("Approval request در tenant/workspace فعلی پیدا نشد.");
        return;
      }
      if (data?.error === "auth_provider_review_decision_unavailable") {
        setNotice("Approval decision store در دسترس نیست؛ اتصال دیتابیس یا schema باید بررسی شود.");
        return;
      }
      if (!response.ok || !data?.ok) {
        setNotice("تصمیم Approval queue پذیرفته نشد.");
        return;
      }
      if (data.reviewRequestsByProvider) {
        setReviewRequestsByProvider(data.reviewRequestsByProvider as AuthProviderReviewRequestsByProvider);
      }
      setReviewDecisionForms((current) => {
        const next = { ...current };
        delete next[reviewDecisionFormKey(request.id)];
        return next;
      });
      setNotice(decision === "approve"
        ? "Approval request با audit append-only تأیید شد؛ execution واقعی در مرحله بعد انجام می‌شود."
        : "Approval request با audit append-only رد شد.");
      await fetchSnapshot();
    } catch {
      setNotice("ارتباط با سرویس Approval Decision برقرار نشد.");
    } finally {
      setBusyReviewRequestId(null);
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
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Providerها", snapshot.summary.totalProviders],
              ["Configured", configuredText],
              ["قفل/نیازمند evidence", snapshot.summary.lockedProviders],
              ["Step-up", snapshot.summary.stepUpProviders],
              ["Review queue", pendingReviewCount],
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
              const evidenceForm = resolveEvidenceForm(provider);
              const currentEvidenceKey = evidenceFormKey(provider.id);
              const evidenceBusy = busyEvidenceKey === currentEvidenceKey;
              const readyEvidenceAction = evidenceForm.action === "mark_ready";
              const providerReviewRequests = reviewRequestsByProvider[provider.id] ?? [];
              const pendingReview = providerReviewRequests.find((request) => request.status === "pending") ?? null;
              return (
                <article key={provider.id} className="rounded-[24px] border border-white/10 bg-[#030914] p-4 md:p-5">
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

                  {pendingReview && (
                    <p className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs font-black leading-6 text-amber-100">
                      <Clock3 className="h-4 w-4" aria-hidden="true" />
                      درخواست {reviewRequestedStateLabelFa[pendingReview.requestedState]} در صف approval است؛ انقضا:
                      <span dir="ltr" className="font-mono">{formatIsoDateTime(pendingReview.expiresAt)}</span>
                    </p>
                  )}

                  <div className="mt-4 grid gap-2 text-[11px] font-bold text-slate-400 sm:grid-cols-2">
                    <span className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">Permission: {provider.requiredPermission}</span>
                    <span className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">Readiness: {provider.readinessPercent}%</span>
                    <span className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">{provider.stepUpRequired ? "Step-up required" : "Standard"}</span>
                    <span dir="ltr" className="truncate rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left">{provider.callbackPath ?? "No callback"}</span>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(280px,0.92fr)]">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-black text-slate-300">Setup fields</h3>
                        <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-2.5 py-1 text-[10px] font-black text-cyan-100">
                          Secret value hidden
                        </span>
                      </div>
                      <div className="mt-2 space-y-2">
                        {provider.configurationFields.map((field) => (
                          <div key={`${provider.id}-${field.id}`} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-black text-slate-200">{field.labelFa}</p>
                              <FieldStatusBadge status={field.status} />
                            </div>
                            <p className="mt-1 text-[11px] font-bold leading-6 text-slate-500">{field.helperFa}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="rounded-full border border-white/10 bg-[#030914] px-2 py-0.5 text-[10px] font-bold text-slate-400">
                                {storageLabelFa[field.storage]}
                              </span>
                              <span className="rounded-full border border-white/10 bg-[#030914] px-2 py-0.5 text-[10px] font-bold text-slate-400">
                                {field.required ? "Required" : "Optional"}
                              </span>
                              <span className="rounded-full border border-white/10 bg-[#030914] px-2 py-0.5 text-[10px] font-bold text-slate-400">
                                {field.masked ? "Masked" : "Visible metadata"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      {provider.id !== "passkey" && (
                        <form
                          className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void submitEvidenceMutation(provider);
                          }}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-xs font-black text-cyan-100">Evidence writer</h3>
                              <p className="mt-1 text-[11px] font-bold leading-6 text-slate-500">
                                Secret خام وارد نکن؛ فقط reference و fingerprint ثبت می‌شود.
                              </p>
                            </div>
                            <span className="rounded-full border border-cyan-300/15 bg-[#030914] px-2 py-0.5 text-[10px] font-black text-cyan-100">
                              Audit append-only
                            </span>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <label className="text-[11px] font-black text-slate-300" htmlFor={`${provider.id}-evidence-gate`}>
                              Evidence gate
                              <select
                                id={`${provider.id}-evidence-gate`}
                                value={evidenceForm.gateId}
                                onChange={(event) => updateEvidenceForm(provider, { gateId: event.target.value as AuthProviderEvidenceGateId })}
                                className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-xs font-bold text-white outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/25"
                              >
                                {provider.gates.map((gate) => (
                                  <option key={gate.id} value={gate.id}>{gate.labelFa}</option>
                                ))}
                              </select>
                            </label>

                            <label className="text-[11px] font-black text-slate-300" htmlFor={`${provider.id}-evidence-action`}>
                              Action
                              <select
                                id={`${provider.id}-evidence-action`}
                                value={evidenceForm.action}
                                onChange={(event) => updateEvidenceForm(provider, { action: event.target.value as EvidenceAction })}
                                className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-xs font-bold text-white outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/25"
                              >
                                {(["mark_ready", "reject", "expire", "mark_missing"] as const).map((action) => (
                                  <option key={action} value={action}>{evidenceActionLabelFa[action]}</option>
                                ))}
                              </select>
                            </label>
                          </div>

                          {readyEvidenceAction ? (
                            <div className="mt-2 grid gap-2">
                              <label className="text-[11px] font-black text-slate-300" htmlFor={`${provider.id}-evidence-ref`}>
                                Evidence reference
                                <input
                                  id={`${provider.id}-evidence-ref`}
                                  value={evidenceForm.evidenceRef}
                                  onChange={(event) => updateEvidenceForm(provider, { evidenceRef: event.target.value })}
                                  placeholder="vault://oauth/google/client-secret"
                                  className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-left font-mono text-xs font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/25"
                                  dir="ltr"
                                />
                              </label>

                              <label className="text-[11px] font-black text-slate-300" htmlFor={`${provider.id}-evidence-sha`}>
                                SHA-256 fingerprint
                                <input
                                  id={`${provider.id}-evidence-sha`}
                                  value={evidenceForm.evidenceSha256}
                                  onChange={(event) => updateEvidenceForm(provider, { evidenceSha256: event.target.value })}
                                  placeholder="64 lowercase hex characters"
                                  className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-left font-mono text-xs font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/25"
                                  dir="ltr"
                                />
                              </label>

                              <label className="text-[11px] font-black text-slate-300" htmlFor={`${provider.id}-evidence-expiry`}>
                                Optional expiry
                                <input
                                  id={`${provider.id}-evidence-expiry`}
                                  value={evidenceForm.expiresAt}
                                  onChange={(event) => updateEvidenceForm(provider, { expiresAt: event.target.value })}
                                  placeholder="2026-12-31T23:59:00.000Z"
                                  className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-left font-mono text-xs font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/25"
                                  dir="ltr"
                                />
                              </label>
                            </div>
                          ) : (
                            <label className="mt-2 block text-[11px] font-black text-slate-300" htmlFor={`${provider.id}-evidence-note`}>
                              Decision reason
                              <input
                                id={`${provider.id}-evidence-note`}
                                value={evidenceForm.decisionNote}
                                onChange={(event) => updateEvidenceForm(provider, { decisionNote: event.target.value })}
                                placeholder="ticket-1234 callback mismatch"
                                className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-xs font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/25"
                              />
                            </label>
                          )}

                          <button
                            type="submit"
                            disabled={evidenceBusy}
                            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.1] px-4 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/[0.15] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {evidenceBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                            ثبت evidence gate
                          </button>
                        </form>
                      )}

                      {provider.id !== "passkey" && (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-xs font-black text-slate-300">Approval queue</h3>
                              <p className="mt-1 text-[11px] font-bold leading-6 text-slate-500">
                                آخرین درخواست‌های enable/disable با audit trace همین provider.
                              </p>
                            </div>
                            <span className="rounded-full border border-white/10 bg-[#030914] px-2.5 py-1 text-[10px] font-black text-slate-300">
                              {providerReviewRequests.length.toLocaleString("fa-IR")} رکورد
                            </span>
                          </div>

                          {providerReviewRequests.length === 0 ? (
                            <p className="mt-3 rounded-xl border border-white/10 bg-[#030914] px-3 py-2 text-[11px] font-bold leading-6 text-slate-500">
                              هنوز درخواست بازبینی برای این Provider ثبت نشده است.
                            </p>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {providerReviewRequests.map((request) => {
                                const decisionForm = resolveReviewDecisionForm(request);
                                const decisionBusy = busyReviewRequestId === request.id;
                                const pending = request.status === "pending";
                                const noteTooShort = decisionForm.decisionNote.trim().length < 10;

                                return (
                                  <div key={request.id} className="rounded-xl border border-white/10 bg-[#030914] px-3 py-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-xs font-black text-white">
                                        {reviewRequestedStateLabelFa[request.requestedState]}
                                      </p>
                                      <ReviewStatusBadge status={request.status} />
                                    </div>
                                    <div className="mt-2 grid gap-1.5 text-[10px] font-bold text-slate-500 sm:grid-cols-2">
                                      <span dir="ltr" className="truncate text-left font-mono">ID: {request.id}</span>
                                      <span dir="ltr" className="truncate text-left font-mono">Audit: {shortAuditHash(request.auditEventHash)}</span>
                                      <span>ثبت: {formatIsoDateTime(request.requestedAt)}</span>
                                      <span>انقضا: {formatIsoDateTime(request.expiresAt)}</span>
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-[11px] font-bold leading-6 text-slate-500">
                                      {request.reason}
                                    </p>

                                    {pending && (
                                      <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-2">
                                        <label className="block text-[11px] font-black text-amber-100" htmlFor={`${request.id}-review-note`}>
                                          Decision reason
                                          <input
                                            id={`${request.id}-review-note`}
                                            value={decisionForm.decisionNote}
                                            onChange={(event) => updateReviewDecisionForm(request, { decisionNote: event.target.value })}
                                            placeholder="independent reviewer verified evidence ticket"
                                            className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-xs font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/20"
                                          />
                                        </label>
                                        <p className="mt-2 text-[10px] font-bold leading-5 text-slate-500">
                                          Dual-control سمت سرور enforce می‌شود؛ requester خودش نمی‌تواند تصمیم بگیرد.
                                        </p>
                                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                          <button
                                            type="button"
                                            disabled={decisionBusy || noteTooShort}
                                            onClick={() => void submitReviewDecision(request, "approve")}
                                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-55"
                                          >
                                            {decisionBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                                            Approve
                                          </button>
                                          <button
                                            type="button"
                                            disabled={decisionBusy || noteTooShort}
                                            onClick={() => void submitReviewDecision(request, "reject")}
                                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[0.08] px-3 text-xs font-black text-rose-100 transition hover:bg-rose-300/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-55"
                                          >
                                            {decisionBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />}
                                            Reject
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <h3 className={`${provider.id === "passkey" ? "" : "mt-4"} text-xs font-black text-slate-300`}>Admin operations</h3>
                      <div className="mt-2 space-y-2">
                        {provider.adminActions.map((action) => {
                          const disabled = !action.enabled || busyProvider === provider.id;
                          const actionBusy = busyProvider === provider.id && ["request_enable", "request_disable"].includes(action.id);
                          const actionableClassName =
                            action.id === "request_enable"
                              ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-100 hover:bg-amber-300/[0.12] focus-visible:ring-amber-300"
                              : "border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100 hover:bg-cyan-300/[0.12] focus-visible:ring-cyan-300";
                          const lockedClassName = "border-white/10 bg-white/[0.025] text-slate-500";

                          return (
                            <button
                              key={action.id}
                              type="button"
                              onClick={() => void runProviderAction(provider, action)}
                              disabled={disabled}
                              title={action.disabledReasonFa ?? action.descriptionFa}
                              className={`min-h-11 w-full rounded-xl border px-3 py-2 text-right transition focus-visible:outline-none focus-visible:ring-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 ${
                                action.enabled ? actionableClassName : lockedClassName
                              }`}
                            >
                              <span className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-2 text-xs font-black">
                                  {actionBusy ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                                  ) : action.locked ? (
                                    <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                  )}
                                  {action.labelFa}
                                </span>
                                <span className="text-[10px] font-black uppercase">{action.stepUpRequired ? "Step-up" : "Read"}</span>
                              </span>
                              <span className="mt-1 block text-[11px] font-bold leading-6 opacity-80">
                                {action.disabledReasonFa ?? action.descriptionFa}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <h3 className="text-xs font-black text-slate-300">Evidence gates</h3>
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
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
