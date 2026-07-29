"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, Sparkles, UserRoundCheck } from "lucide-react";

type Locale = "fa" | "en";
type Mode = "login" | "signup";

function normalizeUsername(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 32);
}

export function AcademyAuthClient({
  locale = "fa",
  mode = "login",
}: {
  locale?: Locale;
  mode?: Mode;
}) {
  const isFa = locale === "fa";
  const isSignup = mode === "signup";
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const usernameHint = useMemo(
    () =>
      normalizeUsername(username || displayName || email.split("@")[0] || ""),
    [username, displayName, email],
  );

  async function submit() {
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    const cleanDisplay = (displayName || cleanEmail.split("@")[0])
      .trim()
      .slice(0, 60);
    const cleanUser = normalizeUsername(
      username || cleanDisplay || cleanEmail.split("@")[0],
    );
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError(isFa ? "ایمیل معتبر وارد کن." : "Enter a valid email.");
      return;
    }
    if (password.length < 10) {
      setError(
        isFa
          ? "رمز عبور باید حداقل ۱۰ کاراکتر باشد."
          : "Password must be at least 10 characters.",
      );
      return;
    }
    if (isSignup && cleanDisplay.length < 2) {
      setError(
        isFa
          ? "نام نمایشی باید حداقل ۲ حرف باشد."
          : "Display name must be at least 2 characters.",
      );
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(isSignup ? "/api/academy/auth/register" : "/api/academy/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          displayName: cleanDisplay,
          username: cleanUser,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || "auth_failed");
      }
      // Wait one tick and verify the session/profile through the same-origin API.
      // This prevents a false redirect loop when the browser has not persisted the auth cookie yet.
      await new Promise((resolve) => setTimeout(resolve, 80));
      const profileResponse = await fetch("/api/academy-student-profile", {
        cache: "no-store",
        credentials: "include",
      }).catch(() => null);
      const profileData = profileResponse ? await profileResponse.json().catch(() => null) : null;
      window.dispatchEvent(new Event("tecpey-academy-auth-ready"));
      router.replace(
        profileData?.profile?.display_name
          ? (locale === "en" ? "/en/academy/profile" : "/academy/profile")
          : (locale === "en" ? "/en/academy/onboarding" : "/academy/onboarding"),
      );
      router.refresh();
    } catch (err) {
      const code = (err as Error)?.message || "auth_failed";
      const faMessages: Record<string, string> = {
        username_taken: "این نام کاربری قبلاً ثبت شده است.",
        invalid_credentials: "ایمیل یا رمز عبور درست نیست.",
        invalid_email: "ایمیل معتبر وارد کن.",
        weak_password: "رمز عبور باید حداقل ۱۰ کاراکتر باشد.",
        invalid_username: "نام کاربری باید حداقل ۳ کاراکتر انگلیسی باشد.",
        academy_auth_storage_unavailable: "ذخیره‌سازی حساب آکادمی در این محیط فعال نیست. در لوکال از localhost استفاده کن یا TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE=true را در env بگذار.",
        academy_auth_service_not_configured: "کلید امنیتی آکادمی تنظیم نشده است.",
        server_error: "خطای داخلی ثبت‌نام آکادمی؛ لطفاً خروجی ترمینال را بررسی کن.",
      };
      const enMessages: Record<string, string> = {
        username_taken: "This username is already taken.",
        invalid_credentials: "Email or password is incorrect.",
        invalid_email: "Enter a valid email.",
        weak_password: "Password must be at least 10 characters.",
        invalid_username: "Username must be at least 3 English characters.",
        academy_auth_storage_unavailable: "Academy account storage is not enabled in this environment. Use localhost or set TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE=true.",
        academy_auth_service_not_configured: "Academy security secret is not configured.",
        server_error: "Internal academy signup error; check the terminal output.",
      };
      setError(
        isFa
          ? faMessages[code] || "ورود یا ثبت‌نام آکادمی انجام نشد. اطلاعات را بررسی کن."
          : enMessages[code] || "Academy login or signup failed. Check your information.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main
      className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,.18),transparent_34%),#020617] px-4 py-14 text-white"
      dir={isFa ? "rtl" : "ltr"}
    >
      <section className="mx-auto max-w-4xl overflow-hidden rounded-[40px] border border-cyan-300/20 bg-white/[0.06] shadow-[0_32px_120px_rgba(34,211,238,.16)] lg:grid lg:grid-cols-[1fr_420px]">
        <div className="p-7 lg:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
            <UserRoundCheck className="h-4 w-4" />{" "}
            {isFa ? "حساب اختصاصی آکادمی" : "Dedicated academy account"}
          </div>
          <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">
            {isSignup
              ? isFa
                ? "ثبت‌نام در آکادمی تک‌پی"
                : "Create your TecPey Academy account"
              : isFa
                ? "ورود به آکادمی تک‌پی"
                : "Log in to TecPey Academy"}
          </h1>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-300">
            {isFa
              ? "این ورود مخصوص آکادمی است و از حساب صرافی جدا مدیریت می‌شود. بعد از ورود، پروفایل آموزشی، نام نمایشی، منتور، ترم‌ها و مرکز هوشمند برای همین حساب فعال می‌شود."
              : "This login is dedicated to the academy and is separate from the exchange account. After login, your learning profile, display name, mentor, terms and Smart Center activate for this account."}
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {[
              isFa ? "نام نمایشی" : "Display name",
              isFa ? "منتور شخصی" : "Personal mentor",
              isFa ? "ترم‌های قفل‌دار" : "Locked terms",
            ].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 text-sm font-black text-cyan-50"
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 bg-slate-950/85 p-6 lg:border-r lg:border-t-0">
          {isSignup ? (
            <>
              <label className="block text-sm font-black">
                {isFa ? "نام نمایشی" : "Display name"}
              </label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={isFa ? "مثلاً منان" : "e.g. Mannan"}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold outline-none ring-cyan-300/30 transition focus:ring-4"
              />
              <label className="mt-4 block text-sm font-black">
                {isFa ? "نام کاربری انگلیسی" : "English username"}
              </label>
              <input
                value={username}
                onChange={(event) =>
                  setUsername(normalizeUsername(event.target.value))
                }
                placeholder="crypto_mannan"
                dir="ltr"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm font-bold outline-none ring-cyan-300/30 transition focus:ring-4"
              />
              <p className="mt-2 text-xs font-bold text-slate-400">
                @{usernameHint || "username"}
              </p>
            </>
          ) : null}
          <label
            className={
              isSignup
                ? "mt-4 block text-sm font-black"
                : "block text-sm font-black"
            }
          >
            {isFa ? "ایمیل" : "Email"}
          </label>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            dir="ltr"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm font-bold outline-none ring-cyan-300/30 transition focus:ring-4"
          />
          <label className="mt-4 block text-sm font-black">
            {isFa ? "رمز عبور" : "Password"}
          </label>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="••••••••"
            dir="ltr"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm font-bold outline-none ring-cyan-300/30 transition focus:ring-4"
          />
          {error ? (
            <p className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-500/10 p-3 text-xs font-black leading-6 text-rose-100">
              {error}
            </p>
          ) : null}
          <button
            onClick={submit}
            disabled={saving}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-cyan-500 to-violet-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isSignup ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <LockKeyhole className="h-4 w-4" />
            )}
            {isSignup
              ? isFa
                ? "ساخت حساب آکادمی"
                : "Create academy account"
              : isFa
                ? "ورود به آکادمی"
                : "Log in to academy"}
          </button>
          <Link
            href={
              isSignup
                ? isFa
                  ? "/academy/login"
                  : "/en/academy/login"
                : isFa
                  ? "/academy/signup"
                  : "/en/academy/signup"
            }
            className="mt-5 block text-center text-sm font-black text-cyan-100 underline underline-offset-4"
          >
            {isSignup
              ? isFa
                ? "حساب آکادمی دارم"
                : "I already have an academy account"
              : isFa
                ? "ثبت‌نام اختصاصی آکادمی"
                : "Create a dedicated academy account"}
          </Link>
          <Link
            href={isFa ? "/academy" : "/en/academy"}
            className="mt-3 block text-center text-xs font-bold text-slate-400 underline underline-offset-4"
          >
            {isFa ? "بازگشت به معرفی آکادمی" : "Back to academy overview"}
          </Link>
        </div>
      </section>
    </main>
  );
}
