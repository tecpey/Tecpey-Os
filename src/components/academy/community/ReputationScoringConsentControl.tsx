"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useLocale } from "next-intl";
import {
  Check,
  EyeOff,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import {
  loadCommunityReputationScoringConsentClient,
  updateCommunityReputationScoringConsentClient,
  type CommunityReputationScoringConsentClient,
  type CommunityReputationScoringConsentMutationResult,
} from "@/lib/community-reputation-scoring-consent-client";

type Copy = {
  title: string;
  enabled: string;
  disabled: string;
  defaultOff: string;
  intro: string;
  computesTitle: string;
  computes: string;
  excludesTitle: string;
  excludes: string;
  privacyTitle: string;
  privacy: string;
  evidenceTitle: string;
  evidence: string;
  acknowledge: string;
  enable: string;
  enabling: string;
  disable: string;
  disabling: string;
  keepOff: string;
  activeNote: string;
  revokedNote: string;
  saved: string;
  refreshed: string;
  conflict: string;
  rateLimited: string;
  unauthenticated: string;
  unavailable: string;
  invalid: string;
  retry: string;
  loading: string;
  lastChanged: string;
};

const COPY: Record<"fa" | "en", Copy> = {
  fa: {
    title: "رضایت محاسبه امتیاز خصوصی",
    enabled: "فعال",
    disabled: "غیرفعال",
    defaultOff: "پیش‌فرض خاموش",
    intro:
      "این انتخاب فقط اجازه محاسبه امتیاز خصوصی انضباط ژورنال را می‌دهد و از نمایش عمومی پروفایل یا لیدربرد کاملاً مستقل است.",
    computesTitle: "چه چیزی محاسبه می‌شود؟",
    computes:
      "ثبات تکمیل Challenge رسمی ژورنال و پوشش Reflectionهای معتبر در چرخه‌های نهایی‌شده.",
    excludesTitle: "چه چیزی محاسبه نمی‌شود؟",
    excludes:
      "سودآوری، مهارت معامله، ریسک مالی، شایستگی شغلی، بورسیه، حساب تأمین سرمایه یا رتبه عمومی.",
    privacyTitle: "مرز حریم خصوصی",
    privacy:
      "فعال‌سازی این گزینه پروفایل شما را عمومی نمی‌کند و هیچ تصمیم Mentor یا Instructor ایجاد نمی‌کند.",
    evidenceTitle: "پس از لغو رضایت",
    evidence:
      "محاسبه‌های بعدی فوراً متوقف می‌شوند؛ شواهد تغییرناپذیر Challenge برای صحت سوابق حذف یا بازنویسی نمی‌شوند.",
    acknowledge:
      "متوجه شدم که این رضایت فقط برای محاسبه خصوصی Journal Discipline Score است.",
    enable: "فعال‌کردن محاسبه خصوصی",
    enabling: "در حال ثبت رضایت…",
    disable: "لغو رضایت و توقف محاسبه",
    disabling: "در حال لغو رضایت…",
    keepOff: "تا زمانی که خودتان فعال نکنید، خاموش می‌ماند.",
    activeNote:
      "امتیاز فقط برای خود شما قابل مشاهده است. لغو رضایت به همان سادگی فعال‌سازی انجام می‌شود.",
    revokedNote: "رضایت لغو شد و محاسبه‌های بعدی متوقف می‌شوند.",
    saved: "انتخاب شما با موفقیت در سرور ثبت شد.",
    refreshed: "وضعیت تازه از سرور بارگذاری شد.",
    conflict:
      "این تنظیم در دستگاه یا نشست دیگری تغییر کرده بود؛ وضعیت تازه بارگذاری شد.",
    rateLimited: "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
    unauthenticated: "برای مدیریت رضایت، وارد حساب آکادمی شوید.",
    unavailable:
      "مرجع سرور رضایت موقتاً در دسترس نیست؛ هیچ وضعیت محلی جایگزین نمی‌شود.",
    invalid: "پاسخ سرور معتبر نبود و هیچ تغییری اعمال نشد.",
    retry: "تلاش دوباره",
    loading: "در حال دریافت وضعیت رضایت…",
    lastChanged: "آخرین تغییر",
  },
  en: {
    title: "Private scoring consent",
    enabled: "Enabled",
    disabled: "Disabled",
    defaultOff: "Default off",
    intro:
      "This choice only permits computation of your private Journal Discipline Score. It is independent from public profile and leaderboard visibility.",
    computesTitle: "What is computed?",
    computes:
      "Consistency of finalized official journal challenges and valid Reflection coverage across those cycles.",
    excludesTitle: "What is not computed?",
    excludes:
      "Profitability, trading skill, financial risk, employability, scholarships, funded accounts, or public rank.",
    privacyTitle: "Privacy boundary",
    privacy:
      "Enabling this does not make your profile public and does not create Mentor or Instructor decisions.",
    evidenceTitle: "After withdrawal",
    evidence:
      "Future computation stops immediately. Immutable challenge evidence is retained for record integrity and is not rewritten.",
    acknowledge:
      "I understand this consent is only for computing my private Journal Discipline Score.",
    enable: "Enable private scoring",
    enabling: "Saving consent…",
    disable: "Withdraw consent and stop scoring",
    disabling: "Withdrawing consent…",
    keepOff: "It stays off until you explicitly enable it.",
    activeNote:
      "The score is visible only to you. Withdrawing consent is as easy as enabling it.",
    revokedNote: "Consent was withdrawn and future computation will stop.",
    saved: "Your choice was saved securely on the server.",
    refreshed: "The latest server state was loaded.",
    conflict:
      "This setting changed in another device or session; the latest state was loaded.",
    rateLimited: "Too many requests. Please try again shortly.",
    unauthenticated: "Sign in to your Academy account to manage consent.",
    unavailable:
      "The consent authority is temporarily unavailable; no local fallback is used.",
    invalid: "The server response was invalid and no change was applied.",
    retry: "Try again",
    loading: "Loading consent status…",
    lastChanged: "Last changed",
  },
};

type Props = {
  onConsentChanged?: (consent: CommunityReputationScoringConsentClient) => void;
};

function mutationMessage(
  result: Extract<CommunityReputationScoringConsentMutationResult, { ok: false }>,
  copy: Copy,
): string {
  switch (result.reason) {
    case "revision_conflict":
      return copy.conflict;
    case "rate_limited":
      return copy.rateLimited;
    case "unauthenticated":
      return copy.unauthenticated;
    case "invalid_response":
      return copy.invalid;
    case "idempotency_conflict":
    case "unavailable":
    default:
      return copy.unavailable;
  }
}

export function ReputationScoringConsentControl({ onConsentChanged }: Props) {
  const locale = useLocale();
  const language = locale === "fa" ? "fa" : "en";
  const copy = COPY[language];
  const checkboxId = useId();
  const [consent, setConsent] =
    useState<CommunityReputationScoringConsentClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (announce = false) => {
    setLoading(true);
    setError(null);
    const result = await loadCommunityReputationScoringConsentClient();
    if (result.available) {
      setConsent(result.consent);
      if (announce) setMessage(copy.refreshed);
    } else {
      setConsent(null);
      setError(
        result.reason === "unauthenticated"
          ? copy.unauthenticated
          : result.reason === "invalid_response"
            ? copy.invalid
            : copy.unavailable,
      );
    }
    setLoading(false);
  }, [copy]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const save = useCallback(
    async (enabled: boolean) => {
      if (!consent || saving) return;
      setSaving(true);
      setMessage(null);
      setError(null);
      const result = await updateCommunityReputationScoringConsentClient({
        expectedRevision: consent.revision,
        enabled,
      });
      if (result.ok) {
        setConsent(result.consent);
        setAcknowledged(false);
        setMessage(enabled ? copy.saved : copy.revokedNote);
        onConsentChanged?.(result.consent);
      } else {
        setError(mutationMessage(result, copy));
        if (result.reason === "revision_conflict") {
          await load(false);
        }
      }
      setSaving(false);
    }, [consent, copy, load, onConsentChanged, saving],
  );

  if (loading) {
    return (
      <section
        className="rounded-[24px] border border-cyan-300/15 bg-cyan-300/[0.04] p-5"
        aria-busy="true"
        aria-label={copy.loading}
        dir={language === "fa" ? "rtl" : "ltr"}
      >
        <div className="flex items-center gap-3 text-sm font-bold text-cyan-100/75">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {copy.loading}
        </div>
      </section>
    );
  }

  if (!consent) {
    return (
      <section
        className="rounded-[24px] border border-amber-300/20 bg-amber-300/[0.04] p-5"
        dir={language === "fa" ? "rtl" : "ltr"}
      >
        <div className="flex items-start gap-3">
          <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-black text-amber-100">{copy.unavailable}</p>
            <button
              type="button"
              onClick={() => void load(true)}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-200/10 px-4 py-2 text-xs font-black text-amber-50 transition hover:bg-amber-200/15 focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {copy.retry}
            </button>
          </div>
        </div>
        <p className="sr-only" role="alert" aria-live="assertive">
          {error}
        </p>
      </section>
    );
  }

  const changedAt = consent.consentedAt
    ? new Intl.DateTimeFormat(language === "fa" ? "fa-IR" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(consent.consentedAt))
    : null;

  return (
    <section
      className="rounded-[24px] border border-cyan-300/20 bg-gradient-to-b from-cyan-300/[0.06] to-slate-950/20 p-5"
      dir={language === "fa" ? "rtl" : "ltr"}
      aria-labelledby={`${checkboxId}-title`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10">
            <ShieldCheck className="h-5 w-5 text-cyan-200" aria-hidden="true" />
          </div>
          <div>
            <h3 id={`${checkboxId}-title`} className="font-black text-cyan-50">
              {copy.title}
            </h3>
            <p className="mt-1 max-w-2xl text-xs font-bold leading-6 text-cyan-100/65">
              {copy.intro}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${
              consent.enabled
                ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                : "border-slate-400/20 bg-slate-400/10 text-slate-300"
            }`}
          >
            {consent.enabled ? copy.enabled : copy.disabled}
          </span>
          {!consent.enabled && (
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-black text-cyan-100">
              {copy.defaultOff}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          [copy.computesTitle, copy.computes],
          [copy.excludesTitle, copy.excludes],
          [copy.privacyTitle, copy.privacy],
          [copy.evidenceTitle, copy.evidence],
        ].map(([title, description]) => (
          <div
            key={title}
            className="rounded-2xl border border-white/5 bg-slate-950/35 p-4"
          >
            <p className="text-xs font-black text-slate-200">{title}</p>
            <p className="mt-1.5 text-[11px] font-bold leading-5 text-slate-400">
              {description}
            </p>
          </div>
        ))}
      </div>

      {consent.enabled ? (
        <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] p-4">
          <div className="flex items-start gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-xs font-black text-emerald-100">{copy.activeNote}</p>
              {changedAt && (
                <p className="mt-1 text-[10px] font-bold text-emerald-100/55">
                  {copy.lastChanged}: {changedAt}
                </p>
              )}
              <button
                type="button"
                onClick={() => void save(false)}
                disabled={saving}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300/20 bg-slate-300/10 px-4 py-2 text-xs font-black text-slate-100 transition hover:bg-slate-300/15 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                )}
                {saving ? copy.disabling : copy.disable}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <fieldset className="mt-5 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <legend className="sr-only">{copy.title}</legend>
          <label
            htmlFor={checkboxId}
            className="flex cursor-pointer items-start gap-3 text-xs font-bold leading-6 text-slate-300"
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              disabled={saving}
              className="mt-1 h-4 w-4 shrink-0 rounded border-slate-500 bg-slate-900 accent-cyan-300 focus:ring-2 focus:ring-cyan-300"
            />
            <span>{copy.acknowledge}</span>
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={!acknowledged || saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-200/25 bg-cyan-200/10 px-4 py-2 text-xs font-black text-cyan-50 transition hover:bg-cyan-200/15 focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? copy.enabling : copy.enable}
            </button>
            <p className="text-[10px] font-bold text-slate-500">{copy.keepOff}</p>
          </div>
        </fieldset>
      )}

      <div
        className="mt-3 min-h-5 text-[11px] font-bold"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message && <p className="text-emerald-200">{message}</p>}
        {error && <p className="text-amber-200">{error}</p>}
      </div>
    </section>
  );
}
