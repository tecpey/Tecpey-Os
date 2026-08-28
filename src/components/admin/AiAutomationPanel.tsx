"use client";

import {
  Bot,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Users,
  Workflow,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type WorkflowId =
  | "public_intelligence_digest"
  | "content_publication"
  | "knowledge_promotion"
  | "executive_operating_review"
  | "provider_budget_failover";
type DataClass = "public" | "aggregate_deidentified" | "approved_platform_content";
type RunStatus =
  | "queued"
  | "ai_review"
  | "manager_review"
  | "c_level_review"
  | "approved"
  | "executing"
  | "completed"
  | "rejected"
  | "blocked"
  | "failed"
  | "cancelled";

type PolicyDefinition = {
  id: WorkflowId;
  labelFa: string;
  labelEn: string;
  trigger: "scheduled" | "event" | "manual";
  defaultIntervalMinutes: number | null;
  allowedDataClasses: DataClass[];
  criticality: "noncritical" | "standard" | "critical";
  aiReviewers: string[];
  aiQuorum: number;
  managerRoles: string[];
  managerQuorum: number;
  cLevelRoles: string[];
  cLevelQuorum: number;
  externalEffect: "none" | "publish" | "knowledge_promotion";
  freeFallbackAllowed: boolean;
  maxAttempts: number;
  approvalTtlMinutes: number;
};

type PolicySnapshot = {
  workflowId: WorkflowId;
  enabled: boolean;
  configured: boolean;
  intervalMinutes: number | null;
  maxConcurrency: number;
  policyVersion: string;
  revision: number;
  nextRunAt: string | null;
  lastEnqueuedAt: string | null;
  updatedAt: string | null;
};

type ReviewSnapshot = {
  id: string;
  reviewKind: "ai_agent" | "manager" | "c_level";
  reviewerAgentId: string | null;
  reviewerAdminId: string | null;
  decision: "approve" | "reject" | "abstain";
  summary: string;
  providerId: string | null;
  model: string | null;
  sources: Array<{ url: string; title: string | null }>;
  createdAt: string;
};

type RunSnapshot = {
  id: string;
  workflowId: WorkflowId;
  status: RunStatus;
  triggerType: "manual" | "event" | "scheduled";
  dataClass: DataClass;
  criticality: "noncritical" | "standard" | "critical";
  resourceType: string;
  resourceId: string | null;
  inputText: string;
  inputHash: string;
  aiReviewerIds: string[];
  aiQuorum: number;
  managerRoleIds: string[];
  managerQuorum: number;
  cLevelRoleIds: string[];
  cLevelQuorum: number;
  externalEffect: "none" | "publish" | "knowledge_promotion";
  freeFallbackAllowed: boolean;
  attemptCount: number;
  maxAttempts: number;
  requestedBy: string | null;
  approvedAt: string | null;
  expiresAt: string;
  failureCode: string | null;
  createdAt: string;
  reviews: ReviewSnapshot[];
};

type AutomationSnapshot = {
  policyVersion: string;
  catalog: PolicyDefinition[];
  policies: PolicySnapshot[];
  runs: RunSnapshot[];
  statusSummary: Partial<Record<RunStatus, number>>;
};

type PolicyForm = {
  enabled: boolean;
  intervalMinutes: string;
  maxConcurrency: string;
  revision: number;
};

const inputClass = "min-h-11 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-sm font-bold text-white outline-none transition-colors focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black outline-none transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none";

const statusFa: Record<RunStatus, string> = {
  queued: "در صف",
  ai_review: "بازبینی AI",
  manager_review: "تأیید مدیر",
  c_level_review: "تأیید C‑Level",
  approved: "تأیید کامل",
  executing: "در حال اجرا",
  completed: "تکمیل‌شده",
  rejected: "ردشده",
  blocked: "مسدود",
  failed: "ناموفق",
  cancelled: "لغوشده",
};

function policyForm(policy: PolicySnapshot): PolicyForm {
  return {
    enabled: policy.enabled,
    intervalMinutes: policy.intervalMinutes === null ? "" : String(policy.intervalMinutes),
    maxConcurrency: String(policy.maxConcurrency),
    revision: policy.revision,
  };
}

function dateLabel(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function automationError(code: unknown, details?: Record<string, unknown>): string {
  const messages: Record<string, string> = {
    admin_session_required: "نشست مدیریتی منقضی شده است.",
    permission_denied: "نقش فعلی مجوز مدیریت یا بازبینی اتوماسیون را ندارد.",
    step_up_required: "برای این تصمیم حساس دوباره احراز هویت کنید.",
    ai_automation_unavailable: "ذخیره‌ساز اتوماسیون در دسترس نیست.",
    ai_automation_policy_revision_conflict: "سیاست هم‌زمان تغییر کرده است؛ صفحه را تازه کنید.",
    ai_automation_agents_not_ready: `ایجنت‌های لازم آماده نیستند: ${Array.isArray(details?.missingAgents) ? details.missingAgents.join("، ") : "تنظیمات ایجنت را بررسی کنید"}`,
    ai_automation_human_reviewer_gap: `پوشش انسانی گیت ${String(details?.missingGate ?? "مدیریتی")} کافی نیست.`,
    ai_automation_policy_disabled: "این workflow هنوز فعال نشده است.",
    ai_automation_policy_stale: "نسخهٔ سیاست قدیمی است؛ آن را دوباره بررسی و ثبت کنید.",
    ai_automation_input_rejected: "ورودی شامل داده شخصی، Secret، محتوای ممنوع یا الگوی تزریق دستور است.",
    ai_automation_data_class_forbidden: "کلاس داده برای این workflow مجاز نیست.",
    ai_automation_review_reviewer_forbidden: "نقش فعلی در گیت این اجرا مجاز نیست یا درخواست‌کننده نمی‌تواند کار خودش را تأیید کند.",
    ai_automation_review_wrong_gate: "این اجرا اکنون در گیت دیگری قرار دارد.",
    ai_automation_review_already_reviewed: "این مدیر قبلاً در همین اجرا رأی داده است.",
    ai_automation_review_not_reviewable: "اجرا منقضی یا نهایی شده و دیگر قابل بازبینی نیست.",
  };
  return messages[typeof code === "string" ? code : ""] ?? "عملیات اتوماسیون کامل نشد؛ وضعیت گیت و دسترسی را بررسی کنید.";
}

function GatePill({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${active ? "border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100" : "border-white/10 bg-white/[0.035] text-slate-500"}`}>{children}</span>;
}

export function AiAutomationPanel() {
  const [snapshot, setSnapshot] = useState<AutomationSnapshot | null>(null);
  const [forms, setForms] = useState<Partial<Record<WorkflowId, PolicyForm>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [runForm, setRunForm] = useState({
    workflowId: "public_intelligence_digest" as WorkflowId,
    dataClass: "public" as DataClass,
    resourceType: "public_research_topic",
    resourceId: "",
    inputText: "",
  });

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/command-center/ai-automation", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data.snapshot) {
        if (!quiet) setError(automationError(data?.error, data?.details));
        return;
      }
      const next = data.snapshot as AutomationSnapshot;
      setSnapshot(next);
      setForms(Object.fromEntries(next.policies.map((policy) => [policy.workflowId, policyForm(policy)])));
      if (!quiet) setError("");
    } catch {
      if (!quiet) setError("ارتباط با orchestration control plane برقرار نشد.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const polling = window.setInterval(() => void load(true), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(polling);
    };
  }, [load]);

  const selectedDefinition = useMemo(
    () => snapshot?.catalog.find((item) => item.id === runForm.workflowId) ?? null,
    [runForm.workflowId, snapshot],
  );

  const savePolicy = async (definition: PolicyDefinition) => {
    const current = snapshot?.policies.find((item) => item.workflowId === definition.id);
    const form = forms[definition.id];
    if (!current || !form) return;
    setBusy(`policy:${definition.id}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/command-center/ai-automation", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_policy",
          workflowId: definition.id,
          enabled: form.enabled,
          intervalMinutes: definition.trigger === "scheduled" ? Number(form.intervalMinutes) : null,
          maxConcurrency: Number(form.maxConcurrency),
          expectedRevision: current.revision,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setError(automationError(data?.error, data?.details));
        return;
      }
      setNotice(form.enabled
        ? "سیاست فعال شد؛ worker فقط اجراهای منطبق با قرارداد و پوشش reviewer را claim می‌کند."
        : "سیاست غیرفعال شد؛ اجرای جدید claim نمی‌شود و evidence قبلی حفظ می‌ماند.");
      await load();
    } catch {
      setError("ذخیرهٔ سیاست اتوماسیون انجام نشد.");
    } finally {
      setBusy(null);
    }
  };

  const enqueue = async () => {
    setBusy("enqueue");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/command-center/ai-automation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enqueue_run",
          ...runForm,
          resourceId: runForm.resourceId || null,
          idempotencyKey: `ui:${runForm.workflowId}:${crypto.randomUUID()}`,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setError(automationError(data?.error, data?.details));
        return;
      }
      setNotice("اجرا به صف durable اضافه شد؛ نتیجهٔ AI فقط رأی governance است و اثر بیرونی بدون دو گیت انسانی اجرا نمی‌شود.");
      setRunForm((current) => ({ ...current, inputText: "", resourceId: "" }));
      await load();
    } catch {
      setError("ثبت اجرای اتوماسیون کامل نشد.");
    } finally {
      setBusy(null);
    }
  };

  const review = async (run: RunSnapshot, decision: "approve" | "reject") => {
    const reviewKind = run.status === "manager_review" ? "manager" :
      run.status === "c_level_review" ? "c_level" : null;
    if (!reviewKind) return;
    const summary = reviewNotes[run.id] ?? "";
    setBusy(`review:${run.id}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/command-center/ai-automation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record_review",
          runId: run.id,
          reviewKind,
          decision,
          summary,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setError(automationError(data?.error, data?.details));
        return;
      }
      setNotice(decision === "approve"
        ? "رأی با هویت مدیر، نقش مؤثر و hash شواهد ثبت شد؛ گیت بعدی خودکار محاسبه شد."
        : "اجرا رد و متوقف شد؛ رأی و زنجیرهٔ evidence قابل حذف نیست.");
      await load();
    } catch {
      setError("ثبت رأی governance کامل نشد.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section dir="rtl" className="mt-8 rounded-[30px] border border-violet-300/15 bg-[#071321] p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.3)] md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex items-center gap-2 text-violet-200"><Workflow className="h-5 w-5" /><p className="text-xs font-black tracking-[0.12em]">ENTERPRISE ORCHESTRATION</p></div><h2 className="mt-3 text-2xl font-black md:text-3xl">اتوماسیون، quorum و گیت‌های مدیر/C‑Level</h2><p className="mt-3 max-w-4xl text-sm font-bold leading-8 text-slate-400">صف durable، lease محدود، retry کنترل‌شده، جلوگیری از self‑approval و state machine دیتابیس. تأیید AI هرگز جای رأی انسانی لازم برای انتشار یا ارتقای دانش را نمی‌گیرد.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading || busy !== null} className={`${buttonClass} border border-white/10 bg-white/[0.06] text-cyan-100 hover:bg-white/10`}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> بروزرسانی</button>
      </div>

      {(error || notice) && <div role={error ? "alert" : "status"} className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 text-sm font-bold leading-7 ${error ? "border-rose-300/20 bg-rose-300/[0.08] text-rose-100" : "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"}`}>{error ? <TriangleAlert className="mt-1 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-1 h-5 w-5 shrink-0" />}{error || notice}</div>}

      {loading && !snapshot ? <div className="mt-6 flex min-h-48 items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-violet-300" /></div> : snapshot && <>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {snapshot.catalog.map((definition) => {
            const policy = snapshot.policies.find((item) => item.workflowId === definition.id);
            if (!policy) return null;
            const form = forms[definition.id] ?? policyForm(policy);
            return <article key={definition.id} className="rounded-[24px] border border-white/10 bg-[#050d18] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black">{definition.labelFa}</h3><p dir="ltr" className="mt-1 text-left text-[10px] font-bold text-slate-500">{definition.id} · {definition.trigger}</p></div><GatePill active={form.enabled}>{form.enabled ? "فعال" : "fail-closed"}</GatePill></div>
              <div className="mt-4 flex flex-wrap gap-2"><GatePill active={definition.aiQuorum > 0}>AI {definition.aiQuorum}/{definition.aiReviewers.length}</GatePill><GatePill active={definition.managerQuorum > 0}>Manager {definition.managerQuorum}</GatePill><GatePill active={definition.cLevelQuorum > 0}>C‑Level {definition.cLevelQuorum}</GatePill><GatePill active={definition.externalEffect === "none"}>{definition.externalEffect === "none" ? "بدون اثر بیرونی" : definition.externalEffect}</GatePill><GatePill active={definition.freeFallbackAllowed}>{definition.freeFallbackAllowed ? "free فقط public" : "بدون free"}</GatePill></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="flex min-h-[67px] items-center justify-between rounded-xl border border-white/10 bg-[#030914] px-3 text-xs font-black"><span>فعال</span><input type="checkbox" checked={form.enabled} onChange={(event) => setForms((current) => ({ ...current, [definition.id]: { ...form, enabled: event.target.checked } }))} className="h-5 w-5 accent-violet-300" /></label>{definition.trigger === "scheduled" ? <label className="text-[10px] font-black text-slate-400">فاصله (دقیقه)<input dir="ltr" inputMode="numeric" value={form.intervalMinutes} onChange={(event) => setForms((current) => ({ ...current, [definition.id]: { ...form, intervalMinutes: event.target.value } }))} className={`${inputClass} mt-2 text-left font-mono`} /></label> : <div className="rounded-xl border border-white/10 bg-[#030914] p-3 text-[10px] font-bold leading-5 text-slate-500">شروع با event یا فرمان idempotent</div>}<label className="text-[10px] font-black text-slate-400">هم‌روندی<input dir="ltr" inputMode="numeric" value={form.maxConcurrency} onChange={(event) => setForms((current) => ({ ...current, [definition.id]: { ...form, maxConcurrency: event.target.value } }))} className={`${inputClass} mt-2 text-left font-mono`} /></label></div>
              <div className="mt-3 text-[10px] font-bold leading-5 text-slate-500"><p>AI: {definition.aiReviewers.join("، ") || "بدون بازبین مدل"}</p><p className="mt-1">Manager roles: {definition.managerRoles.join("، ") || "—"}</p><p className="mt-1">C‑Level roles: {definition.cLevelRoles.join("، ") || "—"}</p></div>
              <div className="mt-4 flex items-center justify-between gap-3 text-[10px] font-bold text-slate-500"><span>اجرای بعدی: {dateLabel(policy.nextRunAt)}</span><span>revision {policy.revision}</span></div>
              <button type="button" onClick={() => void savePolicy(definition)} disabled={busy !== null || (definition.trigger === "scheduled" && (!form.intervalMinutes || Number(form.intervalMinutes) < 5))} className={`${buttonClass} mt-4 w-full bg-violet-300 text-[#150629] hover:bg-violet-200`}>{busy === `policy:${definition.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} ثبت سیاست با step-up</button>
            </article>;
          })}
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <article className="rounded-[24px] border border-cyan-300/15 bg-[#050d18] p-5">
            <div className="flex items-start gap-3"><Play className="h-5 w-5 text-cyan-300" /><div><h3 className="font-black">ثبت اجرای کنترل‌شده</h3><p className="mt-1 text-xs font-bold leading-6 text-slate-500">ورودی خصوصی، Secret و prompt injection قبل از صف رد می‌شود.</p></div></div>
            <label className="mt-4 block text-xs font-black text-slate-300">Workflow<select value={runForm.workflowId} onChange={(event) => {
              const workflowId = event.target.value as WorkflowId;
              const definition = snapshot.catalog.find((item) => item.id === workflowId);
              setRunForm((current) => ({
                ...current,
                workflowId,
                dataClass: definition?.allowedDataClasses[0] ?? current.dataClass,
              }));
            }} className={`${inputClass} mt-2`}>{snapshot.catalog.map((item) => <option key={item.id} value={item.id}>{item.labelFa}</option>)}</select></label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-slate-300">کلاس داده<select value={runForm.dataClass} onChange={(event) => setRunForm((current) => ({ ...current, dataClass: event.target.value as DataClass }))} className={`${inputClass} mt-2`}>{(selectedDefinition?.allowedDataClasses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="text-xs font-black text-slate-300">نوع منبع<input dir="ltr" value={runForm.resourceType} onChange={(event) => setRunForm((current) => ({ ...current, resourceType: event.target.value }))} className={`${inputClass} mt-2 text-left font-mono`} /></label></div>
            <label className="mt-3 block text-xs font-black text-slate-300">شناسه منبع اختیاری<input dir="ltr" value={runForm.resourceId} onChange={(event) => setRunForm((current) => ({ ...current, resourceId: event.target.value }))} className={`${inputClass} mt-2 text-left font-mono`} /></label>
            <label className="mt-3 block text-xs font-black text-slate-300">مادهٔ مورد بررسی<textarea rows={6} value={runForm.inputText} onChange={(event) => setRunForm((current) => ({ ...current, inputText: event.target.value }))} className={`${inputClass} mt-2 min-h-36 resize-y py-3 leading-7`} /></label>
            <button type="button" onClick={() => void enqueue()} disabled={busy !== null || runForm.inputText.trim().length < 8 || runForm.resourceType.trim().length < 2} className={`${buttonClass} mt-4 w-full bg-cyan-300 text-[#03101a] hover:bg-cyan-200`}>{busy === "enqueue" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} افزودن به صف durable</button>
          </article>

          <article className="rounded-[24px] border border-white/10 bg-[#050d18] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><Clock3 className="h-5 w-5 text-violet-300" /><div><h3 className="font-black">صف اجرا و تصمیم‌ها</h3><p className="mt-1 text-xs font-bold text-slate-500">بروزرسانی خودکار هر ۱۵ ثانیه</p></div></div><span className="text-xs font-black text-slate-400">{snapshot.runs.length.toLocaleString("fa-IR")} اجرا</span></div>
            <div className="mt-4 max-h-[900px] space-y-3 overflow-y-auto pe-1">
              {snapshot.runs.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm font-bold text-slate-500">هنوز اجرایی ثبت نشده است.</p>}
              {snapshot.runs.map((run) => {
                const aiApprovals = run.reviews.filter((item) => item.reviewKind === "ai_agent" && item.decision === "approve").length;
                const managerApprovals = run.reviews.filter((item) => item.reviewKind === "manager" && item.decision === "approve").length;
                const cLevelApprovals = run.reviews.filter((item) => item.reviewKind === "c_level" && item.decision === "approve").length;
                const humanGate = run.status === "manager_review" || run.status === "c_level_review";
                return <div key={run.id} className="rounded-2xl border border-white/10 bg-[#030914] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-black">{snapshot.catalog.find((item) => item.id === run.workflowId)?.labelFa ?? run.workflowId}</p><p dir="ltr" className="mt-1 text-left text-[10px] font-bold text-slate-600">{run.id}</p></div><GatePill active={["approved", "executing", "completed"].includes(run.status)}>{statusFa[run.status]}</GatePill></div>
                  <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs font-bold leading-6 text-slate-300">{run.inputText}</p>
                  <div className="mt-3 flex flex-wrap gap-2"><GatePill active={aiApprovals >= run.aiQuorum}><Bot className="me-1 inline h-3 w-3" />AI {aiApprovals}/{run.aiQuorum}</GatePill><GatePill active={managerApprovals >= run.managerQuorum}><Users className="me-1 inline h-3 w-3" />Manager {managerApprovals}/{run.managerQuorum}</GatePill><GatePill active={cLevelApprovals >= run.cLevelQuorum}><ShieldCheck className="me-1 inline h-3 w-3" />C‑Level {cLevelApprovals}/{run.cLevelQuorum}</GatePill></div>
                  <div className="mt-3 flex flex-wrap justify-between gap-2 text-[10px] font-bold text-slate-600"><span>{run.dataClass} · {run.externalEffect}</span><span>انقضا: {dateLabel(run.expiresAt)}</span></div>
                  {run.reviews.length > 0 && <details className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-3"><summary className="cursor-pointer text-[10px] font-black text-cyan-200">{run.reviews.length} رأی ثبت‌شده</summary><div className="mt-3 space-y-2">{run.reviews.map((reviewItem) => <div key={reviewItem.id} className="border-t border-white/10 pt-2 text-[10px] font-bold leading-5 text-slate-400"><p dir="ltr" className="text-left text-cyan-200">{reviewItem.reviewKind} · {reviewItem.reviewerAgentId ?? "human"} · {reviewItem.decision}</p><p className="mt-1">{reviewItem.summary}</p>{reviewItem.sources.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{reviewItem.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="max-w-full truncate rounded-lg border border-cyan-300/15 bg-cyan-300/[0.05] px-2 py-1 text-cyan-100 hover:bg-cyan-300/[0.1]">{source.title ?? source.url}</a>)}</div>}</div>)}</div></details>}
                  {humanGate && <><label className="mt-3 block text-xs font-black text-slate-300">مبنای تصمیم مستقل<input value={reviewNotes[run.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [run.id]: event.target.value }))} placeholder="حداقل ۸ نویسه؛ evidence و ریسک را ثبت کنید" className={`${inputClass} mt-2`} /></label><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => void review(run, "approve")} disabled={busy !== null || (reviewNotes[run.id] ?? "").trim().length < 8} className={`${buttonClass} bg-emerald-300 text-[#032016] hover:bg-emerald-200`}>{busy === `review:${run.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} تأیید گیت</button><button type="button" onClick={() => void review(run, "reject")} disabled={busy !== null || (reviewNotes[run.id] ?? "").trim().length < 8} className={`${buttonClass} border border-rose-300/20 bg-rose-300/[0.08] text-rose-100 hover:bg-rose-300/[0.14]`}><XCircle className="h-4 w-4" /> رد</button></div><p className="mt-2 text-[10px] font-bold leading-5 text-amber-200/70">درخواست‌کننده نمی‌تواند اجرای خودش را تأیید کند؛ یک فرد نیز در Manager و C‑Level دوبار شمرده نمی‌شود.</p></>}
                  {run.status === "approved" && <p className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] p-3 text-[10px] font-bold leading-5 text-emerald-100">quorum کامل است؛ فقط executor دامنه‌ای و idempotent مجاز به claim اجراست. پنل عمومی دکمهٔ دورزدن executor ندارد.</p>}
                  {run.failureCode && <p dir="ltr" className="mt-3 text-left text-[10px] font-bold text-rose-300">{run.failureCode}</p>}
                </div>;
              })}
            </div>
          </article>
        </div>
      </>}
    </section>
  );
}
