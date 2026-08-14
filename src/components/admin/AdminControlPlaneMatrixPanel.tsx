"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Database,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminConnectionStatus,
  AdminControlPlaneGroup,
  AdminControlPlaneModule,
  AdminControlPlaneSnapshot,
  AdminControlPlaneStatus,
  AdminControlRiskLevel,
} from "@/lib/admin-control-plane-matrix";

type GroupFilter = "all" | AdminControlPlaneGroup;

type MatrixResponse = {
  ok?: boolean;
  error?: string;
  snapshot?: AdminControlPlaneSnapshot;
};

const groupLabelFa: Record<GroupFilter, string> = {
  all: "همه",
  identity: "هویت",
  academy: "آکادمی",
  trading: "تریدینگ",
  money_movement: "مالی واقعی",
  growth: "رشد",
  community: "کامیونیتی",
  operations: "عملیات",
};

const groups: GroupFilter[] = ["all", "identity", "academy", "trading", "money_movement", "growth", "community", "operations"];

const statusLabelFa: Record<AdminControlPlaneStatus, string> = {
  live: "Live",
  configured: "Configured",
  launch_locked: "Launch locked",
  feature_locked: "Feature locked",
  needs_evidence: "نیازمند evidence",
  planned: "Planned",
};

const statusClassName: Record<AdminControlPlaneStatus, string> = {
  live: "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100",
  configured: "border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100",
  launch_locked: "border-rose-300/25 bg-rose-300/[0.08] text-rose-100",
  feature_locked: "border-amber-300/25 bg-amber-300/[0.08] text-amber-100",
  needs_evidence: "border-orange-300/25 bg-orange-300/[0.08] text-orange-100",
  planned: "border-violet-300/25 bg-violet-300/[0.08] text-violet-100",
};

const connectionLabelFa: Record<AdminConnectionStatus, string> = {
  internal: "Internal",
  connected: "Connected",
  locked: "Locked",
  needs_secret: "Needs secret",
  planned: "Planned",
};

const connectionClassName: Record<AdminConnectionStatus, string> = {
  internal: "border-slate-300/15 bg-slate-300/[0.05] text-slate-300",
  connected: "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100",
  locked: "border-rose-300/20 bg-rose-300/[0.08] text-rose-100",
  needs_secret: "border-amber-300/20 bg-amber-300/[0.08] text-amber-100",
  planned: "border-violet-300/20 bg-violet-300/[0.08] text-violet-100",
};

const riskClassName: Record<AdminControlRiskLevel, string> = {
  standard: "border-slate-300/15 bg-slate-300/[0.05] text-slate-300",
  sensitive: "border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100",
  critical: "border-rose-300/20 bg-rose-300/[0.08] text-rose-100",
};

function isGroupFilter(value: string): value is GroupFilter {
  return groups.includes(value as GroupFilter);
}

function lockedStatus(status: AdminControlPlaneStatus): boolean {
  return ["launch_locked", "feature_locked", "needs_evidence"].includes(status);
}

function initialGroupFilter(): GroupFilter {
  if (typeof window === "undefined") return "all";
  const hash = window.location.hash.replace("#", "");
  return isGroupFilter(hash) ? hash : "all";
}

function StatusBadge({ status }: { status: AdminControlPlaneStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${statusClassName[status]}`}>
      {statusLabelFa[status]}
    </span>
  );
}

function ConnectionBadge({ status }: { status: AdminConnectionStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${connectionClassName[status]}`}>
      {connectionLabelFa[status]}
    </span>
  );
}

function ModuleAction({ module }: { module: AdminControlPlaneModule }) {
  if (module.adminRoute === "/command-center/auth-providers") {
    return (
      <Link
        href="/command-center/auth-providers"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] px-4 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> ورود به Provider Control
      </Link>
    );
  }

  const locked = lockedStatus(module.status);
  const Icon = locked ? LockKeyhole : CheckCircle2;

  return (
    <span
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black ${
        locked
          ? "border-amber-300/15 bg-amber-300/[0.05] text-amber-100"
          : "border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-100"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" /> {locked ? "قفل/رصد در همین ماتریس" : "کنترل عملیاتی در همین ماتریس"}
    </span>
  );
}

export function AdminControlPlaneMatrixPanel() {
  const [snapshot, setSnapshot] = useState<AdminControlPlaneSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeGroup, setActiveGroup] = useState<GroupFilter>(initialGroupFilter);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/command-center/control-plane", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => ({}))) as MatrixResponse;
      if (response.status === 401) {
        setSnapshot(null);
        setError("ابتدا از مسیر Command Center با Passkey وارد شو.");
        return;
      }
      if (response.status === 403) {
        setSnapshot(null);
        setError("برای مشاهده Control Plane، Permission ادمین admin.roles.read لازم است.");
        return;
      }
      if (!response.ok || !data.ok || !data.snapshot) {
        setSnapshot(null);
        setError("Snapshot کنترل‌پلین در حال حاضر قابل دریافت نیست.");
        return;
      }
      setSnapshot(data.snapshot);
    } catch {
      setSnapshot(null);
      setError("ارتباط با سرویس Control Plane برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const visibleModules = useMemo(() => {
    if (!snapshot) return [];
    if (activeGroup === "all") return snapshot.modules;
    return snapshot.modules.filter((module) => module.group === activeGroup);
  }, [activeGroup, snapshot]);

  const selectGroup = (group: GroupFilter) => {
    setActiveGroup(group);
    const nextHash = group === "all" ? "" : `#${group}`;
    window.history.replaceState(null, "", `${window.location.pathname}${nextHash}`);
  };

  return (
    <section dir="rtl" className="min-h-screen bg-[#030914] px-4 py-6 text-white md:px-8 md:py-8" aria-labelledby="control-plane-title">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-cyan-300/15 bg-[#071321] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.35)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1.5 text-xs font-black text-cyan-100">
                <Database className="h-4 w-4" aria-hidden="true" /> Enterprise Control Plane Matrix
              </p>
              <h1 id="control-plane-title" className="mt-4 text-2xl font-black md:text-4xl">کنترل تمام بخش‌ها، اتصال‌ها و تنظیمات</h1>
              <p className="mt-3 max-w-3xl text-sm font-bold leading-8 text-slate-400">
                این نما وضعیت واقعی هر capability را نشان می‌دهد: چه چیزی live است، چه چیزی فقط configured است، کدام اتصال secret/evidence می‌خواهد و کدام مسیر تا launch واقعی قفل می‌ماند.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
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
        </header>

        {error && (
          <p role="alert" className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm font-bold leading-7 text-amber-100">
            {error}
          </p>
        )}

        {loading && !snapshot && (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-[24px] border border-white/10 bg-white/[0.035]" />
            ))}
          </div>
        )}

        {snapshot && (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Modules", snapshot.summary.totalModules],
                ["Live/Configured", snapshot.summary.liveModules],
                ["Locked/Evidence", snapshot.summary.lockedModules],
                ["Connections", `${snapshot.summary.managedConnections}/${snapshot.summary.lockedConnections}`],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-[22px] border border-white/10 bg-[#07111e] p-4">
                  <p className="text-xs font-bold text-slate-500">{String(label)}</p>
                  <p className="mt-2 font-mono text-2xl font-black text-white">{String(value)}</p>
                </div>
              ))}
            </div>

            <p className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4 text-sm font-bold leading-7 text-amber-100">
              {snapshot.safetyCopyFa}
            </p>

            <div className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="فیلتر گروه‌های کنترل‌پلین">
              {groups.map((group) => {
                const active = activeGroup === group;
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => selectGroup(group)}
                    className={`min-h-11 shrink-0 rounded-xl border px-4 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                      active
                        ? "border-cyan-300/40 bg-cyan-300/[0.14] text-cyan-100"
                        : "border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.07]"
                    }`}
                    aria-pressed={active}
                  >
                    {groupLabelFa[group]}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {visibleModules.map((module) => (
                <article key={module.id} className="rounded-[24px] border border-white/10 bg-[#07111e] p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300/80">{groupLabelFa[module.group]}</p>
                      <h2 className="mt-2 text-lg font-black text-white">{module.labelFa}</h2>
                      <p className="mt-2 text-sm font-bold leading-7 text-slate-400">{module.descriptionFa}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={module.status} />
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${riskClassName[module.riskLevel]}`}>
                        {module.riskLevel}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 text-[11px] font-bold text-slate-400 sm:grid-cols-2">
                    <span className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">Permission: {module.requiredPermission}</span>
                    <span className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">{module.stepUpRequired ? "Step-up required" : "Read session"}</span>
                    <span dir="ltr" className="truncate rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left">{module.adminRoute}</span>
                    <span className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">Flags: {module.gatedBy.join(" · ") || "none"}</span>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-xs font-black text-slate-300">Connections</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {module.connections.map((connection) => (
                        <span key={connection.id} title={connection.lockedReasonFa} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#030914] px-3 py-2 text-[11px] font-bold text-slate-300">
                          <ConnectionBadge status={connection.status} /> {connection.labelFa}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <h3 className="text-xs font-black text-slate-300">Controls</h3>
                    {module.controls.map((control) => {
                      const locked = lockedStatus(control.status);
                      return (
                        <div
                          key={control.id}
                          className={`rounded-xl border border-white/10 bg-[#030914] px-3 py-3 ${locked ? "opacity-75" : ""}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-2 text-sm font-black text-white">
                              {locked ? <LockKeyhole className="h-4 w-4 text-amber-200" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 text-emerald-200" aria-hidden="true" />}
                              {control.labelFa}
                            </span>
                            <StatusBadge status={control.status} />
                          </div>
                          <p className="mt-2 text-xs font-bold leading-6 text-slate-500">
                            {control.surfaceFa} · {control.requiredPermission} · {control.stepUpRequired ? "Step-up" : "Read"}
                          </p>
                          {control.lockedReasonFa && (
                            <p className="mt-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-xs font-bold leading-6 text-amber-100">
                              {control.lockedReasonFa}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                    <div className="flex flex-wrap gap-2">
                      {module.evidenceChecklistFa.slice(0, 3).map((item) => (
                        <span key={item} className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-black text-slate-400">
                          {item}
                        </span>
                      ))}
                    </div>
                    <ModuleAction module={module} />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
