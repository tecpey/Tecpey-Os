"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, CreditCard, Lock, RefreshCw, ShieldCheck } from "lucide-react";

type Billing = {
  subscription: null | {
    id: string;
    planKey: string;
    planVersion: number;
    state: "pending" | "trialing" | "active" | "grace" | "suspended" | "canceled" | "expired";
    effectiveAt: string;
    currentPeriodEnd: string | null;
    cancelAt: string | null;
    stateVersion: number;
  };
  entitlement: {
    active: boolean;
    capabilities: Record<string, unknown>;
    snapshotVersion: number | null;
  };
};

type ReadState =
  | { kind: "loading" }
  | { kind: "ready"; billing: Billing }
  | { kind: "guest" }
  | { kind: "forbidden" }
  | { kind: "unavailable" };

const stateTone: Record<NonNullable<Billing["subscription"]>["state"], string> = {
  pending: "border-slate-400/25 bg-slate-400/10 text-slate-700 dark:text-slate-200",
  trialing: "border-cyan-400/25 bg-cyan-400/10 text-cyan-800 dark:text-cyan-200",
  active: "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  grace: "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  suspended: "border-orange-500/25 bg-orange-500/10 text-orange-800 dark:text-orange-200",
  canceled: "border-slate-400/25 bg-slate-400/10 text-slate-700 dark:text-slate-200",
  expired: "border-slate-400/25 bg-slate-400/10 text-slate-700 dark:text-slate-200",
};

export function CommerceBillingPanel({ locale }: { locale: "fa" | "en" }) {
  const isFa = locale === "fa";
  const [state, setState] = useState<ReadState>({ kind: "loading" });

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/commerce/billing", {
        cache: "no-store",
        credentials: "include",
        signal,
      });
      if (signal?.aborted) return;
      if (response.status === 401) return setState({ kind: "guest" });
      if (response.status === 403) return setState({ kind: "forbidden" });
      if (!response.ok) return setState({ kind: "unavailable" });
      const body = await response.json().catch(() => null) as { billing?: Billing } | null;
      if (!body?.billing) return setState({ kind: "unavailable" });
      setState({ kind: "ready", billing: body.billing });
    } catch {
      if (!signal?.aborted) setState({ kind: "unavailable" });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(isFa ? "fa-IR" : "en-US", { dateStyle: "medium" }),
    [isFa],
  );
  const formatDate = (value: string | null) => {
    if (!value) return isFa ? "—" : "—";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : (isFa ? "نامشخص" : "Unknown");
  };

  if (state.kind !== "ready") {
    const message = state.kind === "loading"
      ? (isFa ? "در حال دریافت وضعیت اشتراک از مرجع امن تک‌پی…" : "Loading subscription status from TecPey authority…")
      : state.kind === "guest"
        ? (isFa ? "برای مشاهده وضعیت اشتراک باید وارد حساب شوی." : "Sign in to view your subscription status.")
        : state.kind === "forbidden"
          ? (isFa ? "این حساب در فضای کاری فعلی به Billing دسترسی ندارد." : "This account cannot access billing in the current workspace.")
          : (isFa ? "مرجع Billing موقتاً در دسترس نیست. هیچ دسترسی Pro در این وضعیت فرض نمی‌شود." : "Billing authority is temporarily unavailable. No Pro access is assumed in this state.");
    return <div className="rounded-[24px] border border-fg/10 bg-bg/70 p-5" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-400/10"><CreditCard className="h-5 w-5 text-cyan-700 dark:text-cyan-200" aria-hidden="true"/></span>
        <div className="min-w-0">
          <h3 className="font-semibold">{isFa ? "اشتراک و Billing" : "Subscription & billing"}</h3>
          <p role="status" className="mt-1 text-sm leading-7 text-muted">{message}</p>
          {state.kind === "unavailable" ? <button type="button" onClick={() => void load()} className="mt-3 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 dark:text-cyan-200"><RefreshCw className="h-4 w-4" aria-hidden="true"/>{isFa ? "تلاش دوباره" : "Retry"}</button> : null}
        </div>
      </div>
    </div>;
  }

  const { subscription, entitlement } = state.billing;
  const capabilityCount = entitlement.active ? Object.keys(entitlement.capabilities).length : 0;
  const stateLabel = subscription ? ({
    pending: isFa ? "در انتظار" : "Pending",
    trialing: isFa ? "دوره آزمایشی" : "Trial",
    active: isFa ? "فعال" : "Active",
    grace: isFa ? "مهلت پرداخت" : "Grace period",
    suspended: isFa ? "تعلیق" : "Suspended",
    canceled: isFa ? "لغوشده" : "Canceled",
    expired: isFa ? "منقضی" : "Expired",
  } as const)[subscription.state] : null;

  return <section className="rounded-[26px] border border-fg/10 bg-bg/75 p-5 sm:p-6" aria-labelledby="billing-authority-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[.08]"><CreditCard className="h-5 w-5 text-cyan-700 dark:text-cyan-200" aria-hidden="true"/></span>
        <div>
          <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-200">{isFa ? "مرجع سروری Billing" : "Server billing authority"}</p>
          <h3 id="billing-authority-title" className="mt-1 font-semibold">{subscription ? (subscription.planKey.toLowerCase() === "pro" ? "TecPey Pro" : subscription.planKey) : (isFa ? "اشتراک فعالی ثبت نشده" : "No subscription recorded")}</h3>
        </div>
      </div>
      {subscription ? <span className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-semibold ${stateTone[subscription.state]}`}>{stateLabel}</span> : null}
    </div>

    {subscription ? <dl className="mt-5 grid gap-3 sm:grid-cols-2">
      <BillingFact icon={<ShieldCheck className="h-4 w-4" aria-hidden="true"/>} label={isFa ? "دسترسی Pro" : "Pro access"} value={entitlement.active ? (isFa ? "تأییدشده توسط سرور" : "Server authorized") : (isFa ? "غیرفعال" : "Inactive")} />
      <BillingFact icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true"/>} label={isFa ? "قابلیت‌های مجاز" : "Authorized capabilities"} value={entitlement.active ? String(capabilityCount) : "0"} />
      <BillingFact icon={<CalendarClock className="h-4 w-4" aria-hidden="true"/>} label={isFa ? "پایان دوره جاری" : "Current period ends"} value={formatDate(subscription.currentPeriodEnd)} />
      <BillingFact icon={<CalendarClock className="h-4 w-4" aria-hidden="true"/>} label={isFa ? "زمان لغو برنامه‌ریزی‌شده" : "Scheduled cancellation"} value={formatDate(subscription.cancelAt)} />
    </dl> : <p className="mt-4 text-sm leading-7 text-muted">{isFa ? "در حال حاضر Billing هیچ اشتراک جاری یا سابقه نهایی قابل نمایش برای این حساب گزارش نمی‌کند." : "Billing currently reports no current subscription or terminal subscription record for this account."}</p>}

    <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-500/15 bg-amber-500/[.06] p-4 text-xs leading-6 text-muted">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-200" aria-hidden="true"/>
      <p>{isFa
        ? "این کارت فقط وضعیت authoritative سرور را نمایش می‌دهد. بازگشت موفق از صفحه پرداخت، state کلاینت یا تغییر DOM نمی‌تواند Pro را فعال کند. خرید، لغو و رسیدها فقط پس از فعال‌شدن مسیرهای تراکنشی و Provider معتبر در همین بخش نمایش داده می‌شوند."
        : "This card only displays authoritative server state. A successful payment redirect, client state or DOM change cannot unlock Pro. Purchase, cancellation and receipts appear here only after governed mutation routes and a verified provider are enabled."}</p>
    </div>
  </section>;
}

function BillingFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl border border-fg/10 bg-fg/[.025] p-4">
    <dt className="flex items-center gap-2 text-xs font-medium text-muted">{icon}{label}</dt>
    <dd className="mt-2 text-sm font-semibold"><bdi>{value}</bdi></dd>
  </div>;
}
