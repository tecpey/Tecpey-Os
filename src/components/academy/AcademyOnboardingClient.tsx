"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { AcademyProfileUnavailableState } from "@/components/academy/AcademyProfileUnavailableState";
import { resolveAcademyProfileReadState } from "@/lib/academy-profile-read-state";

type Locale = "fa" | "en";
type ProfileResponse = {
  ok?: boolean;
  authenticated?: boolean;
  profile?: {
    display_name?: string | null;
    username?: string | null;
    avatar?: string | null;
    public_student_id?: string | null;
    learning_goal?: string | null;
  } | null;
};

const avatarOptions = ["🟦", "🟣", "🟢", "🟠", "⚡", "🎓", "🧠", "📈"];
const goalsFa = [
  "ورود امن به بازار",
  "یادگیری سرمایه‌گذاری",
  "تمرین ترید",
  "ساخت مسیر حرفه‌ای",
];
const goalsEn = [
  "Safe market entry",
  "Learn investing",
  "Practice trading",
  "Build a professional path",
];

function normalizeUsername(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 32);
}

export function AcademyOnboardingClient({
  locale = "fa",
}: {
  locale?: Locale;
}) {
  const isFa = locale === "fa";
  const router = useRouter();
  const [profileStatus, setProfileStatus] = useState<
    "loading" | "ready" | "unauthenticated" | "unavailable"
  >("loading");
  const [retryVersion, setRetryVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState(avatarOptions[0]);
  const [goal, setGoal] = useState(isFa ? goalsFa[0] : goalsEn[0]);
  const [error, setError] = useState("");
  const [existingProfile, setExistingProfile] = useState(false);

  const usernameHint = useMemo(
    () => normalizeUsername(username || displayName),
    [displayName, username],
  );

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const response = await fetch("/api/academy-student-profile", {
        cache: "no-store",
        credentials: "include",
      }).catch(() => null);
      const data = response
        ? ((await response.json().catch(() => null)) as ProfileResponse | null)
        : null;
      if (!active) return;

      const state = resolveAcademyProfileReadState<
        NonNullable<ProfileResponse["profile"]>
      >(response, data);
      if (state.status === "unavailable") {
        setProfileStatus("unavailable");
        return;
      }
      if (state.status === "unauthenticated") {
        setProfileStatus("unauthenticated");
        return;
      }
      if (state.profile?.display_name) {
        // Returning users may arrive here from Arena with an account-only
        // session. Keep the existing profile editable instead of redirecting
        // them into a dashboard/onboarding loop. Only an explicit submission
        // uses the existing server-authorized profile/session update.
        setExistingProfile(true);
        setDisplayName(state.profile.display_name);
        setUsername(state.profile.username || "");
        setAvatar(state.profile.avatar || avatarOptions[0]);
        setGoal(state.profile.learning_goal || (locale === "fa" ? goalsFa[0] : goalsEn[0]));
      }
      setProfileStatus("ready");
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, [locale, retryVersion]);

  async function submit() {
    setError("");
    const cleanDisplay = displayName.trim().slice(0, 60);
    const cleanUser = normalizeUsername(username || displayName);
    if (cleanDisplay.length < 2) {
      setError(
        isFa
          ? "نام نمایشی باید حداقل ۲ حرف باشد."
          : "Display name must be at least 2 characters.",
      );
      return;
    }
    if (cleanUser.length < 3) {
      setError(
        isFa
          ? "نام کاربری باید حداقل ۳ کاراکتر انگلیسی باشد."
          : "Username must be at least 3 English characters.",
      );
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/academy-student-profile", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: cleanDisplay,
          username: cleanUser,
          avatar,
          learningGoal: goal,
          locale,
          source: "academy-onboarding",
        }),
      });
      if (response.status === 401) {
        setProfileStatus("unauthenticated");
        throw new Error("login_required");
      }
      if (response.status === 503) {
        setProfileStatus("unavailable");
        throw new Error("profile_service_unavailable");
      }
      if (response.status === 409) {
        const conflict = await response.json().catch(() => null);
        setError(conflict?.error === "academy_username_unavailable"
          ? (isFa ? "این نام کاربری در دسترس نیست. نام دیگری انتخاب کن." : "This username is unavailable. Choose another one.")
          : (isFa ? "اتصال پروفایل نیاز به بررسی دارد. اطلاعاتت را نگه داشتیم؛ با پشتیبانی تماس بگیر." : "Your profile connection needs review. Your entries are preserved; contact support."));
        return;
      }
      if (!response.ok) throw new Error("save_failed");
      window.dispatchEvent(new Event("tecpey-academy-profile-ready"));
      router.push(locale === "en" ? "/en/academy/profile" : "/academy/profile");
    } catch (err) {
      if ((err as Error)?.message === "profile_service_unavailable") {
        return;
      }
      if ((err as Error)?.message === "login_required") {
        setError(
          isFa
            ? "برای ساخت پروفایل، ابتدا وارد حساب اختصاصی آکادمی شوید."
            : "Log in to your dedicated academy account before creating an academy profile.",
        );
      } else {
        setError(
          isFa
            ? "ساخت پروفایل آکادمی انجام نشد. تنظیمات سرور یا اتصال را بررسی کنید."
            : "Academy profile could not be created. Check server settings or connection.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (profileStatus === "loading") {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-16 text-white">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-cyan-300/20 bg-white/[0.055] p-8 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
          <p className="mt-4 font-black">
            {isFa
              ? "در حال بررسی پروفایل آکادمی…"
              : "Checking academy profile…"}
          </p>
        </div>
      </main>
    );
  }

  if (profileStatus === "unavailable") {
    return (
      <AcademyProfileUnavailableState
        locale={locale}
        onRetry={() => {
          setProfileStatus("loading");
          setRetryVersion((version) => version + 1);
        }}
      />
    );
  }

  if (profileStatus === "unauthenticated") {
    return (
      <main
        className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,.18),transparent_34%),#020617] px-4 py-16 text-white"
        dir={isFa ? "rtl" : "ltr"}
      >
        <section className="mx-auto max-w-3xl rounded-[38px] border border-cyan-300/20 bg-white/[0.06] p-8 text-center shadow-[0_32px_110px_rgba(34,211,238,.14)]">
          <UserRoundCheck className="mx-auto h-12 w-12 text-cyan-200" />
          <h1 className="mt-4 text-3xl font-black">
            {isFa
              ? "اول وارد حساب اختصاصی آکادمی شو"
              : "Log in to TecPey Academy first"}
          </h1>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-300">
            {isFa
              ? "پروفایل آکادمی، منتور، ترم‌ها، ژورنال شبیه‌ساز و مدارک باید به حساب اختصاصی آکادمی متصل باشند. این حساب از حساب صرافی جداست و فقط برای مسیر آموزشی ساخته می‌شود."
              : "Academy profile, mentor, terms, simulator journal and certificates must belong to your dedicated academy account. This is separate from the exchange account and is used only for learning."}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <a
              href={isFa ? "/academy/login" : "/en/academy/login"}
              className="rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white"
            >
              {isFa ? "ورود به آکادمی" : "Academy login"}
            </a>
            <a
              href={isFa ? "/academy/signup" : "/en/academy/signup"}
              className="rounded-2xl border border-cyan-300/25 bg-white/5 px-6 py-4 text-sm font-black text-cyan-100"
            >
              {isFa ? "ثبت‌نام آکادمی" : "Academy signup"}
            </a>
          </div>
          <Link
            href={isFa ? "/academy" : "/en/academy"}
            className="mt-5 inline-flex text-sm font-black text-slate-300 underline underline-offset-4"
          >
            {isFa ? "بازگشت به معرفی آکادمی" : "Back to academy overview"}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-6 lg:px-8"
      dir={isFa ? "rtl" : "ltr"}
    >
      <div className="mx-auto max-w-6xl">
        <Link
          href={isFa ? "/academy" : "/en/academy"}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
        >
          <ArrowLeft className={`h-4 w-4 ${isFa ? "rotate-180" : ""}`} aria-hidden="true" />{" "}
          {isFa ? "بازگشت به معرفی آکادمی" : "Back to academy"}
        </Link>
        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-stretch">
          <div className="min-w-0 px-2 py-6 lg:pe-12 lg:pt-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
              <UserRoundCheck className="h-4 w-4" />{" "}
              {isFa ? (existingProfile ? "پروفایل آموزشی" : "خوش آمدی") : (existingProfile ? "Learning profile" : "Welcome aboard")}
            </div>
            <h1 className="mt-6 text-3xl font-bold leading-relaxed sm:text-4xl">
              {isFa
                ? (existingProfile ? "پروفایلت را بررسی کن؛ مسیرت را ادامه بده" : "مسیر یادگیری تو از اینجا شروع می‌شود")
                : (existingProfile ? "Review your profile. Continue your journey." : "Your learning journey starts here.")}
            </h1>
            <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-300 sm:text-base">
              {isFa
                ? "این پروفایل با حساب معاملاتی فرق دارد. نامی که انتخاب می‌کنی در داشبورد، منتور، جامعه آکادمی و پروفایل عمومی دیده می‌شود. TecPey ID فقط شناسه امن داخلی و قابل استعلام مدارک است."
                : "This profile is separate from trading account details. Your chosen name appears in dashboard, mentor, community and public profile. TecPey ID remains the secure internal certificate identity."}
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                isFa ? "داشبورد شخصی" : "Personal dashboard",
                isFa ? "منتور اختصاصی" : "Personal mentor",
                isFa ? "ترم‌های قفل‌دار" : "Locked terms",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-3xl border border-white/10 bg-slate-950/40 p-4"
                >
                  <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                  <p className="mt-3 text-sm font-black">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={(event) => { event.preventDefault(); if (!saving) void submit(); }} aria-busy={saving} className="rounded-[28px] border border-white/10 bg-slate-950 p-6">
            {existingProfile ? <p role="status" className="mb-5 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4 text-sm leading-7 text-cyan-100">{isFa ? "پروفایل قبلی‌ات پیدا شد. اطلاعات را بررسی و ذخیره کن تا اتصال حساب آموزشی تازه شود. پیشرفت ترم‌ها با این فرم تغییر نمی‌کند." : "We found your existing profile. Review and save it to refresh your learning account connection. This form does not change your term progress."}</p> : null}
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center rounded-3xl bg-cyan-400/15 text-3xl">
                {avatar}
              </div>
              <div>
                <p className="text-xs font-black text-cyan-200">
                  {isFa ? "نام قابل نمایش" : "Display identity"}
                </p>
                <p className="mt-1 text-xl font-black">
                  {displayName.trim() || (isFa ? "نام تو" : "Your name")}
                </p>
                <p className="text-xs font-bold text-slate-400">
                  <bdi>@{usernameHint || "username"}</bdi>
                </p>
              </div>
            </div>

            <label htmlFor="academy-display-name" className="mt-6 block text-sm font-black text-slate-100">
              {isFa ? "نام نمایشی" : "Display name"}
            </label>
            <input
              id="academy-display-name"
              autoComplete="nickname"
              maxLength={60}
              disabled={saving}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={isFa ? "مثلاً منان" : "e.g. Mannan"}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold outline-none ring-cyan-300/30 transition focus:ring-4"
            />

            <label htmlFor="academy-profile-username" className="mt-4 block text-sm font-black text-slate-100">
              {isFa ? "نام کاربری انگلیسی" : "English username"}
            </label>
            <input
              id="academy-profile-username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={saving}
              value={username}
              onChange={(event) =>
                setUsername(normalizeUsername(event.target.value))
              }
              placeholder="crypto_mannan"
              dir="ltr"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm font-bold outline-none ring-cyan-300/30 transition focus:ring-4"
            />
            <p className="mt-2 text-xs font-bold text-slate-400">
              {isFa
                ? "برای پروفایل عمومی و تالار افتخار استفاده می‌شود."
                : "Used for public profile and Hall of Fame."}
            </p>

            <p className="mt-4 block text-sm font-black text-slate-100">
              {isFa ? "آواتار" : "Avatar"}
            </p>
            <div role="group" aria-label={isFa ? "انتخاب آواتار" : "Choose an avatar"} className="mt-2 grid grid-cols-4 gap-2">
              {avatarOptions.map((item) => (
                <button
                  key={item}
                  onClick={() => setAvatar(item)}
                  type="button"
                  aria-label={`${isFa ? "آواتار" : "Avatar"} ${item}`}
                  aria-pressed={avatar === item}
                  disabled={saving}
                  className={`grid min-h-11 min-w-11 place-items-center rounded-2xl border text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${avatar === item ? "border-cyan-300 bg-cyan-300/20" : "border-white/10 bg-white/5"}`}
                >
                  {item}
                </button>
              ))}
            </div>

            <label htmlFor="academy-learning-goal" className="mt-4 block text-sm font-black text-slate-100">
              {isFa ? "هدف فعلی" : "Current goal"}
            </label>
            <select
              id="academy-learning-goal"
              disabled={saving}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold outline-none ring-cyan-300/30 transition focus:ring-4"
            >
              {!(isFa ? goalsFa : goalsEn).includes(goal) ? <option value={goal}>{goal}</option> : null}
              {(isFa ? goalsFa : goalsEn).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <p className="mt-2 text-xs font-bold leading-6 text-slate-400">
              {isFa
                ? "این فقط شروع مسیر است؛ سطح واقعی و سبک یادگیری تو را سیستم از رفتار، آزمون‌ها و تمرین‌ها کشف می‌کند."
                : "This is only the starting point; the system discovers your real level and learning style from behavior, quizzes and practice."}
            </p>

            {error ? (
              <p role="alert" className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-500/10 p-3 text-xs font-black leading-6 text-rose-100">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-6 py-4 text-sm font-bold text-slate-950 transition-colors duration-150 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-slate-950 motion-reduce:transition-none"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isFa
                ? (saving ? "در حال ذخیره…" : existingProfile ? "ذخیره و ادامه مسیر" : "ساخت پروفایل و ورود به داشبورد")
                : (saving ? "Saving…" : existingProfile ? "Save and continue" : "Create profile and enter dashboard")}
            </button>
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-xs font-bold leading-6 text-emerald-100">
              <ShieldCheck className="mt-1 h-4 w-4 shrink-0" />
              {isFa
                ? "بعد از ساخت پروفایل، مرکز هوشمند، منتور و ترم اول فعال می‌شود."
                : "After profile creation, Smart Center, mentor and term 1 become available."}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
