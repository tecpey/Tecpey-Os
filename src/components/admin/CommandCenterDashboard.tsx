"use client";

import {
  BarChart3,
  BellRing,
  Brain,
  CheckCircle2,
  Database,
  Fingerprint,
  GraduationCap,
  LoaderCircle,
  LogOut,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Summary = {
  students?: { total?: number; active_week?: number };
  notifications?: { total?: number; unread?: number };
  certificates?: { total?: number };
  challenges?: { total?: number; success?: number };
  events?: { event_type: string; count: number }[];
};

type AdminIdentity = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  authenticationMethods?: string[];
};

type CommandCenterDashboardProps = {
  admin: AdminIdentity;
  busy: boolean;
  onLogout: () => Promise<void> | void;
  onSessionExpired: () => Promise<void> | void;
};

const cards = [
  { key: "students", label: "کاربران", icon: UsersRound },
  { key: "active", label: "فعال هفته", icon: Zap },
  { key: "certificates", label: "مدارک", icon: GraduationCap },
  { key: "notifications", label: "اعلان‌ها", icon: BellRing },
  { key: "challenges", label: "چالش‌ها", icon: Brain },
  { key: "success", label: "موفقیت چالش", icon: ShieldCheck },
] as const;

export function CommandCenterDashboard({
  admin,
  busy,
  onLogout,
  onSessionExpired,
}: CommandCenterDashboardProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [campaign, setCampaign] = useState({
    title: "",
    body: "",
    audience: "inactive",
    actionUrl: "/academy/profile",
    reason: "بازگشت کاربران غیرفعال",
  });
  const [campaignState, setCampaignState] = useState("");
  const [campaignBusy, setCampaignBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/command-center/summary", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        await onSessionExpired();
        return;
      }
      if (!response.ok || !data?.ok) {
        setError("داده‌های عملیاتی در حال حاضر قابل دریافت نیستند.");
        setSummary(null);
        return;
      }
      setSummary(data.summary ?? null);
    } catch {
      setError("ارتباط با سرویس داده Command Center قطع است.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const values = useMemo(() => ({
    students: summary?.students?.total ?? 0,
    active: summary?.students?.active_week ?? 0,
    certificates: summary?.certificates?.total ?? 0,
    notifications: summary?.notifications?.total ?? 0,
    challenges: summary?.challenges?.total ?? 0,
    success: `${summary?.challenges?.success ?? 0}%`,
  }), [summary]);

  const sendCampaign = async () => {
    setCampaignBusy(true);
    setCampaignState("");
    try {
      const response = await fetch("/api/command-center/campaign", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaign),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        await onSessionExpired();
        return;
      }
      if (data?.error === "step_up_required") {
        setCampaignState("برای این عملیات حساس، یک‌بار خارج شو و دوباره با Passkey وارد شو.");
        return;
      }
      setCampaignState(
        response.ok && data?.ok
          ? `کمپین برای ${data.sent} کاربر ثبت شد.`
          : "ساخت کمپین انجام نشد؛ Permission، داده ورودی یا سرویس اعلان را بررسی کن.",
      );
    } catch {
      setCampaignState("ارتباط با سرویس کمپین برقرار نشد.");
    } finally {
      setCampaignBusy(false);
    }
  };

  return (
    <main dir="rtl" className="min-h-screen bg-[#030914] px-4 py-6 text-white md:px-8 md:py-8">
      <section className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-[30px] border border-cyan-300/15 bg-[#071321] shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center lg:p-8">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1.5 text-xs font-black text-cyan-200">
                  <Database className="h-4 w-4" aria-hidden="true" /> TecPey Enterprise Command Center
                </p>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1.5 text-xs font-black text-emerald-200">
                  <Fingerprint className="h-4 w-4" aria-hidden="true" /> Passkey verified
                </span>
              </div>
              <h1 className="mt-5 text-3xl font-black md:text-5xl">کنترل‌پلین عملیاتی تک‌پی</h1>
              <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-400">
                داده‌ها از سرویس‌های سمت سرور خوانده می‌شوند و هر اقدام حساس با هویت، Session و Permission همین مدیر ارزیابی و ثبت می‌شود.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-cyan-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
                بروزرسانی داده
              </button>
              <button
                type="button"
                onClick={() => void onLogout()}
                disabled={busy}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[0.08] px-4 text-sm font-black text-rose-100 transition hover:bg-rose-300/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-60"
              >
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
                خروج امن
              </button>
            </div>
          </div>

          <div className="grid border-t border-white/10 bg-[#050d18] md:grid-cols-3">
            <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4 md:border-b-0 md:border-l">
              <UserRound className="h-5 w-5 text-cyan-300" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold text-slate-500">مدیر فعال</p>
                <p className="mt-1 text-sm font-black text-slate-100">{admin.displayName}</p>
              </div>
            </div>
            <div className="border-b border-white/10 px-6 py-4 md:border-b-0 md:border-l">
              <p className="text-xs font-bold text-slate-500">هویت سازمانی</p>
              <p dir="ltr" className="mt-1 truncate text-left text-sm font-black text-slate-100">{admin.email}</p>
            </div>
            <div className="px-6 py-4">
              <p className="text-xs font-bold text-slate-500">Role فعال</p>
              <p className="mt-1 text-sm font-black text-slate-100">{admin.roles.join(" · ") || "بدون Role"}</p>
            </div>
          </div>
        </header>

        {error && (
          <div role="alert" className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm font-bold leading-7 text-amber-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className="rounded-[24px] border border-white/10 bg-[#07111e] p-5">
                <div className="flex items-center justify-between gap-3">
                  <Icon className="h-6 w-6 text-cyan-200" aria-hidden="true" />
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black tracking-wider text-slate-400">
                    LIVE
                  </span>
                </div>
                <p className="mt-5 text-2xl font-black">{loading ? "—" : String(values[card.key])}</p>
                <p className="mt-2 text-xs font-bold text-slate-500">{card.label}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[28px] border border-white/10 bg-[#07111e] p-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-6 w-6 text-cyan-200" aria-hidden="true" />
              <div>
                <h2 className="text-xl font-black">رویدادهای هفت روز اخیر</h2>
                <p className="mt-1 text-xs font-bold text-slate-500">منبع: Learning Events سمت سرور</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {!loading && (summary?.events ?? []).length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-5 text-sm font-bold leading-7 text-slate-400">
                  رویداد قابل‌نمایشی در بازه فعلی وجود ندارد.
                </p>
              )}
              {(summary?.events ?? []).map((event) => (
                <div key={event.event_type} className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#030914] p-4">
                  <span className="text-sm font-black text-slate-200">{event.event_type}</span>
                  <span className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.08] px-3 py-1 text-sm font-black text-cyan-100">{event.count}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[#07111e] p-6">
            <div className="flex items-center gap-3">
              <Megaphone className="h-6 w-6 text-violet-200" aria-hidden="true" />
              <div>
                <h2 className="text-xl font-black">کمپین بازگشت کاربر</h2>
                <p className="mt-1 text-xs font-bold text-slate-500">نیازمند Permission و Step-up معتبر</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <select
                value={campaign.audience}
                onChange={(event) => setCampaign((current) => ({ ...current, audience: event.target.value }))}
                className="min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-4 text-sm font-bold text-white outline-none focus:border-violet-300"
              >
                <option value="inactive">کاربران غیرفعال</option>
                <option value="all">همه کاربران اخیر</option>
              </select>
              <input
                value={campaign.title}
                onChange={(event) => setCampaign((current) => ({ ...current, title: event.target.value }))}
                placeholder="عنوان پیام"
                className="min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-4 text-sm font-bold text-white outline-none focus:border-violet-300"
              />
              <textarea
                value={campaign.body}
                onChange={(event) => setCampaign((current) => ({ ...current, body: event.target.value }))}
                placeholder="متن پیام"
                rows={4}
                className="w-full rounded-xl border border-white/10 bg-[#030914] px-4 py-3 text-sm font-bold leading-7 text-white outline-none focus:border-violet-300"
              />
              <input
                value={campaign.actionUrl}
                onChange={(event) => setCampaign((current) => ({ ...current, actionUrl: event.target.value }))}
                placeholder="/academy/profile"
                dir="ltr"
                className="min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-4 text-left text-sm font-bold text-white outline-none focus:border-violet-300"
              />
              <input
                value={campaign.reason}
                onChange={(event) => setCampaign((current) => ({ ...current, reason: event.target.value }))}
                placeholder="دلیل عملیاتی"
                className="min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-4 text-sm font-bold text-white outline-none focus:border-violet-300"
              />
              <button
                type="button"
                onClick={() => void sendCampaign()}
                disabled={campaignBusy}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-300 px-5 text-sm font-black text-[#120626] transition hover:bg-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-60"
              >
                {campaignBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
                ثبت کمپین
              </button>
              {campaignState && (
                <p role="status" className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-xs font-bold leading-6 text-slate-300">
                  {campaignState}
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            [ShieldCheck, "Authorization سمت سرور", "هر درخواست با Permission واقعی مدیر و وضعیت Session در PostgreSQL ارزیابی می‌شود."],
            [CheckCircle2, "منبع داده واحد", "آمار، اعلان و Audit از Backend خوانده می‌شوند و مرورگر منبع حقیقت نیست."],
            [Fingerprint, "هویت قابل‌ردیابی", "اقدامات مدیریتی به Admin ID، Session، IP و رویداد Audit متصل می‌شوند."],
          ].map(([Icon, title, body]) => {
            const IconComponent = Icon as typeof ShieldCheck;
            return (
              <div key={String(title)} className="rounded-[24px] border border-white/10 bg-[#07111e] p-5">
                <IconComponent className="h-6 w-6 text-emerald-200" aria-hidden="true" />
                <h3 className="mt-4 font-black">{String(title)}</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-400">{String(body)}</p>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
