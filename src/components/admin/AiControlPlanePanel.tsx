"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  FileSearch,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Workflow,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProviderId = "openai" | "anthropic" | "perplexity" | "xai" | "openrouter" | "x_api";
type ModelProviderId = Exclude<ProviderId, "x_api">;
type AgentId =
  | "mentor_coach"
  | "news_x_researcher"
  | "coin_tool_researcher"
  | "content_reviewer"
  | "executive_briefing"
  | "knowledge_curator"
  | "risk_compliance_reviewer";

type ProviderCatalog = {
  id: ProviderId;
  kind: "model" | "data_connector";
  label: string;
  purposeFa: string;
  capabilities: string[];
  fixedEndpointHost: string;
  secretLabel: string;
};

type Limits = {
  dailyRequests: number;
  dailyTokens: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  monthlyBudgetUsdMicros: number;
};

type AgentCatalog = {
  id: AgentId;
  labelFa: string;
  responsibilityFa: string;
  allowedProviders: ModelProviderId[];
  allowedTools: string[];
  readableScopes: string[];
  forbiddenActions: string[];
  approvalMode: string;
  citationsRequired: boolean;
  mayReceivePrivateUserData: boolean;
  mayPublish: false;
  openRouterFallback: {
    allowedDataClasses: string[];
    freeAllowed: boolean;
    requireZeroDataRetention: true;
    denyProviderDataCollection: true;
  };
  defaultLimits: Limits;
};

type WorkflowCatalog = {
  id: string;
  labelFa: string;
  stages: string[];
  externalEffect: string;
};

type ProviderSnapshot = {
  providerId: ProviderId;
  enabled: boolean;
  secretConfigured: boolean;
  keyFingerprint: string | null;
  revision: number;
  rotatedAt: string | null;
  lastTestStatus: "passed" | "failed" | null;
  lastTestedAt: string | null;
  updatedAt: string | null;
  configurationSource: "managed" | "environment" | "unconfigured";
};

type AgentSnapshot = {
  agentId: AgentId;
  configured: boolean;
  enabled: boolean;
  providerId: ModelProviderId | null;
  model: string | null;
  fallbackModel: string | null;
  limits: Limits;
  approvalMode: string;
  revision: number;
  updatedAt: string | null;
  providerReady: boolean;
  routing: {
    openRouterFallbackEnabled: boolean;
    openRouterModel: string | null;
    freeFallbackEnabled: boolean;
    openRouterCreditFloorUsdMicros: number;
    fallbackProviderReady: boolean;
  };
};

type SourceReference = { url: string; title: string | null };
type KnowledgeSnapshot = {
  id: string;
  knowledgeType: string;
  subjectType: string;
  subjectId: string | null;
  statement: string;
  contentHash: string;
  evidenceRefs: SourceReference[];
  confidence: number;
  dataClass: string;
  status: "candidate" | "verified" | "rejected" | "superseded";
  derivedByAgent: AgentId | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

type Snapshot = {
  providers: ProviderSnapshot[];
  agents: AgentSnapshot[];
  knowledge: KnowledgeSnapshot[];
  knowledgeSummary: Record<KnowledgeSnapshot["status"], number>;
  usageToday: Record<AgentId, { requestCount: number; reservedTokens: number }>;
  openRouterQuota: {
    status: "healthy" | "low" | "exhausted" | "rate_limited" | "unavailable";
    limitUsdMicros: number | null;
    remainingUsdMicros: number | null;
    usageUsdMicros: number | null;
    isFreeTier: boolean | null;
    source: "provider_api" | "request_failure" | "worker_probe";
    checkedAt: string;
  } | null;
};

type Catalog = {
  providers: ProviderCatalog[];
  agents: AgentCatalog[];
  workflows: WorkflowCatalog[];
};

type OpenRouterQuotaStatus = NonNullable<Snapshot["openRouterQuota"]>["status"];

type ProviderForm = { enabled: boolean; apiKey: string; testModel: string };
type AgentForm = {
  enabled: boolean;
  providerId: ModelProviderId;
  model: string;
  fallbackModel: string;
  dailyRequests: string;
  dailyTokens: string;
  maxInputTokens: string;
  maxOutputTokens: string;
  monthlyBudgetUsd: string;
  openRouterFallbackEnabled: boolean;
  openRouterModel: string;
  freeFallbackEnabled: boolean;
  openRouterCreditFloorUsd: string;
};

const providerOrder: ProviderId[] = ["openai", "anthropic", "perplexity", "xai", "openrouter", "x_api"];
const inputClass = "min-h-11 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-sm font-bold text-white outline-none transition-colors focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black outline-none transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none";

function providerForm(snapshot?: ProviderSnapshot): ProviderForm {
  return { enabled: snapshot?.enabled ?? false, apiKey: "", testModel: "" };
}

function agentForm(snapshot: AgentSnapshot | undefined, definition: AgentCatalog): AgentForm {
  const limits = snapshot?.limits ?? definition.defaultLimits;
  return {
    enabled: snapshot?.enabled ?? false,
    providerId: snapshot?.providerId ?? definition.allowedProviders[0],
    model: snapshot?.model ?? "",
    fallbackModel: snapshot?.fallbackModel ?? "",
    dailyRequests: String(limits.dailyRequests),
    dailyTokens: String(limits.dailyTokens),
    maxInputTokens: String(limits.maxInputTokens),
    maxOutputTokens: String(limits.maxOutputTokens),
    monthlyBudgetUsd: String(limits.monthlyBudgetUsdMicros / 1_000_000),
    openRouterFallbackEnabled: snapshot?.routing.openRouterFallbackEnabled ?? false,
    openRouterModel: snapshot?.routing.openRouterModel ?? "",
    freeFallbackEnabled: snapshot?.routing.freeFallbackEnabled ?? false,
    openRouterCreditFloorUsd: String(
      (snapshot?.routing.openRouterCreditFloorUsdMicros ?? 0) / 1_000_000,
    ),
  };
}

function dateLabel(value: string | null): string {
  if (!value) return "ثبت نشده";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function usdLabel(value: number | null): string {
  if (value === null) return "نامشخص";
  return new Intl.NumberFormat("fa-IR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value / 1_000_000);
}

function quotaStatusLabel(status: OpenRouterQuotaStatus): string {
  return {
    healthy: "سالم",
    low: "اعتبار کم",
    exhausted: "اعتبار تمام‌شده",
    rate_limited: "محدودشده",
    unavailable: "نامعلوم — مسیر پولی بسته",
  }[status];
}

function errorMessage(code: unknown): string {
  const messages: Record<string, string> = {
    admin_session_required: "نشست مدیریتی منقضی شده است؛ دوباره وارد شوید.",
    admin_session_invalid: "نشست مدیریتی معتبر نیست.",
    permission_denied: "Permission لازم برای این عملیات به نقش فعلی داده نشده است.",
    step_up_required: "برای این تغییر حساس دوباره با رمز و Authenticator وارد شوید.",
    ai_control_plane_unavailable: "دیتابیس کنترل‌پلین AI در دسترس نیست.",
    ai_provider_secret_required: "ابتدا کلید معتبر Provider را ثبت کنید.",
    ai_provider_test_failed: "تست Provider ناموفق بود؛ کلید، مدل و دسترسی حساب را بررسی کنید.",
    ai_provider_quota_evidence_unavailable: "تست انجام شد اما evidence سهمیه ثبت نشد؛ برای جلوگیری از تصمیم هزینه‌ای نامطمئن، نتیجه پذیرفته نشد.",
    ai_agent_provider_not_ready: "Provider باید فعال، دارای کلید و دارای تست موفق باشد.",
    ai_agent_provider_forbidden: "این Provider در قرارداد ثابت این ایجنت مجاز نیست.",
    ai_agent_fallback_provider_not_ready: "OpenRouter باید فعال، دارای کلید و تست موفق باشد.",
    ai_agent_invalid_routing: "تنظیم fallback معتبر نیست؛ مدل پولی، کف اعتبار و مجوز مدل رایگان را بررسی کنید.",
    ai_agent_invalid_model: "نام مدل معتبر نیست یا مدل رایگان برای داده‌های این ایجنت مجاز نیست.",
    ai_agent_input_limit: "حجم ورودی از سقف تنظیم‌شدهٔ این ایجنت بیشتر است.",
    ai_agent_output_limit: "سقف خروجی درخواستی از قرارداد این ایجنت بیشتر است.",
    ai_research_query_blocked: "پرسش شامل داده خصوصی، Secret یا الگوی تزریق دستور است و ارسال نشد.",
    ai_research_sources_required: "Provider منبع قابل‌تأیید برنگرداند؛ پیش‌نویس پذیرفته نشد.",
    ai_research_output_rejected: "خروجی از مرز ایمنی مالی یا امنیتی عبور نکرد.",
    ai_workflow_evidence_unavailable: "Evidence اجرای workflow ثبت نشد؛ فراخوانی متوقف شد.",
  };
  return messages[typeof code === "string" ? code : ""] ?? "عملیات کامل نشد؛ ورودی، دسترسی و وضعیت Provider را بررسی کنید.";
}

function providerTestMessage(data: unknown): string {
  const payload = data && typeof data === "object"
    ? data as { error?: unknown; details?: { reason?: unknown; attempts?: unknown } }
    : {};
  const reason = payload.details?.reason;
  const attempts = Number(payload.details?.attempts);
  const suffix = Number.isSafeInteger(attempts) && attempts > 1
    ? ` پس از ${new Intl.NumberFormat("fa-IR").format(attempts)} تلاش کنترل‌شده.`
    : "";
  const messages: Record<string, string> = {
    rate_limited: "ظرفیت مدل انتخاب‌شده موقتاً محدود است؛ تک‌پی تلاش مجدد و مسیریابی جایگزین را انجام داد. چند دقیقه دیگر دوباره تست کنید.",
    quota_exhausted: "اعتبار یا سهمیه این Provider تمام شده است؛ مسیر fallback را فعال یا اعتبار حساب را بررسی کنید.",
    timeout: "Provider در مهلت امن پاسخ نداد؛ وضعیت سرویس و شبکه را بررسی و کمی بعد دوباره تلاش کنید.",
    network_error: "ارتباط امن با Provider برقرار نشد؛ اتصال شبکه یا وضعیت سرویس را بررسی کنید.",
    circuit_open: "مدار حفاظتی Provider پس از خطاهای متوالی موقتاً باز شده است؛ کمی بعد دوباره تست کنید.",
    invalid_response: "Provider پاسخ موفق اما بدون محتوای قابل‌استفاده برگرداند؛ مدل دیگری انتخاب کنید یا دوباره تلاش کنید.",
    provider_rejected: "Provider درخواست را نپذیرفت؛ نام مدل و سطح دسترسی حساب را بررسی کنید.",
  };
  return (messages[typeof reason === "string" ? reason : ""] ?? errorMessage(payload.error)) + suffix;
}

function StatusPill({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${ready ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100" : "border-amber-300/20 bg-amber-300/[0.08] text-amber-100"}`}>
      {children}
    </span>
  );
}

export function AiControlPlanePanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [providerForms, setProviderForms] = useState<Partial<Record<ProviderId, ProviderForm>>>({});
  const [agentForms, setAgentForms] = useState<Partial<Record<AgentId, AgentForm>>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [providerMessages, setProviderMessages] = useState<Partial<Record<ProviderId, { kind: "error" | "success"; text: string }>>>({});
  const [research, setResearch] = useState({
    agentId: "news_x_researcher" as "news_x_researcher" | "coin_tool_researcher",
    query: "",
    stageAsCandidate: false,
  });
  const [researchResult, setResearchResult] = useState<{
    draft: string;
    sources: SourceReference[];
    providerId: ModelProviderId;
    model: string;
    publicationAuthority: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/command-center/ai-control-plane", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data.snapshot || !data.catalog) {
        setError(errorMessage(data?.error));
        return;
      }
      const nextSnapshot = data.snapshot as Snapshot;
      const nextCatalog = data.catalog as Catalog;
      setSnapshot(nextSnapshot);
      setCatalog(nextCatalog);
      setProviderForms(Object.fromEntries(
        providerOrder.map((id) => [id, providerForm(nextSnapshot.providers.find((item) => item.providerId === id))]),
      ));
      setAgentForms(Object.fromEntries(
        nextCatalog.agents.map((definition) => [
          definition.id,
          agentForm(nextSnapshot.agents.find((item) => item.agentId === definition.id), definition),
        ]),
      ));
    } catch {
      setError("ارتباط امن با کنترل‌پلین AI برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const pending = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(pending);
  }, [load]);

  const readiness = useMemo(() => {
    const providers = snapshot?.providers.filter((item) => item.enabled && item.secretConfigured && item.lastTestStatus === "passed").length ?? 0;
    const agents = snapshot?.agents.filter((item) => item.enabled && item.providerReady).length ?? 0;
    return { providers, agents };
  }, [snapshot]);

  const updateProviderForm = (id: ProviderId, patch: Partial<ProviderForm>) => {
    setProviderForms((current) => ({
      ...current,
      [id]: { ...(current[id] ?? providerForm()), ...patch },
    }));
  };

  const updateAgentForm = (id: AgentId, definition: AgentCatalog, patch: Partial<AgentForm>) => {
    setAgentForms((current) => ({
      ...current,
      [id]: { ...(current[id] ?? agentForm(undefined, definition)), ...patch },
    }));
  };

  const saveProvider = async (id: ProviderId) => {
    const form = providerForms[id] ?? providerForm();
    setBusy(`provider:${id}`);
    setError("");
    setNotice("");
    setProviderMessages((current) => ({ ...current, [id]: undefined }));
    try {
      const response = await fetch("/api/command-center/ai-control-plane", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_provider",
          providerId: id,
          enabled: form.enabled,
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        const text = errorMessage(data?.error);
        setError(text);
        setProviderMessages((current) => ({ ...current, [id]: { kind: "error", text } }));
        return;
      }
      const text = "تنظیم Provider رمز‌شده ذخیره شد. پس از ثبت یا چرخش کلید، تست اتصال را دوباره اجرا کنید.";
      setNotice(text);
      setProviderMessages((current) => ({ ...current, [id]: { kind: "success", text } }));
      await load();
    } catch {
      const text = "ذخیره Provider انجام نشد؛ وضعیت قبلی حفظ شد.";
      setError(text);
      setProviderMessages((current) => ({ ...current, [id]: { kind: "error", text } }));
    } finally {
      setBusy(null);
    }
  };

  const testProvider = async (id: ProviderId) => {
    const form = providerForms[id] ?? providerForm();
    setBusy(`test:${id}`);
    setError("");
    setNotice("");
    setProviderMessages((current) => ({ ...current, [id]: undefined }));
    try {
      const response = await fetch("/api/command-center/ai-control-plane", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_provider",
          providerId: id,
          ...(id === "x_api" ? {} : { model: form.testModel }),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        const text = providerTestMessage(data);
        setError(text);
        setProviderMessages((current) => ({ ...current, [id]: { kind: "error", text } }));
        await load();
        return;
      }
      const attempts = Number(data?.attempts);
      const testedModel = typeof data?.testedModel === "string" ? data.testedModel : "";
      const recovered = Number.isSafeInteger(attempts) && attempts > 1
        ? ` سامانه پس از ${new Intl.NumberFormat("fa-IR").format(attempts)} تلاش کنترل‌شده بازیابی شد.`
        : "";
      const routed = testedModel ? ` مدل پاسخ‌دهنده: ${testedModel}.` : "";
      const text = `اتصال Provider با دادهٔ تست غیرکاربری تأیید و evidence آن ثبت شد.${recovered}${routed}`;
      setNotice(text);
      setProviderMessages((current) => ({ ...current, [id]: { kind: "success", text } }));
      await load();
    } catch {
      const text = "تست اتصال کامل نشد.";
      setError(text);
      setProviderMessages((current) => ({ ...current, [id]: { kind: "error", text } }));
    } finally {
      setBusy(null);
    }
  };

  const saveAgent = async (definition: AgentCatalog) => {
    const form = agentForms[definition.id] ?? agentForm(undefined, definition);
    setBusy(`agent:${definition.id}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/command-center/ai-control-plane", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_agent",
          agentId: definition.id,
          enabled: form.enabled,
          providerId: form.providerId,
          model: form.model,
          fallbackModel: form.fallbackModel,
          limits: {
            dailyRequests: Number(form.dailyRequests),
            dailyTokens: Number(form.dailyTokens),
            maxInputTokens: Number(form.maxInputTokens),
            maxOutputTokens: Number(form.maxOutputTokens),
            monthlyBudgetUsdMicros: Math.round(Number(form.monthlyBudgetUsd) * 1_000_000),
          },
          routing: {
            openRouterFallbackEnabled: form.openRouterFallbackEnabled,
            openRouterModel: form.openRouterModel,
            freeFallbackEnabled: form.freeFallbackEnabled,
            openRouterCreditFloorUsd: Number(form.openRouterCreditFloorUsd),
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setError(errorMessage(data?.error));
        return;
      }
      setNotice("Binding ایجنت ذخیره شد؛ ابزارها، scopeها، ممنوعیت‌ها و approval mode از کاتالوگ ثابت باقی ماندند.");
      await load();
    } catch {
      setError("تنظیم ایجنت ذخیره نشد.");
    } finally {
      setBusy(null);
    }
  };

  const runResearch = async () => {
    setBusy("research");
    setError("");
    setNotice("");
    setResearchResult(null);
    try {
      const response = await fetch("/api/command-center/ai-control-plane", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview_research", locale: "fa", ...research }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setError(errorMessage(data?.error));
        return;
      }
      setResearchResult({
        draft: String(data.draft ?? ""),
        sources: Array.isArray(data.sources) ? data.sources : [],
        providerId: data.providerId as ModelProviderId,
        model: String(data.model ?? ""),
        publicationAuthority: String(data.publicationAuthority ?? "human_only"),
      });
      setNotice(research.stageAsCandidate
        ? "پیش‌نویس منبع‌دار ساخته و فقط به‌عنوان candidate ثبت شد؛ برای verified شدن به بازبینی انسان نیاز دارد."
        : "پیش‌نویس منبع‌دار ساخته شد و هیچ انتشار یا ثبت دانشی انجام نشد.");
      if (research.stageAsCandidate) await load();
    } catch {
      setError("اجرای پژوهش کامل نشد.");
    } finally {
      setBusy(null);
    }
  };

  const reviewKnowledge = async (id: string, decision: "verified" | "rejected") => {
    setBusy(`knowledge:${id}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/command-center/ai-control-plane", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review_knowledge",
          knowledgeItemId: id,
          decision,
          reviewNote: reviewNotes[id] ?? "",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setError(errorMessage(data?.error));
        return;
      }
      setNotice(decision === "verified"
        ? "دانش با هویت مدیر و evidence انسانی verified شد."
        : "کاندید دانش رد شد و در audit باقی می‌ماند.");
      await load();
    } catch {
      setError("ثبت تصمیم بازبینی انجام نشد.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section dir="rtl" className="text-white">
      <header className="overflow-hidden rounded-[30px] border border-cyan-300/15 bg-[#071321] shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
        <div className="grid gap-6 p-5 md:p-8 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <Link href="/command-center" className="inline-flex min-h-10 items-center gap-2 rounded-xl text-sm font-black text-cyan-200 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300">
              <ArrowRight className="h-4 w-4" aria-hidden="true" /> بازگشت به مرکز فرمان
            </Link>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1.5 text-xs font-black text-cyan-100"><BrainCircuit className="h-4 w-4" /> TecPey AI Control Plane</span>
              <StatusPill ready={readiness.providers > 0}>{readiness.providers} Provider آماده</StatusPill>
              <StatusPill ready={readiness.agents > 0}>{readiness.agents} ایجنت فعال</StatusPill>
            </div>
            <h1 className="mt-5 text-3xl font-black leading-tight md:text-5xl">لایهٔ هوشمند، با اختیار محدود و حافظهٔ کنترل‌شده</h1>
            <p className="mt-4 max-w-4xl text-sm font-bold leading-8 text-slate-400">
              مدیر فقط Provider، مدل و سقف‌های هر ایجنت را در محدودهٔ قرارداد ثابت تغییر می‌دهد. ابزار، scope، ممنوعیت، مجوز انتشار و مسیر ارتقای دانش در کد و دیتابیس قفل هستند.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className={`${buttonClass} border border-white/10 bg-white/[0.06] text-cyan-100 hover:bg-white/10`}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> بروزرسانی
          </button>
        </div>
        <div className="grid border-t border-white/10 bg-[#050d18] md:grid-cols-3">
          {[
            [ShieldCheck, "بدون انتشار مستقیم", "تمام ایجنت‌ها draft/recommend هستند"],
            [KeyRound, "Secret سمت سرور", "کلید اصلی پس از ذخیره نمایش داده نمی‌شود"],
            [Workflow, "یادگیری با گیت انسان", "candidate → review → verified"],
          ].map(([Icon, title, detail]) => {
            const ItemIcon = Icon as typeof ShieldCheck;
            return <div key={String(title)} className="border-b border-white/10 px-5 py-4 md:border-b-0 md:border-l last:md:border-l-0"><ItemIcon className="h-5 w-5 text-cyan-300" /><p className="mt-3 text-sm font-black">{String(title)}</p><p className="mt-1 text-xs font-bold leading-6 text-slate-500">{String(detail)}</p></div>;
          })}
        </div>
      </header>

      {(error || notice) && (
        <div role={error ? "alert" : "status"} className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 text-sm font-bold leading-7 ${error ? "border-rose-300/20 bg-rose-300/[0.08] text-rose-100" : "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"}`}>
          {error ? <TriangleAlert className="mt-1 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-1 h-5 w-5 shrink-0" />}
          {error || notice}
        </div>
      )}

      {loading && !snapshot ? (
        <div role="status" className="mt-6 flex min-h-56 items-center justify-center rounded-[28px] border border-white/10 bg-[#07111e]"><LoaderCircle className="h-8 w-8 animate-spin text-cyan-300" /></div>
      ) : (
        <>
          <section className="mt-7" aria-labelledby="ai-providers-title">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-xs font-black tracking-[0.12em] text-cyan-300">CONNECTIONS</p><h2 id="ai-providers-title" className="mt-2 text-2xl font-black">Providerها و کانکتور X</h2></div>
              <p className="hidden text-xs font-bold text-slate-500 md:block">Endpoint از پنل قابل تغییر نیست؛ SSRF surface بسته می‌ماند.</p>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {(catalog?.providers ?? []).map((definition) => {
                const current = snapshot?.providers.find((item) => item.providerId === definition.id);
                const form = providerForms[definition.id] ?? providerForm(current);
                const ready = Boolean(current?.enabled && current.secretConfigured && current.lastTestStatus === "passed");
                const providerMessage = providerMessages[definition.id];
                return (
                  <article key={definition.id} className="rounded-[24px] border border-white/10 bg-[#07111e] p-5">
                    <div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{definition.label}</h3><p dir="ltr" className="mt-1 text-left text-[11px] font-bold text-slate-500">{definition.fixedEndpointHost}</p></div><StatusPill ready={ready}>{ready ? "آماده" : current?.lastTestStatus === "failed" ? "تست ناموفق" : "نیازمند تکمیل"}</StatusPill></div>
                    <p className="mt-4 text-sm font-bold leading-7 text-slate-400">{definition.purposeFa}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">{definition.capabilities.map((item) => <span key={item} className="rounded-lg border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] font-bold text-slate-400">{item}</span>)}</div>
                    <div className="mt-4 rounded-xl border border-white/10 bg-[#030914] p-3 text-xs font-bold text-slate-400">
                      <div className="flex justify-between gap-3"><span>Secret</span><span dir="ltr" className="text-left text-slate-200">{current?.secretConfigured ? `•••• ${current.keyFingerprint}` : current?.configurationSource === "environment" ? "environment compatibility" : "ثبت نشده"}</span></div>
                      <div className="mt-2 flex justify-between gap-3"><span>آخرین تست</span><span>{dateLabel(current?.lastTestedAt ?? null)}</span></div>
                    </div>
                    {definition.id === "openrouter" && snapshot?.openRouterQuota && (
                      <div className="mt-3 rounded-xl border border-violet-300/15 bg-violet-300/[0.045] p-3 text-xs font-bold text-slate-400">
                        <div className="flex justify-between gap-3"><span>وضعیت سهمیه</span><span className="text-violet-100">{quotaStatusLabel(snapshot.openRouterQuota.status)}</span></div>
                        <div className="mt-2 flex justify-between gap-3"><span>باقی‌مانده</span><span dir="ltr" className="text-left text-slate-200">{usdLabel(snapshot.openRouterQuota.remainingUsdMicros)}</span></div>
                        <div className="mt-2 flex justify-between gap-3"><span>مصرف ماه</span><span dir="ltr" className="text-left text-slate-200">{usdLabel(snapshot.openRouterQuota.usageUsdMicros)}</span></div>
                        <div className="mt-2 flex justify-between gap-3"><span>آخرین بررسی</span><span>{dateLabel(snapshot.openRouterQuota.checkedAt)}</span></div>
                      </div>
                    )}
                    <label className="mt-4 block text-xs font-black text-slate-300">{definition.secretLabel}<input type="password" dir="ltr" autoComplete="new-password" spellCheck={false} value={form.apiKey} onChange={(event) => updateProviderForm(definition.id, { apiKey: event.target.value })} placeholder={current?.secretConfigured ? "برای حفظ کلید فعلی خالی بگذارید" : "کلید جدید"} className={`${inputClass} mt-2 text-left font-mono`} /></label>
                    {definition.kind === "model" && <label className="mt-3 block text-xs font-black text-slate-300">مدل برای تست اتصال<input dir="ltr" value={form.testModel} onChange={(event) => updateProviderForm(definition.id, { testModel: event.target.value })} placeholder="نام دقیق مدل حساب شما" className={`${inputClass} mt-2 text-left font-mono`} /></label>}
                    <label className="mt-4 flex min-h-11 items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-3 text-xs font-black"><span>فعال‌سازی Provider</span><input type="checkbox" checked={form.enabled} onChange={(event) => updateProviderForm(definition.id, { enabled: event.target.checked })} className="h-5 w-5 accent-cyan-300" /></label>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => void saveProvider(definition.id)} disabled={busy !== null} className={`${buttonClass} bg-cyan-300 text-[#03101a] hover:bg-cyan-200`}>{busy === `provider:${definition.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} ذخیره</button>
                      <button type="button" onClick={() => void testProvider(definition.id)} disabled={busy !== null || !current?.secretConfigured || (definition.kind === "model" && !form.testModel)} className={`${buttonClass} border border-white/10 bg-white/[0.06] text-white hover:bg-white/10`}>{busy === `test:${definition.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} تست</button>
                    </div>
                    {providerMessage && <div role={providerMessage.kind === "error" ? "alert" : "status"} className={`mt-3 rounded-xl border px-3 py-2 text-xs font-bold leading-6 ${providerMessage.kind === "error" ? "border-rose-300/20 bg-rose-300/[0.08] text-rose-100" : "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"}`}>{providerMessage.text}</div>}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="mt-8" aria-labelledby="ai-agents-title">
            <p className="text-xs font-black tracking-[0.12em] text-cyan-300">AGENT CONTRACTS</p>
            <h2 id="ai-agents-title" className="mt-2 text-2xl font-black">مسئولیت، محدودیت و Binding ایجنت‌ها</h2>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {(catalog?.agents ?? []).map((definition) => {
                const current = snapshot?.agents.find((item) => item.agentId === definition.id);
                const form = agentForms[definition.id] ?? agentForm(current, definition);
                const usage = snapshot?.usageToday?.[definition.id] ?? { requestCount: 0, reservedTokens: 0 };
                return (
                  <article key={definition.id} className="rounded-[26px] border border-white/10 bg-[#07111e] p-5 md:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.08]"><Bot className="h-5 w-5 text-cyan-100" /></span><div><h3 className="font-black">{definition.labelFa}</h3><p dir="ltr" className="mt-1 text-left text-[11px] font-bold text-slate-500">{definition.id}</p></div></div><StatusPill ready={Boolean(current?.enabled && current.providerReady)}>{current?.enabled && current.providerReady ? "فعال" : "غیرفعال"}</StatusPill></div>
                    <p className="mt-4 text-sm font-bold leading-7 text-slate-300">{definition.responsibilityFa}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-white/10 bg-[#030914] p-3"><p className="text-[10px] font-black text-slate-500">انتشار</p><p className="mt-2 text-xs font-black text-rose-200">هرگز مستقیم</p></div>
                      <div className="rounded-xl border border-white/10 bg-[#030914] p-3"><p className="text-[10px] font-black text-slate-500">Approval</p><p dir="ltr" className="mt-2 truncate text-left text-xs font-black text-amber-100">{definition.approvalMode}</p></div>
                      <div className="rounded-xl border border-white/10 bg-[#030914] p-3"><p className="text-[10px] font-black text-slate-500">Citation</p><p className="mt-2 text-xs font-black text-cyan-100">{definition.citationsRequired ? "اجباری" : "وابسته به کار"}</p></div>
                      <div className="rounded-xl border border-white/10 bg-[#030914] p-3"><p className="text-[10px] font-black text-slate-500">مصرف امروز</p><p className="mt-2 text-xs font-black text-cyan-100">{usage.requestCount.toLocaleString("fa-IR")} درخواست · {usage.reservedTokens.toLocaleString("fa-IR")} توکن</p></div>
                    </div>
                    <details className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-3 open:bg-white/[0.04]"><summary className="cursor-pointer text-xs font-black text-cyan-100">مشاهدهٔ scopeها، ابزارها و کارهای ممنوع</summary><div className="mt-4 grid gap-4 md:grid-cols-3"><div><p className="text-[10px] font-black text-slate-500">READ SCOPES</p>{definition.readableScopes.map((item) => <p key={item} dir="ltr" className="mt-2 break-all text-left text-[11px] font-bold text-slate-300">{item}</p>)}</div><div><p className="text-[10px] font-black text-slate-500">TOOLS</p>{definition.allowedTools.length ? definition.allowedTools.map((item) => <p key={item} dir="ltr" className="mt-2 text-left text-[11px] font-bold text-cyan-200">{item}</p>) : <p className="mt-2 text-[11px] font-bold text-slate-500">بدون ابزار</p>}</div><div><p className="text-[10px] font-black text-rose-300">FORBIDDEN</p>{definition.forbiddenActions.map((item) => <p key={item} dir="ltr" className="mt-2 break-all text-left text-[11px] font-bold text-rose-100/80">{item}</p>)}</div></div></details>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-black text-slate-300">Provider<select value={form.providerId} onChange={(event) => { const providerId = event.target.value as ModelProviderId; updateAgentForm(definition.id, definition, { providerId, openRouterFallbackEnabled: false, openRouterModel: "", freeFallbackEnabled: false, openRouterCreditFloorUsd: "0" }); }} className={`${inputClass} mt-2`}>{definition.allowedProviders.map((id) => <option key={id} value={id}>{catalog?.providers.find((item) => item.id === id)?.label ?? id}</option>)}</select></label>
                      <label className="text-xs font-black text-slate-300">مدل<input dir="ltr" value={form.model} onChange={(event) => updateAgentForm(definition.id, definition, { model: event.target.value })} className={`${inputClass} mt-2 text-left font-mono`} /></label>
                      <label className="text-xs font-black text-slate-300">مدل جایگزین<input dir="ltr" value={form.fallbackModel} onChange={(event) => updateAgentForm(definition.id, definition, { fallbackModel: event.target.value })} className={`${inputClass} mt-2 text-left font-mono`} /></label>
                      <label className="flex min-h-[67px] items-center justify-between rounded-xl border border-white/10 bg-[#030914] px-3 text-xs font-black"><span>ایجنت فعال باشد</span><input type="checkbox" checked={form.enabled} onChange={(event) => updateAgentForm(definition.id, definition, { enabled: event.target.checked })} className="h-5 w-5 accent-cyan-300" /></label>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
                      {[
                        ["درخواست/روز", "dailyRequests"],
                        ["توکن/روز", "dailyTokens"],
                        ["ورودی", "maxInputTokens"],
                        ["خروجی", "maxOutputTokens"],
                        ["سقف قراردادی $/ماه", "monthlyBudgetUsd"],
                      ].map(([label, key]) => <label key={key} className="text-[10px] font-black text-slate-400">{label}<input dir="ltr" inputMode="numeric" value={form[key as keyof AgentForm] as string} onChange={(event) => updateAgentForm(definition.id, definition, { [key]: event.target.value })} className={`${inputClass} mt-2 px-2 text-left font-mono text-xs`} /></label>)}
                    </div>
                    <div className="mt-4 rounded-2xl border border-violet-300/15 bg-violet-300/[0.035] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div><p className="text-xs font-black text-violet-100">Fallback کنترل‌شده با OpenRouter</p><p className="mt-1 text-[10px] font-bold leading-5 text-slate-500">فقط پس از quota/rate-limit/timeout مسیر اصلی؛ ZDR اجباری و data collection مسدود است.</p></div>
                        <StatusPill ready={Boolean(current?.routing.fallbackProviderReady)}>{current?.routing.fallbackProviderReady ? "آماده" : "نیازمند Provider"}</StatusPill>
                      </div>
                      <label className="mt-3 flex min-h-11 items-center justify-between rounded-xl border border-white/10 bg-[#030914] px-3 text-xs font-black"><span>fallback پولی فعال باشد</span><input type="checkbox" checked={form.openRouterFallbackEnabled} disabled={form.providerId === "openrouter"} onChange={(event) => updateAgentForm(definition.id, definition, { openRouterFallbackEnabled: event.target.checked, ...(event.target.checked ? {} : { openRouterModel: "", freeFallbackEnabled: false, openRouterCreditFloorUsd: "0" }) })} className="h-5 w-5 accent-violet-300" /></label>
                      {form.openRouterFallbackEnabled && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-black text-slate-400">مدل پولی OpenRouter<input dir="ltr" value={form.openRouterModel} onChange={(event) => updateAgentForm(definition.id, definition, { openRouterModel: event.target.value })} placeholder="anthropic/claude-…" className={`${inputClass} mt-2 text-left font-mono text-xs`} /></label><label className="text-[10px] font-black text-slate-400">کف اعتبار باقی‌مانده ($)<input dir="ltr" inputMode="decimal" value={form.openRouterCreditFloorUsd} onChange={(event) => updateAgentForm(definition.id, definition, { openRouterCreditFloorUsd: event.target.value })} className={`${inputClass} mt-2 text-left font-mono text-xs`} /></label></div>}
                      {form.providerId === "openrouter" && definition.openRouterFallback.freeAllowed && form.freeFallbackEnabled && <label className="mt-3 block text-[10px] font-black text-slate-400">کف اعتبار باقی‌مانده ($)<input dir="ltr" inputMode="decimal" value={form.openRouterCreditFloorUsd} onChange={(event) => updateAgentForm(definition.id, definition, { openRouterCreditFloorUsd: event.target.value })} className={`${inputClass} mt-2 text-left font-mono text-xs`} /></label>}
                      {(form.openRouterFallbackEnabled || form.providerId === "openrouter") && definition.openRouterFallback.freeAllowed && <label className="mt-3 flex min-h-11 items-center justify-between rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3 text-xs font-black text-amber-100"><span>پس از اتمام اعتبار، مسیر <span dir="ltr">openrouter/free</span></span><input type="checkbox" checked={form.freeFallbackEnabled} onChange={(event) => updateAgentForm(definition.id, definition, { freeFallbackEnabled: event.target.checked, ...(event.target.checked ? {} : { openRouterCreditFloorUsd: form.openRouterFallbackEnabled ? form.openRouterCreditFloorUsd : "0" }) })} className="h-5 w-5 accent-amber-300" /></label>}
                      <p className="mt-3 text-[10px] font-bold leading-5 text-slate-500">داده‌های مجاز: {definition.openRouterFallback.allowedDataClasses.join("، ")}. fallback رایگان برای Mentor، داده خصوصی، تصمیم حساس و هر کار دارای اثر بیرونی در سرور رد می‌شود.</p>
                    </div>
                    <p className="mt-3 text-[10px] font-bold leading-5 text-slate-500">سقف درخواست و توکن روزانه در زمان اجرا اتمیک اعمال می‌شود؛ مبلغ ماهانه فعلاً سقف قراردادی برای کنترل و تطبیق هزینه است و پس از اتصال گزارش صورتحساب Provider قابل enforce خواهد بود.</p>
                    <button type="button" onClick={() => void saveAgent(definition)} disabled={busy !== null || !form.model} className={`${buttonClass} mt-4 w-full bg-cyan-300 text-[#03101a] hover:bg-cyan-200`}>{busy === `agent:${definition.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} ذخیره Binding و سقف‌ها</button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="mt-8 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[26px] border border-white/10 bg-[#07111e] p-5 md:p-6">
              <div className="flex items-start gap-3"><Workflow className="h-6 w-6 text-cyan-300" /><div><h2 className="text-xl font-black">Workflowهای ثابت</h2><p className="mt-1 text-xs font-bold text-slate-500">ترتیب مرحله و authority از پنل قابل دورزدن نیست.</p></div></div>
              <div className="mt-5 space-y-3">{(catalog?.workflows ?? []).map((workflow) => <article key={workflow.id} className="rounded-2xl border border-white/10 bg-[#030914] p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black">{workflow.labelFa}</h3><StatusPill ready={workflow.externalEffect === "none"}>{workflow.externalEffect === "none" ? "بدون اثر خارجی" : "فقط انسان"}</StatusPill></div><ol className="mt-3 space-y-2">{workflow.stages.map((stage, index) => <li key={stage} className="flex items-center gap-2 text-xs font-bold text-slate-400"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 text-[9px] text-cyan-200">{index + 1}</span><span dir="ltr" className="text-left">{stage}</span></li>)}</ol></article>)}</div>
            </div>

            <div className="rounded-[26px] border border-cyan-300/15 bg-[#071321] p-5 md:p-6">
              <div className="flex items-start gap-3"><FileSearch className="h-6 w-6 text-cyan-300" /><div><h2 className="text-xl font-black">پژوهش منبع‌دار آزمایشی</h2><p className="mt-1 text-xs font-bold leading-6 text-slate-500">دادهٔ خصوصی ممنوع؛ خروجی draft است و انتشار مستقیم ندارد.</p></div></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-slate-300">ایجنت<select value={research.agentId} onChange={(event) => setResearch((current) => ({ ...current, agentId: event.target.value as typeof current.agentId }))} className={`${inputClass} mt-2`}><option value="news_x_researcher">خبر و X — xAI/Grok</option><option value="coin_tool_researcher">کوین و ابزار — Perplexity/GPT</option></select></label><label className="flex min-h-[67px] items-center justify-between rounded-xl border border-white/10 bg-[#030914] px-3 text-xs font-black"><span>ثبت خروجی به‌عنوان candidate</span><input type="checkbox" checked={research.stageAsCandidate} onChange={(event) => setResearch((current) => ({ ...current, stageAsCandidate: event.target.checked }))} className="h-5 w-5 accent-cyan-300" /></label></div>
              <label className="mt-3 block text-xs font-black text-slate-300">موضوع عمومی پژوهش<textarea rows={5} value={research.query} onChange={(event) => setResearch((current) => ({ ...current, query: event.target.value }))} placeholder="مثلاً ادعاهای عمومی و منابع معتبر دربارهٔ به‌روزرسانی یک ابزار یا کوین را بررسی کن…" className={`${inputClass} mt-2 min-h-32 resize-y py-3 leading-7`} /></label>
              <button type="button" onClick={() => void runResearch()} disabled={busy !== null || research.query.trim().length < 8} className={`${buttonClass} mt-4 w-full bg-cyan-300 text-[#03101a] hover:bg-cyan-200`}>{busy === "research" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} اجرای پژوهش کنترل‌شده</button>
              {researchResult && <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-emerald-200">پیش‌نویس — بدون authority انتشار</p><span dir="ltr" className="text-[10px] font-bold text-slate-400">{researchResult.providerId} · {researchResult.model}</span></div><p className="mt-4 whitespace-pre-wrap text-sm font-bold leading-8 text-slate-200">{researchResult.draft}</p><div className="mt-4 border-t border-white/10 pt-4"><p className="text-xs font-black text-cyan-200">منابع قابل‌بررسی</p><div className="mt-2 space-y-2">{researchResult.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" dir="ltr" className="block break-all text-left text-xs font-bold text-cyan-300 underline-offset-4 hover:underline">{source.title || source.url}</a>)}</div></div></div>}
            </div>
          </section>

          <section className="mt-8 rounded-[28px] border border-white/10 bg-[#07111e] p-5 md:p-6" aria-labelledby="knowledge-review-title">
            <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><Sparkles className="h-6 w-6 text-cyan-300" /><div><h2 id="knowledge-review-title" className="text-xl font-black">حافظهٔ دانش کنترل‌شده</h2><p className="mt-1 text-xs font-bold leading-6 text-slate-500">هیچ الگوی کشف‌شده‌ای خودکار verified نمی‌شود.</p></div></div><div className="flex flex-wrap gap-2"><StatusPill ready={false}>{snapshot?.knowledgeSummary.candidate ?? 0} candidate</StatusPill><StatusPill ready>{snapshot?.knowledgeSummary.verified ?? 0} verified</StatusPill></div></div>
            <div className="mt-5 space-y-4">
              {(snapshot?.knowledge.filter((item) => item.status === "candidate") ?? []).length === 0 && <p className="rounded-2xl border border-dashed border-white/10 bg-[#030914] p-5 text-sm font-bold leading-7 text-slate-400">کاندید منتظر بازبینی وجود ندارد. پژوهش را با گزینهٔ candidate اجرا کنید یا workflow کشف الگو را به آن متصل کنید.</p>}
              {(snapshot?.knowledge.filter((item) => item.status === "candidate") ?? []).map((item) => <article key={item.id} className="rounded-2xl border border-white/10 bg-[#030914] p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-cyan-300" /><p className="text-xs font-black text-cyan-100">{item.knowledgeType} · اعتماد {item.confidence}%</p></div><span dir="ltr" className="text-[10px] font-bold text-slate-500">{item.contentHash.slice(0, 16)}…</span></div><p className="mt-4 whitespace-pre-wrap text-sm font-bold leading-8 text-slate-200">{item.statement}</p><div className="mt-3 flex flex-wrap gap-2">{item.evidenceRefs.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.06] px-2 py-1 text-[10px] font-bold text-cyan-200 hover:bg-cyan-300/[0.1]">منبع</a>)}</div><label className="mt-4 block text-xs font-black text-slate-300">دلیل تصمیم انسانی<input value={reviewNotes[item.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="حداقل ۸ نویسه؛ مبنای تأیید یا رد را ثبت کنید" className={`${inputClass} mt-2`} /></label><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => void reviewKnowledge(item.id, "verified")} disabled={busy !== null || (reviewNotes[item.id] ?? "").trim().length < 8} className={`${buttonClass} bg-emerald-300 text-[#032016] hover:bg-emerald-200`}>{busy === `knowledge:${item.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} تأیید</button><button type="button" onClick={() => void reviewKnowledge(item.id, "rejected")} disabled={busy !== null || (reviewNotes[item.id] ?? "").trim().length < 8} className={`${buttonClass} border border-rose-300/20 bg-rose-300/[0.08] text-rose-100 hover:bg-rose-300/[0.14]`}><XCircle className="h-4 w-4" /> رد</button></div></article>)}
            </div>
          </section>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              [CircleDollarSign, "بودجه و سقف مصرف", "مدل، fallback، درخواست روزانه، توکن و سقف ماهانه برای هر ایجنت جدا است."],
              [ShieldCheck, "مرز داده", "فقط Mentor مجاز به دادهٔ خصوصی همان کاربر است؛ پژوهشگران فقط داده عمومی می‌بینند."],
              [Workflow, "حافظهٔ قابل حسابرسی", "evidence شامل hash، منبع، مدل و مصرف است؛ candidate برای ارتقا به تأیید انسان نیاز دارد."],
            ].map(([Icon, title, body]) => { const CardIcon = Icon as typeof ShieldCheck; return <div key={String(title)} className="rounded-[22px] border border-white/10 bg-[#07111e] p-5"><CardIcon className="h-6 w-6 text-cyan-300" /><h3 className="mt-4 font-black">{String(title)}</h3><p className="mt-2 text-sm font-bold leading-7 text-slate-400">{String(body)}</p></div>; })}
          </div>
        </>
      )}
    </section>
  );
}
