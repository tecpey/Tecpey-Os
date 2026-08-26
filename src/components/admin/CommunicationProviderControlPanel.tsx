"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  Mail,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProviderId = "limoo_sms" | "resend" | "sendgrid";
type ProviderSnapshot = {
  providerId: ProviderId;
  enabled: boolean;
  secretConfigured: boolean;
  keyFingerprint: string | null;
  settings: {
    otpPatternId?: string;
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
    defaultTemplateId?: string;
  };
  revision: number;
  rotatedAt: string | null;
  lastTestStatus: "passed" | "failed" | null;
  lastTestedAt: string | null;
  updatedAt: string | null;
};

type FormState = Omit<ProviderSnapshot["settings"], "otpPatternId"> & {
  enabled: boolean;
  apiKey: string;
  otpPatternId: string;
};

const PROVIDERS: Array<{
  id: ProviderId;
  title: string;
  detail: string;
  icon: typeof Mail;
}> = [
  {
    id: "limoo_sms",
    title: "Limoo SMS",
    detail: "ارسال رمز یک‌بارمصرف تولیدشده توسط تک‌پی با پترن تأییدشده لیمو",
    icon: MessageSquareText,
  },
  {
    id: "resend",
    title: "Resend",
    detail: "ایمیل تراکنشی با دامنه فرستنده و Template منتشرشده",
    icon: Mail,
  },
  {
    id: "sendgrid",
    title: "SendGrid",
    detail: "ایمیل تراکنشی و Dynamic Template با API v3",
    icon: Mail,
  },
];

function initialForm(snapshot?: ProviderSnapshot): FormState {
  return {
    enabled: snapshot?.enabled ?? false,
    apiKey: "",
    otpPatternId: snapshot?.settings.otpPatternId?.toString() ?? "",
    fromName: snapshot?.settings.fromName ?? "TecPey",
    fromEmail: snapshot?.settings.fromEmail ?? "noreply@tecpey.ir",
    replyTo: snapshot?.settings.replyTo ?? "",
    defaultTemplateId: snapshot?.settings.defaultTemplateId ?? "",
  };
}

function formatDate(value: string | null): string {
  if (!value) return "ثبت نشده";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function CommunicationProviderControlPanel() {
  const [providers, setProviders] = useState<ProviderSnapshot[]>([]);
  const [forms, setForms] = useState<Partial<Record<ProviderId, FormState>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [testing, setTesting] = useState<ProviderId | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/command-center/communications", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !Array.isArray(data.providers)) {
        setError(response.status === 401
          ? "Session مدیریتی منقضی شده است؛ دوباره با رمز و Authenticator وارد شوید."
          : "دریافت تنظیمات ارتباطات ممکن نشد.");
        return;
      }
      const next = data.providers as ProviderSnapshot[];
      setProviders(next);
      setForms(Object.fromEntries(next.map((provider) => [provider.providerId, initialForm(provider)])));
    } catch {
      setError("ارتباط با مرکز تنظیمات برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const pendingLoad = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(pendingLoad);
  }, [load]);

  const readyCount = useMemo(
    () => providers.filter((provider) =>
      provider.secretConfigured &&
      provider.enabled &&
      provider.lastTestStatus === "passed" &&
      (provider.providerId !== "limoo_sms" || Boolean(provider.settings.otpPatternId))
    ).length,
    [providers],
  );

  const updateForm = (id: ProviderId, patch: Partial<FormState>) => {
    setForms((current) => ({
      ...current,
      [id]: { ...(current[id] ?? initialForm()), ...patch },
    }));
  };

  const save = async (id: ProviderId) => {
    const form = forms[id] ?? initialForm();
    setBusy(id);
    setError("");
    setMessage("");
    try {
      const isSms = id === "limoo_sms";
      const response = await fetch("/api/command-center/communications", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: id,
          enabled: form.enabled,
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
          settings: isSms
            ? { otpPatternId: form.otpPatternId }
            : {
                fromName: form.fromName,
                fromEmail: form.fromEmail,
                replyTo: form.replyTo,
                defaultTemplateId: form.defaultTemplateId,
              },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setError(data?.error === "step_up_required"
          ? "برای تغییر Secret باید دوباره با رمز و Authenticator وارد شوید."
          : data?.error === "communication_provider_secret_required"
            ? "برای فعال‌سازی، API Key معتبر را وارد کنید."
            : "ذخیره تنظیمات انجام نشد؛ ورودی‌ها و دسترسی مدیر را بررسی کنید.");
        return;
      }
      const updated = data.provider as ProviderSnapshot;
      setProviders((current) => current.map((provider) => provider.providerId === id ? updated : provider));
      setForms((current) => ({ ...current, [id]: { ...form, apiKey: "" } }));
      setMessage(`${PROVIDERS.find((provider) => provider.id === id)?.title} با موفقیت و به‌صورت رمز‌شده ذخیره شد؛ برای تأیید تنظیمات فعلی، تست اتصال را اجرا کنید.`);
    } catch {
      setError("ارتباط هنگام ذخیره قطع شد؛ وضعیت فعلی تغییر نکرد.");
    } finally {
      setBusy(null);
    }
  };

  const test = async (id: ProviderId) => {
    setTesting(id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/command-center/communications", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: id, ...(id === "limoo_sms" ? { testPhone } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        if (data?.error === "communication_provider_test_failed") await load();
        setError(data?.error === "invalid_iranian_mobile"
          ? "برای تست SMS یک شماره موبایل معتبر ایران وارد کنید."
          : data?.error === "step_up_required"
            ? "برای تست Provider دوباره با رمز و Authenticator وارد شوید."
            : "تست Provider ناموفق بود؛ کلید، دامنه و تنظیمات Provider را بررسی کنید.");
        return;
      }
      setMessage(id === "limoo_sms"
        ? "درخواست کد تست توسط Limoo پذیرفته شد."
        : "ایمیل تست به ایمیل همین مدیر ارسال شد.");
      await load();
    } catch {
      setError("ارتباط هنگام تست Provider قطع شد.");
    } finally {
      setTesting(null);
    }
  };

  return (
    <section dir="rtl" className="text-white">
      <header className="rounded-[28px] border border-cyan-300/15 bg-[#071321] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.35)] md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/command-center" className="inline-flex min-h-10 items-center gap-2 rounded-xl text-sm font-black text-cyan-200 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300">
              <ArrowRight className="h-4 w-4" aria-hidden="true" /> بازگشت به مرکز فرمان
            </Link>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1.5 text-xs font-black text-cyan-100">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Secret-safe control plane
              </span>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1.5 text-xs font-black text-emerald-100">
                {readyCount} اتصال آماده
              </span>
            </div>
            <h1 className="mt-5 text-3xl font-black md:text-5xl">مرکز ارتباطات و Providerها</h1>
            <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-400">
              کلید جدید فقط هنگام ذخیره وارد می‌شود؛ پس از آن هیچ مدیر یا API نمی‌تواند مقدار اصلی را دوباره مشاهده کند. تغییرات حساس با Step-up، رمزگذاری سمت سرور و audit غیرقابل‌ویرایش ثبت می‌شوند.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-cyan-100 outline-none transition-[background-color,transform] duration-150 active:scale-[0.97] hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60 motion-reduce:transform-none">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> بروزرسانی
          </button>
        </div>
      </header>

      {(error || message) && (
        <div role={error ? "alert" : "status"} className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 text-sm font-bold leading-7 ${error ? "border-rose-300/20 bg-rose-300/[0.08] text-rose-100" : "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"}`}>
          {error ? <TriangleAlert className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />}
          {error || message}
        </div>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        {PROVIDERS.map((meta) => {
          const provider = providers.find((item) => item.providerId === meta.id);
          const form = forms[meta.id] ?? initialForm(provider);
          const Icon = meta.icon;
          const isSms = meta.id === "limoo_sms";
          const testable = Boolean(
            provider?.secretConfigured &&
            provider.enabled &&
            (!isSms || provider.settings.otpPatternId),
          );
          const ready = testable && provider?.lastTestStatus === "passed";
          const status = !provider?.secretConfigured
            ? "نیازمند کلید"
            : !testable
              ? "غیرفعال"
              : provider.lastTestStatus === "failed"
                ? "خطای تست"
                : ready
                  ? "آماده"
                  : "نیازمند تست";
          return (
            <article key={meta.id} className="rounded-[26px] border border-white/10 bg-[#07111e] p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.08]">
                    <Icon className="h-5 w-5 text-cyan-100" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-lg font-black">{meta.title}</h2>
                    <p className="mt-1 text-xs font-bold leading-6 text-slate-500">{meta.detail}</p>
                  </div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${ready ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100" : "border-amber-300/20 bg-amber-300/[0.08] text-amber-100"}`}>
                  {status}
                </span>
              </div>

              <div className="mt-5 rounded-2xl border border-white/8 bg-[#050d18] p-4 text-xs font-bold leading-6 text-slate-400">
                <div className="flex items-center justify-between gap-3"><span>Secret</span><span dir="ltr" className="text-slate-200">{provider?.secretConfigured ? `•••• ${provider.keyFingerprint}` : "ثبت نشده"}</span></div>
                <div className="mt-2 flex items-center justify-between gap-3"><span>آخرین چرخش</span><span>{formatDate(provider?.rotatedAt ?? null)}</span></div>
                <div className="mt-2 flex items-center justify-between gap-3"><span>آخرین تست</span><span className={provider?.lastTestStatus === "passed" ? "text-emerald-200" : provider?.lastTestStatus === "failed" ? "text-rose-200" : ""}>{provider?.lastTestStatus === "passed" ? "موفق" : provider?.lastTestStatus === "failed" ? "ناموفق" : "انجام نشده"}</span></div>
              </div>

              <label className="mt-5 block text-xs font-black text-slate-300">
                <span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4" aria-hidden="true" /> API Key جدید</span>
                <input type="password" value={form.apiKey} onChange={(event) => updateForm(meta.id, { apiKey: event.target.value })} autoComplete="new-password" spellCheck={false} placeholder={provider?.secretConfigured ? "برای حفظ کلید فعلی خالی بگذارید" : "کلید جدید را وارد کنید"} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-left font-mono text-sm text-white outline-none transition-colors focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20" dir="ltr" />
              </label>

              {isSms ? (
                <>
                  <label className="mt-4 block text-xs font-black text-slate-300">Pattern ID لیمو
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={form.otpPatternId} onChange={(event) => updateForm(meta.id, { otpPatternId: event.target.value.replace(/\D/g, "").slice(0, 19) })} placeholder="شناسه عددی پترن تأییدشده" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-left font-mono text-sm text-white outline-none transition-colors focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20" dir="ltr" />
                    <span className="mt-2 block text-[11px] font-bold leading-5 text-slate-500">پترن تأییدشده در لیمو باید دقیقاً یک متغیر برای رمز ۶ رقمی تولیدشده توسط تک‌پی داشته باشد.</span>
                  </label>
                  <label className="mt-4 block text-xs font-black text-slate-300">شماره تست
                    <input value={testPhone} onChange={(event) => setTestPhone(event.target.value)} inputMode="tel" placeholder="09123456789" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-left text-sm text-white outline-none transition-colors focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20" dir="ltr" />
                  </label>
                </>
              ) : (
                <div className="mt-4 grid gap-4">
                  <label className="text-xs font-black text-slate-300">نام فرستنده<input value={form.fromName ?? ""} onChange={(event) => updateForm(meta.id, { fromName: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20" /></label>
                  <label className="text-xs font-black text-slate-300">ایمیل فرستنده<input type="email" value={form.fromEmail ?? ""} onChange={(event) => updateForm(meta.id, { fromEmail: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-left text-sm text-white outline-none transition-colors focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20" dir="ltr" /></label>
                  <label className="text-xs font-black text-slate-300">Reply-To اختیاری<input type="email" value={form.replyTo ?? ""} onChange={(event) => updateForm(meta.id, { replyTo: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-left text-sm text-white outline-none transition-colors focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20" dir="ltr" /></label>
                  <label className="text-xs font-black text-slate-300">Template ID پیش‌فرض (بدون متغیر اجباری)<input value={form.defaultTemplateId ?? ""} onChange={(event) => updateForm(meta.id, { defaultTemplateId: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030914] px-3 text-left font-mono text-sm text-white outline-none transition-colors focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20" dir="ltr" /></label>
                </div>
              )}

              <label className="mt-5 flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black">
                <span>Provider فعال باشد</span>
                <input type="checkbox" checked={form.enabled} onChange={(event) => updateForm(meta.id, { enabled: event.target.checked })} className="h-5 w-5 accent-cyan-400" />
              </label>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => void save(meta.id)} disabled={busy !== null || testing !== null || loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-cyan-500 to-blue-600 px-3 text-sm font-black text-white outline-none transition-transform duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50 motion-reduce:transform-none">
                  {busy === meta.id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />} ذخیره امن
                </button>
                <button type="button" onClick={() => void test(meta.id)} disabled={!testable || busy !== null || testing !== null || loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-black text-cyan-100 outline-none transition-[background-color,transform] duration-150 active:scale-[0.97] hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-40 motion-reduce:transform-none">
                  {testing === meta.id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />} تست اتصال
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4 text-xs font-bold leading-7 text-amber-100">
        API Key ذخیره‌شده بازیابی یا نمایش داده نمی‌شود. برای تغییر آن همیشه کلید جدید وارد کنید. کلید مادر رمزگذاری فقط در Secret فایل سرویس نگهداری می‌شود و از این پنل قابل مشاهده یا تغییر نیست.
      </div>
    </section>
  );
}
