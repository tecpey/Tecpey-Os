"use client";

import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Check, Loader2, ShieldCheck } from "lucide-react";

type MentorPreferences = {
  externalProviderEnabled: boolean;
  behavioralPersonalizationEnabled: boolean;
};

type MentorCapabilities = {
  plan: "free" | "premium";
  premiumRuntimeEnabled: boolean;
  publicResearchEnabled: boolean;
  reason: string;
};

const DEFAULT_PREFERENCES: MentorPreferences = {
  externalProviderEnabled: false,
  behavioralPersonalizationEnabled: false,
};

export function MentorPrivacyControls({ locale }: { locale: "fa" | "en" }) {
  const isFa = locale === "fa";
  const [saved, setSaved] = useState<MentorPreferences>(DEFAULT_PREFERENCES);
  const [draft, setDraft] = useState<MentorPreferences>(DEFAULT_PREFERENCES);
  const [capabilities, setCapabilities] = useState<MentorCapabilities | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mentor-preferences", {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (controller.signal.aborted) return;
        if (!response.ok || !data?.preferences) {
          setStatus("error");
          return;
        }
        const next: MentorPreferences = {
          externalProviderEnabled:
            data.preferences.externalProviderEnabled === true,
          behavioralPersonalizationEnabled:
            data.preferences.behavioralPersonalizationEnabled === true,
        };
        setSaved(next);
        setDraft(next);
        setCapabilities(data.capabilities ?? null);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, []);

  const changed = useMemo(
    () =>
      saved.externalProviderEnabled !== draft.externalProviderEnabled ||
      saved.behavioralPersonalizationEnabled !==
        draft.behavioralPersonalizationEnabled,
    [draft, saved],
  );

  const save = async () => {
    if (!changed || status === "saving") return;
    setStatus("saving");
    try {
      const response = await fetch("/api/mentor-preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok || !data?.preferences) {
        setStatus("error");
        return;
      }
      const next: MentorPreferences = {
        externalProviderEnabled:
          data.preferences.externalProviderEnabled === true,
        behavioralPersonalizationEnabled:
          data.preferences.behavioralPersonalizationEnabled === true,
      };
      setSaved(next);
      setDraft(next);
      setStatus("saved");
      window.setTimeout(() => setStatus("ready"), 1400);
    } catch {
      setStatus("error");
    }
  };

  return (
    <section
      id="mentor-privacy"
      className="mt-8 scroll-mt-28 rounded-2xl border border-cyan-400/20 p-6"
      aria-labelledby="mentor-ai-privacy"
    >
      <h2
        id="mentor-ai-privacy"
        className="flex items-center gap-2 font-semibold"
      >
        <BrainCircuit
          className="h-5 w-5 text-cyan-600 dark:text-cyan-200"
          aria-hidden="true"
        />
        {isFa ? "حریم خصوصی و هوش مصنوعی منتور" : "Mentor AI & privacy"}
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted">
        {isFa
          ? "کنترل ارسال داده به ارائه‌دهنده هوش مصنوعی خارجی و شخصی‌سازی رفتاری دست خود شماست. خاموش‌کردن هر گزینه فوراً برای درخواست‌های بعدی اعمال می‌شود."
          : "You control external AI-provider use and behavioral personalization. Turning either option off applies to subsequent Mentor requests."}
      </p>

      {status === "loading" ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {isFa ? "در حال دریافت تنظیمات…" : "Loading Mentor settings…"}
        </p>
      ) : status === "error" ? (
        <p className="mt-5 text-sm leading-7 text-amber-700 dark:text-amber-200" role="alert">
          {isFa
            ? "تنظیمات منتور در دسترس نیست؛ برای حفظ حریم خصوصی هیچ مجوز تازه‌ای فرض نمی‌شود."
            : "Mentor settings are unavailable; no new permission is assumed."}
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-4">
            <label className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border border-fg/10 p-4">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-cyan-600"
                checked={draft.externalProviderEnabled}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    externalProviderEnabled: event.target.checked,
                  }))
                }
              />
              <span>
                <strong className="block text-sm">
                  {isFa
                    ? "استفاده از ارائه‌دهنده هوش مصنوعی خارجی"
                    : "Use an external AI provider"}
                </strong>
                <span className="mt-1 block text-xs leading-6 text-muted">
                  {isFa
                    ? "در صورت فعال‌بودن، سؤال جاری و زمینه آموزشی حداقلی و مجاز می‌تواند برای تولید پاسخ زنده ارسال شود. Seed Phrase، کلید خصوصی، رمز و کدهای احراز هویت پیش از خروج مسدود می‌شوند."
                    : "When enabled, the current question and a bounded permitted learning context may be sent for a live answer. Seed phrases, private keys, passwords and authentication codes are blocked before egress."}
                </span>
              </span>
            </label>

            <label className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border border-fg/10 p-4">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-cyan-600"
                checked={draft.behavioralPersonalizationEnabled}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    behavioralPersonalizationEnabled: event.target.checked,
                  }))
                }
              />
              <span>
                <strong className="block text-sm">
                  {isFa
                    ? "شخصی‌سازی رفتاری"
                    : "Behavioral personalization"}
                </strong>
                <span className="mt-1 block text-xs leading-6 text-muted">
                  {isFa
                    ? "در صورت فعال‌بودن، منتور می‌تواند از خلاصه کنترل‌شدهٔ عملکرد آکادمی و تمرین Arena برای تنظیم سطح توضیح، ضعف‌ها و مدیریت ریسک استفاده کند؛ داده خام حساب مالی یا KYC جزو این مجوز نیست."
                    : "When enabled, the Mentor may use a bounded summary of Academy and Arena practice to adapt explanations, weak-area repair and risk coaching. Raw financial-account or KYC data is not part of this permission."}
                </span>
              </span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!changed || status === "saving"}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : status === "saved" ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              {status === "saving"
                ? isFa
                  ? "در حال ذخیره…"
                  : "Saving…"
                : status === "saved"
                  ? isFa
                    ? "ذخیره شد"
                    : "Saved"
                  : isFa
                    ? "ذخیره تنظیمات"
                    : "Save settings"}
            </button>
            <span className="text-xs leading-6 text-muted">
              {isFa
                ? "پژوهش وب و X فقط بعد از مجوز معتبر سمت‌سرور TecPey Pro باز می‌شود."
                : "Web and X research unlock only after a server-authoritative TecPey Pro entitlement."}
            </span>
          </div>

          {capabilities && !capabilities.premiumRuntimeEnabled ? (
            <p className="mt-3 text-xs leading-6 text-muted">
              {isFa
                ? "در حال حاضر خرید و مجوز اشتراک Pro عملیاتی نشده و پژوهش عمومی عمداً قفل است."
                : "Pro purchase and entitlement are not operational yet, so public research intentionally remains locked."}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
