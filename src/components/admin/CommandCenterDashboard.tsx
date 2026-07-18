"use client";

import {
  BarChart3,
  BellRing,
  Brain,
  CheckCircle2,
  Database,
  GraduationCap,
  LogOut,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Summary = {
  students?: { total?: number; active_week?: number };
  notifications?: { total?: number; unread?: number };
  certificates?: { total?: number };
  challenges?: { total?: number; success?: number };
  events?: { event_type: string; count: number }[];
};

const cards = [
  { key: "students", label: "کاربران", icon: UsersRound },
  { key: "active", label: "فعال هفته", icon: Zap },
  { key: "certificates", label: "مدارک", icon: GraduationCap },
  { key: "notifications", label: "اعلان‌ها", icon: BellRing },
  { key: "challenges", label: "چالش‌ها", icon: Brain },
  { key: "success", label: "موفقیت چالش", icon: ShieldCheck },
];

export function CommandCenterDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [campaign, setCampaign] = useState({
    title: "",
    body: "",
    audience: "inactive",
    actionUrl: "/academy/profile",
  });
  const [campaignState, setCampaignState] = useState("");

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/command-center/summary", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error ?? "summary_failed");
      setSummary(data?.summary ?? data?.data?.summary ?? null);
    } catch {
      setSummary(null);
      setLoadError("دریافت داده‌های مرکز فرماندهی انجام نشد.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const values = useMemo(() => ({
    students: summary?.students?.total || 0,
    active: summary?.students?.active_week || 0,
    certificates: summary?.certificates?.total || 0,
    notifications: summary?.notifications?.total || 0,
    challenges: summary?.challenges?.total || 0,
    success: `${summary?.challenges?.success || 0}%`,
  }), [summary]);

  const sendCampaign = async () => {
    setCampaignState("در حال ثبت کمپین...");
    try {
      const response = await fetch("/api/command-center/campaign", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaign),
      });
      const data = await response.json().catch(() => ({}));
      setCampaignState(response.ok && data?.ok
        ? `کمپین برای ${data.sent ?? data?.data?.sent ?? 0} کاربر آماده شد.`
        : "ثبت کمپین انجام نشد یا مجوز کافی وجود ندارد.");
    } catch {
      setCampaignState("ثبت کمپین انجام نشد.");
    }
  };

  const logout = async () => {
    await fetch("/api/command-center/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
    window.location.reload();
  };

  return (
    <main dir="rtl" className="min-h-screen bg-slate-950 px-4 py-10 text-white md:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="rounded-[34px] border border-cyan-300/20 bg-slate-900 p-6 shadow-2xl shadow-cyan-950/30 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-100">
                <Database className="h-4 w-4" /> TecPey Command Center
              </p>
              <h1 className="mt-5 text-3xl font-black md:text-5xl">مرکز فرماندهی Learning OS</h1>
              <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-300">
                نشست مدیریتی با هویت فردی، Passkey و کنترل دسترسی سمت سرور محافظت می‌شود.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-cyan-100">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> بروزرسانی
              </button>
              <button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm font-black text-rose-100">
                <LogOut className="h-4 w-4" /> خروج امن
              </button>
            </div>
          </div>
          {loadError && (
            <p role="alert" className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">
              {loadError}
            </p>
          )}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5">
                <div className="flex items-center justify-between gap-3">
                  <Icon className="h-6 w-6 text-cyan-200" />
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black text-slate-300">Live</span>
                </div>
                <p className="mt-5 text-2xl font-black">{String(values[card.key as keyof typeof values])}</p>
                <p className="mt-2 text-xs font-bold text-slate-400">{card.label}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[30px] border border-white/10 bg-white/[0.05] p-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-6 w-6 text-cyan-200" />
              <h2 className="text-xl font-black">رویدادهای Learning OS</h2>
            </div>
            <div className="mt-5 space-y-3">
              {(summary?.events || []).length === 0 && (
                <p className="rounded-2xl bg-white/5 p-4 text-sm font-bold text-slate-300">
                  پس از ورود داده‌های واقعی، رویدادهای درس، آزمون، چالش، شبیه‌ساز و اعلان اینجا نمایش داده می‌شوند.
                </p>
              )}
              {(summary?.events || []).map((event) => (
                <div key={event.event_type} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <span className="text-sm font-black text-slate-200">{event.event_type}</span>
                  <span className="rounded-xl bg-cyan-400/15 px-3 py-1 text-sm font-black text-cyan-100">{event.count}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-white/[0.05] p-6">
            <div className="flex items-center gap-3">
              <Megaphone className="h-6 w-6 text-violet-200" />
              <h2 className="text-xl font-black">کمپین بازگشت کاربر</h2>
            </div>
            <div className="mt-5 space-y-3">
              <select value={campaign.audience} onChange={(event) => setCampaign((current) => ({ ...current, audience: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white">
                <option value="inactive">کاربران غیرفعال</option>
                <option value="all">همه کاربران اخیر</option>
              </select>
              <input value={campaign.title} onChange={(event) => setCampaign((current) => ({ ...current, title: event.target.value }))} placeholder="عنوان هوک" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white" />
              <textarea value={campaign.body} onChange={(event) => setCampaign((current) => ({ ...current, body: event.target.value }))} placeholder="متن پیام هوشمند" rows={4} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold leading-7 text-white" />
              <input value={campaign.actionUrl} onChange={(event) => setCampaign((current) => ({ ...current, actionUrl: event.target.value }))} placeholder="/academy/profile" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white" />
              <button type="button" onClick={sendCampaign} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-300 px-5 py-3 text-sm font-black text-slate-950">
                <BellRing className="h-4 w-4" /> ساخت کمپین
              </button>
              {campaignState && <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs font-bold leading-6 text-slate-300">{campaignState}</p>}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            [ShieldCheck, "هویت فردی مدیر", "هر نشست مدیریتی به Passkey و رکورد قابل‌لغو سمت سرور متصل است."],
            [CheckCircle2, "بدون ذخیره راز در مرورگر", "هیچ shared token یا داده پایدار مدیریتی در localStorage یا sessionStorage نگهداری نمی‌شود."],
          ].map(([Icon, title, body]) => {
            const IconComponent = Icon as typeof ShieldCheck;
            return (
              <div key={String(title)} className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5">
                <IconComponent className="h-6 w-6 text-emerald-200" />
                <h3 className="mt-4 font-black">{String(title)}</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{String(body)}</p>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
