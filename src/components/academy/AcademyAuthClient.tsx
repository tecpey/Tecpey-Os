"use client";

import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaApple, FaGoogle } from "react-icons/fa6";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  CheckCircle2,
  UserRoundCheck,
} from "lucide-react";
import { TecpeyMark } from "@/components/brand/TecpeyMark";
import {
  resolveAcademyPostAuthPath,
  resolveAcademyProfileReadState,
} from "@/lib/academy-profile-read-state";

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

function SocialAuthButton({
  label,
  status,
  icon,
}: {
  label: string;
  status: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled
      className="group relative inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--tp-border)] bg-white text-xl text-[color:var(--tp-text)] opacity-65 shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/40 disabled:cursor-not-allowed dark:bg-white/[0.08]"
      aria-label={`${label} - ${status}`}
      title={status}
    >
      <span aria-hidden="true">
        {icon}
      </span>
      <span className="sr-only">{label}: {status}</span>
    </button>
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
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [phoneChallengeId, setPhoneChallengeId] = useState("");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const usernameHint = useMemo(
    () =>
      normalizeUsername(username || displayName || email.split("@")[0] || ""),
    [username, displayName, email],
  );
  const ArrowIcon = isFa ? ArrowLeft : ArrowRight;
  const loginHref = isFa ? "/academy/login" : "/en/academy/login";
  const signupHref = isFa ? "/academy/signup" : "/en/academy/signup";
  const overviewHref = isFa ? "/academy" : "/en/academy";
  const socialStatus = isFa
    ? "به‌زودی پس از اتصال امن provider فعال می‌شود"
    : "Coming soon after secure provider connection";
  const errorId = "academy-auth-error";
  const passwordHintId = "academy-password-hint";

  async function completeAuthenticatedNavigation() {
    // Give the browser a brief moment to persist the newly issued same-origin
    // session before the profile authority is queried.
    await new Promise((resolve) => setTimeout(resolve, 80));
    const profileResponse = await fetch("/api/academy-student-profile", {
      cache: "no-store",
      credentials: "include",
    }).catch(() => null);
    const profileData = profileResponse
      ? await profileResponse.json().catch(() => null)
      : null;
    const profileState = resolveAcademyProfileReadState<{
      display_name?: string | null;
    }>(profileResponse, profileData);
    const requestedPath = new URLSearchParams(window.location.search).get(
      "redirect",
    );
    window.dispatchEvent(new Event("tecpey-academy-auth-ready"));
    router.replace(
      resolveAcademyPostAuthPath(locale, profileState, requestedPath),
    );
    router.refresh();
  }

  async function requestPhoneOtp() {
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/auth/phone-otp/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "signup" }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        challengeId?: string;
        maskedPhone?: string;
      } | null;
      if (!response.ok || !data?.challengeId) throw new Error(data?.error || "otp_delivery_unavailable");
      setPhoneChallengeId(data.challengeId);
      setMaskedPhone(data.maskedPhone || phone);
      setPhoneOtpCode("");
      setPhoneVerified(false);
    } catch (err) {
      const code = (err as Error)?.message;
      const messages: Record<string, string> = isFa
        ? {
            invalid_iranian_mobile: "شماره موبایل ایران را به‌صورت 09xxxxxxxxx وارد کن.",
            limoo_sms_not_configured: "اتصال لیمو اس‌ام‌اس هنوز در محیط سرور تنظیم نشده است.",
            phone_otp_service_not_configured: "کلیدهای امنیتی OTP در سرور تنظیم نشده‌اند.",
            rate_limited: "درخواست‌های زیادی ثبت شده؛ چند دقیقه بعد دوباره تلاش کن.",
          }
        : {
            invalid_iranian_mobile: "Enter a valid Iranian mobile number (09xxxxxxxxx).",
            limoo_sms_not_configured: "Limoo SMS is not configured on the server yet.",
            phone_otp_service_not_configured: "OTP security keys are not configured on the server.",
            rate_limited: "Too many requests. Try again in a few minutes.",
          };
      setError(messages[code] || (isFa ? "ارسال کد تأیید در دسترس نیست." : "Verification code delivery is unavailable."));
    } finally {
      setSaving(false);
    }
  }

  async function verifyPhoneOtp() {
    setError("");
    if (!phoneChallengeId || !/^\d{4,8}$/.test(phoneOtpCode)) {
      setError(isFa ? "کد پیامکی معتبر را وارد کن." : "Enter the valid SMS code.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/phone-otp/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: phoneChallengeId, code: phoneOtpCode }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; verified?: boolean } | null;
      if (!response.ok || !data?.verified) throw new Error(data?.error || "invalid_otp_code");
      setPhoneVerified(true);
    } catch (err) {
      const code = (err as Error)?.message;
      setError(code === "otp_challenge_expired"
        ? (isFa ? "زمان کد تمام شده؛ کد تازه بگیر." : "The code expired. Request a new one.")
        : code === "otp_verification_unavailable"
          ? (isFa ? "ارتباط با سرویس پیامک موقتاً برقرار نیست." : "The SMS provider is temporarily unavailable.")
          : (isFa ? "کد پیامکی صحیح نیست." : "The SMS code is not valid."));
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (twoFactorToken) {
      if (!/^\d{6}$/.test(twoFactorCode)) {
        setError(isFa ? "کد ۶ رقمی برنامه احراز هویت را وارد کن." : "Enter the 6-digit authenticator code.");
        return;
      }
      setSaving(true);
      try {
        const response = await fetch("/api/auth/2fa/verify", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: twoFactorCode, preAuthToken: twoFactorToken }),
        });
        const data = (await response.json().catch(() => null)) as { error?: string; authenticated?: boolean } | null;
        if (!response.ok || !data?.authenticated) throw new Error(data?.error || "invalid_totp_code");
        await completeAuthenticatedNavigation();
      } catch (err) {
        const code = (err as Error)?.message;
        setError(code === "preauth_token_invalid"
          ? (isFa ? "زمان ورود تمام شد؛ دوباره وارد شو." : "The login challenge expired; sign in again.")
          : (isFa ? "کد احراز هویت معتبر نیست یا قبلاً استفاده شده است." : "The authenticator code is invalid or already used."));
      } finally {
        setSaving(false);
      }
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanDisplay = (displayName || cleanEmail.split("@")[0])
      .trim()
      .slice(0, 60);
    const cleanUser = normalizeUsername(
      username || cleanDisplay || cleanEmail.split("@")[0],
    );
    const loginWithPhone = !isSignup && /^(?:\+?98|0)?9\d{9}$/.test(cleanEmail.replace(/[\s()-]/g, ""));
    if (!loginWithPhone && !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError(
        isSignup
          ? isFa
            ? "ایمیل معتبر وارد کن."
            : "Enter a valid email."
          : isFa
            ? "ایمیل یا شماره موبایل معتبر وارد کن."
            : "Enter a valid email or mobile number.",
      );
      return;
    }
    if (isSignup && !phoneVerified) {
      setError(isFa ? "ابتدا شماره موبایل را با کد پیامکی تأیید کن." : "Verify your mobile number with the SMS code first.");
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
            identity: cleanEmail,
            email: isSignup ? cleanEmail : undefined,
            phone: isSignup ? phone : undefined,
            phoneChallengeId: isSignup ? phoneChallengeId : undefined,
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
      const authData = (await response.json().catch(() => null)) as {
        requires2fa?: boolean;
        preAuthToken?: string;
      } | null;
      if (authData?.requires2fa) {
        if (!authData.preAuthToken) throw new Error("preauth_authority_unavailable");
        setTwoFactorToken(authData.preAuthToken);
        setTwoFactorCode("");
        return;
      }
      await completeAuthenticatedNavigation();
    } catch (err) {
      const code = (err as Error)?.message || "auth_failed";
      const faMessages: Record<string, string> = {
        username_taken: "این نام کاربری قبلاً ثبت شده است.",
        invalid_credentials: "ایمیل یا رمز عبور درست نیست.",
        invalid_email: "ایمیل معتبر وارد کن.",
        invalid_login_identity: "ایمیل یا شماره موبایل معتبر وارد کن.",
        phone_required: "شماره موبایل برای ساخت حساب لازم است.",
        phone_taken: "این شماره موبایل قبلاً به حساب دیگری متصل شده است.",
        phone_verification_required: "شماره موبایل باید دوباره تأیید شود.",
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
        invalid_login_identity: "Enter a valid email or mobile number.",
        phone_required: "A mobile number is required to create an account.",
        phone_taken: "This mobile number is already linked to another account.",
        phone_verification_required: "The mobile number must be verified again.",
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
      className="tecpey-enterprise relative isolate min-h-[100dvh] overflow-hidden bg-[color:var(--tp-bg)] px-4 py-8 text-[color:var(--tp-text)] sm:px-6 lg:px-8"
      dir={isFa ? "rtl" : "ltr"}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_14%_0%,rgba(8,217,214,.18),transparent_30%),radial-gradient(circle_at_86%_8%,rgba(7,94,171,.16),transparent_28%),linear-gradient(180deg,transparent,rgba(8,184,216,.08))]" />
      <section className="mx-auto grid max-w-6xl items-center lg:min-h-[calc(100dvh-6rem)]">
        <div
          dir="ltr"
          className="tecpey-glass grid overflow-hidden rounded-[30px] p-2 shadow-[0_28px_110px_rgba(7,94,171,.16)] lg:grid-cols-[minmax(0,.92fr)_minmax(390px,.72fr)]"
        >
          <aside
            dir={isFa ? "rtl" : "ltr"}
            className="tecpey-motion-reveal relative order-2 overflow-hidden rounded-[24px] border border-white/10 bg-slate-950 p-6 text-white md:p-8 lg:order-1 lg:min-h-[680px] lg:p-10"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_14%,rgba(34,211,238,.34),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(37,99,235,.28),transparent_25%),linear-gradient(145deg,rgba(2,6,23,.20),rgba(2,6,23,.86))]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-[linear-gradient(160deg,transparent_18%,rgba(8,47,73,.72)_19%,rgba(15,23,42,.96)_62%),linear-gradient(20deg,transparent_28%,rgba(34,211,238,.18)_29%,transparent_58%)]" />
            <div className="relative z-10 flex h-full flex-col">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border border-cyan-200/25 bg-white/[0.10] shadow-[0_18px_50px_rgba(34,211,238,.18)] backdrop-blur">
                  <TecpeyMark
                    alt="TecPey"
                    width={48}
                    height={48}
                    priority
                    className="h-12 w-12 object-contain"
                  />
                </span>
                <div>
                  <p className="text-xs font-black text-cyan-200">
                    {isFa ? "حساب اختصاصی آکادمی" : "Dedicated Academy account"}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-300">
                    {isFa
                      ? "مسیر یادگیری، تمرین و منتور هوشمند"
                      : "Learning, practice and AI mentor access"}
                  </p>
                </div>
              </div>

              <h1 className="mt-8 max-w-3xl text-3xl font-black leading-tight sm:text-5xl">
                {isSignup
                  ? isFa
                    ? "ثبت‌نام در آکادمی تک‌پی"
                    : "Create your TecPey Academy account"
                  : isFa
                    ? "ورود به آکادمی تک‌پی"
                    : "Log in to TecPey Academy"}
              </h1>
              <p className="mt-5 max-w-2xl text-base font-bold leading-8 text-slate-300">
                {isFa
                  ? "این فرم فقط برای مسیر آموزشی است. برای حساب مالی و صرافی، ورود از دامنه رسمی my.tecpey.ir انجام می‌شود."
                  : "This form is only for the learning path. Exchange and financial account access continue on the official my.tecpey.ir domain."}
              </p>

              <div className="relative mt-7 overflow-hidden rounded-[24px] border border-white/10 bg-slate-950 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_18px_60px_rgba(0,0,0,.24)]">
                <div
                  className="pointer-events-none absolute inset-0 scale-105 bg-[url('/images/brand/academy-auth-crystal.jpeg')] bg-cover bg-[center_38%] opacity-90"
                  aria-hidden="true"
                />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,.94),rgba(2,6,23,.68)_46%,rgba(8,47,73,.28)),radial-gradient(circle_at_58%_34%,rgba(34,211,238,.20),transparent_28%)]" />
                <div className="mb-14 flex gap-1.5 sm:mb-20" aria-hidden="true">
                  <span className="h-3 w-3 rounded-full bg-rose-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-300" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(155deg,transparent_12%,rgba(8,145,178,.38)_13%,rgba(15,23,42,.96)_58%),linear-gradient(25deg,transparent_28%,rgba(56,189,248,.30)_29%,transparent_60%)]" />
                <div className="relative max-w-sm">
                  <p className="text-2xl font-black leading-9">
                    {isSignup
                      ? isFa
                        ? "شروع مسیر یادگیری"
                        : "Begin your learning path"
                      : isFa
                        ? "خوش برگشتی"
                        : "Welcome back"}
                  </p>
                  <p className="mt-2 text-sm font-bold leading-7 text-slate-300">
                    {isSignup
                      ? isFa
                        ? "پروفایل آکادمی، تمرین و منتور از همین‌جا فعال می‌شود."
                        : "Your academy profile, practice and mentor start here."
                      : isFa
                        ? "مسیرت را از آخرین درس، آزمون یا تمرین ادامه بده."
                        : "Continue from your latest lesson, quiz or practice."}
                  </p>
                  <span className="mt-4 inline-flex min-h-10 items-center rounded-full border border-cyan-200/30 bg-white/[0.10] px-5 text-xs font-black text-cyan-100 backdrop-blur">
                    {isSignup ? (isFa ? "ثبت‌نام" : "Sign up") : isFa ? "ورود" : "Login"}
                  </span>
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                {learningPoints.map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-sm font-bold leading-7 text-slate-300 backdrop-blur"
                  >
                    <BookOpenCheck
                      className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-8">
                <div className="rounded-3xl border border-cyan-200/20 bg-cyan-300/10 p-5 backdrop-blur">
                  <div className="flex items-start gap-3">
                    <ShieldCheck
                      className="mt-0.5 h-6 w-6 shrink-0 text-cyan-200"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-bold leading-7 text-slate-200">
                      {isFa
                        ? "تک‌پی هیچ تضمین سودی نمی‌دهد. آکادمی برای ساخت تصمیم آگاهانه و کنترل ریسک طراحی شده است."
                        : "TecPey does not promise profit. Academy is designed for informed decisions and risk control."}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-black text-cyan-100">
                  {(isFa ? ["آموزش", "تمرین", "منتور"] : ["Learn", "Practice", "Mentor"]).map((item) => (
                    <span key={item} className="rounded-2xl border border-white/10 bg-white/[0.06] px-2 py-3">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </aside>

        <form
          dir={isFa ? "rtl" : "ltr"}
          onSubmit={submit}
          className="tecpey-motion-reveal order-1 rounded-[24px] bg-white/[0.96] p-5 shadow-[0_18px_70px_rgba(6,17,31,.08)] dark:bg-[#07111f]/[0.94] md:p-6 lg:order-2 lg:self-center lg:p-7"
          noValidate
        >
          <div className="mb-5 flex items-center justify-between gap-4">
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
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/[0.12] text-cyan-700 dark:text-cyan-200">
              {isSignup ? (
                <UserRoundCheck className="h-6 w-6" aria-hidden="true" />
              ) : (
                <LockKeyhole className="h-6 w-6" aria-hidden="true" />
              )}
            </span>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-[color:var(--tp-border)] bg-[color:var(--tp-surface)] p-1">
            <Link
              href={loginHref}
              aria-current={!isSignup ? "page" : undefined}
              className={`inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-black transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/50 ${
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
              className={`inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-black transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/50 ${
                isSignup
                  ? "bg-white text-cyan-700 shadow-sm dark:bg-white/[0.12] dark:text-cyan-200"
                  : "text-[color:var(--tp-muted)] hover:bg-white/[0.60] dark:hover:bg-white/[0.08]"
              }`}
            >
              {isFa ? "ثبت‌نام" : "Signup"}
            </Link>
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-center gap-3">
              <SocialAuthButton
                label="Google"
                status={socialStatus}
                icon={<FaGoogle />}
              />
              <SocialAuthButton
                label="Apple"
                status={socialStatus}
                icon={<FaApple />}
              />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-[color:var(--tp-border)]" />
              <span className="text-xs font-black text-[color:var(--tp-muted)]">
                {isFa ? "یا با ایمیل ادامه بده" : "or continue with email"}
              </span>
              <span className="h-px flex-1 bg-[color:var(--tp-border)]" />
            </div>
            <p className="mt-2 text-center text-[11px] font-bold leading-5 text-[color:var(--tp-muted)]">
              {isFa
                ? "این دکمه‌ها فقط بعد از تکمیل OAuth واقعی و تست امنیتی فعال می‌شوند."
                : "These buttons activate only after real OAuth and security testing are complete."}
            </p>
          </div>

          <div className="space-y-3.5">
            {twoFactorToken ? (
              <div>
                <FieldLabel htmlFor="academy-two-factor-code">
                  {isFa ? "کد احراز هویت دومرحله‌ای" : "Two-factor authentication code"}
                </FieldLabel>
                <input
                  id="academy-two-factor-code"
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  dir="ltr"
                  autoFocus
                  className="mt-2 min-h-12 w-full rounded-2xl border border-cyan-300 bg-slate-50 px-4 py-3 text-center text-xl font-black tracking-[0.45em] text-[color:var(--tp-text)] outline-none focus:ring-4 focus:ring-cyan-300/25 dark:bg-white/[0.08]"
                  aria-describedby="academy-two-factor-hint"
                />
                <p id="academy-two-factor-hint" className="mt-2 text-xs font-bold leading-6 text-[color:var(--tp-muted)]">
                  {isFa ? "کد فعلی برنامه Authenticator را وارد کن. تا تأیید کد هیچ نشستی صادر نمی‌شود." : "Enter the current code from your authenticator app. No session is issued before verification."}
                </p>
              </div>
            ) : (
              <>
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
                    className="mt-2 min-h-11 w-full rounded-2xl border border-[color:var(--tp-border)] bg-slate-50 px-4 py-3 text-sm font-bold text-[color:var(--tp-text)] outline-none transition-[border-color,box-shadow,background-color] duration-150 ease-out placeholder:text-slate-500 focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-300/25 dark:bg-white/[0.08] dark:placeholder:text-slate-400 dark:focus:bg-white/[0.10]"
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
                    className="mt-2 min-h-11 w-full rounded-2xl border border-[color:var(--tp-border)] bg-slate-50 px-4 py-3 text-left text-sm font-bold text-[color:var(--tp-text)] outline-none transition-[border-color,box-shadow,background-color] duration-150 ease-out placeholder:text-slate-500 focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-300/25 dark:bg-white/[0.08] dark:placeholder:text-slate-400 dark:focus:bg-white/[0.10]"
                  />
                  <p className="mt-2 text-xs font-bold text-[color:var(--tp-muted)]">
                    @{usernameHint || "username"}
                  </p>
                </div>
              </>
            ) : null}

            <div>
              <FieldLabel htmlFor="academy-email">
                {isSignup
                  ? (isFa ? "ایمیل" : "Email")
                  : (isFa ? "ایمیل یا شماره موبایل" : "Email or mobile number")}
              </FieldLabel>
              <input
                id="academy-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={isSignup ? "you@example.com" : (isFa ? "you@example.com یا 0912…" : "you@example.com or 0912…")}
                type={isSignup ? "email" : "text"}
                inputMode={isSignup ? "email" : "text"}
                autoComplete={isSignup ? "email" : "username"}
                dir="ltr"
                aria-invalid={error ? "true" : "false"}
                aria-describedby={error ? errorId : undefined}
                className="mt-2 min-h-11 w-full rounded-2xl border border-[color:var(--tp-border)] bg-slate-50 px-4 py-3 text-left text-sm font-bold text-[color:var(--tp-text)] outline-none transition-[border-color,box-shadow,background-color] duration-150 ease-out placeholder:text-slate-500 focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-300/25 dark:bg-white/[0.08] dark:placeholder:text-slate-400 dark:focus:bg-white/[0.10]"
              />
            </div>

            {isSignup ? (
              <div className="rounded-2xl border border-[color:var(--tp-border)] bg-cyan-500/[0.05] p-3.5">
                <FieldLabel htmlFor="academy-phone">
                  {isFa ? "شماره موبایل ایران" : "Iranian mobile number"}
                </FieldLabel>
                <div className="mt-2 flex gap-2">
                  <input
                    id="academy-phone"
                    value={phone}
                    onChange={(event) => {
                      setPhone(event.target.value);
                      setPhoneChallengeId("");
                      setPhoneOtpCode("");
                      setPhoneVerified(false);
                    }}
                    placeholder="09123456789"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    disabled={phoneVerified}
                    className="min-h-11 min-w-0 flex-1 rounded-2xl border border-[color:var(--tp-border)] bg-slate-50 px-4 py-3 text-left text-sm font-bold text-[color:var(--tp-text)] outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-300/25 disabled:opacity-70 dark:bg-white/[0.08]"
                  />
                  <button
                    type="button"
                    onClick={requestPhoneOtp}
                    disabled={saving || phoneVerified}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-cyan-300/60 bg-cyan-50 px-3 text-xs font-black text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-400/10 dark:text-cyan-100"
                  >
                    {phoneVerified ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <MessageSquareText className="h-4 w-4" aria-hidden="true" />}
                    {phoneVerified
                      ? (isFa ? "تأیید شد" : "Verified")
                      : phoneChallengeId
                        ? (isFa ? "ارسال دوباره" : "Resend")
                        : (isFa ? "دریافت کد" : "Send code")}
                  </button>
                </div>

                {phoneChallengeId && !phoneVerified ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={phoneOtpCode}
                      onChange={(event) => setPhoneOtpCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                      placeholder={isFa ? "کد پیامکی" : "SMS code"}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      dir="ltr"
                      className="min-h-11 min-w-0 flex-1 rounded-2xl border border-cyan-300 bg-white px-4 py-3 text-center text-base font-black tracking-[0.25em] text-[color:var(--tp-text)] outline-none focus:ring-4 focus:ring-cyan-300/25 dark:bg-white/[0.08]"
                      aria-label={isFa ? "کد پیامکی" : "SMS verification code"}
                    />
                    <button
                      type="button"
                      onClick={verifyPhoneOtp}
                      disabled={saving}
                      className="min-h-11 rounded-2xl bg-cyan-600 px-4 text-xs font-black text-white transition hover:bg-cyan-700 disabled:opacity-60"
                    >
                      {isFa ? "تأیید شماره" : "Verify number"}
                    </button>
                  </div>
                ) : null}
                <p className="mt-2 text-[11px] font-bold leading-5 text-[color:var(--tp-muted)]">
                  {phoneVerified
                    ? (isFa ? `${maskedPhone || phone} با موفقیت به این ثبت‌نام متصل شد.` : `${maskedPhone || phone} is securely linked to this signup.`)
                    : (isFa ? "حساب فقط پس از تأیید کد یک‌بارمصرف ساخته می‌شود." : "The account is created only after one-time-code verification.")}
                </p>
              </div>
            ) : null}

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
                  aria-describedby={error ? `${passwordHintId} ${errorId}` : passwordHintId}
                  className="min-h-11 w-full rounded-2xl border border-[color:var(--tp-border)] bg-slate-50 px-4 py-3 pe-14 text-left text-sm font-bold text-[color:var(--tp-text)] outline-none transition-[border-color,box-shadow,background-color] duration-150 ease-out placeholder:text-slate-500 focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-300/25 dark:bg-white/[0.08] dark:placeholder:text-slate-400 dark:focus:bg-white/[0.10]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-1 right-1 inline-flex min-h-10 w-11 items-center justify-center rounded-xl text-[color:var(--tp-muted)] transition-[transform,background-color,color] duration-150 ease-out hover:bg-cyan-50 hover:text-cyan-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/40 dark:hover:bg-white/[0.10] dark:hover:text-cyan-200"
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
              <p
                id={passwordHintId}
                className="mt-2 text-xs font-bold text-[color:var(--tp-muted)]"
              >
                {isFa
                  ? "حداقل ۱۰ کاراکتر برای محافظت بهتر از حساب آموزشی."
                  : "Use at least 10 characters for stronger account protection."}
              </p>
            </div>
              </>
            )}
          </div>

          {error ? (
            <p
              id={errorId}
              className="mt-5 rounded-2xl border border-red-300/35 bg-red-500/10 p-3 text-xs font-black leading-6 text-red-700 dark:text-red-200"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out hover:bg-cyan-700 hover:shadow-2xl hover:shadow-cyan-500/25 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : isSignup ? (
              <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            )}
            {twoFactorToken
              ? isFa ? "تأیید کد و ورود" : "Verify code and sign in"
              : isSignup
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
              <ShieldCheck
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
        </div>
      </section>
    </main>
  );
}
