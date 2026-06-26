"use client";

import { BarChart3, BellRing, Brain, CheckCircle2, Database, GraduationCap, LockKeyhole, Megaphone, RefreshCw, ShieldCheck, UsersRound, Zap } from "lucide-react";
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
  const [token, setToken] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [campaign, setCampaign] = useState({ title: "", body: "", audience: "inactive", actionUrl: "/academy/profile" });
  const [campaignState, setCampaignState] = useState("");

  const load = () => {
    if (!token.trim()) { setConfigured(false); setSummary(null); return; }
    setLoading(true);
    fetch("/api/command-center/summary", { headers: { "x-tecpey-admin-token": token.trim() }, cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { setConfigured(Boolean(data?.configured && data?.ok)); setSummary(data?.summary || null); })
      .catch(() => { setConfigured(false); setSummary(null); })
      .finally(() => setLoading(false));
  };

  // On mount, silently attempt to restore the session using the httpOnly
  // admin cookie set by a previous successful authentication. The token
  // input is no longer persisted in sessionStorage to prevent XSS exposure.
  useEffect(() => {
    setLoading(true);
    fetch("/api/command-center/summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok && data?.configured) {
          setConfigured(true);
          setSummary(data.summary || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const values = useMemo(() => ({
    students: summary?.students?.total || 0,
    active: summary?.students?.active_week || 0,
    certificates: summary?.certificates?.total || 0,
    notifications: summary?.notifications?.total || 0,
    challenges: summary?.challenges?.total || 0,
    success: `${summary?.challenges?.success || 0}%`,
  }), [summary]);

  const sendCampaign = () => {
    setCampaignState("در حال ارسال...");
    fetch("/api/command-center/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tecpey-admin-token": token.trim() },
      body: JSON.stringify(campaign),
    })
      .then((response) => response.json())
      .then((data) => setCampaignState(data?.ok ? `کمپین برای ${data.sent} کاربر آماده شد.` : "ارسال کمپین نیازمند توکن ادمین و دیتابیس فعال است."))
      .catch(() => setCampaignState("ارسال کمپین انجام نشد."));
  };

  return (
    <main dir="rtl" className="min-h-screen bg-slate-950 px-4 py-10 text-white md:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="rounded-[34px] border border-cyan-300/20 bg-gradient-to-br from-cyan-500/15 via-slate-900 to-violet-500/15 p-6 shadow-2xl shadow-cyan-500/10 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-100">
                <Database className="h-4 w-4" /> TecPey Command Center
              </p>
              <h1 className="mt-5 text-3xl font-black md:text-5xl">مرکز فرماندهی Learning OS</h1>
              <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-300">
                مدیریت کاربران، چالش‌های منتور، اعلان‌های هوشمند، شبیه‌ساز، جامعه، مدرک و آمار رشد از یک پنل SaaS ریسپانسیو و آماده توسعه موبایل.
              </p>
            </div>
            <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-cyan-100">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> بروزرسانی
            </button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="کلید دسترسی مدیر" className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-300" />
            <button onClick={load} className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950">اتصال امن</button>
          </div>
          {configured === false && (
            <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm font-bold leading-7 text-amber-100">
              اتصال امن برقرار نشد. کلید دسترسی یا سرویس داده را بررسی کن.
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5">
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
          <section className="rounded-[30px] border border-white/10 bg-white/[0.06] p-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-6 w-6 text-cyan-200" />
              <h2 className="text-xl font-black">رویدادهای Learning OS</h2>
            </div>
            <div className="mt-5 space-y-3">
              {(summary?.events || []).length === 0 && <p className="rounded-2xl bg-white/5 p-4 text-sm font-bold text-slate-300">پس از ورود داده‌های واقعی، رویدادهای درس، آزمون، چالش، شبیه‌ساز و اعلان اینجا نمایش داده می‌شوند.</p>}
              {(summary?.events || []).map((event) => (
                <div key={event.event_type} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <span className="text-sm font-black text-slate-200">{event.event_type}</span>
                  <span className="rounded-xl bg-cyan-400/15 px-3 py-1 text-sm font-black text-cyan-100">{event.count}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-white/[0.06] p-6">
            <div className="flex items-center gap-3">
              <Megaphone className="h-6 w-6 text-violet-200" />
              <h2 className="text-xl font-black">کمپین بازگشت کاربر</h2>
            </div>
            <div className="mt-5 space-y-3">
              <select value={campaign.audience} onChange={(e) => setCampaign((prev) => ({ ...prev, audience: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white">
                <option value="inactive">کاربران غیرفعال</option>
                <option value="all">همه کاربران اخیر</option>
              </select>
              <input value={campaign.title} onChange={(e) => setCampaign((prev) => ({ ...prev, title: e.target.value }))} placeholder="عنوان هوک" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white" />
              <textarea value={campaign.body} onChange={(e) => setCampaign((prev) => ({ ...prev, body: e.target.value }))} placeholder="متن پیام هوشمند" rows={4} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold leading-7 text-white" />
              <input value={campaign.actionUrl} onChange={(e) => setCampaign((prev) => ({ ...prev, actionUrl: e.target.value }))} placeholder="/academy/profile" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white" />
              <button onClick={sendCampaign} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-400 px-5 py-3 text-sm font-black text-slate-950"><BellRing className="h-4 w-4" /> ساخت کمپین</button>
              {campaignState && <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs font-bold leading-6 text-slate-300">{campaignState}</p>}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            [LockKeyhole, "امنیت", "دسترسی مدیریتی با احراز هویت و مسیر محافظت‌شده کنترل می‌شود."],
            [CheckCircle2, "آماده موبایل", "Device token، کانال Push، Email، Telegram و In-App از یک هسته مشترک تغذیه می‌شوند."],
            [ShieldCheck, "آماده SaaS", "Academy CMS، Question Bank، Notification Campaign و Analytics به همین Command Center وصل می‌شوند."],
          ].map(([Icon, title, body]) => {
            const IconComp = Icon as typeof ShieldCheck;
            return <div key={String(title)} className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5"><IconComp className="h-6 w-6 text-emerald-200" /><h3 className="mt-4 font-black">{String(title)}</h3><p className="mt-2 text-sm font-bold leading-7 text-slate-300">{String(body)}</p></div>;
          })}
        </div>
      </section>
    </main>
  );
}
