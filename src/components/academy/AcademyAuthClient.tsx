"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";

type Locale = "fa" | "en";
type Mode = "login" | "signup";

const EXCHANGE_SIGNIN_URL = "https://my.tecpey.ir/signin";

function normalizeUsername(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 32);
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-sm font-black text-[color:var(--tp-text)]"
    >
      {children}
    </label>
  );
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
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const usernameHint = useMemo(
    () =>
      normalizeUsername(username || displayName || email.split("@")[0] || ""),
    [username, displayName, email],
  );
  const ArrowIcon = isFa ? ArrowLeft : ArrowRight;
  const loginHref = isFa ? "/academy/login" : "/en/academy/login";
  const signupHref = isFa ? "/academy/signup" : "/en/academy/signup";
  const overviewHref = isFa ? "/academy" : "/en/academy";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const response = await fetch(
        isSignup ? "/api/academy/auth/register" : "/api/academy/auth/login",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: cleanEmail,
            password,
            displayName: cleanDisplay,
            username: cleanUser,
          }),
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || "auth_failed");
      }
      // Verify the same-origin session after the cookie is persisted.
      await new Promise((resolve) => setTimeout(resolve, 80));
      const profileResponse = await fetch("/api/academy-student-profile", {
        cache: "no-store",
        credentials: "include",
      }).catch(() => null);
      const profileData = profileResponse
        ? await profileResponse.json().catch(() => null)
        : null;
      window.dispatchEvent(new Event("tecpey-academy-auth-ready"));
      router.replace(
        profileData?.profile?.display_name
          ? locale === "en"
            ? "/en/academy/profile"
            : "/academy/profile"
          : locale === "en"
            ? "/en/academy/onboarding"
            : "/academy/onboarding",
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
        academy_auth_storage_unavailable:
          "ذخیره‌سازی حساب آکادمی در این محیط فعال نیست. در لوکال از localhost استفاده کن یا TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE=true را در env بگذار.",
        academy_auth_service_not_configured:
          "کلید امنیتی آکادمی تنظیم نشده است.",
        server_error:
          "خطای داخلی ثبت‌نام آکادمی؛ لطفاً خروجی ترمینال را بررسی کن.",
      };
      const enMessages: Record<string, string> = {
        username_taken: "This username is already taken.",
        invalid_credentials: "Email or password is incorrect.",
        invalid_email: "Enter a valid email.",
        weak_password: "Password must be at least 10 characters.",
        invalid_username: "Username must be at least 3 English characters.",
        academy_auth_storage_unavailable:
          "Academy account storage is not enabled in this environment. Use localhost or set TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE=true.",
        academy_auth_service_not_configured:
          "Academy security secret is not configured.",
        server_error: "Internal academy signup error; check the terminal output.",
      };
      setError(
        isFa
          ? faMessages[code] ||
              "ورود یا ثبت‌نام آکادمی انجام نشد. اطلاعات را بررسی کن."
          : enMessages[code] ||
              "Academy login or signup failed. Check your information.",
      );
    } finally {
      setSaving(false);
    }
  }

  const learningPoints = isFa
    ? [
        "حساب آکادمی از حساب صرافی جداست.",
        "پروفایل آموزشی، منتور و ترم‌ها بعد از ورود فعال می‌شوند.",
        "تمرین و یادگیری قبل از تصمیم مالی قرار می‌گیرد.",
      ]
    : [
        "Academy identity is separate from exchange access.",
        "Profile, mentor and terms activate after login.",
        "Learning and practice come before financial action.",
      ];

  return (
    <main
      className="tecpey-enterprise relative isolate min-h-[100dvh] overflow-hidden bg-[color:var(--tp-bg)] px-4 py-10 text-[color:var(--tp-text)] sm:px-6 lg:px-8"
      dir={isFa ? "rtl" : "ltr"}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_16%_0%,rgba(8,217,214,.16),transparent_30%),radial-gradient(circle_at_86%_8%,rgba(7,94,171,.14),transparent_28%)]" />
      <section className="mx-auto grid max-w-7xl gap-6 lg:min-h-[calc(100dvh-7rem)] lg:grid-cols-[minmax(0,.9fr)_minmax(400px,.72fr)] lg:items-center">
        <div className="rounded-[34px] border border-[color:var(--tp-border)] bg-[color:var(--tp-card)] p-6 shadow-[0_24px_90px_rgba(7,94,171,.13)] backdrop-blur md:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border border-cyan-300/20 bg-white shadow-[0_18px_50px_rgba(7,94,171,.16)] dark:bg-white/[0.08]">
              <Image
                src="/images/tecpey-logo.png"
                alt="TecPey"
                width={48}
                height={48}
                priority
                className="h-12 w-12 object-contain"
              />
            </span>
            <div>
              <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">
                {isFa ? "حساب اختصاصی آکادمی" : "Dedicated Academy account"}
              </p>
              <p className="mt-1 text-sm font-bold text-[color:var(--tp-muted)]">
                {isFa
                  ? "مسیر یادگیری، تمرین و منتور هوشمند"
                  : "Learning, practice and AI mentor access"}
              </p>
            </div>
          </div>

          <h1 className="mt-8 max-w-3xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
            {isSignup
              ? isFa
                ? "ثبت‌نام در آکادمی تک‌پی"
                : "Create your TecPey Academy account"
              : isFa
                ? "ورود به آکادمی تک‌پی"
                : "Log in to TecPey Academy"}
          </h1>
          <p className="mt-5 max-w-2xl text-base font-bold leading-8 text-[color:var(--tp-muted)]">
            {isFa
              ? "این فرم فقط برای مسیر آموزشی است. برای حساب مالی و صرافی، ورود از دامنه رسمی my.tecpey.ir انجام می‌شود."
              : "This form is only for the learning path. Exchange and financial account access continue on the official my.tecpey.ir domain."}
          </p>

          <div className="mt-8 grid gap-3">
            {learningPoints.map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-2xl border border-[color:var(--tp-border)] bg-white/[0.68] p-4 text-sm font-bold leading-7 text-[color:var(--tp-muted)] dark:bg-white/[0.07]"
              >
                <BookOpenCheck
                  className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-300"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck
                className="mt-0.5 h-6 w-6 shrink-0 text-cyan-600 dark:text-cyan-300"
                aria-hidden="true"
              />
              <p className="text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                {isFa
                  ? "تک‌پی هیچ تضمین سودی نمی‌دهد. آکادمی برای ساخت تصمیم آگاهانه و کنترل ریسک طراحی شده است."
                  : "TecPey does not promise profit. Academy is designed for informed decisions and risk control."}
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-[34px] border border-[color:var(--tp-border)] bg-white/[0.92] p-5 shadow-[0_28px_100px_rgba(6,17,31,.16)] backdrop-blur dark:bg-[#07111f]/[0.92] md:p-6 lg:p-7"
          noValidate
        >
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black text-[color:var(--tp-text)]">
                {isSignup
                  ? isFa
                    ? "ساخت حساب آموزشی"
                    : "Create learning account"
                  : isFa
                    ? "ورود حساب آموزشی"
                    : "Learning account login"}
              </p>
              <p className="mt-1 text-xs font-bold text-[color:var(--tp-muted)]">
                {isFa ? "امن، جدا از حساب صرافی" : "Secure, separate from exchange"}
              </p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/[0.12] text-cyan-700 dark:text-cyan-200">
              {isSignup ? (
                <UserRoundCheck className="h-6 w-6" aria-hidden="true" />
              ) : (
                <LockKeyhole className="h-6 w-6" aria-hidden="true" />
              )}
            </span>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-[color:var(--tp-border)] bg-[color:var(--tp-surface)] p-1">
            <Link
              href={loginHref}
              aria-current={!isSignup ? "page" : undefined}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-black transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/50 ${
                !isSignup
                  ? "bg-white text-cyan-700 shadow-sm dark:bg-white/[0.12] dark:text-cyan-200"
                  : "text-[color:var(--tp-muted)] hover:bg-white/[0.60] dark:hover:bg-white/[0.08]"
              }`}
            >
              {isFa ? "ورود" : "Login"}
            </Link>
            <Link
              href={signupHref}
              aria-current={isSignup ? "page" : undefined}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-black transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/50 ${
                isSignup
                  ? "bg-white text-cyan-700 shadow-sm dark:bg-white/[0.12] dark:text-cyan-200"
                  : "text-[color:var(--tp-muted)] hover:bg-white/[0.60] dark:hover:bg-white/[0.08]"
              }`}
            >
              {isFa ? "ثبت‌نام" : "Signup"}
            </Link>
          </div>

          <div className="space-y-4">
            {isSignup ? (
              <>
                <div>
                  <FieldLabel htmlFor="academy-display-name">
                    {isFa ? "نام نمایشی" : "Display name"}
                  </FieldLabel>
                  <input
                    id="academy-display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder={isFa ? "مثلاً منان" : "e.g. Mannan"}
                    autoComplete="name"
                    className="mt-2 min-h-12 w-full rounded-2xl border border-[color:var(--tp-border)] bg-white px-4 py-3 text-sm font-bold text-[color:var(--tp-text)] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-300/25 dark:bg-white/[0.08] dark:placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="academy-username">
                    {isFa ? "نام کاربری انگلیسی" : "English username"}
                  </FieldLabel>
                  <input
                    id="academy-username"
                    value={username}
                    onChange={(event) =>
                      setUsername(normalizeUsername(event.target.value))
                    }
                    placeholder="crypto_mannan"
                    dir="ltr"
                    autoComplete="username"
                    className="mt-2 min-h-12 w-full rounded-2xl border border-[color:var(--tp-border)] bg-white px-4 py-3 text-left text-sm font-bold text-[color:var(--tp-text)] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-300/25 dark:bg-white/[0.08] dark:placeholder:text-slate-400"
                  />
                  <p className="mt-2 text-xs font-bold text-[color:var(--tp-muted)]">
                    @{usernameHint || "username"}
                  </p>
                </div>
              </>
            ) : null}

            <div>
              <FieldLabel htmlFor="academy-email">
                {isFa ? "ایمیل" : "Email"}
              </FieldLabel>
              <input
                id="academy-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
                inputMode="email"
                autoComplete="email"
                dir="ltr"
                aria-invalid={error ? "true" : "false"}
                className="mt-2 min-h-12 w-full rounded-2xl border border-[color:var(--tp-border)] bg-white px-4 py-3 text-left text-sm font-bold text-[color:var(--tp-text)] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-300/25 dark:bg-white/[0.08] dark:placeholder:text-slate-400"
              />
            </div>

            <div>
              <FieldLabel htmlFor="academy-password">
                {isFa ? "رمز عبور" : "Password"}
              </FieldLabel>
              <div className="relative mt-2">
                <input
                  id="academy-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  dir="ltr"
                  aria-invalid={error ? "true" : "false"}
                  className="min-h-12 w-full rounded-2xl border border-[color:var(--tp-border)] bg-white px-4 py-3 pe-14 text-left text-sm font-bold text-[color:var(--tp-text)] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-300/25 dark:bg-white/[0.08] dark:placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-1 end-1 inline-flex min-h-10 w-11 items-center justify-center rounded-xl text-[color:var(--tp-muted)] transition-[transform,background-color,color] duration-150 ease-out hover:bg-cyan-50 hover:text-cyan-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/40 dark:hover:bg-white/[0.10] dark:hover:text-cyan-200"
                  aria-label={
                    showPassword
                      ? isFa
                        ? "پنهان کردن رمز عبور"
                        : "Hide password"
                      : isFa
                        ? "نمایش رمز عبور"
                        : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs font-bold text-[color:var(--tp-muted)]">
                {isFa
                  ? "حداقل ۱۰ کاراکتر برای محافظت بهتر از حساب آموزشی."
                  : "Use at least 10 characters for stronger account protection."}
              </p>
            </div>
          </div>

          {error ? (
            <p
              className="mt-5 rounded-2xl border border-red-300/35 bg-red-500/10 p-3 text-xs font-black leading-6 text-red-700 dark:text-red-200"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out hover:bg-cyan-700 hover:shadow-2xl hover:shadow-cyan-500/25 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : isSignup ? (
              <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            )}
            {isSignup
              ? isFa
                ? "ساخت حساب آکادمی"
                : "Create academy account"
              : isFa
                ? "ورود به آکادمی"
                : "Log in to academy"}
          </button>

          <div className="mt-5 grid gap-3">
            <Link
              href={EXCHANGE_SIGNIN_URL}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[color:var(--tp-border)] px-4 py-3 text-sm font-black text-[color:var(--tp-text)] transition-[transform,border-color,background-color] duration-150 ease-out hover:border-cyan-300/50 hover:bg-cyan-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/50 dark:hover:bg-white/[0.08]"
            >
              <GraduationCap
                className="h-4 w-4 text-cyan-600 dark:text-cyan-300"
                aria-hidden="true"
              />
              {isFa ? "ورود به حساب صرافی" : "Exchange account login"}
              <ArrowIcon className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={overviewHref}
              className="text-center text-xs font-bold text-[color:var(--tp-muted)] underline underline-offset-4 transition hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/40"
            >
              {isFa ? "بازگشت به معرفی آکادمی" : "Back to Academy overview"}
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
